// 학생자료 공유 드라이브에서 같은 이름(YYYY-MM-DD)으로 중복 생성된 날짜 폴더를 하나로 병합한다.
//
// 배경: 여러 학생이 같은 순간에 업로드하면 서버의 "목록 조회 → 없으면 생성"이 원자적이지 않아
//       같은 날짜 폴더가 여러 개 생기고 파일이 흩어졌다(예: 2026-06-29 폴더 5개).
//       서버 코드(getOrCreateStudentWorkDateFolder)는 재발을 막고, 이 스크립트는 이미 흩어진 걸 정리한다.
//
// 동작: 날짜별로 가장 먼저 만들어진 폴더를 '정본'으로 삼고, 나머지 중복 폴더의 파일을 정본으로 옮긴 뒤
//       빈 중복 폴더를 휴지통으로 보낸다(영구삭제 아님 → 되돌릴 수 있음).
//
// 사용:
//   node scripts/mergeStudentWorkDuplicateFolders.mjs           # dry-run(계획만 출력, 변경 없음)
//   node scripts/mergeStudentWorkDuplicateFolders.mjs --apply   # 실제 이동·정리 수행
//
// 필요: .env 의 GOOGLE_SERVICE_ACCOUNT_JSON (선택: STUDENT_WORK_DRIVE_FOLDER_ID)

import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const ROOT_FOLDER_ID = process.env.STUDENT_WORK_DRIVE_FOLDER_ID || '0AHL-LinZZ7XbUk9PVA';

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

// 페이지네이션을 처리하며 특정 부모의 자식을 모두 가져온다.
async function listChildren(drive, parentId, extraQuery = '') {
  const items = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and trashed=false${extraQuery}`,
      fields: 'nextPageToken, files(id,name,mimeType,createdTime)',
      orderBy: 'createdTime',
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

  // 1) 루트 아래 날짜 폴더 전부 조회
  const folders = await listChildren(
    drive,
    ROOT_FOLDER_ID,
    " and mimeType='application/vnd.google-apps.folder'"
  );

  // 2) 이름별로 묶기
  const byName = new Map();
  for (const f of folders) {
    if (!byName.has(f.name)) byName.set(f.name, []);
    byName.get(f.name).push(f);
  }

  const duplicateNames = [...byName.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (duplicateNames.length === 0) {
    console.log('중복 날짜 폴더가 없습니다. 정리할 것이 없어요. ✅');
    return;
  }

  let movedFiles = 0;
  let trashedFolders = 0;

  for (const [name, list] of duplicateNames) {
    // 가장 먼저 만들어진 폴더를 정본으로
    list.sort((a, b) => String(a.createdTime).localeCompare(String(b.createdTime)));
    const canonical = list[0];
    const dups = list.slice(1);
    console.log(`\n■ ${name} — 폴더 ${list.length}개 → 정본 ${canonical.id} 로 통합`);

    for (const dup of dups) {
      const children = await listChildren(drive, dup.id);
      console.log(`  · 중복 폴더 ${dup.id}: 파일 ${children.length}개 이동`);
      for (const child of children) {
        console.log(`      → ${child.name}`);
        if (APPLY) {
          await drive.files.update({
            fileId: child.id,
            addParents: canonical.id,
            removeParents: dup.id,
            fields: 'id,parents',
            supportsAllDrives: true,
          });
        }
        movedFiles += 1;
      }

      // 이동 후 비었는지 재확인하고 휴지통으로
      if (APPLY) {
        const remaining = await listChildren(drive, dup.id);
        if (remaining.length === 0) {
          await drive.files.update({
            fileId: dup.id,
            requestBody: { trashed: true },
            supportsAllDrives: true,
          });
          trashedFolders += 1;
          console.log(`    ✔ 빈 중복 폴더 휴지통 이동: ${dup.id}`);
        } else {
          console.log(`    ! 아직 파일이 남아 폴더를 남겨둠: ${dup.id} (${remaining.length}개)`);
        }
      } else {
        trashedFolders += 1; // dry-run 예상치
      }
    }
  }

  console.log(
    `\n[요약] 중복 날짜 ${duplicateNames.length}건 / 이동${APPLY ? '' : '(예정)'} 파일 ${movedFiles}개 / 정리${APPLY ? '' : '(예정)'} 폴더 ${trashedFolders}개`
  );
  if (!APPLY) {
    console.log('\n실제로 정리하려면:  node scripts/mergeStudentWorkDuplicateFolders.mjs --apply');
  } else {
    console.log('\n완료 ✅ (중복 폴더는 휴지통에 있으니 문제 시 복원 가능)');
  }
}

main().catch((err) => {
  console.error('\n[실패]', err?.message || err);
  process.exit(1);
});
