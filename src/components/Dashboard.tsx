import React from 'react';
import { 
  LayoutGrid, 
  BookOpen, 
  Calendar, 
  StickyNote, 
  ArrowRight, 
  Star, 
  Edit3 
} from 'lucide-react';
import { motion } from 'motion/react';

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

export const Dashboard: React.FC = () => {
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
            Instructor's Workspace
          </span>
          <h1 className="text-6xl font-serif font-bold text-[#4A3728] mb-6 leading-tight">
            다사랑 <span className="italic text-[#8B5E3C]">수업 허브</span>
          </h1>
          <p className="text-lg text-[#8B7E74] leading-relaxed mb-8">
            수업 폴더를 만들고, 그 안에서 인원, 리소스, 날짜 수업을 관리합니다. 선생님의 따뜻한 시선이 닿는 모든 공간을 함께합니다.
          </p>
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

      {/* Quick Navigation */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-serif font-bold text-[#4A3728]">빠른 이동</h2>
          <button className="text-[#8B5E3C] font-bold text-sm flex items-center gap-1 hover:underline">
            See All Resources
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <QuickNavCard 
            icon={<LayoutGrid size={24} />}
            title="수업 폴더 전체 보기"
            description="상위 수업 폴더를 만들고 날짜 수업을 추가합니다."
            delay={0.1}
          />
          <QuickNavCard 
            icon={<BookOpen size={24} />}
            title="첫 수업 폴더 열기"
            description="창의적 예술 교육 폴더를 바로 엽니다."
            delay={0.2}
          />
          <QuickNavCard 
            icon={<Calendar size={24} />}
            title="최근 날짜 수업 열기"
            description="2024-05-22 수업 상세 페이지로 이동합니다."
            delay={0.3}
          />
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
            <h2 className="text-2xl font-bold mb-4">Premium Tip</h2>
            <p className="text-white/80 leading-relaxed text-sm">
              자주 사용하는 자료는 수업 폴더 내 'Resources' 섹션에 고정하여 빠르게 접근할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center justify-between mt-10">
            <button className="flex items-center gap-2 font-bold hover:gap-3 transition-all">
              Learn more <ArrowRight size={18} />
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
