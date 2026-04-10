# dasarang-class

학생/수업 관리 앱입니다. 데이터 원본은 Firebase Firestore에 저장되고, 학생 명단은 Google Sheets로 동기화됩니다. 학생 페이지의 다국어 번역은 서버측 Gemini API를 통해 처리됩니다.

## Local Run

Prerequisites:
- Node.js 22 LTS or newer

1. Install dependencies:
   `npm install`
2. Create `.env` from `.env.example`
3. Start the app:
   `npm run dev`

Local development runs the Vite client and Express server together from `server.ts`.

## Production Runtime

This app is not a static-only site. Production requires the Node/Express server because these routes must stay live:
- `/api/health`
- `/api/translate`
- `/api/google-sheets/status`
- `/api/google-sheets/sync-folder`
- `/api/google-sheets/sync-student`

The application is deployed using Firebase App Hosting.
- `apphosting.yaml` configures the server environment and build settings.
- Secrets like `GEMINI_API_KEY` and `GOOGLE_SERVICE_ACCOUNT_JSON` are managed via Firebase Secret Manager.
