import dotenv from 'dotenv';
import express from 'express';
import { createServer as createNetServer } from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  getGoogleSheetsStatus,
  syncClassroomToGoogleSheets,
  syncFolderToGoogleSheets,
  syncStudentToGoogleSheets,
  verifyAdminIdToken,
  type ClassroomSyncPayload,
  type FolderSyncPayload,
  type StudentSyncPayload,
} from './server/googleSheetsSync';
import { translateText, validateTranslatePayload } from './server/geminiTranslate';

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

  app.post(withBasePath(APP_BASE_PATH, '/api/google-sheets/sync-folder'), requireAdmin, async (req, res) => {
    try {
      const result = await syncFolderToGoogleSheets(req.body as FolderSyncPayload);
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

  if (!isProduction) {
    const vite = await createViteServer({
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
