# dasarang-class

학생/수업 관리 앱입니다. 데이터 원본은 Firebase Firestore에 저장됩니다. 실습 자료의 다국어 번역은 실습 HTML에 미리 심어 둔 번역 사전(`window.__DSR_TR__`)을 학생 화면의 🌐 버튼으로 치환하는 방식으로, 별도 번역 API 호출 없이 동작합니다. 학생이 음성 버튼에서 언어를 고르면(`dsr_voice_lang`) 실습 번역도 그 언어로 자동으로 켜지고, 교사 방송 자막은 번역문과 한국어 원문을 함께 보여줍니다.

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

The application is deployed using Firebase App Hosting.
- `apphosting.yaml` configures the server environment and build settings.
- Secrets like `ADMIN_API_KEY` and `GOOGLE_SERVICE_ACCOUNT_JSON` are managed via Firebase Secret Manager.
