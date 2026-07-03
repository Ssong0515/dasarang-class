import { RESOURCE_NAMES, RESOURCE_SPECS, type ResourceName } from './resources';

const buildResourceGuide = () => {
  const lines: string[] = [];
  for (const name of RESOURCE_NAMES) {
    const spec = RESOURCE_SPECS[name as ResourceName];
    lines.push(`### ${name}`);
    lines.push(spec.description);
    lines.push('필드:');
    for (const [field, fieldSpec] of Object.entries(spec.fields)) {
      const required = fieldSpec.required ? ' (필수)' : '';
      const enumNote = fieldSpec.enumValues ? ` [${fieldSpec.enumValues.join('|')}]` : '';
      lines.push(`- ${field} (${fieldSpec.type})${required}${enumNote}: ${fieldSpec.description}`);
    }
    if (spec.filterFields.length > 0) {
      lines.push(`목록 필터: ${spec.filterFields.join(', ')}${spec.dateField ? ' + dateFrom/dateTo' : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
};

export const buildOpenApiDocument = () => {
  const serverUrl = (process.env.APP_URL || 'https://class.damuna.org').replace(/\/$/, '');
  const resourceEnum = [...RESOURCE_NAMES];

  const errorResponse = {
    description: '오류',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
  };

  const resourceParam = {
    name: 'resource',
    in: 'path',
    required: true,
    description: '리소스 이름',
    schema: { type: 'string', enum: resourceEnum },
  };

  const idParam = {
    name: 'id',
    in: 'path',
    required: true,
    description: '문서 id',
    schema: { type: 'string' },
  };

  // ChatGPT Actions 검증기는 type:object 스키마에 properties 키가 존재할 것을 요구한다.
  // 자유 형식(문서 내용이 리소스마다 다름)은 properties:{} + additionalProperties:true로 표현.
  const genericObjectSchema = {
    type: 'object',
    properties: {},
    additionalProperties: true,
  };

  return {
    openapi: '3.1.0',
    info: {
      title: '다사랑 수업 관리 API',
      version: '1.0.0',
      description: [
        '다사랑문화학교 수업 관리 앱(class.damuna.org)의 데이터를 조회/생성/수정/삭제하는 API.',
        '',
        '## 사용 순서',
        '1. 대화 시작 시 getOverview로 교실/커리큘럼/오늘 수업 현황을 파악한다.',
        '2. id가 필요한 작업은 먼저 listResource로 대상의 id를 찾는다.',
        '3. 수업 기록(특정 반의 특정 날짜 메모/출석/콘텐츠)은 반드시 upsertLessonRecord를 사용한다.',
        '',
        '## 리소스 안내',
        buildResourceGuide(),
        '## 달력 연동',
        '수업 기록은 calendar.damuna.org에 자동 반영된다. 별도 일정(행사 등)은 calendar/events로 직접 관리한다.',
      ].join('\n'),
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }],
    components: {
      schemas: {
        FirestoreDoc: {
          type: 'object',
          properties: { id: { type: 'string' } },
          additionalProperties: true,
        },
        ErrorResponse: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
    paths: {
      '/api/gpt/overview': {
        get: {
          operationId: 'getOverview',
          summary: '전체 현황 (교실, 커리큘럼, 오늘 수업, 최근 메모, 승인 대기 게시물)',
          responses: {
            '200': { description: '현황 스냅샷', content: { 'application/json': { schema: genericObjectSchema } } },
            '401': errorResponse,
          },
        },
      },
      '/api/gpt/resources/{resource}': {
        get: {
          operationId: 'listResource',
          summary: '리소스 목록 조회 (필터 가능)',
          parameters: [
            resourceParam,
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
            { name: 'dateFrom', in: 'query', description: 'YYYY-MM-DD (date 필드 리소스만)', schema: { type: 'string' } },
            { name: 'dateTo', in: 'query', description: 'YYYY-MM-DD (date 필드 리소스만)', schema: { type: 'string' } },
            { name: 'includeHtml', in: 'query', description: 'contents 목록에서 html 포함 여부', schema: { type: 'boolean' } },
            {
              name: 'filter',
              in: 'query',
              description: '등호 필터. 예: classroomId=abc 는 filter=classroomId:abc, 카테고리 미배정은 filter=categoryId:null',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': { description: '목록', content: { 'application/json': { schema: genericObjectSchema } } },
            '400': errorResponse,
            '401': errorResponse,
          },
        },
        post: {
          operationId: 'createResource',
          summary: '리소스 생성',
          parameters: [resourceParam],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['data'],
                  properties: {
                    id: { type: 'string', description: '명시적 문서 id (보통 생략)' },
                    data: { ...genericObjectSchema, description: '리소스 안내의 필드 표를 따르는 데이터' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: '생성된 문서', content: { 'application/json': { schema: genericObjectSchema } } },
            '400': errorResponse,
            '401': errorResponse,
          },
        },
      },
      '/api/gpt/resources/{resource}/{id}': {
        get: {
          operationId: 'getResource',
          summary: '리소스 단건 조회 (contents의 html 전체 포함)',
          parameters: [resourceParam, idParam],
          responses: {
            '200': { description: '문서', content: { 'application/json': { schema: genericObjectSchema } } },
            '404': errorResponse,
            '401': errorResponse,
          },
        },
        patch: {
          operationId: 'updateResource',
          summary: '리소스 부분 수정 (보낸 필드만 병합)',
          parameters: [resourceParam, idParam],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['data'],
                  properties: { data: genericObjectSchema },
                },
              },
            },
          },
          responses: {
            '200': { description: '수정된 문서', content: { 'application/json': { schema: genericObjectSchema } } },
            '400': errorResponse,
            '404': errorResponse,
            '401': errorResponse,
          },
        },
        delete: {
          operationId: 'deleteResource',
          summary: '리소스 삭제',
          parameters: [resourceParam, idParam],
          responses: {
            '200': { description: '삭제 결과', content: { 'application/json': { schema: genericObjectSchema } } },
            '404': errorResponse,
            '401': errorResponse,
          },
        },
      },
      '/api/gpt/lesson-records/upsert': {
        post: {
          operationId: 'upsertLessonRecord',
          summary: '수업 기록 생성/수정 (반+날짜 단위, 달력 자동 동기화)',
          description:
            '특정 반의 특정 날짜 수업 기록을 만들거나 수정한다. 이미 있으면 보낸 필드만 병합된다. curriculumSessionId를 주면 해당 커리큘럼 회차에 연결된다.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['classroomId', 'date'],
                  properties: {
                    classroomId: { type: 'string' },
                    date: { type: 'string', description: 'YYYY-MM-DD' },
                    memo: { type: 'string' },
                    contentIds: { type: 'array', items: { type: 'string' } },
                    attendance: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          studentId: { type: 'string' },
                          status: { type: 'string', enum: ['Present', 'Absent', 'Late'] },
                          isExcluded: { type: 'boolean' },
                        },
                      },
                    },
                    curriculumId: { type: 'string' },
                    curriculumSessionId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: '저장된 기록', content: { 'application/json': { schema: genericObjectSchema } } },
            '400': errorResponse,
            '404': errorResponse,
            '401': errorResponse,
          },
        },
      },
      '/api/gpt/curriculums/{curriculumId}/sessions': {
        post: {
          operationId: 'mutateCurriculumSessions',
          summary: '커리큘럼 회차 추가/수정/삭제/순서변경 (일괄)',
          parameters: [
            { name: 'curriculumId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['ops'],
                  properties: {
                    ops: {
                      type: 'array',
                      description:
                        "작업 배열. add: {type:'add', session:{topic,details?,contentIds?}, order?(1-based 삽입 위치)} / update: {type:'update', sessionId, session:{...}} / remove: {type:'remove', sessionId} / reorder: {type:'reorder', sessionId, order}",
                      items: genericObjectSchema,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: '갱신된 회차 목록', content: { 'application/json': { schema: genericObjectSchema } } },
            '400': errorResponse,
            '404': errorResponse,
            '401': errorResponse,
          },
        },
      },
      '/api/gpt/calendar/events': {
        get: {
          operationId: 'listCalendarEvents',
          summary: 'calendar.damuna.org 달력 이벤트 목록',
          parameters: [
            { name: 'dateFrom', in: 'query', schema: { type: 'string' } },
            { name: 'dateTo', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: '이벤트 목록', content: { 'application/json': { schema: genericObjectSchema } } },
            '401': errorResponse,
          },
        },
        put: {
          operationId: 'upsertCalendarEvent',
          summary: 'calendar.damuna.org 달력 이벤트 생성/수정',
          description: 'clsrec_ 접두사(수업 기록 자동 동기화) 이벤트는 직접 수정할 수 없다.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['date', 'title'],
                  properties: {
                    id: { type: 'string', description: '기존 이벤트 수정 시에만' },
                    date: { type: 'string', description: 'YYYY-MM-DD' },
                    title: { type: 'string' },
                    time: { type: 'string', description: '예: 14:00 (선택)' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: '저장된 이벤트', content: { 'application/json': { schema: genericObjectSchema } } },
            '400': errorResponse,
            '401': errorResponse,
          },
        },
      },
      '/api/gpt/calendar/events/{id}': {
        delete: {
          operationId: 'deleteCalendarEvent',
          summary: 'calendar.damuna.org 달력 이벤트 삭제',
          parameters: [idParam],
          responses: {
            '200': { description: '삭제 결과', content: { 'application/json': { schema: genericObjectSchema } } },
            '400': errorResponse,
            '401': errorResponse,
          },
        },
      },
      '/api/gpt/calendar/resync': {
        post: {
          operationId: 'resyncCalendar',
          summary: '수업 기록 전체를 calendar.damuna.org에 재동기화',
          responses: {
            '200': { description: '동기화 결과 {upserted, removed}', content: { 'application/json': { schema: genericObjectSchema } } },
            '401': errorResponse,
          },
        },
      },
      '/api/gpt/calendar/classes': {
        get: {
          operationId: 'listCalendarClasses',
          summary: 'calendar.damuna.org 참고 시간표(classes) 목록',
          description: '각 수업의 반복 일정(요일=월0…토5, 시간)·기간. 교실에 연결할 calendarClassId 선택에 사용.',
          responses: {
            '200': { description: '시간표 목록', content: { 'application/json': { schema: genericObjectSchema } } },
            '401': errorResponse,
          },
        },
      },
      '/api/gpt/calendar/assign-curriculum-dates': {
        post: {
          operationId: 'assignCurriculumDates',
          summary: '참고 시간표 날짜를 교실 커리큘럼 회차에 자동 배정',
          description:
            '교실에 연결된 calendarClassId의 실제 수업 날짜들을 커리큘럼 회차에 순서대로 채운다(1회차→첫 수업일…). done/skipped 회차는 건너뛴다.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['classroomId'],
                  properties: {
                    classroomId: { type: 'string' },
                    calendarClassId: { type: 'string', description: '미지정 시 교실에 저장된 연결 사용' },
                    overwrite: { type: 'boolean', description: '기존 배정 날짜 덮어쓰기 (기본 true)' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: '배정 결과', content: { 'application/json': { schema: genericObjectSchema } } },
            '400': errorResponse,
            '404': errorResponse,
            '401': errorResponse,
          },
        },
      },
      '/api/gpt/student-posts/{id}/review': {
        post: {
          operationId: 'reviewStudentPost',
          summary: '학생 게시물 승인/숨김/제거 (승인 시 damuna.org에 공개, 제거 시 Drive 파일까지 완전 삭제)',
          parameters: [idParam],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['action'],
                  properties: {
                    action: { type: 'string', enum: ['approve', 'hide', 'delete'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: '처리 결과', content: { 'application/json': { schema: genericObjectSchema } } },
            '400': errorResponse,
            '404': errorResponse,
            '401': errorResponse,
          },
        },
      },
    },
  };
};
