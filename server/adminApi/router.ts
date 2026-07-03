import express from 'express';
import { requireApiKey } from './auth';
import {
  deleteCalendarEvent,
  fullResync,
  listCalendarEvents,
  upsertCalendarEvent,
} from './calendarSync';
import { assignCurriculumDatesFromCalendar, listCalendarClasses } from './calendarClasses';
import { buildOpenApiDocument } from './openapi';
import { AdminApiError, isResourceName } from './resources';
import {
  createPracticeContent,
  createResource,
  deleteResource,
  getOverview,
  getResource,
  listResource,
  mutateCurriculumSessions,
  updateResource,
  upsertLessonRecord,
} from './services';
import { reviewStudentPost } from './studentPosts';

const sendError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof AdminApiError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error('[adminApi]', error);
  res.status(500).json({ error: error instanceof Error ? error.message : fallbackMessage });
};

const parseFilterParam = (raw: unknown): Record<string, string> => {
  if (typeof raw !== 'string' || !raw.trim()) {
    return {};
  }
  const filters: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const separatorIndex = pair.indexOf(':');
    if (separatorIndex <= 0) {
      throw new AdminApiError(400, `filter 형식이 올바르지 않습니다: '${pair}'. 'field:value' 형식을 사용하세요.`);
    }
    filters[pair.slice(0, separatorIndex).trim()] = pair.slice(separatorIndex + 1).trim();
  }
  return filters;
};

const requireResource = (raw: string) => {
  if (!isResourceName(raw)) {
    throw new AdminApiError(404, `알 수 없는 리소스입니다: '${raw}'`);
  }
  return raw;
};

export const createAdminApiRouter = () => {
  const router = express.Router();

  // 공개: ChatGPT Actions 가져오기용 스키마
  router.get('/openapi.json', (_req, res) => {
    res.json(buildOpenApiDocument());
  });

  router.use(requireApiKey);

  router.get('/overview', async (_req, res) => {
    try {
      res.json(await getOverview());
    } catch (error) {
      sendError(res, error, '현황 조회에 실패했습니다.');
    }
  });

  router.get('/resources/:resource', async (req, res) => {
    try {
      const resource = requireResource(req.params.resource);
      const result = await listResource(resource, {
        filters: parseFilterParam(req.query.filter),
        dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        includeHtml: req.query.includeHtml === 'true',
      });
      res.json(result);
    } catch (error) {
      sendError(res, error, '목록 조회에 실패했습니다.');
    }
  });

  router.post('/resources/:resource', async (req, res) => {
    try {
      const resource = requireResource(req.params.resource);
      const body = (req.body || {}) as { id?: string; data?: Record<string, unknown> };
      if (!body.data || typeof body.data !== 'object') {
        throw new AdminApiError(400, "요청 본문에 'data' 객체가 필요합니다.");
      }
      res.json(await createResource(resource, body.data, body.id));
    } catch (error) {
      sendError(res, error, '생성에 실패했습니다.');
    }
  });

  router.get('/resources/:resource/:id', async (req, res) => {
    try {
      const resource = requireResource(req.params.resource);
      res.json(await getResource(resource, req.params.id));
    } catch (error) {
      sendError(res, error, '조회에 실패했습니다.');
    }
  });

  router.patch('/resources/:resource/:id', async (req, res) => {
    try {
      const resource = requireResource(req.params.resource);
      const body = (req.body || {}) as { data?: Record<string, unknown> };
      if (!body.data || typeof body.data !== 'object') {
        throw new AdminApiError(400, "요청 본문에 'data' 객체가 필요합니다.");
      }
      res.json(await updateResource(resource, req.params.id, body.data));
    } catch (error) {
      sendError(res, error, '수정에 실패했습니다.');
    }
  });

  router.delete('/resources/:resource/:id', async (req, res) => {
    try {
      const resource = requireResource(req.params.resource);
      res.json(await deleteResource(resource, req.params.id));
    } catch (error) {
      sendError(res, error, '삭제에 실패했습니다.');
    }
  });

  router.post('/lesson-records/upsert', async (req, res) => {
    try {
      res.json(await upsertLessonRecord(req.body || {}));
    } catch (error) {
      sendError(res, error, '수업 기록 저장에 실패했습니다.');
    }
  });

  router.post('/curriculums/:curriculumId/sessions', async (req, res) => {
    try {
      const ops = (req.body || {}).ops;
      res.json(await mutateCurriculumSessions(req.params.curriculumId, ops));
    } catch (error) {
      sendError(res, error, '커리큘럼 회차 수정에 실패했습니다.');
    }
  });

  // Claude/MCP와 동일한 실습 자료 생성 흐름을 REST로도 노출 (GPT Actions에는 미등록이지만 사용 가능)
  router.post('/contents/practice', async (req, res) => {
    try {
      res.json(await createPracticeContent(req.body || {}));
    } catch (error) {
      sendError(res, error, '실습 자료 생성에 실패했습니다.');
    }
  });

  router.get('/calendar/events', async (req, res) => {
    try {
      res.json({
        items: await listCalendarEvents({
          dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
          dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
        }),
      });
    } catch (error) {
      sendError(res, error, '달력 이벤트 조회에 실패했습니다.');
    }
  });

  router.put('/calendar/events', async (req, res) => {
    try {
      res.json(await upsertCalendarEvent(req.body || {}));
    } catch (error) {
      sendError(res, error, '달력 이벤트 저장에 실패했습니다.');
    }
  });

  router.delete('/calendar/events/:id', async (req, res) => {
    try {
      await deleteCalendarEvent(req.params.id);
      res.json({ deleted: true, id: req.params.id });
    } catch (error) {
      sendError(res, error, '달력 이벤트 삭제에 실패했습니다.');
    }
  });

  router.post('/calendar/resync', async (_req, res) => {
    try {
      res.json(await fullResync());
    } catch (error) {
      sendError(res, error, '달력 재동기화에 실패했습니다.');
    }
  });

  router.get('/calendar/classes', async (_req, res) => {
    try {
      res.json({ items: await listCalendarClasses() });
    } catch (error) {
      sendError(res, error, '참고 시간표 조회에 실패했습니다.');
    }
  });

  router.post('/calendar/assign-curriculum-dates', async (req, res) => {
    try {
      const { classroomId, calendarClassId, overwrite } = (req.body || {}) as {
        classroomId?: string;
        calendarClassId?: string;
        overwrite?: boolean;
      };
      res.json(
        await assignCurriculumDatesFromCalendar({
          classroomId: classroomId || '',
          calendarClassId,
          overwrite,
        })
      );
    } catch (error) {
      sendError(res, error, '회차 날짜 배정에 실패했습니다.');
    }
  });

  router.post('/student-posts/:id/review', async (req, res) => {
    try {
      const action = (req.body || {}).action;
      if (action !== 'approve' && action !== 'hide' && action !== 'delete') {
        throw new AdminApiError(400, "action은 'approve'·'hide'·'delete' 중 하나여야 합니다.");
      }
      res.json(await reviewStudentPost(req.params.id, action));
    } catch (error) {
      sendError(res, error, '게시물 처리에 실패했습니다.');
    }
  });

  return router;
};
