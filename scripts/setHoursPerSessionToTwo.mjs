// 기존 클래스들의 '회차당 시수'(hoursPerSession)를 2로 맞춘다.
//
// 왜: 강사가 보통 한 회차에 2시수를 진행하는데, 예전에 만들어진 클래스들은
//     hoursPerSession이 비어 있거나 1로 저장돼 있어 회차당 강사비가 절반(예: 8만 대신 4만)으로
//     계산됐다. 신규 클래스 기본값은 이미 2시수로 바뀌었고, 이 스크립트는 기존 클래스를 보정한다.
//
// 동작:
//   hoursPerSession이 (없음 | 1)인 클래스만 2로 설정한다. 이미 2 이상이거나
//   강사가 일부러 다른 값(예: 3)으로 둔 클래스는 건드리지 않는다. feePerHour는 손대지 않는다.
//
// 안전:
//   - 기본은 DRY-RUN(미리보기만). 실제 반영은 `--apply`.
//   - 멱등: 다시 돌려도 안전(이미 2면 no-op).
//   - 되돌리기: 실제로 1시수인 반이 있으면 클래스 설정 탭에서 '회차당 시수'를 1로 바꿔 저장하면 됨.
//
// 사용: node scripts/setHoursPerSessionToTwo.mjs           # dry-run (미리보기)
//       node scripts/setHoursPerSessionToTwo.mjs --apply   # 실제 반영
import fs from 'node:fs';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
const TARGET_HOURS = 2;

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
    `\n[set-hours-per-session] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} db=${cfg.firestoreDatabaseId} target=${TARGET_HOURS}시수\n`
  );

  const snap = await db.collection('classrooms').get();
  let touched = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const current = data.hoursPerSession;
    const needsUpdate = current == null || Number(current) === 1;
    const name = data.name || '(이름없음)';

    if (!needsUpdate) {
      skipped += 1;
      console.log(`  - skip "${name}": hoursPerSession=${current} (그대로 둠)`);
      continue;
    }

    touched += 1;
    const before = current == null ? '없음' : current;
    console.log(`  ✓ "${name}": hoursPerSession ${before} → ${TARGET_HOURS}`);
    if (APPLY) {
      await doc.ref.set({ hoursPerSession: TARGET_HOURS }, { merge: true });
    }
  }

  console.log(
    `\n[set-hours-per-session] ${APPLY ? '반영 완료' : '미리보기'} — 변경 ${touched}개 / 유지 ${skipped}개 (총 ${snap.size}개)`
  );
  if (!APPLY && touched > 0) {
    console.log('실제로 반영하려면 다시 --apply 로 실행하세요.\n');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[set-hours-per-session] 실패:', err);
    process.exit(1);
  });
