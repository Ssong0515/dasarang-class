"""
AI Studio DB 데이터 삭제 스크립트
ai-studio-f8009495-4feb-4e1e-95b7-fb82fb050c0f 의 모든 컬렉션 삭제
"""
import os
import sys
import json
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

import firebase_admin
from firebase_admin import credentials, firestore

ROOT_DIR = os.path.join(os.path.dirname(__file__), '..')
with open(os.path.join(ROOT_DIR, 'firebase-applet-config.json')) as f:
    cfg = json.load(f)

OLD_DB_ID = 'ai-studio-f8009495-4feb-4e1e-95b7-fb82fb050c0f'

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
db = firestore.client(app=app, database_id=OLD_DB_ID)

COLLECTIONS = [
    'classrooms', 'students', 'classroomDateRecords', 'contents',
    'memos', 'curriculums', 'categories', 'studentPosts', 'dailyReviews',
    'publishedLessons', 'studentAccess', 'access_logs', 'admins', 'users',
    'integrations',
]

BATCH_SIZE = 400
total = 0

for col_name in COLLECTIONS:
    docs = list(db.collection(col_name).stream())
    if not docs:
        print(f'  {col_name}: 0 (skip)')
        continue
    print(f'  {col_name}: {len(docs)} 삭제 중...')
    for i in range(0, len(docs), BATCH_SIZE):
        batch = db.batch()
        for doc in docs[i:i + BATCH_SIZE]:
            batch.delete(db.collection(col_name).document(doc.id))
        batch.commit()
    total += len(docs)
    print(f'    -> 완료')

print(f'\n총 {total}개 문서 삭제 완료')
