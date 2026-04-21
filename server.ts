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
import { verifyAdminIdToken } from './server/firebaseAdmin';
import { uploadStudentWork } from './server/googleDriveUpload';
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

  app.use(express.json({ limit: '1mb' }));

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
      await verifyAdminIdToken(idToken);
      next();
    } catch (error) {
      res.status(401).json({
        error: error instanceof Error ? error.message : 'Unauthorized',
      });
    }
  };

  // API routes go here
  app.post(
    withBasePath(APP_BASE_PATH, '/api/drive/upload'),
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
          classroomId,
          studentName: studentName.trim(),
          fileBuffer: req.file.buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
        });
        res.json({ ok: true, ...result });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : '업로드에 실패했습니다.' });
      }
    }
  );

  app.get(withBasePath(APP_BASE_PATH, '/api/health'), (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get(withBasePath(APP_BASE_PATH, '/api/google-sheets/status'), requireAdmin, async (req, res) => {
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

  app.post(withBasePath(APP_BASE_PATH, '/api/translate'), async (req, res) => {
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
      app.get(new RegExp(`^${escapeForRegExp(APP_BASE_PATH)}$`), (req, res) => {
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
