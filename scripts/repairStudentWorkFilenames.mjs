// 학생자료 공유 드라이브에 이미 깨진 채로 저장된 파일명을 한글로 복원한다.
//
// 배경: 예전 업로드는 멀티파트 파일명을 latin1로 디코드해 저장돼(예: 학습화면.png → íìµí´ë.png) 한글이 깨졌다.
//       서버 코드는 고쳐졌지만(이후 업로드는 정상), 이미 저장된 파일명은 이 스크립트로 되돌린다.
//
// 방법: 파일명 앞부분(학생이름)은 정상 한글이므로 통째로 역변환하면 오히려 깨진다.
//       코드포인트가 0~255인 '연속 구간'만 latin1 바이트로 되돌려 UTF-8로 재해석한다.
//       (ASCII 구간은 그대로 복원되고, 정상 한글 글자(>255)는 건드리지 않는다.)
//       재해석이 유효하지 않거나(치환문자 �) 바뀌지 않으면 그 파일은 건너뛴다.
//
// 사용:
//   node scripts/repairStudentWorkFilenames.mjs           # dry-run(계획만 출력, 변경 없음)
//   node scripts/repairStudentWorkFilenames.mjs --apply   # 실제 파일명 변경
//
// 필요: .env 의 GOOGLE_SERVICE_ACCOUNT_JSON (선택: STUDENT_WORK_DRIVE_FOLDER_ID)

import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config({ quiet: true });

const APPLY = process.argv.includes('--apply');
const ROOT_FOLDER_ID = process.env.STUDENT_WORK_DRIVE_FOLDER_ID || '0AHL-LinZZ7XbUk9PVA';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON 환경변수가 없습니다. (.env 확인)');
  const parsed = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
      project_id: parsed.project_id,
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

// 깨진 파일명 복원: 코드포인트 ≤ 0xFF 인 연속 구간만 latin1→UTF-8 로 되돌린다.
function repairName(name) {
  let out = '';
  let bytes = [];
  const flush = () => {
    if (bytes.length) {
      out += Buffer.from(bytes).toString('utf8');
      bytes = [];
    }
  };
  for (const ch of name) {
    const cp = ch.codePointAt(0);
    if (cp <= 0xff) bytes.push(cp);
    else {
      flush();
      out += ch;
    }
  }
  flush();
  return out;
}

async function listChildren(drive, parentId) {
  const items = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id,name,mimeType)',
      spaces: 'drive',
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
    });
    items.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return items;
}

async function main() {
  const drive = getDriveClient();
  console.log(`\n[모드] ${APPLY ? '★ 실제 적용(--apply)' : 'dry-run (변경 없음)'}`);
  console.log(`[루트] ${ROOT_FOLDER_ID}\n`);

  // 루트 아래 폴더(날짜 폴더)를 순회하며 그 안의 파일들을 검사한다.
  const queue = [ROOT_FOLDER_ID];
  let checked = 0;
  let renamed = 0;
  let skippedInvalid = 0;

  while (queue.length) {
    const parent = queue.shift();
    const children = await listChildren(drive, parent);
    for (const child of children) {
      if (child.mimeType === FOLDER_MIME) {
        queue.push(child.id);
        continue;
      }
      checked += 1;
      const fixed = repairName(child.name);
      if (fixed === child.name) continue; // 바뀔 게 없음(정상/ASCII)
      if (fixed.includes('�')) {
        skippedInvalid += 1;
        console.log(`  ? 건너뜀(재해석 실패): ${child.name}`);
        continue;
      }
      console.log(`  ${child.name}\n    → ${fixed}`);
      if (APPLY) {
        await drive.files.update({
          fileId: child.id,
          requestBody: { name: fixed },
          supportsAllDrives: true,
        });
      }
      renamed += 1;
    }
  }

  console.log(
    `\n[요약] 검사 ${checked}개 / 복원${APPLY ? '' : '(예정)'} ${renamed}개 / 재해석 실패 ${skippedInvalid}개`
  );
  if (!APPLY && renamed > 0) {
    console.log('\n실제로 복원하려면:  node scripts/repairStudentWorkFilenames.mjs --apply');
  } else if (APPLY) {
    console.log('\n완료 ✅');
  }
}

main().catch((err) => {
  console.error('\n[실패]', err?.message || err);
  process.exit(1);
});
