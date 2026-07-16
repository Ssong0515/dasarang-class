import dotenv from 'dotenv';
import express from 'express';
import { createServer as createNetServer } from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { ADMIN_EMAIL, getAdminDb, getFirebaseAdminApp, verifyAdminIdToken, verifyStudentOrAdminIdToken } from './server/firebaseAdmin';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getStudentWorkFile, uploadStudentWork } from './server/googleDriveUpload';
import {
  syncNotebookLmPptxFolder,
  validateNotebookLmSyncPayload,
  syncTheorySlideFromFolder,
  validateTheorySlidePayload,
} from './server/notebookLmSync';
import { createAdminApiRouter } from './server/adminApi/router';
import { handleMcpDeleteRequest, handleMcpGetRequest, handleMcpPostRequest } from './server/adminApi/mcp';
import {
  assignCurriculumDatesFromCalendar,
  listCalendarClasses,
} from './server/adminApi/calendarClasses';
import { createPostFromUpload, isApprovedStudentWorkFile, listPublicStudentPosts, reviewStudentPost } from './server/adminApi/studentPosts';
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

// multer(busboy)는 멀티파트 파일명을 latin1로 디코드해 한글 파일명이 깨진다(예: 학습화면.png → íìµí´ë.png).
// latin1 바이트를 UTF-8로 되돌린다. 재해석 결과가 유효하지 않으면(치환문자 등) 원본을 그대로 둔다.
const decodeMultipartFilename = (name: string): string => {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('�') ? name : decoded;
  } catch {
    return name;
  }
};

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
          originalName: decodeMultipartFilename(req.file.originalname),
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

  // Claude/ChatGPT용 MCP 서버 — Streamable HTTP (stateful 세션), Bearer API 키 인증
  app.post(withBasePath(APP_BASE_PATH, '/mcp'), handleMcpPostRequest);
  app.get(withBasePath(APP_BASE_PATH, '/mcp'), handleMcpGetRequest);
  app.delete(withBasePath(APP_BASE_PATH, '/mcp'), handleMcpDeleteRequest);

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
    // 승인 후 공개 페이지에 빨리 반영되도록 캐시를 짧게 둔다(앱 자체 쇼케이스는 추가로 캐시 무력화).
    res.setHeader('Cache-Control', 'public, max-age=60');
    try {
      res.json({ items: await listPublicStudentPosts() });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '게시물 조회에 실패했습니다.' });
    }
  });

  // 승인된 학생 작품 파일을 같은 출처에서 '제대로' 렌더한다.
  // Drive의 webViewLink는 HTML을 원문 텍스트(+잘못된 인코딩)로 보여줘 깨지므로,
  // 서버가 올바른 Content-Type(text/html이면 charset=utf-8)으로 직접 스트리밍해 브라우저가 렌더하게 한다.
  app.get(withBasePath(APP_BASE_PATH, '/api/public/student-work/:fileId'), async (req, res) => {
    const { fileId } = req.params as { fileId?: string };
    if (!fileId) {
      res.status(400).json({ error: 'fileId가 필요합니다.' });
      return;
    }
    try {
      if (!(await isApprovedStudentWorkFile(fileId))) {
        res.status(404).json({ error: '공개된 작품을 찾을 수 없습니다.' });
        return;
      }
      const file = await getStudentWorkFile(fileId);
      const isHtml = /text\/html/i.test(file.mimeType);
      res.setHeader('Content-Type', isHtml ? 'text/html; charset=utf-8' : file.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`
      );
      res.setHeader('Cache-Control', 'public, max-age=300');
      file.stream.on('error', (streamError) => {
        console.error('[public/student-work] 스트림 오류:', streamError);
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
        .json({ error: error instanceof Error ? error.message : '작품을 불러오지 못했습니다.' });
    }
  });

  // 실습 콘텐츠 HTML 미리보기. 채팅에서 받은 previewUrl로 전체를 다운로드하지 않고 브라우저에서 바로 본다.
  // 인증 없음(랜덤 20자 content id가 곧 캡처빌리티). 키를 URL에 박으면 채팅·기록에 새므로 공개가 더 안전.
  // 기본은 렌더(text/html), ?raw=1이면 소스(text/plain). edit 후 즉시 반영되도록 캐시 안 함.
  app.get(withBasePath(APP_BASE_PATH, '/preview/:contentId'), async (req, res) => {
    const { contentId } = req.params as { contentId?: string };
    if (!contentId) {
      res.status(400).type('text/plain; charset=utf-8').send('contentId가 필요합니다.');
      return;
    }
    try {
      const doc = await getAdminDb().collection('contents').doc(contentId).get();
      const html = doc.exists ? (doc.data() as { html?: unknown }).html : undefined;
      if (typeof html !== 'string' || !html.trim()) {
        res.status(404).type('text/plain; charset=utf-8').send('미리볼 실습 콘텐츠를 찾을 수 없습니다.');
        return;
      }
      const raw = req.query.raw === '1' || req.query.raw === 'true';
      res.setHeader('X-Robots-Tag', 'noindex');
      res.setHeader('Cache-Control', 'no-store');
      res.type(raw ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8').send(html);
    } catch (error) {
      res
        .status(500)
        .type('text/plain; charset=utf-8')
        .send(error instanceof Error ? error.message : '미리보기에 실패했습니다.');
    }
  });

  // 관리자 UI에서 학생 게시물 승인(홈페이지 공유)/숨김/제거. 승인 시 Drive 파일 공개 전환,
  // 제거 시 Drive 파일 삭제는 서버만 가능.
  app.post(
    withBasePath(APP_BASE_PATH, '/api/student-posts/:id/review'),
    requireAdmin,
    async (req, res) => {
      const { action } = (req.body || {}) as { action?: string };
      if (action !== 'approve' && action !== 'hide' && action !== 'delete') {
        res.status(400).json({ error: "action은 'approve'·'hide'·'delete' 중 하나여야 합니다." });
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

  // 이론 행 단건 동기화 — 반 이론 폴더에서 제목과 맞는 pptx 하나를 구글 슬라이드로 변환해 slideUrl만 돌려준다.
  app.post(withBasePath(APP_BASE_PATH, '/api/notebooklm/sync-theory-slide'), requireAdmin, async (req, res) => {
    try {
      const payload = validateTheorySlidePayload(req.body);
      const result = await syncTheorySlideFromFolder(payload);
      res.json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Theory slide sync failed.';
      const statusCode = /required|not a folder|찾을 수 없/i.test(message) ? 400 : 500;
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
    // 배포 즉시 반영을 위한 캐시 전략:
    //   - index.html: 절대 캐시 안 함(no-store). 항상 최신을 받아 새 해시 에셋을 가리키게 한다.
    //   - /assets/**: Vite가 파일명에 콘텐츠 해시를 박으므로 영구 캐시(immutable) 안전.
    // firebase.json의 hosting 헤더는 클래식 Firebase Hosting 전용이라 App Hosting(Express)에는
    // 적용되지 않는다. 실제 서빙 주체인 이 서버에서 직접 헤더를 지정해야 한다.
    const NO_CACHE = 'no-cache, no-store, must-revalidate';
    const IMMUTABLE = 'public, max-age=31536000, immutable';
    const sendIndex = (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'), {
        cacheControl: false,
        headers: { 'Cache-Control': NO_CACHE },
      });
    };

    if (APP_BASE_PATH !== '/') {
      app.get(new RegExp(`^${escapeForRegExp(APP_BASE_PATH)}$`), (_req, res) => {
        res.redirect(301, `${APP_BASE_PATH}/`);
      });
    }

    app.use(
      APP_BASE_PATH,
      express.static(distPath, {
        index: false,
        redirect: false,
        setHeaders: (res, filePath) => {
          // 해시 파일명을 쓰는 빌드 에셋만 영구 캐시. index.html과 public/의 비해시 파일
          // (logo.svg 등)은 배포 반영을 위해 매번 재검증한다.
          const isHashedAsset = filePath
            .slice(distPath.length)
            .replace(/\\/g, '/')
            .startsWith('/assets/');
          res.setHeader('Cache-Control', isHashedAsset ? IMMUTABLE : NO_CACHE);
        },
      })
    );

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
