import type { ClassroomDateRecord, PublishedLesson } from '../types';

export const CLASSROOMS_COLLECTION = 'classrooms';
export const CLASSROOM_DATE_RECORDS_COLLECTION = 'classroomDateRecords';
export const STUDENTS_COLLECTION = 'students';
export const DAILY_REVIEWS_COLLECTION = 'dailyReviews';
export const PUBLISHED_LESSONS_COLLECTION = 'publishedLessons';
export const STUDENT_VOICE_MESSAGES_COLLECTION = 'studentVoiceMessages';
export const TEACHER_BROADCAST_MESSAGES_COLLECTION = 'teacherBroadcastMessages';

export const getClassroomDateRecordId = (classroomId: string, date: string) =>
  `${classroomId.trim()}_${date.trim()}`;

/** publishedLessons 문서 id — classroomDateRecord와 동일한 규칙(반+날짜)을 따른다. */
export const getPublishedLessonId = (classroomId: string, date: string) =>
  `${classroomId.trim()}_${date.trim()}`;

/**
 * 공개(이론·실습) 세션 자동 만료 시간(ms). 마지막 공개 동작(updatedAt) 뒤 이 시간이 지나면
 * 교사가 끄는 걸 깜빡해도 학생 화면·대시보드 달력 모두 '꺼짐'으로 취급한다(발행 후 3시간).
 * 서버 크론 없이 읽는 시점에 판정하므로, 교사 앱을 꺼둬도 학생 화면이 자동으로 잠긴다.
 */
export const PUBLISHED_LESSON_TTL_MS = 3 * 60 * 60 * 1000;

/**
 * 이 공개 문서가 만료됐는지(마지막 공개 updatedAt 후 TTL 경과) 판정.
 * updatedAt이 없거나 파싱 불가면 '만료 아님'으로 본다(시각 불명일 때 공개를 임의로 끄지 않도록 안전).
 */
export const isPublishedLessonExpired = (
  lesson: Pick<PublishedLesson, 'updatedAt'>,
  now: number = Date.now()
): boolean => {
  const ts = Date.parse(lesson.updatedAt || '');
  if (Number.isNaN(ts)) return false;
  return now - ts >= PUBLISHED_LESSON_TTL_MS;
};

/**
 * 지금 학생에게 실제로 공개 중인 상태(내용이 있고 + 만료 안 됨). 이론/실습을 나눠 돌려준다.
 * `any`는 둘 중 하나라도 켜져 있는지. 만료됐으면 내용이 있어도 전부 false.
 */
export const getPublishedLessonLiveState = (
  lesson: Pick<PublishedLesson, 'publishedContentIds' | 'publishedTheory' | 'updatedAt'>,
  now: number = Date.now()
): { theory: boolean; practice: boolean; any: boolean } => {
  if (isPublishedLessonExpired(lesson, now)) {
    return { theory: false, practice: false, any: false };
  }
  const theory = Boolean(lesson.publishedTheory?.url);
  const practice = (lesson.publishedContentIds?.length ?? 0) > 0;
  return { theory, practice, any: theory || practice };
};

export const getClassroomDateRecordTimestamp = (
  record: Pick<ClassroomDateRecord, 'updatedAt' | 'createdAt'>
) => {
  const updatedAt = new Date(record.updatedAt || '').getTime();
  if (Number.isFinite(updatedAt)) {
    return updatedAt;
  }

  const createdAt = new Date(record.createdAt || '').getTime();
  if (Number.isFinite(createdAt)) {
    return createdAt;
  }

  return 0;
};

export const isCanonicalClassroomDateRecordId = (
  record: Pick<ClassroomDateRecord, 'id' | 'classroomId' | 'date'>
) => record.id === getClassroomDateRecordId(record.classroomId, record.date);

const hasMemoText = (record: ClassroomDateRecord) => record.memo.trim().length > 0;

const getContentCount = (record: ClassroomDateRecord) => record.contentIds.length;

export const comparePreferredClassroomDateRecord = (
  left: ClassroomDateRecord,
  right: ClassroomDateRecord
) => {
  const leftCanonical = isCanonicalClassroomDateRecordId(left);
  const rightCanonical = isCanonicalClassroomDateRecordId(right);

  if (leftCanonical !== rightCanonical) {
    return leftCanonical ? -1 : 1;
  }

  const timestampDiff =
    getClassroomDateRecordTimestamp(right) - getClassroomDateRecordTimestamp(left);
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  if (hasMemoText(left) !== hasMemoText(right)) {
    return hasMemoText(left) ? -1 : 1;
  }

  if (getContentCount(left) !== getContentCount(right)) {
    return getContentCount(right) - getContentCount(left);
  }

  return left.id.localeCompare(right.id);
};

export const sortClassroomDateRecords = (records: ClassroomDateRecord[]) =>
  [...records].sort((left, right) => {
    const dateDiff = new Date(right.date).getTime() - new Date(left.date).getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }

    return comparePreferredClassroomDateRecord(left, right);
  });
