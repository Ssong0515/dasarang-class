import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  getGoogleSheetsStatus,
  syncFolderToGoogleSheets,
  syncStudentToGoogleSheets,
  verifyAdminIdToken,
  type FolderSyncPayload,
  type StudentSyncPayload,
} from './server/googleSheetsSync';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

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
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/google-sheets/status', requireAdmin, async (req, res) => {
    try {
      const status = await getGoogleSheetsStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to read Google Sheets status.',
      });
    }
  });

  app.post('/api/google-sheets/sync-folder', requireAdmin, async (req, res) => {
    try {
      const result = await syncFolderToGoogleSheets(req.body as FolderSyncPayload);
      res.json({ ok: true, result });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to sync folder to Google Sheets.',
      });
    }
  });

  app.post('/api/google-sheets/sync-student', requireAdmin, async (req, res) => {
    try {
      const result = await syncStudentToGoogleSheets(req.body as StudentSyncPayload);
      res.json({ ok: true, result });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to sync student to Google Sheets.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
