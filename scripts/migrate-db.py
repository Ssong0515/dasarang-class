"""
Firestore DB 마이그레이션 스크립트
ai-studio-f8009495-... (구 DB) → dasarang-class (신 DB)

사용법:
  pip install firebase-admin python-dotenv
  python scripts/migrate-db.py          # 드라이런 (읽기만)
  python scripts/migrate-db.py --run    # 실제 마이그레이션

주의: AI Studio DB는 무료 할당량(하루 50,000 reads)에 영구 묶임.
      할당량 초과 시 매일 오후 4시(KST) 리셋 후 재시도.
"""

import sys
import os
import json
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

import firebase_admin
from firebase_admin import credentials, firestore

DRY_RUN = '--run' not in sys.argv

ROOT_DIR = os.path.join(os.path.dirname(__file__), '..')
CONFIG_PATH = os.path.join(ROOT_DIR, 'firebase-applet-config.json')
FIREBASE_JSON_PATH = os.path.join(ROOT_DIR, 'firebase.json')

# ── 설정 ──────────────────────────────────────────────────────────────────────
with open(CONFIG_PATH) as f:
    cfg = json.load(f)

OLD_DB_ID = cfg['firestoreDatabaseId']  # ai-studio-...
NEW_DB_ID = 'dasarang-class'

project_id   = os.environ['FIREBASE_SERVICE_ACCOUNT_PROJECT_ID']
client_email = os.environ['FIREBASE_SERVICE_ACCOUNT_EMAIL']
private_key  = os.environ.get('FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY', '').replace('\\n', '\n')

sa = {
    'type': 'service_account',
    'project_id': project_id,
    'client_email': client_email,
    'private_key': private_key,
    'token_uri': 'https://oauth2.googleapis.com/token',
}

# ── 초기화 ────────────────────────────────────────────────────────────────────
cred = credentials.Certificate(sa)
app = firebase_admin.initialize_app(cred)

old_db = firestore.client(app=app, database_id=OLD_DB_ID)
new_db = firestore.client(app=app, database_id=NEW_DB_ID)

COLLECTIONS = [
    'classrooms',
    'students',
    'classroomDateRecords',
    'contents',
    'memos',
    'curriculums',
    'categories',
    'studentPosts',
    'dailyReviews',
    'publishedLessons',
    'studentAccess',
    'access_logs',
    'admins',
    'users',
]

BATCH_SIZE = 400  # Firestore 배치 최대 500, 여유 있게 400


def patch_configs():
    cfg['firestoreDatabaseId'] = NEW_DB_ID
    with open(CONFIG_PATH, 'w') as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'  ✅ firebase-applet-config.json → firestoreDatabaseId: "{NEW_DB_ID}"')

    if os.path.exists(FIREBASE_JSON_PATH):
        with open(FIREBASE_JSON_PATH) as f:
            fb = json.load(f)
        if 'firestore' in fb and isinstance(fb['firestore'], dict):
            fb['firestore']['database'] = NEW_DB_ID
            with open(FIREBASE_JSON_PATH, 'w') as f:
                json.dump(fb, f, indent=2, ensure_ascii=False)
                f.write('\n')
            print(f'  ✅ firebase.json → firestore.database: "{NEW_DB_ID}"')


def migrate():
    mode = '드라이런 (읽기만)' if DRY_RUN else '실제 마이그레이션'
    print(f'\n{mode}')
    print(f'  FROM: {OLD_DB_ID}')
    print(f'  TO:   {NEW_DB_ID}\n')

    total_docs = 0

    for col_name in COLLECTIONS:
        try:
            docs = list(old_db.collection(col_name).stream())
        except Exception as e:
            if 'RESOURCE_EXHAUSTED' in str(e) or '429' in str(e):
                print(f'\n❌ 할당량 초과: AI Studio DB 읽기 한도 소진됨.')
                print('   매일 오후 4시(KST) 리셋 후 재시도하세요.')
                sys.exit(1)
            raise

        count = len(docs)
        total_docs += count

        if count == 0:
            print(f'  {col_name}: 0개 (건너뜀)')
            continue

        print(f'  {col_name}: {count}개 복사 중...')

        if not DRY_RUN:
            for i in range(0, count, BATCH_SIZE):
                batch = new_db.batch()
                for doc in docs[i:i + BATCH_SIZE]:
                    batch.set(new_db.collection(col_name).document(doc.id), doc.to_dict())
                batch.commit()
                print(f'    → {min(i + BATCH_SIZE, count)}/{count} 완료')
        else:
            sample_keys = list(docs[0].to_dict().keys())[:6]
            print(f'    샘플 필드: {sample_keys}')

    print(f'\n총 {total_docs}개 문서')

    if DRY_RUN:
        print('\n✅ 드라이런 완료. 실제 실행: python scripts/migrate-db.py --run')
    else:
        print('\n✅ 데이터 복사 완료! config 파일 자동 수정 중...\n')
        patch_configs()
        print('\n다음 단계:')
        print('  1. firebase deploy --only firestore:rules  (새 DB에 보안 규칙 적용)')
        print('  2. 앱 빌드 & 배포 (npm run build → 서버 재시작)')


if __name__ == '__main__':
    migrate()
