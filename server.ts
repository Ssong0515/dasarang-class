import dotenv from 'dotenv';
import express from 'express';
import { createServer as createNetServer } from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  getGoogleSheetsStatus,
  syncClassroomToGoogleSheets,
  syncStudentToGoogleSheets,
  type ClassroomSyncPayload,
  type StudentSyncPayload,
} from './server/googleSheetsSync';
import {
  ApiError,
  generateDailyReview,
  generateMemoDraft,
  validateGenerateDailyReviewPayload,
  validateGenerateMemoDraftPayload,
} from './server/geminiClassNotes';
import { translateText, validateTranslatePayload } from './server/geminiTranslate';
import { ADMIN_EMAIL, getAdminDb, getFirebaseAdminApp, verifyAdminIdToken, verifyStudentOrAdminIdToken } from './server/firebaseAdmin';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getStudentWorkFile, uploadStudentWork } from './server/googleDriveUpload';
import {
  syncNotebookLmPptxFolder,
  validateNotebookLmSyncPayload,
} from './server/notebookLmSync';
import { createAdminApiRouter } from './server/adminApi/router';
import { handleMcpPostRequest, handleMcpUnsupportedMethod } from './server/adminApi/mcp';
import { syncRecordToCalendarSafe } from './server/adminApi/calendarSync';
import {
  assignCurriculumDatesFromCalendar,
  listCalendarClasses,
} from './server/adminApi/calendarClasses';
import { createPostFromUpload, listPublicStudentPosts, reviewStudentPost } from './server/adminApi/studentPosts';
import multer from 'multer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const normalizeBasePath = (value?: string) => {
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
};

const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const withBasePath = (basePath: string, routePath: string) => {
  const normalizedRoute = routePath === '/' ? '/' : `/${routePath.replace(/^\/+/, '')}`;

  if (basePath === '/') {
    return normalizedRoute;
  }

  return normalizedRoute === '/' ? basePath : `${basePath}${normalizedRoute}`;
};

const findAvailablePort = async (preferredPort: number, host: string) => {
  let candidatePort = preferredPort;

  while (candidatePort < preferredPort + 20) {
    const isAvailable = await new Promise<boolean>((resolve) => {
      const tester = createNetServer();

      tester.once('error', () => {
        tester.close();
        resolve(false);
      });

      tester.once('listening', () => {
        tester.close(() => resolve(true));
      });

      tester.listen(candidatePort, host);
    });

    if (isAvailable) {
      return candidatePort;
    }

    candidatePort += 1;
  }

  throw new Error(`Could not find an available port starting from ${preferredPort}.`);
};

async function startServer() {
  const app = express();
  const parsedPort = Number.parseInt(process.env.PORT || '3000', 10);
  const requestedPort = Number.isNaN(parsedPort) ? 3000 : parsedPort;
  const isProduction = process.env.NODE_ENV === 'production';
  const HOST = process.env.HOST || '0.0.0.0';
  const APP_BASE_PATH = normalizeBasePath(process.env.APP_BASE_PATH);
  const parsedHmrPort = Number.parseInt(process.env.HMR_PORT || '', 10);
  const PORT = isProduction ? requestedPort : await findAvailablePort(requestedPort, HOST);
  const requestedHmrPort = Number.isNaN(parsedHmrPort) ? PORT + 1 : parsedHmrPort;
  const HMR_PORT = isProduction ? requestedHmrPort : await findAvailablePort(requestedHmrPort, HOST);

  app.use(express.json({ limit: '5mb' }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'text/html', 'application/pdf'];
      cb(null, allowed.includes(file.mimetype));
    },
  });

  const requireAdmin: express.RequestHandler = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authorization header is required.' });
        return;
      }

      const idToken = authHeader.slice('Bearer '.length).trim();
      const decodedToken = await verifyAdminIdToken(idToken);
      res.locals.adminUid = decodedToken.uid;
      next();
    } catch (error) {
      res.status(401).json({
        error: error instanceof Error ? error.message : 'Unauthorized',
      });
    }
  };

  const requireStudentOrAdmin: express.RequestHandler = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authorization header is required.' });
        return;
      }

      const idToken = authHeader.slice('Bearer '.length).trim();
      const decodedToken = await verifyStudentOrAdminIdToken(idToken);
      res.locals.viewerUid = decodedToken.uid;
      next();
    } catch (error) {
      res.status(401).json({
        error: error instanceof Error ? error.message : 'Unauthorized',
      });
    }
  };

  // Dev-only: issue a Firebase custom token so local dev works without Google login
  if (!isProduction) {
    app.get(withBasePath(APP_BASE_PATH, '/api/dev/token'), async (_req, res) => {
      try {
        const adminApp = getFirebaseAdminApp();
        // Ensure the dev-admin user document exists so Firestore rules recognize it as admin
        await getAdminDb().collection('users').doc('dev-admin').set(
          { role: 'admin', email: ADMIN_EMAIL },
          { merge: true }
        );
        const token = await getAdminAuth(adminApp).createCustomToken('dev-admin');
        res.json({ token });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create dev token' });
      }
    });
  }

  // API routes
  app.post(
    withBasePath(APP_BASE_PATH, '/api/drive/upload'),
    requireStudentOrAdmin,
    upload.single('file'),
    async (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: '파일이 없습니다.' });
          return;
        }
        const { classroomId, studentName } = req.body as { classroomId?: string; studentName?: string };
        if (!classroomId || !studentName?.trim()) {
          res.status(400).json({ error: 'classroomId와 studentName이 필요합니다.' });
          return;
        }
        const result = await uploadStudentWork({
          studentName: studentName.trim(),
          fileBuffer: req.file.buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
        });

        // 업로드 성공 시 승인 대기 게시물 자동 생성 (실패해도 업로드 자체는 성공 처리)
        const { title, description, anonymous } = req.body as {
          title?: string;
          description?: string;
          anonymous?: string;
        };
        let postId: string | undefined;
        try {
          const post = await createPostFromUpload({
            classroomId,
            studentName: studentName.trim(),
            title,
            description,
            anonymous: anonymous === 'true' || anonymous === 'on',
            mimeType: req.file.mimetype,
            upload: result,
          });
          postId = post.id;
        } catch (postError) {
          console.warn('[studentPosts] 게시물 자동 생성 실패:', postError);
        }

        res.json({ ok: true, ...result, postId });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : '업로드에 실패했습니다.' });
      }
    }
  );

  // 강사(관리자) 전용: 학생 결과물 파일을 서버가 대신 읽어 스트리밍한다.
  // 수업 중 결과물 갤러리에서 비공개 Drive 파일을 외부 공개 없이 보여주기 위함. <img>는 헤더를 못 붙이므로
  // 프론트가 fetch(Bearer)로 받아 objectURL로 표시한다.
  app.get(
    withBasePath(APP_BASE_PATH, '/api/drive/file/:fileId'),
    requireAdmin,
    async (req, res) => {
      const { fileId } = req.params as { fileId?: string };
      if (!fileId) {
        res.status(400).json({ error: 'fileId가 필요합니다.' });
        return;
      }
      try {
        const file = await getStudentWorkFile(fileId);
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Cache-Control', 'private, max-age=300');
        file.stream.on('error', (streamError) => {
          console.error('[drive/file] 스트림 오류:', streamError);
          if (!res.headersSent) {
            res.status(502).end();
          } else {
            res.end();
          }
        });
        file.stream.pipe(res);
      } catch (error) {
        res
          .status(500)
          .json({ error: error instanceof Error ? error.message : '파일을 불러오지 못했습니다.' });
      }
    }
  );

  app.get(withBasePath(APP_BASE_PATH, '/api/health'), (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ChatGPT(커스텀 GPT Actions)용 관리 API — API 키 인증 (openapi.json만 공개)
  app.use(withBasePath(APP_BASE_PATH, '/api/gpt'), createAdminApiRouter());

  // Claude용 MCP 서버 — Streamable HTTP (stateless), Bearer API 키 인증
  app.post(withBasePath(APP_BASE_PATH, '/mcp'), handleMcpPostRequest);
  app.get(withBasePath(APP_BASE_PATH, '/mcp'), handleMcpUnsupportedMethod);
  app.delete(withBasePath(APP_BASE_PATH, '/mcp'), handleMcpUnsupportedMethod);

  // damuna.org 학생 작품 쇼케이스용 공개 피드 (승인된 게시물만)
  app.get(withBasePath(APP_BASE_PATH, '/api/public/student-posts'), async (req, res) => {
    const origin = req.headers.origin || '';
    const allowedOrigins = isProduction
      ? ['https://damuna.org', 'https://www.damuna.org']
      : [origin].filter(Boolean);
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'public, max-age=300');
    try {
      res.json({ items: await listPublicStudentPosts() });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '게시물 조회에 실패했습니다.' });
    }
  });

  // 관리자 UI에서 학생 게시물 승인(홈페이지 공유)/숨김. 승인 시 Drive 파일 공개 전환은 서버만 가능.
  app.post(
    withBasePath(APP_BASE_PATH, '/api/student-posts/:id/review'),
    requireAdmin,
    async (req, res) => {
      const { action } = (req.body || {}) as { action?: string };
      if (action !== 'approve' && action !== 'hide') {
        res.status(400).json({ error: "action은 'approve' 또는 'hide'여야 합니다." });
        return;
      }
      try {
        res.json(await reviewStudentPost(req.params.id, action));
      } catch (error) {
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? (error as { statusCode: number }).statusCode
            : 500;
        res.status(statusCode).json({
          error: error instanceof Error ? error.message : '게시물 처리에 실패했습니다.',
        });
      }
    }
  );

  // 브라우저(관리자 UI)에서 수업 기록 저장/삭제 후 달력 동기화를 트리거
  app.post(withBasePath(APP_BASE_PATH, '/api/calendar/sync-record'), requireAdmin, async (req, res) => {
    const { recordId } = (req.body || {}) as { recordId?: string };
    if (!recordId?.trim()) {
      res.status(400).json({ error: 'recordId가 필요합니다.' });
      return;
    }
    const result = await syncRecordToCalendarSafe(recordId.trim());
    res.json({ ok: result !== null, result });
  });

  // calendar의 참고 시간표 목록 (교실 연결 드롭다운용)
  app.get(withBasePath(APP_BASE_PATH, '/api/calendar/classes'), requireAdmin, async (_req, res) => {
    try {
      res.json({ items: await listCalendarClasses() });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '참고 시간표 조회에 실패했습니다.',
      });
    }
  });

  // 연결된 시간표의 수업 날짜들을 커리큘럼 회차에 자동 배정
  app.post(
    withBasePath(APP_BASE_PATH, '/api/calendar/assign-curriculum-dates'),
    requireAdmin,
    async (req, res) => {
      try {
        const { classroomId, calendarClassId, overwrite } = (req.body || {}) as {
          classroomId?: string;
          calendarClassId?: string;
          overwrite?: boolean;
        };
        const result = await assignCurriculumDatesFromCalendar({
          classroomId: classroomId || '',
          calendarClassId,
          overwrite,
        });
        res.json({ ok: true, ...result });
      } catch (error) {
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? (error as { statusCode: number }).statusCode
            : 500;
        res.status(statusCode).json({
          error: error instanceof Error ? error.message : '회차 날짜 배정에 실패했습니다.',
        });
      }
    }
  );

  app.post(withBasePath(APP_BASE_PATH, '/api/notebooklm/sync-folder'), requireAdmin, async (req, res) => {
    try {
      const payload = validateNotebookLmSyncPayload(req.body);
      const result = await syncNotebookLmPptxFolder({
        folderId: payload.folderId,
        ownerUid: res.locals.adminUid as string,
        driveAccessToken: payload.driveAccessToken,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'NotebookLM folder sync failed.';
      const statusCode = /required|not a folder/i.test(message) ? 400 : 500;
      res.status(statusCode).json({ error: message });
    }
  });

  app.get(withBasePath(APP_BASE_PATH, '/api/google-sheets/status'), requireAdmin, async (_req, res) => {
    try {
      const status = await getGoogleSheetsStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to read Google Sheets status.',
      });
    }
  });

  app.post(withBasePath(APP_BASE_PATH, '/api/google-sheets/sync-classroom'), requireAdmin, async (req, res) => {
    try {
      const result = await syncClassroomToGoogleSheets(req.body as ClassroomSyncPayload);
      res.json({ ok: true, result });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to sync classroom to Google Sheets.',
      });
    }
  });

  app.post(withBasePath(APP_BASE_PATH, '/api/google-sheets/sync-student'), requireAdmin, async (req, res) => {
    try {
      const result = await syncStudentToGoogleSheets(req.body as StudentSyncPayload);
      res.json({ ok: true, result });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to sync student to Google Sheets.',
      });
    }
  });

  app.post(withBasePath(APP_BASE_PATH, '/api/translate'), requireStudentOrAdmin, async (req, res) => {
    try {
      const payload = validateTranslatePayload(req.body);
      const translatedText = await translateText(payload);
      res.json({ translatedText });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Translation failed.';
      const statusCode = /required|must be/i.test(message) ? 400 : 500;
      res.status(statusCode).json({ error: message });
    }
  });

  app.post(
    withBasePath(APP_BASE_PATH, '/api/classroom-date-records/generate-memo-draft'),
    requireAdmin,
    async (req, res) => {
      try {
        const payload = validateGenerateMemoDraftPayload(req.body);
        const result = await generateMemoDraft(payload);
        res.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Memo draft generation failed.';
        const statusCode =
          error instanceof ApiError
            ? error.statusCode
            : /required|must be/i.test(message)
              ? 400
              : 500;
        res.status(statusCode).json({ error: message });
      }
    }
  );

  app.post(withBasePath(APP_BASE_PATH, '/api/daily-reviews/generate'), requireAdmin, async (req, res) => {
    try {
      const payload = validateGenerateDailyReviewPayload(req.body);
      const result = await generateDailyReview(payload);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Daily review generation failed.';
      const statusCode =
        error instanceof ApiError
          ? error.statusCode
          : /required|must be/i.test(message)
            ? 400
            : 500;
      res.status(statusCode).json({ error: message });
    }
  });


  if (!isProduction) {
    const vite = await createViteServer({
      base: '/',
      server: {
        middlewareMode: true,
        hmr: {
          port: HMR_PORT,
          clientPort: HMR_PORT,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const sendIndex = (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    };

    if (APP_BASE_PATH !== '/') {
      app.get(new RegExp(`^${escapeForRegExp(APP_BASE_PATH)}$`), (_req, res) => {
        res.redirect(301, `${APP_BASE_PATH}/`);
      });
    }

    app.use(APP_BASE_PATH, express.static(distPath, { index: false, redirect: false }));

    if (APP_BASE_PATH === '/') {
      app.get('/', sendIndex);
      app.get('*', sendIndex);
    } else {
      app.get(`${APP_BASE_PATH}/`, sendIndex);
      app.get(`${APP_BASE_PATH}/*`, sendIndex);
    }
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}${APP_BASE_PATH}`);
    if (!isProduction && (PORT !== requestedPort || HMR_PORT !== requestedHmrPort)) {
      console.log(
        `Dev port override: app ${requestedPort} -> ${PORT}, hmr ${requestedHmrPort} -> ${HMR_PORT}`
      );
    }
  });
}

startServer();
