// 2회차 실습 샘플 HTML을 DB 콘텐츠 문서에 반영 (같은 ID 유지 → 날짜기록 연결·게이팅 그대로).
// 로컬 인터랙티브 검수용 유틸. 클라우드 루틴은 이걸 쓰지 말 것(MCP+키 사용).
import fs from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadEnv(path){
  if(!fs.existsSync(path)) return;
  for(const rawLine of fs.readFileSync(path,'utf8').split(/\r?\n/)){
    const line=rawLine.trim(); if(!line||line.startsWith('#')) continue;
    const eq=line.indexOf('='); if(eq===-1) continue;
    const key=line.slice(0,eq).trim(); let val=line.slice(eq+1).trim();
    if((val.startsWith('"')&&val.endsWith('"'))||(val.startsWith("'")&&val.endsWith("'"))) val=val.slice(1,-1);
    if(!(key in process.env)) process.env[key]=val;
  }
}
loadEnv('./.env');

const cfg=JSON.parse(fs.readFileSync('./firebase-applet-config.json','utf8'));
const app=getApps()[0] ?? initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_SERVICE_ACCOUNT_PROJECT_ID||cfg.projectId,
  clientEmail: process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
  privateKey: (process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY||'').replace(/\\n/g,'\n')
}), projectId: process.env.FIREBASE_SERVICE_ACCOUNT_PROJECT_ID||cfg.projectId });
const db=getFirestore(app, cfg.firestoreDatabaseId);

// contentId → 샘플 파일 (description은 그대로 두려면 null)
const MAP=[
  { id:'mzCANhPoBOSA0QnnWlxp', file:'./docs/lesson-automation/sample-practice-desktop-mission.html' },  // 2회차 3시수 바탕화면
  { id:'9dtcvBidvZrZeNdTayQg', file:'./docs/lesson-automation/sample-practice-folder-builder.html' },     // 2회차 4시수 폴더
];

for(const m of MAP){
  const ref=db.collection('contents').doc(m.id);
  const snap=await ref.get();
  if(!snap.exists){ console.log('SKIP (없음):', m.id); continue; }
  const before=(snap.data().html||'').length;
  const html=fs.readFileSync(m.file,'utf8');
  await ref.update({ html });
  console.log('PUSHED', m.id, '|', snap.data().title, '| html', before, '→', html.length);
}
process.exit(0);
