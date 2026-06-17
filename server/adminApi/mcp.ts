import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type express from 'express';
import { z } from 'zod';
import { extractBearerToken, isValidApiKey } from './auth';
import {
  deleteCalendarEvent,
  fullResync,
  listCalendarEvents,
  upsertCalendarEvent,
} from './calendarSync';
import { AdminApiError, RESOURCE_NAMES } from './resources';
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
  type CurriculumSessionOp,
  type UpsertLessonRecordInput,
} from './services';
import { reviewStudentPost } from './studentPosts';

const resourceEnum = z.enum(RESOURCE_NAMES);

const toToolResult = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

const toToolError = (error: unknown) => ({
  isError: true,
  content: [
    {
      type: 'text' as const,
      text:
        error instanceof AdminApiError
          ? `오류 (${error.statusCode}): ${error.message}`
          : `오류: ${error instanceof Error ? error.message : String(error)}`,
    },
  ],
});

const run = async (fn: () => Promise<unknown>) => {
  try {
    return toToolResult(await fn());
  } catch (error) {
    return toToolError(error);
  }
};

const buildMcpServer = () => {
  const server = new McpServer({
    name: 'dasarang-class',
    version: '1.0.0',
  });

  server.tool(
    'get_overview',
    '다사랑 수업 관리 전체 현황 (교실, 커리큘럼, 오늘 수업, 최근 메모, 승인 대기 게시물). 대화 시작 시 먼저 호출해 id들을 파악할 것.',
    {},
    async () => run(() => getOverview())
  );

  server.tool(
    'list_resource',
    `리소스 목록 조회. 리소스: ${RESOURCE_NAMES.join(', ')}. contents 목록에서는 html이 생략된다(전체는 get_resource 사용).`,
    {
      resource: resourceEnum,
      filters: z.record(z.string()).optional().describe('등호 필터 예: {"classroomId":"abc"}, 미배정은 {"categoryId":"null"}'),
      dateFrom: z.string().optional().describe('YYYY-MM-DD'),
      dateTo: z.string().optional().describe('YYYY-MM-DD'),
      limit: z.number().optional(),
    },
    async ({ resource, filters, dateFrom, dateTo, limit }) =>
      run(() => listResource(resource, { filters, dateFrom, dateTo, limit }))
  );

  server.tool(
    'get_resource',
    '리소스 단건 조회 (contents의 html 전문 포함).',
    { resource: resourceEnum, id: z.string() },
    async ({ resource, id }) => run(() => getResource(resource, id))
  );

  server.tool(
    'create_resource',
    '리소스 생성. data 필드는 list_resource로 본 기존 문서 형태를 따른다. 수업 기록은 upsert_lesson_record를, 실습 자료 HTML은 create_practice_content를 사용할 것.',
    {
      resource: resourceEnum,
      data: z.record(z.unknown()),
      id: z.string().optional().describe('명시적 문서 id (보통 생략)'),
    },
    async ({ resource, data, id }) => run(() => createResource(resource, data, id))
  );

  server.tool(
    'update_resource',
    '리소스 부분 수정 (보낸 필드만 병합).',
    { resource: resourceEnum, id: z.string(), data: z.record(z.unknown()) },
    async ({ resource, id, data }) => run(() => updateResource(resource, id, data))
  );

  server.tool(
    'delete_resource',
    '리소스 삭제.',
    { resource: resourceEnum, id: z.string() },
    async ({ resource, id }) => run(() => deleteResource(resource, id))
  );

  server.tool(
    'upsert_lesson_record',
    '특정 반의 특정 날짜 수업 기록(메모/출석/배정 콘텐츠) 생성·수정. 문서 id는 {classroomId}_{date}로 고정되며 calendar.damuna.org에 자동 동기화된다.',
    {
      classroomId: z.string(),
      date: z.string().describe('YYYY-MM-DD'),
      memo: z.string().optional(),
      contentIds: z.array(z.string()).optional(),
      attendance: z
        .array(
          z.object({
            studentId: z.string(),
            status: z.enum(['Present', 'Absent', 'Late']),
            isExcluded: z.boolean().optional(),
          })
        )
        .optional(),
      curriculumId: z.string().optional(),
      curriculumSessionId: z.string().optional().describe('커리큘럼 회차에 연결할 때'),
    },
    async (input) => run(() => upsertLessonRecord(input as UpsertLessonRecordInput))
  );

  server.tool(
    'mutate_curriculum_sessions',
    '커리큘럼 회차 추가/수정/삭제/순서변경을 일괄 수행. 회차 순번(order)은 자동 재계산된다.',
    {
      curriculumId: z.string(),
      ops: z
        .array(
          z.object({
            type: z.enum(['add', 'update', 'remove', 'reorder']),
            sessionId: z.string().optional(),
            session: z
              .object({
                topic: z.string().optional(),
                details: z.string().optional(),
                plannedDate: z.string().optional().describe('YYYY-MM-DD'),
                contentIds: z.array(z.string()).optional(),
                status: z.enum(['planned', 'done', 'skipped']).optional(),
              })
              .optional(),
            order: z.number().optional().describe('1-based 위치 (add 삽입/reorder 이동)'),
          })
        )
        .min(1),
    },
    async ({ curriculumId, ops }) => run(() => mutateCurriculumSessions(curriculumId, ops as CurriculumSessionOp[]))
  );

  server.tool(
    'create_practice_content',
    '실습 자료(자체 완결 HTML)를 학생 콘텐츠로 등록한다. 등록 즉시 학생 페이지에 표시된다. categoryId나 categoryName을 주지 않으면 "실습 자료" 카테고리에 들어간다. HTML은 외부 리소스 없이 자체 완결로 작성할 것 (최대 약 900KB).',
    {
      title: z.string(),
      description: z.string().optional().describe('학생에게 보이는 짧은 설명'),
      html: z.string().describe('완성된 HTML 문서 전체'),
      categoryId: z.string().optional(),
      categoryName: z.string().optional(),
    },
    async (input) => run(() => createPracticeContent(input))
  );

  server.tool(
    'sync_calendar',
    'calendar.damuna.org 달력 조작. action=list/upsert/delete는 일반 이벤트 CRUD, action=resync는 수업 기록 전체 재동기화.',
    {
      action: z.enum(['list', 'upsert', 'delete', 'resync']),
      event: z
        .object({
          id: z.string().optional(),
          date: z.string().optional().describe('YYYY-MM-DD'),
          title: z.string().optional(),
          time: z.string().optional(),
        })
        .optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    },
    async ({ action, event, dateFrom, dateTo }) =>
      run(async () => {
        switch (action) {
          case 'list':
            return { items: await listCalendarEvents({ dateFrom, dateTo }) };
          case 'upsert':
            if (!event?.date || !event?.title) {
              throw new AdminApiError(400, 'upsert에는 event.date와 event.title이 필요합니다.');
            }
            return upsertCalendarEvent({ id: event.id, date: event.date, title: event.title, time: event.time });
          case 'delete':
            if (!event?.id) {
              throw new AdminApiError(400, 'delete에는 event.id가 필요합니다.');
            }
            await deleteCalendarEvent(event.id);
            return { deleted: true, id: event.id };
          case 'resync':
            return fullResync();
        }
      })
  );

  server.tool(
    'review_student_post',
    '학생 작품 게시물 승인/숨김. approve하면 Drive 파일이 링크 공개로 바뀌고 damuna.org 학생 작품 페이지에 노출된다.',
    { id: z.string(), action: z.enum(['approve', 'hide']) },
    async ({ id, action }) => run(() => reviewStudentPost(id, action))
  );

  return server;
};

/**
 * Streamable HTTP (stateless) 핸들러.
 * App Hosting은 인스턴스 0-2개로 세션 어피니티가 없으므로 요청마다 새 transport를 만든다.
 */
export const handleMcpPostRequest: express.RequestHandler = async (req, res) => {
  // 인증: Authorization 헤더(Bearer) 우선, 없으면 URL 쿼리 파라미터(?key= 또는 ?token=)
  // 쿼리 방식은 Claude Desktop 커넥터 UI처럼 커스텀 헤더를 못 넣는 클라이언트를 위한 것.
  const queryKey = (req.query.key || req.query.token);
  const token = extractBearerToken(req.headers.authorization)
    || (typeof queryKey === 'string' ? queryKey.trim() : '');
  if (!token || !isValidApiKey(token)) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized: Bearer API 키가 필요합니다.' },
      id: null,
    });
    return;
  }

  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[mcp] 요청 처리 실패:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
};

export const handleMcpUnsupportedMethod: express.RequestHandler = (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. POST /mcp만 지원합니다 (stateless).' },
    id: null,
  });
};
