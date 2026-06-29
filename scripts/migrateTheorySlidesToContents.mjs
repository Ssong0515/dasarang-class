import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  applicationDefault,
  cert,
  getApps as getAdminApps,
  initializeApp as initializeAdminApp,
} from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// 이론 자료 링크(slideUrl)를 "날짜기록(classroomDateRecord)"에서 "실습 콘텐츠(content)"로 옮긴다.
//
// 배경:
//   예전에는 이론 링크가 날짜+반별 기록의 theoryPrompts[i].slideUrl(또는 theorySlides[i].url,
//   구버전 단일 theorySlideUrl)에 저장됐다. 그래서 같은 실습을 다른 반/날짜에 써도 이론이
//   따라오지 않았다. 새 모델은 이론을 실습 콘텐츠(LessonContent.theorySlideUrl)에 묶어,
//   같은 실습을 쓰는 모든 곳에 자동으로 따라오게 한다(완전 공유).
//
// 매핑 규칙(강사 화면과 동일):
//   실습 콘텐츠 i  ↔  theoryPrompts[i].slideUrl
//   - 실습 콘텐츠 = 그날 contentIds 순서대로, html이 있고 slideUrl이 없는 콘텐츠.
//   - 같은 콘텐츠에 서로 다른 링크가 여러 기록에서 붙어 있으면 updatedAt이 가장 최근인 것을 택한다.
//   - 이미 theorySlideUrl이 있는 콘텐츠는 건드리지 않는다(수동 설정 보호).
//
// 안전장치:
//   - 기본은 dry-run(감사 파일만 생성). 실제 쓰기는 --apply 플래그가 있을 때만.
//   - 쓰기는 set({theorySlideUrl}, {merge:true}) — 콘텐츠의 다른 필드는 건드리지 않는다.
//   - 날짜기록의 구버전 링크는 그대로 둔다(비파괴적). 새 코드가 콘텐츠 값을 우선 쓰므로 무해하다.
// ─────────────────────────────────────────────────────────────────────────────

const CONTENTS_COLLECTION = 'contents';
const CLASSROOM_DATE_RECORDS_COLLECTION = 'classroomDateRecords';
const DEFAULT_AUDIT_PATH = path.resolve(process.cwd(), 'scripts', 'theory-slides-migration-audit.json');
const BATCH_SIZE = 350;

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');
const outputArg = [...args].find((arg) => arg.startsWith('--output='));
const auditOutputPath = outputArg
  ? path.resolve(process.cwd(), outputArg.slice('--output='.length))
  : DEFAULT_AUDIT_PATH;

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const normalizePrivateKey = (privateKey) => privateKey?.replace(/\\n/g, '\n');

const parseServiceAccountJson = (raw) => {
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  const clientEmail = parsed.client_email || parsed.clientEmail;
  const privateKey = normalizePrivateKey(parsed.private_key || parsed.privateKey);
  if (!clientEmail || !privateKey) {
    throw new Error('Service account JSON must include client_email and private_key.');
  }
  return { projectId: parsed.project_id || parsed.projectId, clientEmail, privateKey };
};

const getServiceAccountFromEnv = (prefix) => {
  const jsonConfig = parseServiceAccountJson(process.env[`${prefix}_SERVICE_ACCOUNT_JSON`]);
  if (jsonConfig) return jsonConfig;
  const clientEmail = process.env[`${prefix}_SERVICE_ACCOUNT_EMAIL`];
  const privateKey = normalizePrivateKey(process.env[`${prefix}_SERVICE_ACCOUNT_PRIVATE_KEY`]);
  const projectId = process.env[`${prefix}_SERVICE_ACCOUNT_PROJECT_ID`];
  if (!clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
};

const getFirebaseServiceAccount = () =>
  getServiceAccountFromEnv('FIREBASE') || getServiceAccountFromEnv('GOOGLE');

const getAdminDb = () => {
  const existingApp = getAdminApps()[0];
  if (existingApp) {
    return getAdminFirestore(existingApp, firebaseConfig.firestoreDatabaseId);
  }
  const serviceAccount = getFirebaseServiceAccount();
  const app = initializeAdminApp(
    serviceAccount
      ? {
          credential: cert({
            projectId: serviceAccount.projectId,
            clientEmail: serviceAccount.clientEmail,
            privateKey: serviceAccount.privateKey,
          }),
          projectId: serviceAccount.projectId || firebaseConfig.projectId,
        }
      : {
          credential: applicationDefault(),
          projectId: firebaseConfig.projectId,
        }
  );
  return getAdminFirestore(app, firebaseConfig.firestoreDatabaseId);
};

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

const parseTimestamp = (value) => {
  const normalized = trimmed(value);
  if (!normalized) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
};

// 한 날짜기록에서 "시수 index → 이론 링크"를 뽑는다(강사 화면 폴백 순서와 동일).
const collectRecordTheoryByIndex = (data) => {
  const byIndex = new Map();
  const prompts = Array.isArray(data.theoryPrompts) ? data.theoryPrompts : [];
  prompts.forEach((prompt, index) => {
    const url = trimmed(prompt?.slideUrl);
    if (url) byIndex.set(index, url);
  });
  const slides = Array.isArray(data.theorySlides) ? data.theorySlides : [];
  slides.forEach((slide, index) => {
    if (byIndex.has(index)) return; // prompt 링크가 우선
    const url = trimmed(slide?.url);
    if (url) byIndex.set(index, url);
  });
  // 구버전 단일 링크는 첫 실습(index 0)에 귀속
  const single = trimmed(data.theorySlideUrl);
  if (single && !byIndex.has(0)) byIndex.set(0, single);
  return byIndex;
};

const chunk = (items, size) => {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const writeAuditFile = (audit) => {
  fs.mkdirSync(path.dirname(auditOutputPath), { recursive: true });
  fs.writeFileSync(auditOutputPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
};

const run = async () => {
  const db = getAdminDb();
  const [contentSnap, recordSnap] = await Promise.all([
    db.collection(CONTENTS_COLLECTION).get(),
    db.collection(CLASSROOM_DATE_RECORDS_COLLECTION).get(),
  ]);

  const contentsById = new Map();
  contentSnap.docs.forEach((doc) => contentsById.set(doc.id, { id: doc.id, ...doc.data() }));

  const isPractice = (content) =>
    Boolean(content && trimmed(content.html)) && !trimmed(content.slideUrl);

  // 콘텐츠별 후보 링크 수집: { url, recordId, updatedAt }
  const candidatesByContent = new Map();
  const recordsWithLegacyTheory = [];
  const unmatched = []; // 링크는 있는데 매칭되는 실습 콘텐츠가 없는 경우

  recordSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const theoryByIndex = collectRecordTheoryByIndex(data);
    if (theoryByIndex.size === 0) return;

    const contentIds = Array.isArray(data.contentIds) ? data.contentIds : [];
    const practiceContents = contentIds
      .map((id) => contentsById.get(id))
      .filter((content) => isPractice(content));

    recordsWithLegacyTheory.push({
      recordId: doc.id,
      links: theoryByIndex.size,
      practiceCount: practiceContents.length,
    });

    const updatedAt = data.updatedAt;
    for (const [index, url] of theoryByIndex.entries()) {
      const target = practiceContents[index];
      if (!target) {
        unmatched.push({ recordId: doc.id, index, url });
        continue;
      }
      const list = candidatesByContent.get(target.id) || [];
      list.push({ url, recordId: doc.id, updatedAt, updatedAtValue: parseTimestamp(updatedAt) });
      candidatesByContent.set(target.id, list);
    }
  });

  const writes = []; // { contentId, title, theorySlideUrl, fromRecordId }
  const conflicts = []; // 같은 콘텐츠에 서로 다른 링크 후보가 있던 경우
  const skippedAlreadySet = []; // 이미 theorySlideUrl이 있어 건너뜀

  for (const [contentId, candidates] of candidatesByContent.entries()) {
    const content = contentsById.get(contentId);
    const distinctUrls = [...new Set(candidates.map((candidate) => candidate.url))];
    // 최신 updatedAt 후보 선택
    const winner = candidates.slice().sort((a, b) => b.updatedAtValue - a.updatedAtValue)[0];

    if (distinctUrls.length > 1) {
      conflicts.push({
        contentId,
        title: trimmed(content?.title),
        chosen: winner.url,
        chosenFromRecord: winner.recordId,
        candidates: candidates.map((c) => ({ url: c.url, recordId: c.recordId, updatedAt: c.updatedAt })),
      });
    }

    const existing = trimmed(content?.theorySlideUrl);
    if (existing) {
      skippedAlreadySet.push({ contentId, title: trimmed(content?.title), existing, proposed: winner.url });
      continue;
    }

    writes.push({
      contentId,
      title: trimmed(content?.title),
      theorySlideUrl: winner.url,
      fromRecordId: winner.recordId,
    });
  }

  const audit = {
    generatedAt: new Date().toISOString(),
    applyRequested: shouldApply,
    summary: {
      contentCount: contentsById.size,
      dateRecordCount: recordSnap.size,
      recordsWithLegacyTheory: recordsWithLegacyTheory.length,
      contentsToUpdate: writes.length,
      conflicts: conflicts.length,
      skippedAlreadySet: skippedAlreadySet.length,
      unmatchedLinks: unmatched.length,
    },
    writes,
    conflicts,
    skippedAlreadySet,
    unmatched,
    recordsWithLegacyTheory,
  };

  writeAuditFile(audit);
  console.log('Theory→Content migration audit:');
  console.log(JSON.stringify(audit.summary, null, 2));

  if (!shouldApply) {
    console.log(`\nDry-run only. Review ${auditOutputPath} then re-run with --apply to write.`);
    return;
  }

  for (const writeChunk of chunk(writes, BATCH_SIZE)) {
    const batch = db.batch();
    writeChunk.forEach((write) => {
      batch.set(
        db.collection(CONTENTS_COLLECTION).doc(write.contentId),
        { theorySlideUrl: write.theorySlideUrl },
        { merge: true }
      );
    });
    await batch.commit();
  }

  // 검증: 쓴 값이 실제로 반영됐는지 확인
  await Promise.all(
    writes.map(async (write) => {
      const snap = await db.collection(CONTENTS_COLLECTION).doc(write.contentId).get();
      const saved = trimmed(snap.get('theorySlideUrl'));
      if (saved !== write.theorySlideUrl) {
        throw new Error(`Content '${write.contentId}' theorySlideUrl not written correctly.`);
      }
    })
  );

  console.log(`\nApplied: ${writes.length} content(s) updated. Audit saved to ${auditOutputPath}.`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
