// 커리큘럼 회차(sessions)에 빠진 고유 `id`를 백필하고, 그로 인해 망가진
// 반(classrooms.sessionStates)의 고아 키('undefined' 등)를 정리한다.
//
// 왜: `sessions`를 통째로 넣어 만든 커리큘럼은 회차에 id가 없었다. 자동 배정이 날짜를
//     `sessionStates[session.id]`에 쓰는데, id가 전부 undefined면 모든 회차가 같은
//     `"undefined"` 키로 뭉쳐 마지막에 쓴 한 날짜(예: 11월)만 살아남는다.
//     → 모든 회차가 같은 11월 날짜로 보이는 버그. 회차에 id를 부여해 1:1로 풀어준다.
//
// 동작:
//   Phase 1: id가 없는 회차에 randomUUID()를 부여하고 order를 1-based로 재계산.
//   Phase 2: 각 반의 sessionStates에서 "연결 커리큘럼의 현재 회차 id에 없는 키"를 제거
//            (id 백필 전에 쓰였던 'undefined' 같은 고아 날짜 정리). 정상 키는 보존.
//
// 안전: 기본 DRY-RUN(미리보기). 실제 반영은 `--apply`. 멱등(다시 돌려도 안전).
//
// 사용: node scripts/backfillCurriculumSessionIds.mjs           # dry-run
//       node scripts/backfillCurriculumSessionIds.mjs --apply   # 실제 반영
import fs from 'node:fs';
import crypto from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  for (const rawLine of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv('./.env');

const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const normalizePrivateKey = (k) => k?.replace(/\\n/g, '\n');
const svcEmail =
  process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const svcKey = normalizePrivateKey(
  process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
);
const svcProject =
  process.env.FIREBASE_SERVICE_ACCOUNT_PROJECT_ID ||
  process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID ||
  cfg.projectId;

const app =
  getApps()[0] ??
  initializeApp(
    svcEmail && svcKey
      ? {
          credential: cert({ projectId: svcProject, clientEmail: svcEmail, privateKey: svcKey }),
          projectId: svcProject,
        }
      : { credential: applicationDefault(), projectId: cfg.projectId }
  );
const db = getFirestore(app, cfg.firestoreDatabaseId);

async function main() {
  console.log(
    `\n[backfill-curriculum-session-ids] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} db=${cfg.firestoreDatabaseId}\n`
  );

  const [curriculumsSnap, classroomsSnap] = await Promise.all([
    db.collection('curriculums').get(),
    db.collection('classrooms').get(),
  ]);

  // ---- Phase 1: backfill session ids ----
  // curriculumId -> Set(현재 회차 id) (백필 후 기준)
  const idsByCurriculum = new Map();
  let currTouched = 0;
  let sessionsFixed = 0;
  for (const doc of curriculumsSnap.docs) {
    const raw = Array.isArray(doc.data().sessions) ? doc.data().sessions : [];
    const sorted = raw
      .map((s, i) => ({ s: s && typeof s === 'object' ? s : {}, i }))
      .sort((a, b) => (a.s.order ?? a.i) - (b.s.order ?? b.i))
      .map(({ s }) => s);

    let changed = false;
    const fixed = sorted.map((s, index) => {
      const next = { ...s };
      if (!next.id) {
        next.id = crypto.randomUUID();
        changed = true;
        sessionsFixed += 1;
      }
      if (next.order !== index + 1) {
        next.order = index + 1;
        changed = true;
      }
      return next;
    });

    idsByCurriculum.set(doc.id, new Set(fixed.map((s) => s.id)));

    if (changed) {
      currTouched += 1;
      console.log(`  [curriculum] ${doc.data().title || doc.id} (${doc.id}): backfilled ids/order`);
      if (APPLY) await doc.ref.set({ sessions: fixed, updatedAt: new Date().toISOString() }, { merge: true });
    }
  }
  console.log(
    `\nPhase 1: ${currTouched} curriculum(s), ${sessionsFixed} session(s) got new id${APPLY ? ' written' : ' (dry-run)'}\n`
  );

  // ---- Phase 2: drop orphan sessionStates keys ('undefined' 등) ----
  let classesTouched = 0;
  let keysDropped = 0;
  for (const doc of classroomsSnap.docs) {
    const data = doc.data();
    const states = data.sessionStates || {};
    const validIds = idsByCurriculum.get(data.curriculumId);
    if (!validIds) continue; // 커리큘럼 미연결 반은 건드리지 않음

    const orphans = Object.keys(states).filter((key) => !validIds.has(key));
    if (orphans.length === 0) continue;

    classesTouched += 1;
    keysDropped += orphans.length;
    console.log(`  [class] ${data.name || doc.id} (${doc.id}): drop ${orphans.length} orphan key(s):`);
    for (const k of orphans) console.log(`          ${JSON.stringify(k)} = ${JSON.stringify(states[k])}`);

    if (APPLY) {
      // update()는 sessionStates 필드만 통째로 교체한다(다른 top-level 필드는 보존, 맵 deep-merge 아님).
      const next = {};
      for (const [k, v] of Object.entries(states)) if (validIds.has(k)) next[k] = v;
      await doc.ref.update({ sessionStates: next });
    }
  }
  console.log(
    `\nPhase 2: ${classesTouched} class(es), ${keysDropped} orphan key(s) dropped${APPLY ? ' written' : ' (dry-run)'}\n`
  );

  if (!APPLY) console.log('DRY-RUN only. 검토 후 `--apply`로 다시 실행하세요.\n');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
