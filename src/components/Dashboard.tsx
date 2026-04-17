import React from 'react';
import {
  LayoutGrid,
  BookOpen,
  Calendar,
  StickyNote,
  ArrowRight,
  Star,
  Edit3,
  Users,
  Library,
  GraduationCap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { ClassroomDiagnosticsBanner } from './ClassroomDiagnosticsBanner';
import { AccessLog, Classroom, ClassroomLoadDiagnostics } from '../types';
import {
  getClassroomCardColors,
  getClassroomIconComponent,
} from '../utils/classroomAppearance';
import { getStudentCounts } from '../utils/students';

const QuickNavCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
  onClick?: () => void;
}> = ({ icon, title, description, delay = 0, onClick }) => (
  <motion.button
    type="button"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    onClick={onClick}
    className="group w-full cursor-pointer rounded-[32px] border border-[#E5E3DD] bg-white p-8 text-left transition-all hover:shadow-xl hover:shadow-[#8B5E3C]/5"
  >
    <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3F2EE] text-[#8B5E3C] transition-colors group-hover:bg-[#8B5E3C] group-hover:text-white">
      {icon}
    </div>
    <h3 className="mb-2 text-lg font-bold text-[#4A3728]">{title}</h3>
    <p className="text-sm leading-relaxed text-[#8B7E74]">{description}</p>
  </motion.button>
);

interface DashboardProps {
  classrooms?: Classroom[];
  classroomLoadDiagnostics?: ClassroomLoadDiagnostics;
  onManageClassroom: (classroom: Classroom) => void;
  onGoToLibrary: () => void;
  onGoToMemo: () => void;
  onSwitchToStudent: () => void;
  accessLogs?: AccessLog[];
}

export const Dashboard: React.FC<DashboardProps> = ({
  classrooms = [],
  classroomLoadDiagnostics,
  onManageClassroom,
  onGoToLibrary,
  onGoToMemo,
  onSwitchToStudent,
  accessLogs = [],
}) => {
  const isDev = import.meta.env.DEV;
  const firstClassroom = classrooms[0];
  const lastClassroom = classrooms[classrooms.length - 1];

  const renderEmptyClassroomState = () => {
    const status = classroomLoadDiagnostics?.status ?? 'idle';
    const title =
      status === 'error'
        ? '클래스 목록을 불러오지 못했습니다.'
        : status === 'loading' || status === 'idle'
          ? '클래스 목록을 불러오는 중입니다.'
          : '아직 생성된 클래스가 없습니다.';
    const description =
      status === 'error'
        ? 'Firestore 읽기 상태를 확인한 뒤 다시 시도해 주세요.'
        : status === 'loading' || status === 'idle'
          ? 'one-shot 조회와 실시간 구독을 동시에 확인하고 있습니다.'
          : 'classrooms 컬렉션이 실제로 비어 있을 때만 이 문구가 표시됩니다.';

    return (
      <div className="col-span-full rounded-[32px] border border-dashed border-[#E5E3DD] bg-white p-12 text-center">
        <p className="font-bold text-[#4A3728]">{title}</p>
        <p className="mt-2 text-[#8B7E74]">{isDev ? description : status === 'empty' ? title : description}</p>
        {isDev && classroomLoadDiagnostics && (
          <div className="mt-4 space-y-1 text-left text-xs text-[#8B7E74]">
            <p>status: {classroomLoadDiagnostics.status}</p>
            <p>snapshotCount: {classroomLoadDiagnostics.snapshotCount ?? 'pending'}</p>
            <p>oneShotCount: {classroomLoadDiagnostics.oneShotCount ?? 'pending'}</p>
            <p>snapshotCompleted: {String(classroomLoadDiagnostics.snapshotCompleted)}</p>
            <p>oneShotCompleted: {String(classroomLoadDiagnostics.oneShotCompleted)}</p>
            <p>configuredDatabaseId: {classroomLoadDiagnostics.configuredDatabaseId}</p>
            <p>resolvedDatabaseId: {classroomLoadDiagnostics.resolvedDatabaseId}</p>
            {classroomLoadDiagnostics.lastError && (
              <p className="break-all text-red-600">
                lastClassroomLoadError: {classroomLoadDiagnostics.lastError}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[#FBFBFA] p-8">
      <motion.section
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative mb-12 overflow-hidden rounded-[40px] bg-[#FFF5E9] p-12"
      >
        <div className="relative z-10 max-w-2xl">
          <span className="mb-6 inline-block rounded-full bg-[#EBD9C1] px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#8B5E3C]">
            관리자 워크스페이스
          </span>
          <h1 className="mb-6 text-6xl font-serif font-bold leading-tight text-[#4A3728]">
            다사랑 <span className="italic text-[#8B5E3C]">컴퓨터 수업</span>
          </h1>
          <p className="hidden mb-8 text-lg leading-relaxed text-[#8B7E74]">
            콘텐츠는 클래스별로 배정하고, 날짜별 수업 운영 기록은 클래스 관리 화면에서 활성 날짜만 열어
            관리합니다.
          </p>
          <p className="mb-8 text-lg leading-relaxed text-[#8B7E74]">
            학생 페이지에는 분류된 전체 콘텐츠가 공통으로 노출되고, 날짜별 수업 운영 기록은 클래스 관리 화면에서 실제 진행한 수업만 남길 수 있습니다.
          </p>
          <div className="flex gap-4">
            <button
              onClick={onGoToLibrary}
              className="flex items-center gap-2 rounded-2xl bg-[#8B5E3C] px-8 py-4 font-bold text-white shadow-lg shadow-[#8B5E3C]/20 transition-all hover:bg-[#724D31]"
            >
              <Library size={20} />
              콘텐츠 라이브러리
            </button>
            <button
              onClick={onSwitchToStudent}
              className="flex items-center gap-2 rounded-2xl border border-[#E5E3DD] bg-white px-8 py-4 font-bold text-[#4A3728] shadow-sm transition-all hover:shadow-md"
            >
              <Users size={20} />
              학생 페이지 보기
            </button>
          </div>
        </div>

        <div className="absolute right-12 top-1/2 hidden -translate-y-1/2 flex-col gap-4 rounded-3xl border border-[#EBD9C1] bg-white p-6 shadow-2xl shadow-[#8B5E3C]/10 lg:flex" style={{ width: '18rem', height: '14rem' }}>
          <div className="flex items-center gap-3 border-b border-[#F3F2EE] pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF5E9]">
              <GraduationCap size={18} className="text-[#8B5E3C]" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#A89F94]">현황 요약</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#8B7E74]">운영 클래스</span>
              <span className="font-bold text-[#4A3728]">{classrooms.length}개</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#8B7E74]">전체 학생</span>
              <span className="font-bold text-[#4A3728]">
                {classrooms.reduce((sum, c) => sum + (c.students?.filter(s => !s.inactive && !s.deleted)?.length ?? 0), 0)}명
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#8B7E74]">오늘 날짜</span>
              <span className="font-bold text-[#8B5E3C]">
                {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
              </span>
            </div>
          </div>
        </div>
      </motion.section>

      <section className="mb-12">
        <ClassroomDiagnosticsBanner
          diagnostics={classroomLoadDiagnostics}
          isDev={isDev}
          className="mb-6"
        />
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-serif font-bold text-[#4A3728]">수업 클래스 관리</h2>
          <span className="rounded-full bg-[#EBD9C1]/30 px-3 py-1 text-xs font-bold text-[#8B5E3C]">
            {classrooms.length}개 클래스 운영 중
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {classrooms.map((classroom, idx) => {
            const { activeCount, inactiveCount } = getStudentCounts(classroom.students || []);
            const { color, backgroundColor } = getClassroomCardColors(classroom.color);
            const ClassroomIcon = getClassroomIconComponent(classroom.icon);

            return (
              <motion.div
                key={classroom.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="group relative flex flex-col overflow-hidden rounded-[40px] border border-[#E5E3DD] bg-white p-8 transition-all"
                style={{ borderColor: `${color}20` }}
              >
                <div className="relative z-10 flex-1">
                  <div
                    className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors group-hover:text-white"
                    style={{ backgroundColor, color }}
                  >
                    <ClassroomIcon size={28} />
                  </div>
                  <h3 className="mb-3 text-2xl font-bold text-[#4A3728]">{classroom.name}</h3>
                  <div className="mb-8 flex flex-wrap items-center gap-2 text-sm text-[#8B7E74]">
                    <span>
                      현재 등록 학생: <span className="font-bold" style={{ color }}>{activeCount}명</span>
                    </span>
                    {inactiveCount > 0 && (
                      <span className="rounded-full bg-[#F3F2EE] px-2.5 py-1 text-[11px] font-bold text-[#8B7E74]">
                        비활성 {inactiveCount}명
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => onManageClassroom(classroom)}
                  className="relative z-10 flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-white transition-all"
                  style={{ backgroundColor: color }}
                >
                  <Users size={16} />
                  클래스 관리 열기
                </button>

                <div
                  className="absolute -bottom-4 -right-4 h-32 w-32 rounded-full transition-colors"
                  style={{ backgroundColor: `${color}10` }}
                />
              </motion.div>
            );
          })}

          {classrooms.length === 0 && renderEmptyClassroomState()}
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-serif font-bold text-[#4A3728]">빠른 이동</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="hidden">
          <QuickNavCard
            icon={<LayoutGrid size={24} />}
            title="첫 클래스 열기"
            description="클래스별 콘텐츠 배정과 활성 날짜 기록 화면으로 바로 이동합니다."
            delay={0.1}
            onClick={() => {
              if (firstClassroom) {
                onManageClassroom(firstClassroom);
              }
            }}
          />
          </div>
          <QuickNavCard
            icon={<LayoutGrid size={24} />}
            title="첫 클래스 열기"
            description="날짜별 수업 기록과 출석 체크 화면으로 바로 이동합니다."
            delay={0.1}
            onClick={() => {
              if (firstClassroom) {
                onManageClassroom(firstClassroom);
              }
            }}
          />
          <QuickNavCard
            icon={<Calendar size={24} />}
            title="최근 클래스 열기"
            description="마지막으로 만든 클래스 관리 화면으로 이동합니다."
            delay={0.2}
            onClick={() => {
              if (lastClassroom) {
                onManageClassroom(lastClassroom);
              }
            }}
          />
          <QuickNavCard
            icon={<BookOpen size={24} />}
            title="콘텐츠 라이브러리"
            description="학생 페이지에 노출할 클래스별 콘텐츠를 바로 편집합니다."
            delay={0.3}
            onClick={onGoToLibrary}
          />
          <QuickNavCard
            icon={<StickyNote size={24} />}
            title="전체 메모 보기"
            description="기타 메모, 날짜별 메모, 학생별 메모를 한 번에 확인합니다."
            delay={0.4}
            onClick={onGoToMemo}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="relative flex items-center justify-between overflow-hidden rounded-[40px] bg-[#F3F2EE] p-10 lg:col-span-2"
        >
          <div className="max-w-md">
            <h2 className="mb-4 text-3xl font-serif font-bold text-[#4A3728]">
              날짜는 활성화할 때만 기록됩니다
            </h2>
            <p className="mb-8 leading-relaxed text-[#8B7E74]">
              달력에서 날짜를 고른 뒤 활성화하면 수업 기록, 메모, 출석체크가 열리고, 비활성화하면
              그 날짜 기록은 삭제됩니다.
            </p>
            <button
              onClick={() => {
                if (firstClassroom) {
                  onManageClassroom(firstClassroom);
                }
              }}
              className="rounded-2xl bg-white px-8 py-3.5 font-bold text-[#4A3728] shadow-sm transition-all hover:shadow-md"
            >
              클래스 관리 열기
            </button>
          </div>

          <div className="hidden shrink-0 lg:flex h-40 w-40 items-center justify-center rounded-[32px] bg-white shadow-xl shadow-[#8B5E3C]/5">
            <Calendar size={56} className="text-[#C5A882]" strokeWidth={1.5} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
          className="group relative flex flex-col justify-between overflow-hidden rounded-[40px] bg-[#8B5E3C] p-10 text-white"
        >
          <div>
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <Star size={24} className="fill-white" />
            </div>
            <h2 className="mb-4 text-2xl font-bold">관리자 팁</h2>
            <p className="hidden text-sm leading-relaxed text-white/80">
              클래스 배정은 학생 페이지 노출 기준이고, 날짜 기록은 실제로 수업을 진행한 날만 활성화해서
              남겨두면 됩니다.
            </p>
            <p className="text-sm leading-relaxed text-white/80">
              학생 페이지는 분류된 전체 콘텐츠를 공통으로 보여주고, 날짜 기록은 실제 진행한 수업만 선택해서 남기는 방식으로 운영됩니다.
            </p>
          </div>

          <div className="mt-10 flex items-center justify-between">
            <button
              onClick={onGoToLibrary}
              className="flex items-center gap-2 font-bold transition-all hover:gap-3"
            >
              라이브러리 열기 <ArrowRight size={18} />
            </button>
            <button
              onClick={onGoToMemo}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            >
              <Edit3 size={20} />
            </button>
          </div>

          <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-white/5 blur-3xl" />
        </motion.div>
      </div>

      {/* Access Logs */}
      {accessLogs.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="mx-6 mb-8"
        >
          <h2 className="mb-4 text-lg font-bold text-[#4A3728]">방문 로그</h2>
          <div className="overflow-hidden rounded-[24px] border border-[#E5E3DD] bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E3DD] bg-[#F3F2EE]">
                  <th className="px-5 py-3 text-left font-semibold text-[#8B7E74]">이름</th>
                  <th className="px-5 py-3 text-left font-semibold text-[#8B7E74]">이메일</th>
                  <th className="px-5 py-3 text-left font-semibold text-[#8B7E74]">접속 시간</th>
                </tr>
              </thead>
              <tbody>
                {accessLogs.slice(0, 50).map((log, i) => (
                  <tr
                    key={log.id}
                    className={i % 2 === 0 ? 'bg-white' : 'bg-[#FBFBFA]'}
                  >
                    <td className="px-5 py-3 font-medium text-[#4A3728]">
                      {log.displayName || '(이름 없음)'}
                    </td>
                    <td className="px-5 py-3 text-[#8B7E74]">{log.email}</td>
                    <td className="px-5 py-3 text-[#8B7E74]">
                      {log.loginAt
                        ? new Date(log.loginAt).toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>
      )}
    </main>
  );
};
