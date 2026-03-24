# gemini_class_room

학생/수업 관리 앱입니다. 런타임 기준 원본 데이터는 Firebase Firestore에 저장되고, 학생 명단은 Google Sheets로 한방향 동기화됩니다.

## Local Run

Prerequisites:
- Node.js 22 LTS or newer

1. Install dependencies:
   `npm install`
2. Create `.env` from [.env.example](/C:/dev/gemini_class_room/.env.example)
3. Start the app:
   `npm run dev`

Local dev runs the Vite client and Express server from [server.ts](/C:/dev/gemini_class_room/server.ts).

## Production Runtime

This app is not a static-only site. Production requires the Node/Express server because these routes must stay live:
- `/api/health`
- `/api/google-sheets/status`
- `/api/google-sheets/sync-folder`
- `/api/google-sheets/sync-student`

Recommended production shape:
- `npm ci`
- `npm run build`
- `NODE_ENV=production PORT=3100 npm run start`
- Nginx reverse proxy in front
- `systemd` for process management
- `APP_BASE_PATH=/dasarang-class` when mounted under a subpath

`PulseBot` can stay on the same host as long as it uses a different local port/service name.

## Deployment Guides

- Lightsail migration guide: [docs/lightsail-deploy.md](/C:/dev/gemini_class_room/docs/lightsail-deploy.md)
- `systemd` example: [deploy/systemd/gemini-class-room.service](/C:/dev/gemini_class_room/deploy/systemd/gemini-class-room.service)
- Nginx example: [deploy/nginx/gemini-class-room.conf](/C:/dev/gemini_class_room/deploy/nginx/gemini-class-room.conf)
