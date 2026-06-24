// 커리큘럼(공유 템플릿)에 남아 있던 회차별 plannedDate/status를
// 각 반(classrooms.sessionStates)으로 옮기고, 커리큘럼 문서에서는 제거한다.
//
// 왜: 커리큘럼 = 순수 템플릿(주제·상세·순서). "이 반이 이 회차를 언제·어떤 상태로 했는지"는
//     반별(Classroom.sessionStates)에만 둔다. 같은 커리큘럼을 여러 반이 공유해도
//     날짜·상태가 섞이지 않게 하기 위함.
//
// 동작:
//   Phase 1 (backfill): 각 반의 sessionStates에 비어 있는 회차 날짜·상태를, 그 반이 연결한
//                       커리큘럼의 (레거시) plannedDate/status로 채운다.
//                       → 폴백 제거 후에도 화면 표시가 그대로 유지되도록 보존(behavior-preserving).
//   Phase 2 (purge):    모든 커리큘럼 회차에서 plannedDate/status 키를 제거한다.
//
// 안전:
//   - 기본은 DRY-RUN(읽기만, 변경 미리보기). 실제 반영은 `--apply`.
//   - 멱등: 다시 돌려도 안전(이미 옮겼으면 no-op).
//   - 실행 순서: 신규 코드 배포 "전에" --apply 로 한 번 돌릴 것. 신규 코드는 커리큘럼
//     폴백을 읽지 않으므로, 먼저 반별로 옮겨둬야 미마이그레이션 반의 날짜가 사라지지 않는다.
//
// 사용: node scripts/migrateCurriculumSessionStates.mjs           # dry-run (미리보기)
//       node scripts/migrateCurriculumSessionStates.mjs --apply   # 실제 반영
import fs from 'node:fs';
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

// 'planned'(기본값)은 폴백 시 어차피 'planned'으로 보이므로 옮길 필요 없음. 의미 있는 상태만 보존.
const isMeaningfulStatus = (s) => s === 'done' || s === 'skipped';

async function main() {
  console.log(
    `\n[migrate-curriculum-session-states] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} db=${cfg.firestoreDatabaseId}\n`
  );

  const [curriculumsSnap, classroomsSnap] = await Promise.all([
    db.collection('curriculums').get(),
    db.collection('classrooms').get(),
  ]);

  // curriculumId -> Map(sessionId -> { plannedDate, status })  (레거시 값 조회용)
  const legacyByCurriculum = new Map();
  for (const doc of curriculumsSnap.docs) {
    const sessions = Array.isArray(doc.data().sessions) ? doc.data().sessions : [];
    const m = new Map();
    for (const s of sessions) {
      if (s && s.id) m.set(s.id, { plannedDate: s.plannedDate, status: s.status });
    }
    legacyByCurriculum.set(doc.id, m);
  }

  // ---- Phase 1: backfill classrooms.sessionStates ----
  let classesTouched = 0;
  let entriesBackfilled = 0;
  for (const doc of classroomsSnap.docs) {
    const data = doc.data();
    if (!data.curriculumId) continue;
    const legacy = legacyByCurriculum.get(data.curriculumId);
    if (!legacy || legacy.size === 0) continue;

    const states = { ...(data.sessionStates || {}) };
    const changes = [];
    for (const [sid, leg] of legacy) {
      const entry = states[sid] || {};
      let date = entry.date;
      let status = entry.status;
      if (!date && leg.plannedDate) date = leg.plannedDate;
      if (!status && isMeaningfulStatus(leg.status)) status = leg.status;
      if (date === entry.date && status === entry.status) continue; // 변화 없음

      const next = {};
      if (date) next.date = date;
      if (status) next.status = status;
      states[sid] = next;
      if (date !== entry.date) changes.push(`${sid}: date←${date}`);
      if (status !== entry.status) changes.push(`${sid}: status←${status}`);
    }

    if (changes.length > 0) {
      classesTouched += 1;
      entriesBackfilled += changes.length;
      console.log(`  [class] ${data.name || doc.id} (${doc.id}) ← curriculum ${data.curriculumId}`);
      for (const c of changes) console.log(`          ${c}`);
      if (APPLY) await doc.ref.set({ sessionStates: states }, { merge: true });
    }
  }
  console.log(
    `\nPhase 1 backfill: ${classesTouched} classes, ${entriesBackfilled} field(s)${APPLY ? ' written' : ' (dry-run)'}\n`
  );

  // ---- Phase 2: purge plannedDate/status from curriculum sessions ----
  let curriculaTouched = 0;
  let sessionsCleaned = 0;
  for (const doc of curriculumsSnap.docs) {
    const sessions = Array.isArray(doc.data().sessions) ? doc.data().sessions : [];
    let changed = false;
    const cleaned = sessions.map((s) => {
      if (s && ('plannedDate' in s || 'status' in s)) {
        changed = true;
        sessionsCleaned += 1;
        const { plannedDate: _pd, status: _st, ...rest } = s;
        return rest;
      }
      return s;
    });
    if (changed) {
      curriculaTouched += 1;
      console.log(
        `  [curriculum] ${doc.data().title || doc.id} (${doc.id}): stripped plannedDate/status`
      );
      // sessions는 배열 → set merge 시 통째로 교체된다(원하는 동작).
      if (APPLY) await doc.ref.set({ sessions: cleaned }, { merge: true });
    }
  }
  console.log(
    `\nPhase 2 purge: ${curriculaTouched} curriculums, ${sessionsCleaned} session(s) cleaned${APPLY ? ' written' : ' (dry-run)'}\n`
  );

  if (!APPLY) console.log('DRY-RUN only. 검토 후 `--apply`로 다시 실행하세요.\n');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
