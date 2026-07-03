import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Images,
  ImageIcon,
  FileText,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Share2,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { Classroom, StudentPost } from '../types';
import { resolveAppPath } from '../utils/appPaths';

interface ClassroomResultGalleryProps {
  classroom: Classroom;
  /** 전체 학생 작품(반 구분 없음). 내부에서 이 반 + 선택 날짜로 거른다. */
  posts: StudentPost[];
  getAuthToken: () => Promise<string | null>;
  /** '홈페이지에 공유'(승인)/숨김 — 기존 쇼케이스 파이프라인 재사용. 없으면 버튼 숨김. */
  onReview?: (id: string, action: 'approve' | 'hide') => Promise<void>;
}

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateLabel = (iso: string) => iso.replace(/-/g, '.').slice(2);

/** 결과물이 "올라온 날"을 강사 기준(로컬) 날짜로 본다. createdAt은 UTC ISO라 그대로 자르면 KST 새벽엔 하루 어긋난다. */
const postLocalDay = (post: StudentPost) => {
  if (!post.createdAt) return '';
  const date = new Date(post.createdAt);
  return Number.isNaN(date.getTime()) ? post.createdAt.slice(0, 10) : getLocalDateString(date);
};

const isHtmlPost = (post: StudentPost) =>
  post.mimeType === 'text/html' || post.fileName?.toLowerCase().endsWith('.html');

const isImagePost = (post: StudentPost) => (post.mimeType || '').startsWith('image/');

const displayName = (post: StudentPost) => (post.anonymous ? '익명' : post.studentName || '학생');

/** 비공개 Drive 파일을 관리자 토큰으로 받아 objectURL로 만든다(이미지 썸네일·PDF용). 언마운트 시 해제. */
function useDriveBlobUrl(
  fileId: string | null,
  getAuthToken: () => Promise<string | null>,
  enabled: boolean
) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!fileId || !enabled) {
      setUrl(null);
      setState('idle');
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState('loading');
    void (async () => {
      try {
        const token = await getAuthToken();
        if (!token) throw new Error('no-token');
        const res = await fetch(resolveAppPath(`/api/drive/file/${encodeURIComponent(fileId)}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('fetch-failed');
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setState('idle');
      } catch {
        if (!cancelled) {
          setUrl(null);
          setState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, enabled, getAuthToken]);

  return { url, state };
}

/** 그리드 카드의 썸네일 — 이미지는 실제 미리보기, 그 외는 아이콘.
 *  (StudentShowcaseManager에서도 재사용 — 승인 전 비공개 파일도 관리자 프록시로 미리보기) */
export const ResultThumbnail: React.FC<{
  post: StudentPost;
  getAuthToken: () => Promise<string | null>;
}> = ({ post, getAuthToken }) => {
  // imageUrl이 있으면(승인 썸네일·인라인 미리보기) 바로 표시. 없으면 비공개 파일을 프록시로 받는다.
  const inlineSrc = post.imageUrl;
  const needsProxy = !inlineSrc && isImagePost(post);
  const { url, state } = useDriveBlobUrl(post.driveFileId, getAuthToken, needsProxy);
  const src = inlineSrc || url;

  if (inlineSrc || isImagePost(post)) {
    if (src) {
      return <img src={src} alt={post.title} className="h-full w-full object-cover" />;
    }
    return (
      <div className="flex h-full w-full items-center justify-center text-[#C8BFB8]">
        {state === 'error' ? <ImageIcon size={26} /> : <Loader2 size={22} className="animate-spin" />}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center text-[#A89F94]">
      <FileText size={26} />
    </div>
  );
};

/** 발표(present) 모달의 큰 뷰어 — 이미지/HTML/PDF를 받아 화면에 띄운다. post.id로 remount된다. */
const ResultViewer: React.FC<{
  post: StudentPost;
  getAuthToken: () => Promise<string | null>;
}> = ({ post, getAuthToken }) => {
  // 이미지면서 imageUrl이 있으면(승인 썸네일·인라인 미리보기) 프록시 없이 바로 띄운다.
  const inlineImage = !isHtmlPost(post) ? post.imageUrl : undefined;
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [htmlText, setHtmlText] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(inlineImage ? 'ready' : 'loading');

  useEffect(() => {
    if (inlineImage) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setState('loading');
    setBlobUrl(null);
    setHtmlText(null);
    void (async () => {
      try {
        const token = await getAuthToken();
        if (!token) throw new Error('로그인이 필요해요.');
        const res = await fetch(
          resolveAppPath(`/api/drive/file/${encodeURIComponent(post.driveFileId)}`),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error('불러오기 실패');
        const blob = await res.blob();
        if (cancelled) return;
        if (isHtmlPost(post)) {
          const text = await blob.text();
          if (cancelled) return;
          setHtmlText(text);
        } else {
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
        }
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [post.driveFileId, post.id, getAuthToken, inlineImage]);

  if (inlineImage) {
    return <img src={inlineImage} alt={post.title} className="max-h-full max-w-full object-contain" />;
  }

  if (state === 'loading') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/70">
        <Loader2 size={36} className="animate-spin" />
        <p className="text-sm">결과물 불러오는 중…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-white/70">
        결과물을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </div>
    );
  }

  if (isHtmlPost(post) && htmlText !== null) {
    return (
      <iframe
        srcDoc={htmlText}
        title={post.title}
        className="h-full w-full rounded-2xl border-none bg-white"
        sandbox="allow-scripts allow-same-origin"
      />
    );
  }

  if (isImagePost(post) && blobUrl) {
    return <img src={blobUrl} alt={post.title} className="max-h-full max-w-full object-contain" />;
  }

  if (blobUrl) {
    // PDF 등 브라우저가 인라인 렌더 가능한 파일
    return <iframe src={blobUrl} title={post.title} className="h-full w-full rounded-2xl border-none bg-white" />;
  }

  return null;
};

export const ClassroomResultGallery: React.FC<ClassroomResultGalleryProps> = ({
  classroom,
  posts,
  getAuthToken,
  onReview,
}) => {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()));
  const [presentIndex, setPresentIndex] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  // 이 반 작품만, 날짜별로 그룹.
  const classroomPosts = useMemo(
    () => posts.filter((post) => post.classroomId === classroom.id),
    [posts, classroom.id]
  );

  // 작품이 있는 날짜들(최신순) — 빠른 전환 칩.
  const datesWithPosts = useMemo(() => {
    const set = new Set<string>();
    classroomPosts.forEach((post) => {
      const day = postLocalDay(post);
      if (day) set.add(day);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [classroomPosts]);

  // 선택한 날짜의 작품(올린 순서 = 발표 순서).
  const dayPosts = useMemo(
    () =>
      classroomPosts
        .filter((post) => postLocalDay(post) === selectedDate)
        .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))),
    [classroomPosts, selectedDate]
  );

  const presentPost = presentIndex !== null ? dayPosts[presentIndex] ?? null : null;

  const closePresent = () => {
    setPresentIndex(null);
    setReviewError(null);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };

  // 끝/처음에서 멈춘다(루프 없음).
  const goPrev = () =>
    setPresentIndex((index) => (index === null ? null : Math.max(0, index - 1)));
  const goNext = () =>
    setPresentIndex((index) => (index === null ? null : Math.min(dayPosts.length - 1, index + 1)));

  // 발표 중 키보드 조작: ← → 이동, Esc 닫기.
  useEffect(() => {
    if (presentIndex === null) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') goPrev();
      else if (event.key === 'ArrowRight') goNext();
      else if (event.key === 'Escape' && !document.fullscreenElement) closePresent();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentIndex, dayPosts.length]);

  // 전체화면 상태 동기화(사용자가 Esc로 빠져나올 때 버튼 아이콘 맞추기).
  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggleFullscreen = () => {
    const node = modalRef.current;
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void node.requestFullscreen?.().catch(() => {});
    }
  };

  const handleReview = async (post: StudentPost, action: 'approve' | 'hide') => {
    if (!onReview || busyId) return;
    setBusyId(post.id);
    setReviewError(null);
    try {
      await onReview(post.id, action);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : '처리에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const isToday = selectedDate === getLocalDateString(new Date());

  return (
    <div className="rounded-[40px] border border-[#E5E3DD] bg-white p-10 text-left shadow-sm">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F3F2EE] text-[#8B5E3C]">
            <Images size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#4A3728]">수업 결과물</h2>
            <p className="mt-0.5 text-sm text-[#8B7E74]">
              학생이 저장한 결과물이 실시간으로 모입니다. 하나를 눌러 크게 띄우고 한 명씩 발표해 보세요.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-[#E5E3DD] bg-[#FBFBFA] px-3 py-2 text-sm font-bold text-[#4A3728]">
            <Calendar size={16} className="text-[#8B5E3C]" />
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setPresentIndex(null);
              }}
              className="bg-transparent text-sm font-bold text-[#4A3728] outline-none"
            />
          </label>
          {!isToday && (
            <button
              onClick={() => {
                setSelectedDate(getLocalDateString(new Date()));
                setPresentIndex(null);
              }}
              className="rounded-xl bg-[#F3F2EE] px-3 py-2 text-sm font-bold text-[#8B7E74] transition-all hover:bg-[#EAE8E2]"
            >
              오늘
            </button>
          )}
        </div>
      </div>

      {datesWithPosts.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {datesWithPosts.map((day) => {
            const count = classroomPosts.filter((post) => postLocalDay(post) === day).length;
            const active = day === selectedDate;
            return (
              <button
                key={day}
                onClick={() => {
                  setSelectedDate(day);
                  setPresentIndex(null);
                }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                  active ? 'bg-[#8B5E3C] text-white shadow-sm' : 'bg-white text-[#8B7E74] ring-1 ring-[#E5E3DD] hover:bg-[#F7F4EF]'
                }`}
              >
                {formatDateLabel(day)}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/20' : 'bg-[#F3F2EE] text-[#A2906F]'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {dayPosts.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-6 py-16 text-center text-sm text-[#8B7E74]">
          {classroomPosts.length === 0
            ? '아직 저장된 결과물이 없어요. 학생이 실습에서 저장하기를 누르거나 업로드하면 여기에 실시간으로 모입니다.'
            : '이 날짜에는 저장된 결과물이 없어요. 위에서 다른 날짜를 선택해 보세요.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {dayPosts.map((post, index) => {
            const approved = post.status === 'approved';
            return (
              <button
                key={post.id}
                onClick={() => setPresentIndex(index)}
                className="group flex flex-col overflow-hidden rounded-[20px] border border-[#F0ECE6] bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#FBFBFA]">
                  <ResultThumbnail post={post} getAuthToken={getAuthToken} />
                  {approved && (
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-green-600/90 px-2 py-0.5 text-[10px] font-bold text-white">
                      <CheckCircle2 size={11} /> 공개 중
                    </span>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <p className="truncate text-sm font-bold text-[#4A3728]">{displayName(post)}</p>
                  {post.title && <p className="truncate text-xs text-[#A2906F]">{post.title}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 발표(present) 모달 — 큰 화면 + 한 명씩 이동 */}
      {presentPost && (
        <div ref={modalRef} className="fixed inset-0 z-[120] flex flex-col bg-black/85 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 px-5 py-4 text-white">
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{displayName(presentPost)}</p>
              {presentPost.title && <p className="truncate text-sm text-white/60">{presentPost.title}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">
                {(presentIndex ?? 0) + 1} / {dayPosts.length}
              </span>
              <button
                onClick={closePresent}
                className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                title="닫기 (Esc)"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center gap-3 px-3 pb-3 sm:px-6">
            <button
              onClick={goPrev}
              disabled={(presentIndex ?? 0) <= 0}
              className="shrink-0 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-20"
              title="이전 (←)"
            >
              <ChevronLeft size={28} />
            </button>

            <div className="flex h-full max-h-full min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
              <ResultViewer key={presentPost.id} post={presentPost} getAuthToken={getAuthToken} />
            </div>

            <button
              onClick={goNext}
              disabled={(presentIndex ?? 0) >= dayPosts.length - 1}
              className="shrink-0 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-20"
              title="다음 (→)"
            >
              <ChevronRight size={28} />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 px-5 py-4">
            {reviewError && (
              <span className="rounded-xl bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-100">{reviewError}</span>
            )}
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white/20"
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              {isFullscreen ? '전체화면 끄기' : '전체화면'}
            </button>
            {onReview && (
              presentPost.status === 'approved' ? (
                <button
                  onClick={() => handleReview(presentPost, 'hide')}
                  disabled={busyId === presentPost.id}
                  className="flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
                >
                  {busyId === presentPost.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  홈페이지 공개 취소
                </button>
              ) : (
                <button
                  onClick={() => handleReview(presentPost, 'approve')}
                  disabled={busyId === presentPost.id}
                  className="flex items-center gap-2 rounded-xl bg-[#8B5E3C] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#74492C] disabled:opacity-60"
                  title="이 작품을 damuna.org 학생 작품 페이지에 공개합니다."
                >
                  {busyId === presentPost.id ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                  홈페이지에 공유
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};
