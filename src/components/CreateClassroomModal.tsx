import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, CalendarClock, Loader2, Search } from 'lucide-react';
import { CalendarClassSummary } from '../types';

const DOW_LABELS = ['월', '화', '수', '목', '금', '토'];

const formatSchedule = (schedule: CalendarClassSummary['schedules'][number]) => {
  const days = (schedule.days || []).map((day) => DOW_LABELS[day] ?? '?').join('·');
  const time = schedule.start && schedule.end ? ` ${schedule.start}~${schedule.end}` : '';
  return `${days}${time}`;
};

interface CreateClassroomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateBlank: () => void | Promise<void>;
  onCreateFromCalendar: (calendarClass: CalendarClassSummary) => void | Promise<void>;
  onListCalendarClasses?: () => Promise<CalendarClassSummary[]>;
}

export const CreateClassroomModal: React.FC<CreateClassroomModalProps> = ({
  isOpen,
  onClose,
  onCreateBlank,
  onCreateFromCalendar,
  onListCalendarClasses,
}) => {
  const [calendarClasses, setCalendarClasses] = useState<CalendarClassSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [creatingId, setCreatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !onListCalendarClasses) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSearch('');
    onListCalendarClasses()
      .then((items) => {
        if (!cancelled) setCalendarClasses(items);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '참고 시간표를 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, onListCalendarClasses]);

  const filteredClasses = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return calendarClasses;
    return calendarClasses.filter(
      (calendarClass) =>
        calendarClass.name.toLowerCase().includes(keyword) ||
        calendarClass.instructor.toLowerCase().includes(keyword)
    );
  }, [calendarClasses, search]);

  const handleImport = async (calendarClass: CalendarClassSummary) => {
    if (creatingId) return;
    setCreatingId(calendarClass.id);
    try {
      await onCreateFromCalendar(calendarClass);
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-[32px] border border-[#E5E3DD] bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#E5E3DD] px-7 py-5">
              <h2 className="text-lg font-bold text-[#4A3728]">클래스 생성</h2>
              <button
                onClick={onClose}
                aria-label="닫기"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#8B7E74] transition-all hover:bg-[#F3F2EE]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-7 py-6">
              {/* 빈 클래스 */}
              <button
                onClick={() => onCreateBlank()}
                className="flex items-center gap-3 rounded-2xl border border-dashed border-[#8B5E3C]/30 bg-[#FFF5E9] px-5 py-4 text-left transition-all hover:bg-[#F3E8DB]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#8B5E3C] shadow-sm">
                  <Plus size={18} />
                </span>
                <span>
                  <span className="block text-sm font-bold text-[#8B5E3C]">빈 클래스 만들기</span>
                  <span className="block text-xs text-[#A2906F]">이름·설정을 직접 입력합니다.</span>
                </span>
              </button>

              {/* 캘린더에서 가져오기 */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <CalendarClock size={16} className="text-[#8B5E3C]" />
                  <span className="text-sm font-bold text-[#4A3728]">캘린더에서 가져오기</span>
                  <span className="text-xs text-[#A2906F]">(수업명·색·참고 시간표 자동 설정)</span>
                </div>

                <div className="relative mb-3">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A2906F]"
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="수업명·강사로 검색"
                    className="w-full rounded-xl border border-[#E5E3DD] bg-[#FBFBFA] py-2.5 pl-9 pr-3 text-sm text-[#4A3728] focus:border-[#8B5E3C] focus:outline-none"
                  />
                </div>

                {error ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                ) : loading ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-4 py-8 text-sm text-[#8B7E74]">
                    <Loader2 size={16} className="animate-spin" />
                    불러오는 중...
                  </div>
                ) : filteredClasses.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-4 py-8 text-center text-sm text-[#8B7E74]">
                    {calendarClasses.length === 0
                      ? 'calendar.damuna.org에 등록된 시간표가 없습니다.'
                      : '검색 결과가 없습니다.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredClasses.map((calendarClass) => (
                      <button
                        key={calendarClass.id}
                        onClick={() => handleImport(calendarClass)}
                        disabled={creatingId !== null}
                        className="flex w-full items-center gap-3 rounded-2xl border border-[#F3F2EE] bg-[#FBFBFA] px-4 py-3 text-left transition-all hover:border-[#EBD9C1] hover:bg-[#FFF5E9] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: calendarClass.color || '#A2906F' }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-semibold text-[#4A3728]">
                              {calendarClass.name}
                            </span>
                            {calendarClass.instructor && (
                              <span className="shrink-0 text-xs text-[#A2906F]">
                                {calendarClass.instructor}
                              </span>
                            )}
                          </span>
                          {calendarClass.schedules.length > 0 && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {calendarClass.schedules.map((schedule, index) => (
                                <span
                                  key={index}
                                  className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#8B5E3C] shadow-sm"
                                >
                                  {formatSchedule(schedule)}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs font-bold text-[#8B5E3C]">
                          {creatingId === calendarClass.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            '가져오기'
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
