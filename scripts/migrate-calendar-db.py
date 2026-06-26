"""
Firestore 캘린더 DB 마이그레이션 스크립트
(default) → calendar

사용법:
  pip install firebase-admin python-dotenv
  python scripts/migrate-calendar-db.py          # 드라이런 (읽기만)
  python scripts/migrate-calendar-db.py --run    # 실제 마이그레이션
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
FIREBASE_ADMIN_PATH = os.path.join(ROOT_DIR, 'server', 'firebaseAdmin.ts')

OLD_DB_ID = '(default)'
NEW_DB_ID = 'calendar'

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

cred = credentials.Certificate(sa)
app = firebase_admin.initialize_app(cred)

old_db = firestore.client(app=app, database_id=OLD_DB_ID)
new_db = firestore.client(app=app, database_id=NEW_DB_ID)

COLLECTIONS = [
    'classes',
    'calendar-events',
]

BATCH_SIZE = 400


def patch_firebase_admin():
    with open(FIREBASE_ADMIN_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    old_line = 'export const getCalendarDb = () => getFirestore(getFirebaseAdminApp());'
    new_line = "export const getCalendarDb = () => getFirestore(getFirebaseAdminApp(), 'calendar');"

    if new_line in content:
        print('  [OK] server/firebaseAdmin.ts 이미 calendar DB 사용 중')
        return

    if old_line not in content:
        print('  [!] server/firebaseAdmin.ts 에서 getCalendarDb 라인을 찾지 못했어요. 수동으로 확인하세요.')
        return

    content = content.replace(old_line, new_line)
    with open(FIREBASE_ADMIN_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print("  [OK] server/firebaseAdmin.ts -> getCalendarDb() = 'calendar' DB")


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
                print(f'\n❌ 할당량 초과: {col_name} 읽기 실패.')
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
        print('\n[OK] 드라이런 완료. 실제 실행: python scripts/migrate-calendar-db.py --run')
    else:
        print('\n[OK] 데이터 복사 완료! server/firebaseAdmin.ts 자동 수정 중...\n')
        patch_firebase_admin()
        print('\n다음 단계:')
        print('  1. firebase deploy --only firestore:rules  (calendar DB에 보안 규칙 적용)')
        print('  2. 앱 빌드 & 배포 (npm run build → 서버 재시작)')


if __name__ == '__main__':
    migrate()
