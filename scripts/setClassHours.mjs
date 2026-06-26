// 특정 클래스들의 '회차당 시수'(hoursPerSession)를 지정 값으로 맞춘다.
//
// 사용:
//   node scripts/setClassHours.mjs --hours 1 --names "앱 기초반,앱 활용반"            # dry-run
//   node scripts/setClassHours.mjs --hours 1 --names "앱 기초반,앱 활용반" --apply     # 반영
import fs from 'node:fs';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const HOURS = Number(arg('--hours') ?? 1);
const NAMES = (arg('--names') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

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
    `\n[set-class-hours] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} db=${cfg.firestoreDatabaseId} hours=${HOURS} names=${NAMES.join(' / ')}\n`
  );
  if (NAMES.length === 0) {
    console.error('  --names "반이름1,반이름2" 가 필요합니다.');
    process.exit(1);
  }

  const snap = await db.collection('classrooms').get();
  let touched = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!NAMES.includes(data.name)) continue;
    touched += 1;
    console.log(`  ✓ "${data.name}": hoursPerSession ${data.hoursPerSession ?? '없음'} → ${HOURS}`);
    if (APPLY) await doc.ref.set({ hoursPerSession: HOURS }, { merge: true });
  }
  const missing = NAMES.filter((n) => !snap.docs.some((d) => d.data().name === n));
  if (missing.length) console.log(`  ! 못 찾은 반: ${missing.join(', ')}`);

  console.log(
    `\n[set-class-hours] ${APPLY ? '반영 완료' : '미리보기'} — 변경 ${touched}개`
  );
  if (!APPLY && touched > 0) console.log('실제 반영: --apply 추가\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[set-class-hours] 실패:', err);
    process.exit(1);
  });
