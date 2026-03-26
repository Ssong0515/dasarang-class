import React from 'react';
import { 
  LayoutGrid, 
  BookOpen, 
  Calendar, 
  StickyNote, 
  ArrowRight, 
  Star, 
  Edit3,
  Plus,
  Users,
  Library
} from 'lucide-react';
import { motion } from 'motion/react';
import { Lesson } from '../types';

const QuickNavCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
}> = ({ icon, title, description, delay = 0 }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="bg-white p-8 rounded-[32px] border border-[#E5E3DD] hover:shadow-xl hover:shadow-[#8B5E3C]/5 transition-all cursor-pointer group"
  >
    <div className="bg-[#F3F2EE] w-12 h-12 rounded-xl flex items-center justify-center text-[#8B5E3C] mb-6 group-hover:bg-[#8B5E3C] group-hover:text-white transition-colors">
      {icon}
    </div>
    <h3 className="text-lg font-bold text-[#4A3728] mb-2">{title}</h3>
    <p className="text-sm text-[#8B7E74] leading-relaxed">{description}</p>
  </motion.div>
);

interface DashboardProps {
  folders?: any[];
  onStartLesson: () => void;
  onSelectLesson: (lesson: Lesson) => void;
  onManageFolder: (folder: any) => void;
  onGoToLibrary: () => void;
  onSwitchToStudent: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  folders = [], 
  onStartLesson, 
  onSelectLesson, 
  onManageFolder,
  onGoToLibrary,
  onSwitchToStudent
}) => {
  return (
    <main className="flex-1 overflow-y-auto bg-[#FBFBFA] p-8">
      {/* Hero Section */}
      <motion.section 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-[#FFF5E9] rounded-[40px] p-12 mb-12 overflow-hidden"
      >
        <div className="relative z-10 max-w-2xl">
          <span className="inline-block px-4 py-1.5 bg-[#EBD9C1] text-[#8B5E3C] text-[10px] font-bold uppercase tracking-widest rounded-full mb-6">
            관리자 워크스페이스
          </span>
          <h1 className="text-6xl font-serif font-bold text-[#4A3728] mb-6 leading-tight">
            다사랑 <span className="italic text-[#8B5E3C]">컴퓨터 수업</span>
          </h1>
          <p className="text-lg text-[#8B7E74] leading-relaxed mb-8">
            수업 콘텐츠를 미리 제작하고 라이브러리에 저장하세요. 각 클래스별 수업에서 저장된 콘텐츠를 불러와 사용할 수 있습니다.
          </p>
          <div className="flex gap-4">
            <button 
              onClick={onGoToLibrary}
              className="px-8 py-4 bg-[#8B5E3C] text-white rounded-2xl font-bold shadow-lg shadow-[#8B5E3C]/20 hover:bg-[#724D31] transition-all flex items-center gap-2"
            >
              <Library size={20} />
              콘텐츠 라이브러리 가기
            </button>
            <button 
              onClick={onSwitchToStudent}
              className="px-8 py-4 bg-white text-[#4A3728] rounded-2xl font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-2 border border-[#E5E3DD]"
            >
              <Users size={20} />
              학생 페이지로 이동
            </button>
          </div>
        </div>

        {/* Decorative Element */}
        <div className="absolute right-12 top-1/2 -translate-y-1/2 w-80 h-56 bg-white rounded-3xl shadow-2xl shadow-[#8B5E3C]/10 border border-[#FFF5E9] p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[#EBD9C1]"></div>
            <div className="h-2 w-24 bg-[#F3F2EE] rounded-full"></div>
          </div>
          <div className="h-2 w-full bg-[#F3F2EE] rounded-full"></div>
          <div className="h-2 w-full bg-[#F3F2EE] rounded-full"></div>
          <div className="h-2 w-3/4 bg-[#F3F2EE] rounded-full"></div>
        </div>
      </motion.section>

      {/* Class Folders Section */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-serif font-bold text-[#4A3728]">수업 클래스 (인원 관리)</h2>
          <span className="text-xs font-bold text-[#8B5E3C] bg-[#EBD9C1]/30 px-3 py-1 rounded-full">
            {folders.length}개 클래스 운영 중
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {folders.map((folder, idx) => (
            <motion.div
              key={folder.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white p-8 rounded-[40px] border border-[#E5E3DD] hover:border-[#8B5E3C] transition-all group relative overflow-hidden flex flex-col"
            >
              <div className="relative z-10 flex-1">
                <div className="w-14 h-14 bg-[#F3F2EE] rounded-2xl flex items-center justify-center text-[#8B5E3C] mb-6 group-hover:bg-[#8B5E3C] group-hover:text-white transition-colors">
                  <BookOpen size={28} />
                </div>
                <h3 className="text-2xl font-bold text-[#4A3728] mb-3">{folder.name}</h3>
                <p className="text-sm text-[#8B7E74] mb-8">
                  현재 등록된 학생: <span className="font-bold text-[#8B5E3C]">{folder.students?.length || 0}명</span>
                </p>
              </div>
              
              <div className="relative z-10 flex gap-3">
                <button 
                  onClick={() => onManageFolder(folder)}
                  className="flex-1 py-3 bg-[#F3F2EE] text-[#8B5E3C] rounded-xl font-bold text-sm hover:bg-[#EBD9C1] transition-all flex items-center justify-center gap-2"
                >
                  <Users size={16} />
                  인원 관리
                </button>
                <button 
                  onClick={onStartLesson}
                  className="w-12 h-12 bg-[#8B5E3C] text-white rounded-xl flex items-center justify-center hover:bg-[#724D31] transition-all"
                >
                  <Plus size={20} />
                </button>
              </div>
              
              <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-[#F3F2EE]/50 rounded-full group-hover:bg-[#8B5E3C]/5 transition-colors"></div>
            </motion.div>
          ))}
          {folders.length === 0 && (
            <div className="col-span-full p-12 bg-white rounded-[32px] border border-dashed border-[#E5E3DD] text-center">
              <p className="text-[#8B7E74]">아직 생성된 수업 클래스가 없습니다.</p>
            </div>
          )}
        </div>
      </section>

      {/* Quick Navigation */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-serif font-bold text-[#4A3728]">빠른 이동</h2>
          <button className="text-[#8B5E3C] font-bold text-sm flex items-center gap-1 hover:underline">
            모든 자료 보기
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div onClick={onStartLesson}>
            <QuickNavCard 
              icon={<LayoutGrid size={24} />}
              title="수업 폴더 전체 보기"
              description="상위 수업 폴더를 만들고 날짜 수업을 추가합니다."
              delay={0.1}
            />
          </div>
          <div onClick={onStartLesson}>
            <QuickNavCard 
              icon={<BookOpen size={24} />}
              title="첫 수업 폴더 열기"
              description="창의적 예술 교육 폴더를 바로 엽니다."
              delay={0.2}
            />
          </div>
          <div onClick={onStartLesson}>
            <QuickNavCard 
              icon={<Calendar size={24} />}
              title="최근 날짜 수업 열기"
              description="2024-05-22 수업 상세 페이지로 이동합니다."
              delay={0.3}
            />
          </div>
          <QuickNavCard 
            icon={<StickyNote size={24} />}
            title="전체 메모 보기"
            description="날짜 수업별 메모를 한 번에 확인합니다."
            delay={0.4}
          />
        </div>
      </section>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Schedule Plan */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2 bg-[#F3F2EE] rounded-[40px] p-10 flex items-center justify-between overflow-hidden relative"
        >
          <div className="max-w-md">
            <h2 className="text-3xl font-serif font-bold text-[#4A3728] mb-4">수업 계획을 세워보세요</h2>
            <p className="text-[#8B7E74] mb-8 leading-relaxed">
              이번 주에는 어떤 영감을 아이들과 나누고 싶으신가요? 차분한 마음으로 준비하는 시간을 가져보세요.
            </p>
            <button className="bg-white text-[#4A3728] px-8 py-3.5 rounded-2xl font-bold shadow-sm hover:shadow-md transition-all">
              일정 관리 열기
            </button>
          </div>
          
          <div className="relative w-48 h-48">
            <div className="absolute inset-0 bg-white rounded-[32px] shadow-xl shadow-[#8B5E3C]/5 flex items-center justify-center">
               <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-[#D1E4F3] rounded-full flex items-center justify-center">
                    <div className="w-10 h-10 bg-white rounded-full"></div>
                  </div>
                  <div className="w-20 h-2 bg-[#A8D3E6] rounded-full"></div>
               </div>
            </div>
          </div>
        </motion.div>

        {/* Premium Tip */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-[#8B5E3C] rounded-[40px] p-10 text-white flex flex-col justify-between relative overflow-hidden group"
        >
          <div>
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-8">
              <Star size={24} className="fill-white" />
            </div>
            <h2 className="text-2xl font-bold mb-4">관리자 팁</h2>
            <p className="text-white/80 leading-relaxed text-sm">
              자주 사용하는 자료는 수업 폴더 내 '수업 자료' 섹션에 고정하여 빠르게 접근할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center justify-between mt-10">
            <button className="flex items-center gap-2 font-bold hover:gap-3 transition-all">
              더 알아보기 <ArrowRight size={18} />
            </button>
            <button className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
              <Edit3 size={20} />
            </button>
          </div>

          {/* Decorative Circle */}
          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
        </motion.div>
      </div>
    </main>
  );
};
