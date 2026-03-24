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
- `/dasarang-class/api/health`
- `/dasarang-class/api/translate`
- `/dasarang-class/api/google-sheets/status`
- `/dasarang-class/api/google-sheets/sync-folder`
- `/dasarang-class/api/google-sheets/sync-student`

Recommended production shape:
- `npm ci`
- `npm run build`
- `NODE_ENV=production APP_BASE_PATH=/dasarang-class PORT=3100 npm run start`
- Nginx reverse proxy in front
- `systemd` for process management

## GitHub Push Deploy

`main` push is intended to deploy to Lightsail through GitHub Actions.

Required GitHub repository configuration:
- Secret: `LIGHTSAIL_SSH_KEY`
- Variables:
  `LIGHTSAIL_HOST=15.164.105.38`
  `LIGHTSAIL_USER=ubuntu`
  `DEPLOY_PATH=/opt/dasarang-class/current`
  `SYSTEMD_SERVICE=dasarang-class`

Before the first automated deploy, bootstrap the server once with:
- Node.js 22
- `/opt/dasarang-class/current` clone
- server `.env`
- `dasarang-class.service`
- Nginx route for `/dasarang-class`

## Deployment Guides

- Lightsail bootstrap and validation: `docs/lightsail-deploy.md`
- `systemd` example: `deploy/systemd/dasarang-class.service`
- Nginx example: `deploy/nginx/dasarang-class.conf`
