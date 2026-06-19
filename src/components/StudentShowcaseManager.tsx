import React, { useMemo, useState } from 'react';
import {
  Globe,
  Loader2,
  EyeOff,
  Share2,
  ExternalLink,
  ImageIcon,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { StudentPost, StudentPostStatus } from '../types';

interface StudentShowcaseManagerProps {
  posts: StudentPost[];
  onReview: (id: string, action: 'approve' | 'hide') => Promise<void>;
}

const SHOWCASE_URL = 'https://damuna.org/showcase.html';

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
}) => {
  const [activeStatus, setActiveStatus] = useState<StudentPostStatus>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleAction = async (id: string, action: 'approve' | 'hide') => {
    if (busyId) return;
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

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#8B5E3C]">
              <Globe size={14} />
              홈페이지 공유
            </div>
            <h1 className="text-2xl font-bold text-[#4A3728]">학생 작품 공유 관리</h1>
            <p className="mt-1 text-sm text-[#8B7E74]">
              학생이 올린 작품을 승인하면 damuna.org 학생 작품 페이지에 공개됩니다.
            </p>
          </div>
          <a
            href={SHOWCASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-[#E5E3DD] bg-white px-4 py-2 text-sm font-bold text-[#8B5E3C] transition-all hover:border-[#EBD9C1] hover:bg-[#FFF5E9]"
          >
            <ExternalLink size={15} />
            홈페이지에서 보기
          </a>
        </div>

        <div className="mb-5 flex gap-2">
          {STATUS_TABS.map((tab) => {
            const isActive = activeStatus === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveStatus(tab.key)}
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
                  className="flex gap-4 rounded-[24px] border border-[#F3F2EE] bg-white p-4 shadow-sm"
                >
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#FBFBFA] text-[#A2906F]">
                    {post.imageUrl ? (
                      <img
                        src={post.imageUrl}
                        alt={post.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (post.mimeType || '').startsWith('image/') ? (
                      <ImageIcon size={24} />
                    ) : (
                      <FileText size={24} />
                    )}
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
                      {post.webViewLink && (
                        <a
                          href={post.webViewLink}
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
                        <span className="flex items-center gap-1.5 text-xs font-bold text-green-600">
                          <CheckCircle2 size={14} />
                          공개 중
                        </span>
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
