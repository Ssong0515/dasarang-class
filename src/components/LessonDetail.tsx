import React from 'react';
import { 
  Users, 
  Paperclip, 
  Plus, 
  Download, 
  ExternalLink, 
  FileEdit,
  CheckCircle2,
  Save
} from 'lucide-react';
import { motion } from 'motion/react';
import { Lesson } from '../types';

interface LessonDetailProps {
  lesson: Lesson;
}

export const LessonDetail: React.FC<LessonDetailProps> = ({ lesson }) => {
  return (
    <main className="flex-1 overflow-y-auto bg-[#FBFBFA] p-8 pb-20">
      {/* Breadcrumbs & Header Actions */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <span className="inline-block px-3 py-1 bg-[#FFF5E9] text-[#8B5E3C] text-[10px] font-bold uppercase tracking-widest rounded-full mb-4">
            {lesson.folderName}
          </span>
          <h1 className="text-4xl font-serif font-bold text-[#4A3728]">
            {lesson.date} 수업 상세
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="px-6 py-2.5 bg-[#F3F2EE] text-[#4A3728] rounded-xl font-bold hover:bg-[#EAE8E2] transition-colors flex items-center gap-2">
            <Save size={18} />
            Save Changes
          </button>
          <button className="px-6 py-2.5 bg-[#8B5E3C] text-white rounded-xl font-bold hover:bg-[#724D31] transition-colors flex items-center gap-2 shadow-lg shadow-[#8B5E3C]/20">
            <CheckCircle2 size={18} />
            Complete Lesson
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Attendance */}
        <section className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-[32px] border border-[#E5E3DD] overflow-hidden shadow-sm">
            <div className="p-8 border-bottom border-[#E5E3DD] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="text-[#8B5E3C]" size={24} />
                <h2 className="text-xl font-bold text-[#4A3728]">출석 체크 (Attendance)</h2>
              </div>
              <span className="text-sm text-[#8B7E74]">32 Students Total</span>
            </div>
            
            <div className="px-8 pb-8">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[11px] font-bold text-[#A89F94] uppercase tracking-widest border-b border-[#F3F2EE]">
                    <th className="pb-4">Student Name</th>
                    <th className="pb-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F2EE]">
                  {lesson.attendance?.map((student, idx) => (
                    <tr key={idx} className="group">
                      <td className="py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-[#D1E4F3] flex items-center justify-center text-[#4A86B0] font-bold text-xs">
                            {student.initials}
                          </div>
                          <span className="font-medium text-[#4A3728]">{student.studentName}</span>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${student.status === 'Present' ? 'bg-[#D1F3E0] text-[#2D7A4D]' : 'bg-[#F3F2EE] text-[#8B7E74] hover:bg-[#EAE8E2]'}`}>
                            Present
                          </button>
                          <button className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${student.status === 'Absent' ? 'bg-[#F3D1D1] text-[#7A2D2D]' : 'bg-[#F3F2EE] text-[#8B7E74] hover:bg-[#EAE8E2]'}`}>
                            Absent
                          </button>
                          <button className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${student.status === 'Late' ? 'bg-[#F3EBD1] text-[#7A6A2D]' : 'bg-[#F3F2EE] text-[#8B7E74] hover:bg-[#EAE8E2]'}`}>
                            Late
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Right Column: Resources & Memo */}
        <section className="space-y-8">
          {/* Resources */}
          <div className="bg-white rounded-[32px] border border-[#E5E3DD] p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Paperclip className="text-[#8B5E3C]" size={20} />
                <h2 className="text-lg font-bold text-[#4A3728]">수업 자료 (Resources)</h2>
              </div>
              <button className="w-8 h-8 bg-[#8B5E3C] text-white rounded-full flex items-center justify-center hover:bg-[#724D31] transition-colors">
                <Plus size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {lesson.resources?.map((res, idx) => (
                <div key={idx} className="flex items-center gap-4 p-4 bg-[#FBFBFA] rounded-2xl border border-[#F3F2EE] hover:border-[#EBD9C1] transition-all cursor-pointer group">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${res.type === 'pdf' ? 'bg-[#F3D1D1] text-[#7A2D2D]' : 'bg-[#D1E4F3] text-[#4A86B0]'}`}>
                    {res.type === 'pdf' ? <Download size={18} /> : <ExternalLink size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-[#4A3728] truncate">{res.name}</h4>
                    <p className="text-[11px] text-[#8B7E74]">{res.info}</p>
                  </div>
                  {res.type === 'pdf' ? (
                    <Download size={16} className="text-[#A89F94] group-hover:text-[#8B5E3C]" />
                  ) : (
                    <ExternalLink size={16} className="text-[#A89F94] group-hover:text-[#8B5E3C]" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Today's Memo */}
          <div className="bg-white rounded-[32px] border border-[#E5E3DD] p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <FileEdit className="text-[#8B5E3C]" size={20} />
              <h2 className="text-lg font-bold text-[#4A3728]">오늘의 수업 메모</h2>
            </div>
            <div className="relative">
              <textarea 
                className="w-full bg-[#FBFBFA] border border-[#F3F2EE] rounded-2xl p-6 text-sm text-[#4A3728] leading-relaxed min-h-[200px] outline-none focus:border-[#EBD9C1] transition-all resize-none"
                defaultValue={lesson.memo}
              />
              <span className="absolute bottom-4 right-4 text-[10px] font-bold text-[#A89F94] uppercase tracking-widest">
                Auto-saved at 14:20
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Summary Section */}
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8 bg-[#F3F2EE] rounded-[40px] p-10 flex flex-col md:flex-row items-center gap-10"
      >
        <div className="w-full md:w-1/3 aspect-video bg-white rounded-[32px] overflow-hidden shadow-lg border border-white/50">
          <img 
            src="https://picsum.photos/seed/summary/600/400" 
            alt="Summary Illustration" 
            className="w-full h-full object-cover opacity-80"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-serif font-bold text-[#4A3728] mb-4">수업 진행 요약 (Summary)</h2>
          <p className="text-[#8B7E74] text-sm leading-relaxed mb-8">
            {lesson.summary?.text}
          </p>
          <div className="grid grid-cols-3 gap-8">
            <div>
              <span className="block text-[10px] font-bold text-[#A89F94] uppercase tracking-widest mb-1">Attendance</span>
              <span className="text-2xl font-bold text-[#4A3728]">{lesson.summary?.attendanceRate}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-[#A89F94] uppercase tracking-widest mb-1">Engagement</span>
              <span className="text-2xl font-bold text-[#4A3728]">{lesson.summary?.engagement}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-[#A89F94] uppercase tracking-widest mb-1">Resources</span>
              <span className="text-2xl font-bold text-[#4A3728]">{lesson.summary?.resourceCount}</span>
            </div>
          </div>
        </div>
      </motion.section>

      <footer className="mt-12 text-center text-[11px] text-[#A89F94] font-medium">
        © 2024 Dasarang Classroom. Designed for Mindful Educators.
      </footer>
    </main>
  );
};
