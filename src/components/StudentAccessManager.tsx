import React, { useMemo, useState } from 'react';
import { AlertCircle, Mail, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { StudentAccess } from '../types';
import {
  isValidStudentAccessId,
  normalizeStudentAccessId,
} from '../utils/studentAccess';

interface StudentAccessManagerProps {
  entries: StudentAccess[];
  onAdd: (email: string, memo: string) => Promise<void>;
  onDelete: (email: string) => Promise<void>;
}

export const StudentAccessManager: React.FC<StudentAccessManagerProps> = ({
  entries,
  onAdd,
  onDelete,
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [memoInput, setMemoInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);

  const sortedEntries = useMemo(
    () => [...entries].sort((left, right) => left.email.localeCompare(right.email)),
    [entries]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = normalizeStudentAccessId(emailInput);

    if (!isValidStudentAccessId(email)) {
      setErrorMessage('Google 로그인에 사용할 이메일 형식으로 입력하세요.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      await onAdd(email, memoInput.trim());
      setEmailInput('');
      setMemoInput('');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '아이디 등록에 실패했습니다.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (email: string) => {
    if (!window.confirm(`${email} 아이디의 학생 페이지 접근 권한을 삭제할까요?`)) {
      return;
    }

    setDeletingEmail(email);
    setErrorMessage('');

    try {
      await onDelete(email);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '아이디 삭제에 실패했습니다.'
      );
    } finally {
      setDeletingEmail(null);
    }
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      <section className="mb-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#8B5E3C]">
              Student Access
            </p>
            <h1 className="text-3xl font-serif font-bold text-[#4A3728]">
              학생 페이지 접근 아이디
            </h1>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF5E9] text-[#8B5E3C]">
            <ShieldCheck size={24} />
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-3 rounded-[28px] border border-[#E5E3DD] bg-white p-5 shadow-sm md:grid-cols-[minmax(220px,1fr)_minmax(180px,0.7fr)_auto]"
        >
          <div className="relative">
            <Mail
              size={17}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A89F94]"
            />
            <input
              type="email"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              disabled={isSaving}
              placeholder="student@example.com"
              className="h-12 w-full rounded-2xl border border-[#E5E3DD] bg-[#FBFBFA] pl-11 pr-4 text-sm font-medium text-[#4A3728] outline-none transition-all focus:border-[#8B5E3C] focus:bg-white"
            />
          </div>
          <input
            type="text"
            value={memoInput}
            onChange={(event) => setMemoInput(event.target.value)}
            disabled={isSaving}
            placeholder="메모"
            className="h-12 w-full rounded-2xl border border-[#E5E3DD] bg-[#FBFBFA] px-4 text-sm font-medium text-[#4A3728] outline-none transition-all focus:border-[#8B5E3C] focus:bg-white"
          />
          <button
            type="submit"
            disabled={isSaving || !emailInput.trim()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#8B5E3C] px-6 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#724D31] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={17} />
            {isSaving ? '등록 중...' : '등록'}
          </button>
        </form>

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            <AlertCircle size={16} />
            {errorMessage}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[#E5E3DD] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#E5E3DD] bg-[#F7F4EF] px-5 py-4">
          <h2 className="text-sm font-bold text-[#4A3728]">등록된 아이디</h2>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#8B5E3C]">
            {sortedEntries.length}개
          </span>
        </div>

        {sortedEntries.length > 0 ? (
          <div className="divide-y divide-[#F0ECE6]">
            {sortedEntries.map((entry) => (
              <div
                key={entry.id}
                className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,1fr)_minmax(120px,0.8fr)_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#4A3728]">{entry.email}</p>
                  <p className="mt-1 text-xs text-[#A89F94]">
                    {entry.updatedAt
                      ? new Date(entry.updatedAt).toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '-'}
                  </p>
                </div>
                <p className="text-sm text-[#8B7E74]">{entry.memo || '-'}</p>
                <button
                  type="button"
                  onClick={() => void handleDelete(entry.email)}
                  disabled={deletingEmail === entry.email}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#A89F94] transition-all hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  title="삭제"
                  aria-label={`${entry.email} 삭제`}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <ShieldCheck size={36} className="mx-auto mb-3 text-[#D8D2C8]" />
            <p className="text-sm font-bold text-[#8B7E74]">
              아직 등록된 접근 아이디가 없습니다.
            </p>
          </div>
        )}
      </section>
    </main>
  );
};
