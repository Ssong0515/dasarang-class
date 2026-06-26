import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  BookOpen,
  Plus,
  Trash2,
  Save,
  Loader2,
  ChevronUp,
  ChevronDown,
  FileText,
  ListChecks,
  Library,
} from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';
import { Curriculum, CurriculumSession, LessonContent } from '../types';

interface CurriculumManagerProps {
  curriculums: Curriculum[];
  contents: LessonContent[];
  onCreateCurriculum: (title: string, description?: string) => Promise<string | null>;
  onUpdateCurriculumMeta: (
    curriculumId: string,
    data: { title?: string; description?: string }
  ) => Promise<void>;
  onDeleteCurriculum: (curriculumId: string) => Promise<void>;
  onSaveCurriculumSessions: (curriculumId: string, sessions: CurriculumSession[]) => Promise<void>;
}

const newSessionId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `session-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

const sortSessions = (sessions: CurriculumSession[]) =>
  [...sessions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// 주제·상세·순서만 비교한다 (커리큘럼=순수 템플릿; 날짜·상태는 반별이라 여기서 다루지 않음).
const normalizeSessionsForCompare = (sessions: CurriculumSession[]) =>
  JSON.stringify(
    sessions.map((session, index) => ({
      topic: session.topic || '',
      details: session.details || '',
      order: index + 1,
    }))
  );

export const CurriculumManager: React.FC<CurriculumManagerProps> = ({
  curriculums,
  contents,
  onCreateCurriculum,
  onUpdateCurriculumMeta,
  onDeleteCurriculum,
  onSaveCurriculumSessions,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(curriculums[0]?.id ?? null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [sessionDrafts, setSessionDrafts] = useState<CurriculumSession[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const contentTitleById = useMemo(
    () => new Map(contents.map((content) => [content.id, content.title])),
    [contents]
  );

  const selectedCurriculum = useMemo(
    () => curriculums.find((curriculum) => curriculum.id === selectedId) || null,
    [curriculums, selectedId]
  );

  // 선택이 사라지면(삭제 등) 첫 커리큘럼으로 보정
  useEffect(() => {
    if (!selectedId || curriculums.some((curriculum) => curriculum.id === selectedId)) {
      return;
    }
    setSelectedId(curriculums[0]?.id ?? null);
  }, [curriculums, selectedId]);

  const sortedSessions = useMemo(
    () => sortSessions(selectedCurriculum?.sessions || []),
    [selectedCurriculum]
  );
  const savedSessionsKey = useMemo(
    () => normalizeSessionsForCompare(sortedSessions),
    [sortedSessions]
  );

  // 선택 커리큘럼이 바뀌거나 외부(GPT 등)에서 갱신되면 편집 초안을 다시 맞춘다.
  useEffect(() => {
    setDraftTitle(selectedCurriculum?.title || '');
    setDraftDescription(selectedCurriculum?.description || '');
    setSessionDrafts(sortedSessions.map((session) => ({ ...session })));
    setExpandedSessionId(null);
    setSaveError(null);
  }, [selectedCurriculum?.id, selectedCurriculum?.updatedAt, savedSessionsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMetaDirty =
    !!selectedCurriculum &&
    (draftTitle.trim() !== (selectedCurriculum.title || '') ||
      draftDescription !== (selectedCurriculum.description || ''));
  const isSessionsDirty =
    normalizeSessionsForCompare(sessionDrafts) !== savedSessionsKey;
  const isDirty = isMetaDirty || isSessionsDirty;

  const updateSessionDraft = (id: string, patch: Partial<CurriculumSession>) => {
    setSessionDrafts((drafts) =>
      drafts.map((session) => (session.id === id ? { ...session, ...patch } : session))
    );
  };

  const addSessionDraft = () => {
    setSessionDrafts((drafts) => [
      ...drafts,
      { id: newSessionId(), order: drafts.length + 1, topic: '' },
    ]);
  };

  const removeSessionDraft = (id: string) => {
    setSessionDrafts((drafts) => drafts.filter((session) => session.id !== id));
    if (expandedSessionId === id) {
      setExpandedSessionId(null);
    }
  };

  const moveSessionDraft = (id: string, direction: -1 | 1) => {
    setSessionDrafts((drafts) => {
      const index = drafts.findIndex((session) => session.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= drafts.length) {
        return drafts;
      }
      const next = [...drafts];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setSaveError(null);
    try {
      const id = await onCreateCurriculum('새 커리큘럼');
      if (id) {
        setSelectedId(id);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCurriculum || isSaving || !isDirty) {
      return;
    }
    if (!draftTitle.trim()) {
      setSaveError('커리큘럼 이름을 입력하세요.');
      return;
    }
    if (sessionDrafts.some((session) => !session.topic.trim())) {
      setSaveError('주제가 비어 있는 회차가 있습니다. 모든 회차에 주제를 입력하세요.');
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      if (isMetaDirty) {
        await onUpdateCurriculumMeta(selectedCurriculum.id, {
          title: draftTitle,
          description: draftDescription,
        });
      }
      if (isSessionsDirty) {
        await onSaveCurriculumSessions(
          selectedCurriculum.id,
          sessionDrafts.map((session, index) => ({
            ...session,
            order: index + 1,
            topic: session.topic.trim(),
          }))
        );
      }
    } catch {
      setSaveError('저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCurriculum) return;
    const confirmed = window.confirm(
      `'${selectedCurriculum.title}' 커리큘럼을 삭제할까요? 이 커리큘럼을 연결한 반에서는 연결이 풀립니다. (반별 날짜·상태 기록은 반에 남습니다.)`
    );
    if (!confirmed) return;
    await onDeleteCurriculum(selectedCurriculum.id);
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[#FBFBFA] p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <span className="rounded-full bg-[#FFF5E9] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#8B5E3C]">
            커리큘럼 관리
          </span>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-serif font-bold text-[#4A3728]">
            커리큘럼
            <InfoTooltip
              content="반과 무관한 순수 템플릿(주제·상세·순서)을 여기에서 관리합니다. 날짜와 진행 상태는 각 클래스에서 반별로 지정됩니다."
              label="커리큘럼 설명 보기"
            />
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
          {/* 커리큘럼 목록 */}
          <div className="space-y-2">
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#8B5E3C]/30 bg-[#FFF5E9] px-4 py-3 text-sm font-bold text-[#8B5E3C] transition-all hover:bg-[#F3E8DB] disabled:opacity-60"
            >
              {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              새 커리큘럼
            </button>
            {curriculums.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#E5E3DD] bg-white px-4 py-8 text-center text-sm text-[#8B7E74]">
                아직 커리큘럼이 없습니다.
              </div>
            ) : (
              curriculums.map((curriculum) => {
                const isActive = curriculum.id === selectedId;
                return (
                  <button
                    key={curriculum.id}
                    onClick={() => setSelectedId(curriculum.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                      isActive
                        ? 'border-[#8B5E3C] bg-white shadow-sm'
                        : 'border-[#E5E3DD] bg-white hover:border-[#EBD9C1] hover:bg-[#FFF5E9]'
                    }`}
                  >
                    <BookOpen
                      size={18}
                      className={isActive ? 'text-[#8B5E3C]' : 'text-[#A89F94]'}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#4A3728]">
                        {curriculum.title || '제목 없음'}
                      </span>
                      <span className="block text-xs text-[#A89F94]">
                        {(curriculum.sessions || []).length}회차
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* 선택한 커리큘럼 편집 */}
          {selectedCurriculum ? (
            <motion.div
              key={selectedCurriculum.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-[#4A3728]">기본 정보</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSave}
                      disabled={!isDirty || isSaving}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#8B5E3C] px-4 py-2 text-sm font-bold text-white shadow-md transition-all hover:bg-[#724D31] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#8B5E3C]"
                    >
                      {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      {isSaving ? '저장 중...' : '변경사항 저장'}
                    </button>
                    <button
                      onClick={handleDelete}
                      title="커리큘럼 삭제"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#F3D6D2] px-3 py-2 text-sm font-bold text-[#B42318] transition-all hover:bg-[#FDECEC]"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {saveError && (
                  <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                    {saveError}
                  </div>
                )}
                <label className="mb-1.5 block text-xs font-bold text-[#8B7E74]">커리큘럼 이름</label>
                <input
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  placeholder="예: 디지털 AI 문해 (기초)"
                  className="mb-4 w-full rounded-2xl border border-[#E5E3DD] bg-[#FBFBFA] px-4 py-3 text-base font-bold text-[#4A3728] focus:border-[#8B5E3C] focus:outline-none"
                />
                <label className="mb-1.5 block text-xs font-bold text-[#8B7E74]">설명</label>
                <textarea
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  placeholder="커리큘럼 전체 개요나 대상·목표를 적어 두세요. (선택)"
                  className="custom-scrollbar min-h-[80px] w-full resize-none rounded-2xl border border-[#E5E3DD] bg-[#FBFBFA] p-4 text-sm text-[#4A3728] outline-none focus:border-[#8B5E3C]"
                />
              </div>

              <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-6 shadow-sm sm:p-8">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-[#4A3728]">
                  <ListChecks className="text-[#8B5E3C]" size={18} />
                  회차
                  <span className="rounded-full bg-[#F3F2EE] px-3 py-1 text-xs font-bold text-[#8B7E74]">
                    {sessionDrafts.length}회차
                  </span>
                </h3>
                <div className="space-y-2">
                  {sessionDrafts.map((session, index) => {
                    const isExpanded = expandedSessionId === session.id;
                    const linkedContentCount = (session.contentIds || []).length;
                    return (
                      <div
                        key={session.id}
                        className="rounded-2xl border border-[#F3F2EE] bg-[#FBFBFA] px-3 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EBD9C1] text-xs font-bold text-[#8B5E3C]">
                            {index + 1}
                          </span>
                          <input
                            value={session.topic}
                            onChange={(event) =>
                              updateSessionDraft(session.id, { topic: event.target.value })
                            }
                            placeholder="회차 주제"
                            className="min-w-0 flex-1 rounded-xl border border-[#E5E3DD] bg-white px-3 py-2 text-sm font-medium text-[#4A3728] focus:border-[#8B5E3C] focus:outline-none"
                          />
                          <button
                            onClick={() =>
                              setExpandedSessionId(isExpanded ? null : session.id)
                            }
                            title="상세 설명 편집"
                            className={`inline-flex shrink-0 items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                              session.details?.trim()
                                ? 'border-[#EBD9C1] bg-[#FFF5E9] text-[#8B5E3C]'
                                : 'border-[#E5E3DD] bg-white text-[#8B7E74] hover:bg-[#F3F2EE]'
                            }`}
                          >
                            <FileText size={14} />
                            상세
                          </button>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              onClick={() => moveSessionDraft(session.id, -1)}
                              disabled={index === 0}
                              title="위로"
                              className="rounded-lg p-1.5 text-[#8B7E74] transition-all hover:bg-[#F3F2EE] disabled:opacity-30"
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              onClick={() => moveSessionDraft(session.id, 1)}
                              disabled={index === sessionDrafts.length - 1}
                              title="아래로"
                              className="rounded-lg p-1.5 text-[#8B7E74] transition-all hover:bg-[#F3F2EE] disabled:opacity-30"
                            >
                              <ChevronDown size={16} />
                            </button>
                            <button
                              onClick={() => removeSessionDraft(session.id)}
                              title="회차 삭제"
                              className="rounded-lg p-1.5 text-[#B42318] transition-all hover:bg-[#FDECEC]"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="mt-3 border-t border-[#EDEAE3] pt-3">
                            <textarea
                              value={session.details || ''}
                              onChange={(event) =>
                                updateSessionDraft(session.id, { details: event.target.value })
                              }
                              placeholder="이 회차의 상세 설명(총 시수 / 시수별 모듈·주요활동·결과물 등). 실습 자동생성의 파싱 소스가 됩니다."
                              className="custom-scrollbar min-h-[140px] w-full resize-y rounded-xl border border-[#E5E3DD] bg-white p-3 text-sm leading-relaxed text-[#4A3728] outline-none focus:border-[#8B5E3C]"
                            />
                            {linkedContentCount > 0 && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#8B7E74]">
                                  <Library size={13} />
                                  기본 콘텐츠 {linkedContentCount}
                                </span>
                                {(session.contentIds || []).map((contentId) => (
                                  <span
                                    key={contentId}
                                    className="rounded-full bg-[#F3F2EE] px-2.5 py-1 text-[11px] font-medium text-[#6B625A]"
                                  >
                                    {contentTitleById.get(contentId) || '삭제된 콘텐츠'}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    onClick={addSessionDraft}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-4 py-3 text-sm font-bold text-[#8B5E3C] transition-all hover:border-[#EBD9C1] hover:bg-[#FFF5E9]"
                  >
                    <Plus size={16} />
                    회차 추가
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="flex items-center justify-center rounded-[32px] border border-dashed border-[#E5E3DD] bg-white px-6 py-16 text-center text-sm text-[#8B7E74]">
              왼쪽에서 커리큘럼을 선택하거나 새로 만드세요.
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
