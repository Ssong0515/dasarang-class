export class AdminApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export const RESOURCE_NAMES = [
  'classrooms',
  'students',
  'memos',
  'classroomDateRecords',
  'contents',
  'categories',
  'dailyReviews',
  'curriculums',
  'studentPosts',
] as const;

export type ResourceName = (typeof RESOURCE_NAMES)[number];

export const isResourceName = (value: string): value is ResourceName =>
  (RESOURCE_NAMES as readonly string[]).includes(value);

type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'stringOrNull';

interface FieldSpec {
  type: FieldType;
  required?: boolean;
  enumValues?: readonly string[];
  description: string;
}

export interface ResourceSpec {
  collection: string;
  description: string;
  /** equality 필터로 허용되는 필드 */
  filterFields: string[];
  /** dateFrom/dateTo 범위 필터의 기준 필드 */
  dateField?: string;
  /** 목록 정렬 기준 (메모리 정렬) */
  sort: { field: string; direction: 'asc' | 'desc' };
  fields: Record<string, FieldSpec>;
  /** 목록 응답에서 제외하는 무거운 필드 (includeHtml=true로 포함 가능) */
  listOmitFields?: string[];
  /** create 시 채우는 기본값 */
  defaults?: (ctx: { ownerUid: string; nowIso: string }) => Record<string, unknown>;
  /** update 시 수정 금지 필드 (id/ownerUid는 항상 금지) */
  immutableFields?: string[];
}

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export const isDateString = (value: unknown): value is string =>
  typeof value === 'string' && YYYY_MM_DD.test(value);

export const RESOURCE_SPECS: Record<ResourceName, ResourceSpec> = {
  classrooms: {
    collection: 'classrooms',
    description:
      '교실(반). curriculumId로 커리큘럼과 연결할 수 있다. description=클래스 특징/내용(운영·강사용 내부 메모, 학생 비공개)이며 GPT로 채우는 칸이다.',
    filterFields: ['curriculumId'],
    sort: { field: 'order', direction: 'asc' },
    fields: {
      name: { type: 'string', required: true, description: '반 이름' },
      description: {
        type: 'string',
        description: '클래스 특징/내용 (운영·강사용 내부 메모, 학생에게 노출 안 함). 수업 자동생성 등 내부 참고용.',
      },
      organization: { type: 'string', description: '기관/단체명 (예: "구로구청 / 디지털배움터")' },
      feeItems: {
        type: 'array',
        description:
          '강사비 항목 목록 [{organization?, feePerHour?, hoursPerSession?}]. 기관·단체마다 시수 단가(원)와 회차당 시수를 한 항목씩 두고, 회차 완료 시 항목 합이 적립된다. 있으면 레거시 feePerHour/hoursPerSession보다 우선.',
      },
      isOpen: { type: 'boolean', description: 'UI에서 펼침 여부' },
      order: { type: 'number', description: '정렬 순서' },
      icon: { type: 'string', description: '아이콘 이름' },
      color: { type: 'string', description: '색상' },
      curriculumId: { type: 'stringOrNull', description: '연결된 커리큘럼 id (null=연결 해제)' },
      driveFolderId: { type: 'string', description: '학생 작업물 업로드용 Google Drive 폴더 id' },
      driveFolderName: { type: 'string', description: 'Drive 폴더 이름' },
      annotationLanguages: {
        type: 'array',
        description:
          '이론 슬라이드·실습에 병기할 번역 언어 목록 (문자열 배열, 0개~여러 개. 예: ["러시아어","베트남어"]). 강사가 직접 지정하며, 학생 language로 유추하지 않는다. 비면 병기 없이 쉬운 한국어+그림만 쓴다.',
      },
      copyFromClassroomIds: {
        type: 'array',
        description:
          "'수업 복사해오기'로 이 반이 가져올 수 있는 원본 클래스 id 배열(강사가 반 설정에서 직접 고른다). 대시보드 복사 후보 = 여기 담긴 클래스들의 수업 기록. 비면 복사 후보 없음.",
      },
      showTheory: {
        type: 'boolean',
        description:
          '이론 영역 기본값 — 대시보드 "수업 진행·학생 공개"에 표시할지. 없으면 활성으로 본다. 날짜별로는 classroomDateRecords.showTheory가 이 값을 덮어쓴다.',
      },
      showPractice: {
        type: 'boolean',
        description:
          '실습(학생 공개) 영역 기본값. 없으면 활성으로 본다. "앱 기초/활용"처럼 이론만 하는 반은 false. 날짜별로는 classroomDateRecords.showPractice가 이 값을 덮어쓴다.',
      },
    },
    defaults: ({ nowIso }) => ({ createdAt: nowIso }),
  },
  students: {
    collection: 'students',
    description: '학생. classroomId로 소속 반을 가리킨다. 삭제는 deletedAt 소프트 삭제를 권장.',
    filterFields: ['classroomId'],
    sort: { field: 'order', direction: 'asc' },
    fields: {
      classroomId: { type: 'string', required: true, description: '소속 반 id' },
      name: { type: 'string', required: true, description: '학생 이름' },
      initials: { type: 'string', description: '이니셜 (생략 시 이름 앞글자로 생성)' },
      order: { type: 'number', description: '반 내 정렬 순서' },
      age: { type: 'string', description: '나이' },
      contact: { type: 'string', description: '연락처' },
      memo: { type: 'string', description: '학생 메모' },
      language: {
        type: 'string',
        description:
          '학생의 모국어/사용 언어 (자유 입력, 예: "러시아어", "베트남어"). 참고용 정보일 뿐, 슬라이드·실습 병기 언어는 여기서 유추하지 않고 반 설정(classrooms.annotationLanguages)에서 직접 정한다.',
      },
      inactiveAt: { type: 'string', description: '비활성 처리 시각 (ISO)' },
      deletedAt: { type: 'string', description: '소프트 삭제 시각 (ISO)' },
    },
    defaults: ({ nowIso }) => ({ createdAt: nowIso, updatedAt: nowIso }),
  },
  memos: {
    collection: 'memos',
    description: '날짜별 일반 메모. curriculumSessionId로 커리큘럼 회차에 연결할 수 있다.',
    filterFields: ['date', 'curriculumId', 'curriculumSessionId'],
    dateField: 'date',
    sort: { field: 'date', direction: 'desc' },
    fields: {
      content: { type: 'string', required: true, description: '메모 내용' },
      date: { type: 'string', required: true, description: '날짜 YYYY-MM-DD' },
      curriculumId: { type: 'string', description: '연결된 커리큘럼 id' },
      curriculumSessionId: { type: 'string', description: '연결된 커리큘럼 회차 id' },
    },
  },
  classroomDateRecords: {
    collection: 'classroomDateRecords',
    description:
      '특정 반의 특정 날짜 수업 기록 (메모/출석/배정 콘텐츠). 문서 id는 {classroomId}_{date} 형식. 생성/수정은 가급적 upsertLessonRecord 작업을 사용할 것.',
    filterFields: ['classroomId', 'date', 'curriculumId', 'curriculumSessionId'],
    dateField: 'date',
    sort: { field: 'date', direction: 'desc' },
    fields: {
      classroomId: { type: 'string', required: true, description: '반 id' },
      date: { type: 'string', required: true, description: '날짜 YYYY-MM-DD' },
      classroomName: { type: 'string', description: '반 이름 (서버가 자동으로 채움)' },
      memo: { type: 'string', description: '수업 메모' },
      contentIds: { type: 'array', description: '그 날 배정한 콘텐츠 id 배열' },
      attendance: { type: 'array', description: '출석 배열 [{studentId, status: Present|Absent|Late, isExcluded?}]' },
      curriculumId: { type: 'string', description: '연결된 커리큘럼 id' },
      curriculumSessionId: { type: 'string', description: '연결된 커리큘럼 회차 id' },
      showTheory: {
        type: 'boolean',
        description:
          '이 날짜만의 이론 영역 덮어쓰기. 없으면 클래스 설정(classrooms.showTheory)을 따른다. false면 그 날짜는 이론 없이(실습만) 진행.',
      },
      showPractice: {
        type: 'boolean',
        description:
          '이 날짜만의 실습 영역 덮어쓰기. 없으면 클래스 설정(classrooms.showPractice)을 따른다. false면 그 날짜는 이론만 진행(실습 생성·공개 대상 아님).',
      },
      exemplary: {
        type: 'boolean',
        description:
          "강사가 '잘 만든 수업(모범 수업)'으로 표시한 기록. get_overview의 exemplaryLessons에 모이고, 루틴이 새 수업을 만들 때 톤·구성 참고자료로 읽는다.",
      },
      exemplaryNote: {
        type: 'string',
        description: '이 수업이 왜 좋은지 한 줄 메모(선택). 루틴이 참고할 때 힌트가 된다.',
      },
    },
    immutableFields: ['classroomId', 'date'],
  },
  contents: {
    collection: 'contents',
    description:
      '수업 콘텐츠. slideUrl=이론 슬라이드(강사 화면 전용), html=실습(학생 화면). kind=콘텐츠 성격(practice=학생이 직접 조작하는 실습(기본) / reference=외부 도구(구글 문서 등)로 실습할 때 보고 따라 하는 예시·참고 문서, 비인터랙티브). categoryId가 null이면 어디에도 안 보인다. 카테고리에 넣어도 학생 화면에는 강사가 수업 중 "공개"한 실습만 열린다(게이팅). 목록 조회에서는 html이 생략되며 includeHtml=true로 포함시킬 수 있다.',
    filterFields: ['categoryId'],
    sort: { field: 'order', direction: 'asc' },
    fields: {
      title: { type: 'string', required: true, description: '콘텐츠 제목' },
      description: { type: 'string', description: '설명' },
      html: { type: 'string', description: '자체 HTML 콘텐츠 (iframe으로 렌더됨, 최대 약 900KB)' },
      slideUrl: { type: 'string', description: 'Google Slides 임베드 URL' },
      kind: {
        type: 'string',
        enumValues: ['practice', 'reference'],
        description:
          "콘텐츠 성격. 'practice'(학생이 직접 조작하는 실습, 기본값) | 'reference'(외부 도구—구글 문서 등—로 실습할 때 보고 따라 하는 예시·참고 문서, 비인터랙티브 표시전용). 없으면 practice로 취급.",
      },
      categoryId: { type: 'stringOrNull', description: '카테고리 id. null이면 미배정(학생에게 숨김)' },
      order: { type: 'number', description: '카테고리 내 정렬 순서' },
      standalone: {
        type: 'boolean',
        description:
          'true면 이 예제(kind:reference)를 순서상 바로 앞 실습과 개념 단위로 묶지 않고 대시보드에서 단독 행으로 표시한다(실습의 완성 예시가 아니라 그 자체가 하나의 개념인 미션지·안내문용).',
      },
    },
    listOmitFields: ['html'],
    defaults: ({ nowIso }) => ({ createdAt: nowIso, description: '', html: '', categoryId: null }),
  },
  categories: {
    collection: 'categories',
    description: '콘텐츠 카테고리. 학생 페이지에서 카테고리별로 묶여 보인다.',
    filterFields: [],
    sort: { field: 'order', direction: 'asc' },
    fields: {
      name: { type: 'string', required: true, description: '카테고리 이름' },
      order: { type: 'number', description: '정렬 순서' },
    },
  },
  dailyReviews: {
    collection: 'dailyReviews',
    description: '날짜별 AI 데일리 리뷰 요약.',
    filterFields: ['date'],
    dateField: 'date',
    sort: { field: 'date', direction: 'desc' },
    fields: {
      date: { type: 'string', required: true, description: '날짜 YYYY-MM-DD' },
      summary: { type: 'string', required: true, description: '요약 내용' },
      sourceRecordIds: { type: 'array', description: '근거 수업기록 id 배열' },
    },
    defaults: ({ nowIso }) => ({ createdAt: nowIso, updatedAt: nowIso, sourceRecordIds: [] }),
  },
  curriculums: {
    collection: 'curriculums',
    description:
      '커리큘럼 트랙 (예: 디지털 기초/중급/고급). sessions는 회차 배열 — 회차 조작은 mutateCurriculumSessions 작업을 사용할 것 (직접 PATCH로 sessions 전체를 덮어쓰는 것도 가능).',
    filterFields: [],
    sort: { field: 'order', direction: 'asc' },
    fields: {
      title: { type: 'string', required: true, description: '커리큘럼 이름' },
      description: { type: 'string', description: '설명' },
      sessions: {
        type: 'array',
        description:
          '회차 배열 [{id, order(1부터), topic, details?, plannedDate?(YYYY-MM-DD), contentIds?, status: planned|done|skipped}]',
      },
      order: { type: 'number', description: '정렬 순서' },
    },
    defaults: ({ nowIso }) => ({ createdAt: nowIso, updatedAt: nowIso, sessions: [] }),
  },
  studentPosts: {
    collection: 'studentPosts',
    description:
      '학생 작품 게시물. 학생 업로드 시 pending으로 자동 생성되고, 승인(reviewStudentPost approve)하면 damuna.org에 공개된다.',
    filterFields: ['status', 'classroomId'],
    sort: { field: 'createdAt', direction: 'desc' },
    fields: {
      title: { type: 'string', required: true, description: '작품 제목' },
      description: { type: 'string', description: '작품 설명' },
      studentName: { type: 'string', description: '학생 이름' },
      anonymous: { type: 'boolean', description: 'true면 공개 시 익명으로 표시' },
      classroomId: { type: 'string', description: '반 id' },
      classroomName: { type: 'string', description: '반 이름' },
      driveFileId: { type: 'string', description: 'Google Drive 파일 id' },
      fileName: { type: 'string', description: '파일 이름' },
      mimeType: { type: 'string', description: '파일 MIME 타입' },
      webViewLink: { type: 'string', description: 'Drive 보기 링크' },
      imageUrl: { type: 'string', description: '공개 썸네일 URL (승인 시 자동 설정)' },
      status: { type: 'string', enumValues: ['pending', 'approved', 'hidden'], description: '게시 상태' },
      order: { type: 'number', description: '쇼케이스 정렬 순서' },
    },
    defaults: ({ nowIso }) => ({ createdAt: nowIso, status: 'pending' }),
  },
};

const matchesType = (value: unknown, type: FieldType) => {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'stringOrNull':
      return typeof value === 'string' || value === null;
  }
};

export const validateResourceData = (
  resource: ResourceName,
  data: Record<string, unknown>,
  mode: 'create' | 'update'
) => {
  const spec = RESOURCE_SPECS[resource];

  for (const [key, value] of Object.entries(data)) {
    if (key === 'id' || key === 'ownerUid' || key === 'createdAt' || key === 'updatedAt') {
      throw new AdminApiError(400, `'${key}' 필드는 서버가 관리합니다. data에서 제거하세요.`);
    }
    const fieldSpec = spec.fields[key];
    if (!fieldSpec) {
      throw new AdminApiError(400, `'${resource}'에 없는 필드입니다: '${key}'. 허용 필드: ${Object.keys(spec.fields).join(', ')}`);
    }
    if (mode === 'update' && spec.immutableFields?.includes(key)) {
      throw new AdminApiError(400, `'${key}' 필드는 수정할 수 없습니다.`);
    }
    if (value === undefined) {
      continue;
    }
    if (!matchesType(value, fieldSpec.type)) {
      throw new AdminApiError(400, `'${key}' 필드 타입이 올바르지 않습니다 (${fieldSpec.type} 필요).`);
    }
    if (fieldSpec.enumValues && typeof value === 'string' && !fieldSpec.enumValues.includes(value)) {
      throw new AdminApiError(400, `'${key}' 값은 ${fieldSpec.enumValues.join('|')} 중 하나여야 합니다.`);
    }
    if ((key === 'date' || key === 'plannedDate') && typeof value === 'string' && !isDateString(value)) {
      throw new AdminApiError(400, `'${key}'는 YYYY-MM-DD 형식이어야 합니다.`);
    }
  }

  if (mode === 'create') {
    for (const [key, fieldSpec] of Object.entries(spec.fields)) {
      if (fieldSpec.required && (data[key] === undefined || data[key] === '')) {
        throw new AdminApiError(400, `필수 필드가 없습니다: '${key}'`);
      }
    }
  }
};
