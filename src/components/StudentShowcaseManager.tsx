import React, { useMemo, useState } from 'react';
import {
  Globe,
  Loader2,
  EyeOff,
  Share2,
  ExternalLink,
  Copy,
  Check,
  Trash2,
} from 'lucide-react';
import { StudentPost, StudentPostStatus } from '../types';
import { resolveAppPath } from '../utils/appPaths';
import { InfoTooltip } from './InfoTooltip';
import { ResultThumbnail } from './ClassroomResultGallery';

interface StudentShowcaseManagerProps {
  posts: StudentPost[];
  onReview: (id: string, action: 'approve' | 'hide' | 'delete') => Promise<void>;
  /** 승인 전(비공개) Drive 파일 썸네일을 관리자 프록시로 받기 위한 ID 토큰 공급자 */
  getAuthToken: () => Promise<string | null>;
}

const STATUS_TABS: { key: StudentPostStatus; label: string }[] = [
  { key: 'pending', label: '승인 대기' },
  { key: 'approved', label: '공개 중' },
  { key: 'hidden', label: '숨김' },
];

const STATUS_BADGE: Record<StudentPostStatus, { label: string; className: string }> = {
  pending: { label: '승인 대기', className: 'bg-amber-100 text-amber-700' },
  approved: { label: '공개 중', className: 'bg-green-100 text-green-700' },
  hidden: { label: '숨김', className: 'bg-[#F3F2EE] text-[#8B7E74]' },
};

const formatDate = (iso?: string) => {
  if (!iso) return '';
  const trimmed = iso.slice(0, 10);
  return trimmed.replace(/-/g, '.');
};

export const StudentShowcaseManager: React.FC<StudentShowcaseManagerProps> = ({
  posts,
  onReview,
  getAuthToken,
}) => {
  const [activeStatus, setActiveStatus] = useState<StudentPostStatus>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // 다중 제거용 선택 상태. 탭을 바꾸면 초기화한다(다른 탭의 안 보이는 항목이 같이 지워지는 사고 방지).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  // 이 앱이 직접 서빙하는 공개 작품 페이지(같은 출처). 승인하면 여기에 바로 반영된다.
  const showcaseHref = resolveAppPath('showcase.html');
  const showcaseUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${showcaseHref}` : showcaseHref;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(showcaseUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('아래 주소를 복사하세요', showcaseUrl);
    }
  };

  const counts = useMemo(
    () => ({
      pending: posts.filter((post) => post.status === 'pending').length,
      approved: posts.filter((post) => post.status === 'approved').length,
      hidden: posts.filter((post) => post.status === 'hidden').length,
    }),
    [posts]
  );

  const visiblePosts = useMemo(
    () =>
      posts
        .filter((post) => post.status === activeStatus)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    [posts, activeStatus]
  );

  const handleAction = async (id: string, action: 'approve' | 'hide' | 'delete') => {
    if (busyId || bulkProgress) return;
    setBusyId(id);
    setError(null);
    try {
      await onReview(id, action);
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  // 제거는 숨김(보관)과 달리 업로드 파일까지 지워 복구가 안 되므로 반드시 한 번 확인받는다.
  const handleDelete = (post: StudentPost) => {
    const label = post.title || '이 작품';
    if (
      !window.confirm(
        `'${label}'을(를) 완전히 제거할까요?\n업로드된 파일도 함께 삭제되며 되돌릴 수 없어요.\n(보관만 하려면 '숨김'을 쓰세요)`
      )
    ) {
      return;
    }
    void handleAction(post.id, 'delete');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = visiblePosts.filter((post) => selectedIds.has(post.id)).length;
  const allSelected = visiblePosts.length > 0 && selectedCount === visiblePosts.length;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(visiblePosts.map((post) => post.id)));
  };

  // 선택한 게시물들을 순서대로 하나씩 제거한다(각각 Drive 파일 삭제가 있어 병렬 대신 순차 + 진행 표시).
  const handleBulkDelete = async () => {
    if (busyId || bulkProgress) return;
    const ids = visiblePosts.filter((post) => selectedIds.has(post.id)).map((post) => post.id);
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `선택한 ${ids.length}개 작품을 완전히 제거할까요?\n업로드된 파일도 함께 삭제되며 되돌릴 수 없어요.`
      )
    ) {
      return;
    }
    setError(null);
    setBulkProgress({ done: 0, total: ids.length });
    let failedCount = 0;
    for (const id of ids) {
      try {
        await onReview(id, 'delete');
      } catch {
        failedCount += 1;
      }
      setBulkProgress((current) =>
        current ? { done: current.done + 1, total: current.total } : current
      );
    }
    setBulkProgress(null);
    setSelectedIds(new Set());
    if (failedCount > 0) {
      setError(`${failedCount}개 작품은 제거하지 못했어요. 잠시 후 다시 시도해 주세요.`);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#8B5E3C]">
              <Globe size={14} />
              홈페이지 공유
            </div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[#4A3728]">
              학생 작품 공유 관리
              <InfoTooltip
                content="학생이 올린 작품을 '홈페이지에 공유'로 승인하면 학생 작품 홈페이지에 바로 공개됩니다."
                label="공유 관리 설명 보기"
              />
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyUrl}
              className="flex items-center gap-2 rounded-xl border border-[#E5E3DD] bg-white px-4 py-2 text-sm font-bold text-[#8B7E74] transition-all hover:border-[#EBD9C1] hover:bg-[#FFF5E9]"
            >
              {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
              {copied ? '복사됨' : '주소 복사'}
            </button>
            <a
              href={showcaseHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-[#E5E3DD] bg-white px-4 py-2 text-sm font-bold text-[#8B5E3C] transition-all hover:border-[#EBD9C1] hover:bg-[#FFF5E9]"
            >
              <ExternalLink size={15} />
              홈페이지에서 보기
            </a>
          </div>
        </div>

        <div className="mb-5 flex gap-2">
          {STATUS_TABS.map((tab) => {
            const isActive = activeStatus === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveStatus(tab.key);
                  setSelectedIds(new Set()); // 탭 전환 시 선택 초기화
                }}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all ${
                  isActive
                    ? 'bg-[#8B5E3C] text-white shadow-sm'
                    : 'bg-white text-[#8B7E74] hover:bg-[#F3F2EE]'
                }`}
              >
                {tab.label}
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    isActive ? 'bg-white/20 text-white' : 'bg-[#F3F2EE] text-[#A2906F]'
                  }`}
                >
                  {counts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* 다중 선택 툴바 — 전체 선택 + 선택 항목 일괄 제거 */}
        {visiblePosts.length > 0 && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[#8B7E74]">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 accent-[#8B5E3C]"
              />
              전체 선택
              {selectedCount > 0 && <span className="text-[#8B5E3C]">({selectedCount})</span>}
            </label>
            {selectedCount > 0 && (
              <button
                onClick={() => void handleBulkDelete()}
                disabled={!!bulkProgress || !!busyId}
                className="flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkProgress ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    제거 중... {bulkProgress.done}/{bulkProgress.total}
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    선택 {selectedCount}개 제거
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {visiblePosts.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-6 py-16 text-center text-sm text-[#8B7E74]">
            {activeStatus === 'pending'
              ? '승인 대기 중인 작품이 없습니다. 학생이 작품을 업로드하면 여기에 표시됩니다.'
              : activeStatus === 'approved'
              ? '아직 공개된 작품이 없습니다.'
              : '숨긴 작품이 없습니다.'}
          </div>
        ) : (
          <div className="space-y-3">
            {visiblePosts.map((post) => {
              const badge = STATUS_BADGE[post.status];
              const isBusy = busyId === post.id;
              const byline = [post.anonymous ? '익명' : post.studentName, post.classroomName]
                .filter(Boolean)
                .join(' · ');
              return (
                <div
                  key={post.id}
                  className={`flex gap-4 rounded-[24px] border p-4 shadow-sm transition-colors ${
                    selectedIds.has(post.id)
                      ? 'border-[#8B5E3C] bg-[#FFF9F2]'
                      : 'border-[#F3F2EE] bg-white'
                  }`}
                >
                  {/* 다중 제거용 선택 체크박스 */}
                  <label className="flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(post.id)}
                      onChange={() => toggleSelect(post.id)}
                      aria-label={`${post.title} 선택`}
                      className="h-4 w-4 accent-[#8B5E3C]"
                    />
                  </label>

                  {/* 승인 전 비공개 파일도 관리자 프록시로 실제 미리보기를 띄운다(결과물 갤러리와 동일 로직) */}
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#FBFBFA] text-[#A2906F]">
                    <ResultThumbnail post={post} getAuthToken={getAuthToken} />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-sm font-bold text-[#4A3728]">{post.title}</h3>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    {byline && <p className="mt-0.5 text-xs text-[#A2906F]">{byline}</p>}
                    {post.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-[#8B7E74]">{post.description}</p>
                    )}
                    <p className="mt-1 text-[11px] text-[#C4B8A8]">
                      업로드 {formatDate(post.createdAt)}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {(post.driveFileId || post.webViewLink) && (
                        <a
                          href={
                            post.status === 'approved' && post.driveFileId
                              ? resolveAppPath(`api/public/student-work/${encodeURIComponent(post.driveFileId)}`)
                              : post.webViewLink
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-xl border border-[#E5E3DD] px-3 py-1.5 text-xs font-bold text-[#8B7E74] transition-all hover:bg-[#F3F2EE]"
                        >
                          <ExternalLink size={13} />
                          작품 보기
                        </a>
                      )}

                      {post.status !== 'approved' && (
                        <button
                          onClick={() => handleAction(post.id, 'approve')}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 rounded-xl bg-[#8B5E3C] px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-[#74492C] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}
                          홈페이지에 공유
                        </button>
                      )}

                      {post.status === 'approved' && (
                        <a
                          href={`${showcaseHref}#post-${post.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-xl bg-[#2D7A4D] px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-[#246A41]"
                        >
                          <ExternalLink size={13} />
                          홈페이지로 이동
                        </a>
                      )}

                      {post.status !== 'hidden' && (
                        <button
                          onClick={() => handleAction(post.id, 'hide')}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 rounded-xl border border-[#E5E3DD] px-3 py-1.5 text-xs font-bold text-[#8B7E74] transition-all hover:bg-[#F3F2EE] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy ? <Loader2 size={13} className="animate-spin" /> : <EyeOff size={13} />}
                          {post.status === 'approved' ? '공개 취소' : '숨김'}
                        </button>
                      )}

                      {/* 제거 — 숨김(보관)과 달리 Drive 파일까지 지워 공간을 되돌린다. 복구 불가. */}
                      <button
                        onClick={() => handleDelete(post)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 rounded-xl border border-red-100 px-3 py-1.5 text-xs font-bold text-red-500 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        제거
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
