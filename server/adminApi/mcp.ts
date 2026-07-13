import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type express from 'express';
import { z } from 'zod';
import { extractBearerToken, isValidApiKey } from './auth';
import {
  deleteCalendarEvent,
  fullResync,
  listCalendarEvents,
  upsertCalendarEvent,
} from './calendarSync';
import { assignCurriculumDatesFromCalendar, listCalendarClasses } from './calendarClasses';
import { AdminApiError, RESOURCE_NAMES } from './resources';
import {
  createPracticeContent,
  createResource,
  deleteResource,
  editContentHtml,
  findInContentHtml,
  getOverview,
  getResource,
  listResource,
  mutateCurriculumSessions,
  updateResource,
  upsertLessonRecord,
  type ContentHtmlEdit,
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
    "다사랑 수업 관리 전체 현황 (교실, 커리큘럼, 오늘 수업, 최근 메모, 승인 대기 게시물, 모범 수업 목록). 대화 시작 시 먼저 호출해 id들을 파악할 것. exemplaryLessons는 강사가 '잘 만든 수업'으로 표시한 기록 요약이며, 새 수업을 만들 땐 여기서 비슷한 주제를 골라 get_resource로 열어 톤·구성을 참고할 것.",
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
    '특정 반의 특정 날짜 수업 기록(메모/출석/배정 콘텐츠) 생성·수정. 문서 id는 {classroomId}_{date}로 고정되며 calendar.damuna.org에 자동 동기화된다. theoryPrompts로 NotebookLM 이론 슬라이드 프롬프트도 저장할 수 있다(강사 대시보드 표시용, 줄 때마다 전체 교체). 각 프롬프트의 contentIds에 그 이론(덱)에 속한 실습 콘텐츠 id들을 넣으면 대시보드가 "이론 1개 + 그 실습들"로 묶어 보여준다(인터리브 수업).',
    {
      classroomId: z.string(),
      date: z.string().describe('YYYY-MM-DD'),
      memo: z.string().optional(),
      lessonDescription: z
        .string()
        .optional()
        .describe(
          "이 수업(회차)의 내용 요약. 강사 대시보드 '수업 설명' 팝업에 표시된다. 디자인·대상이 아니라 '오늘 무엇을 어떤 순서로 배우고 무엇을 만드는지' 수업 내용만 쉬운 한국어로. 줄 때마다 이 필드를 통째로 교체한다(보내지 않으면 기존 값 보존)."
        ),
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
      theoryPrompts: z
        .union([
          z.array(
            z.object({
              label: z.string().optional().describe('표시 라벨 (예: "이론 19장 · 파일과 저장")'),
              prompt: z.string().describe('NotebookLM 입력 칸에 붙여넣을 프롬프트 본문'),
              contentIds: z
                .array(z.string())
                .optional()
                .describe(
                  '이 이론(덱)에 속한 실습 콘텐츠 id들(수업 진행 순서 = 개념 순서). 대시보드가 "이론 1개 + 그 실습들" 그룹으로 표시한다.'
                ),
              slideUrl: z
                .string()
                .optional()
                .describe('강사가 이 이론에 붙인 슬라이드/자료 링크(있으면 보존). 루틴이 새로 만들 땐 비움.'),
              links: z
                .array(
                  z.object({
                    id: z.string().optional(),
                    title: z.string().optional(),
                    url: z.string(),
                  })
                )
                .optional()
                .describe('강사가 직접 붙인 외부 URL 자료들({title,url}). 기존 값이 있으면 그대로 보존해 다시 보낼 것(루틴이 지우면 안 됨).'),
            })
          ),
          z.string().describe('위 배열의 JSON 문자열도 허용 — 중첩 배열을 문자열로 직렬화하는 클라이언트 대비'),
        ])
        .optional()
        .describe('이론 슬라이드 프롬프트 배열(이론 덱 1개 = 항목 1개; 배열 또는 그 JSON 문자열). 줄 때마다 그 날짜의 theoryPrompts 전체를 교체한다.'),
      showTheory: z
        .boolean()
        .optional()
        .describe('이 날짜만의 이론 영역 덮어쓰기. 없으면 클래스 설정(classrooms.showTheory)을 따른다. false=이 날짜는 이론 없이 진행.'),
      showPractice: z
        .boolean()
        .optional()
        .describe('이 날짜만의 실습 영역 덮어쓰기. 없으면 클래스 설정(classrooms.showPractice)을 따른다. false=이 날짜는 이론만 진행(실습 생성·공개 대상 아님).'),
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
                contentIds: z.array(z.string()).optional(),
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
    '실습 자료(자체 완결 HTML)를 학생 콘텐츠로 등록한다. 등록해도 학생 화면에는 바로 안 보이고, 강사가 클래스 관리 > 수업 진행에서 "공개"를 눌러야 그 실습이 학생에게 열린다(게이팅). categoryId나 categoryName을 주지 않으면 "실습 자료" 카테고리에 들어간다. 회차에 연결하려면 반환된 콘텐츠 id를 mutate_curriculum_sessions의 session.contentIds에 넣을 것. HTML은 외부 리소스 없이 자체 완결로 작성할 것 (최대 약 900KB). kind="reference"를 주면 학생이 직접 조작하는 실습이 아니라, 외부 도구(구글 문서 등)에서 보고 따라 만드는 예시·참고 문서(표시전용)로 등록된다 — 커리큘럼 details의 "실습 방식: 외부도구"인 개념에 사용.',
    {
      title: z.string(),
      description: z.string().optional().describe('학생에게 보이는 짧은 설명'),
      html: z.string().describe('완성된 HTML 문서 전체'),
      categoryId: z.string().optional(),
      categoryName: z.string().optional(),
      kind: z
        .enum(['practice', 'reference'])
        .optional()
        .describe("콘텐츠 성격. 'reference'=외부 도구 실습용 예시·참고 문서(비인터랙티브). 생략 시 practice."),
    },
    async (input) => run(() => createPracticeContent(input))
  );

  server.tool(
    'edit_content_html',
    '실습 자료(contents) HTML을 전체 재업로드 없이 부분 수정한다. 작은 수정(글자·버튼·버그 한 군데)은 update_resource로 30KB 전체를 다시 보내지 말고 이 도구로 바뀌는 부분만 고칠 것 — 채팅 왕복이 줄고 오류가 거의 사라진다. find는 현재 html에 그대로(공백·따옴표 포함) 있어야 하고 기본은 정확히 1번 일치해야 한다(여러 번이면 앞뒤 맥락을 더 넣어 유일하게 만들거나 replaceAll=true). edits는 순서대로 적용되며 하나라도 실패하면 전체가 취소된다. content id는 그대로라 날짜기록·회차 연결과 공개 상태는 유지된다. 현재 내용을 모르면 find_in_content_html로 먼저 확인할 것.',
    {
      id: z.string().describe('contents 문서 id'),
      edits: z
        .array(
          z.object({
            find: z.string().describe('현재 html에 정확히 있는 문자열(공백·따옴표 포함)'),
            replace: z.string().describe('바꿀 문자열'),
            replaceAll: z.boolean().optional().describe('여러 번 나타나면 모두 교체 (기본 false=정확히 1번)'),
          })
        )
        .min(1),
    },
    async ({ id, edits }) => run(() => editContentHtml(id, edits as ContentHtmlEdit[]))
  );

  server.tool(
    'find_in_content_html',
    '실습 자료(contents) HTML 안에서 문자열을 찾아 주변 맥락만 돌려준다(전체 html을 받지 않고 "들여다보기"용). edit_content_html에 넣을 find 문자열을 정확히 만들 때 사용. 일치 위치마다 줄번호·오프셋과 앞뒤 맥락 스니펫을 반환한다.',
    {
      id: z.string().describe('contents 문서 id'),
      query: z.string().describe('찾을 문자열'),
      maxMatches: z.number().optional().describe('반환할 최대 일치 개수 (기본 20, 최대 100)'),
      context: z.number().optional().describe('일치 앞뒤로 보여줄 글자 수 (기본 100, 최대 1000)'),
    },
    async ({ id, query, maxMatches, context }) =>
      run(() => findInContentHtml(id, query, { maxMatches, context }))
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
    'list_calendar_classes',
    'calendar.damuna.org의 참고 시간표(classes) 목록 조회. 각 수업의 반복 일정(요일=월0…토5, 시간)·기간을 반환한다. 교실에 연결할 calendarClassId를 고를 때 사용.',
    {},
    async () => run(async () => ({ items: await listCalendarClasses() }))
  );

  server.tool(
    'assign_curriculum_dates',
    '교실에 연결된 참고 시간표(calendarClassId)의 실제 수업 날짜들을 그 교실 커리큘럼 회차에 순서대로 자동 배정한다(1회차→첫 수업일…). done/skipped 회차는 건너뛴다. calendarClassId 미지정 시 교실에 저장된 연결을 사용.',
    {
      classroomId: z.string(),
      calendarClassId: z.string().optional(),
      overwrite: z.boolean().optional().describe('이미 날짜가 배정된 회차도 덮어쓸지 (기본 true)'),
    },
    async ({ classroomId, calendarClassId, overwrite }) =>
      run(() => assignCurriculumDatesFromCalendar({ classroomId, calendarClassId, overwrite }))
  );

  server.tool(
    'review_student_post',
    '학생 작품 게시물 승인/숨김/제거. approve하면 Drive 파일이 링크 공개로 바뀌고 damuna.org 학생 작품 페이지에 노출된다. delete는 Drive 파일과 게시물을 완전히 삭제한다(복구 불가).',
    { id: z.string(), action: z.enum(['approve', 'hide', 'delete']) },
    async ({ id, action }) => run(() => reviewStudentPost(id, action))
  );

  return server;
};

/**
 * Streamable HTTP (stateful) 세션 관리.
 *
 * ChatGPT 커넥터는 initialize 응답의 Mcp-Session-Id를 받아 이후 요청·SSE 스트림에
 * 재사용하는 표준 세션 흐름을 기대한다. 무상태로 운영하면 첫 요청 뒤 연결이 끊긴 것으로
 * 처리되므로, 세션ID를 발급하고 transport를 메모리에 유지한다.
 *
 * 주의: 세션 transport는 인스턴스 메모리에 보관되므로 어피니티가 없으면 후속 요청이
 * 다른 인스턴스로 가서 깨진다. 따라서 apphosting.yaml에서 maxInstances를 1로 고정해야 한다.
 */
const transports: Record<string, StreamableHTTPServerTransport> = {};
// 세션별 마지막 활동 시각. min 1로 인스턴스를 항상 띄워두면 재시작으로 청소될 일이 없어,
// 클라이언트가 DELETE 없이 버린 세션이 영영 메모리에 남는다(누수→OOM). 아래 스윕으로 막는다.
const lastSeenAt: Record<string, number> = {};

const SESSION_IDLE_MS = 2 * 60 * 60 * 1000; // 2시간 무활동이면 정리
const MAX_SESSIONS = 200; // 상한 — 초과 시 오래된 순으로 추가 정리
const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10분마다 스윕

const touchSession = (id: string) => {
  lastSeenAt[id] = Date.now();
};

const dropSession = (id: string) => {
  const transport = transports[id];
  delete transports[id];
  delete lastSeenAt[id];
  // close()는 스트림 정리 후 onclose를 부른다. 위에서 이미 맵에서 지웠으므로 재진입해도 안전.
  try {
    void transport?.close();
  } catch {
    /* 이미 닫힌 세션 — 무시 */
  }
};

// 무활동 세션 + 상한 초과분을 주기적으로 정리해 메모리 누수를 막는다.
const sweepSessions = () => {
  const now = Date.now();
  for (const id of Object.keys(transports)) {
    if (now - (lastSeenAt[id] ?? 0) > SESSION_IDLE_MS) {
      dropSession(id);
    }
  }
  const ids = Object.keys(transports);
  if (ids.length > MAX_SESSIONS) {
    ids
      .sort((a, b) => (lastSeenAt[a] ?? 0) - (lastSeenAt[b] ?? 0))
      .slice(0, ids.length - MAX_SESSIONS)
      .forEach(dropSession);
  }
};

setInterval(sweepSessions, SWEEP_INTERVAL_MS).unref();

// 인증: Authorization 헤더(Bearer) 우선, 없으면 URL 쿼리 파라미터(?key= 또는 ?token=).
// 쿼리 방식은 커스텀 헤더를 못 넣는 클라이언트를 위한 것. 통과하면 true, 실패면 401 응답 후 false.
const authorizeMcp = (req: express.Request, res: express.Response): boolean => {
  const queryKey = (req.query.key || req.query.token);
  const token = extractBearerToken(req.headers.authorization)
    || (typeof queryKey === 'string' ? queryKey.trim() : '');
  if (!token || !isValidApiKey(token)) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized: Bearer API 키가 필요합니다.' },
      id: null,
    });
    return false;
  }
  return true;
};

export const handleMcpPostRequest: express.RequestHandler = async (req, res) => {
  if (!authorizeMcp(req, res)) {
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;
    if (sessionId && transports[sessionId]) {
      // 기존 세션 재사용
      transport = transports[sessionId];
      touchSession(sessionId);
    } else if (sessionId) {
      // 세션ID는 왔는데 서버가 모른다 = 재배포/재시작으로 메모리 세션이 소실됨(매 배포마다 발생).
      // MCP 스펙: 만료된 세션ID 요청에는 404를 줘야 클라이언트가 새 initialize로 자동 재연결한다.
      // (400을 주면 클라가 하드 에러로 처리해 재연결하지 않아 배포 후 MCP가 죽은 채로 남았다.)
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session not found: 세션이 만료되었습니다. 다시 initialize 하세요.' },
        id: null,
      });
      return;
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // 새 세션 시작: initialize 요청에만 transport를 생성한다.
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          transports[id] = transport;
          touchSession(id);
        },
      });
      // 세션 종료(클라이언트 DELETE 또는 transport.close) 시 메모리에서 정리한다.
      // 주의: GET SSE 스트림이 끊겨도 onclose는 호출되지 않으므로(세션은 유지) 여기서 안전.
      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
          delete lastSeenAt[transport.sessionId];
        }
      };
      const server = buildMcpServer();
      await server.connect(transport);
    } else {
      // 세션ID가 없고 initialize도 아닌 요청은 거부한다.
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: 유효한 Mcp-Session-Id가 없거나 먼저 initialize가 필요합니다.' },
        id: null,
      });
      return;
    }

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

// GET /mcp (서버→클라 알림용 SSE 스트림), DELETE /mcp (세션 종료) 공통 처리.
const handleMcpSessionRequest: express.RequestHandler = async (req, res) => {
  if (!authorizeMcp(req, res)) {
    return;
  }
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: Mcp-Session-Id 헤더가 필요합니다.' },
      id: null,
    });
    return;
  }
  if (!transports[sessionId]) {
    // 재배포로 소실된 세션. 404로 알려 클라이언트가 새 세션을 시작하게 한다(스펙 준수).
    res.status(404).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Session not found: 세션이 만료되었습니다. 다시 initialize 하세요.' },
      id: null,
    });
    return;
  }
  touchSession(sessionId);
  try {
    await transports[sessionId].handleRequest(req, res);
  } catch (error) {
    console.error('[mcp] 세션 요청 처리 실패:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
};

export const handleMcpGetRequest = handleMcpSessionRequest;
export const handleMcpDeleteRequest = handleMcpSessionRequest;
