import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Paperclip, 
  Plus, 
  Download, 
  ExternalLink, 
  FileEdit,
  CheckCircle2,
  Save,
  Trash2,
  Type,
  Hash,
  FolderOpen,
  FileText
} from 'lucide-react';
import { motion } from 'motion/react';
import { Lesson, LessonFolder, AttendanceRecord, LessonResource, LessonContent } from '../types';

interface LessonDetailProps {
  lesson: Lesson;
  folders: LessonFolder[];
  contents: LessonContent[];
  onSave: (lesson: Lesson) => void;
}

export const LessonDetail: React.FC<LessonDetailProps> = ({ lesson, folders, contents, onSave }) => {
  const [localLesson, setLocalLesson] = useState<Lesson>(lesson);
  const [newResourceName, setNewResourceName] = useState('');
  const [newResourceUrl, setNewResourceUrl] = useState('');
  const [newResourceType, setNewResourceType] = useState<'pdf' | 'link'>('link');

  // Initialize attendance if empty, based on folder students
  useEffect(() => {
    const currentFolder = folders.find(f => f.id === localLesson.folderId);
    if (currentFolder && (!localLesson.attendance || localLesson.attendance.length === 0)) {
      const initialAttendance: AttendanceRecord[] = (currentFolder.students || []).map(s => ({
        studentId: s.id,
        studentName: s.name,
        initials: s.initials,
        status: 'Present'
      }));
      setLocalLesson(prev => ({ ...prev, attendance: initialAttendance }));
    }
  }, [localLesson.folderId, folders]);

  const handleAttendanceChange = (studentId: string, status: 'Present' | 'Absent' | 'Late') => {
    const newAttendance = (localLesson.attendance || []).map(a => 
      a.studentId === studentId ? { ...a, status } : a
    );
    setLocalLesson({ ...localLesson, attendance: newAttendance });
  };

  const handleContentSelect = (contentId: string) => {
    const selectedContent = contents.find(c => c.id === contentId);
    if (selectedContent) {
      setLocalLesson({
        ...localLesson,
        contentId: selectedContent.id,
        content: selectedContent.html,
        title: selectedContent.title
      });
    }
  };

  const handleAddResource = () => {
    if (!newResourceName || !newResourceUrl) return;
    const newRes: LessonResource = {
      name: newResourceName,
      type: newResourceType,
      info: newResourceType === 'pdf' ? 'PDF Document' : 'External Link'
    };
    setLocalLesson({
      ...localLesson,
      resources: [...(localLesson.resources || []), newRes]
    });
    setNewResourceName('');
    setNewResourceUrl('');
  };

  const handleRemoveResource = (idx: number) => {
    const newResources = [...(localLesson.resources || [])];
    newResources.splice(idx, 1);
    setLocalLesson({ ...localLesson, resources: newResources });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#FBFBFA] p-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-12">
        <div className="flex-1 max-w-2xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-[#FFF5E9] text-[#8B5E3C] text-[10px] font-bold uppercase tracking-widest rounded-full">
              <FolderOpen size={12} />
              <select 
                value={localLesson.folderId}
                onChange={(e) => setLocalLesson({ ...localLesson, folderId: e.target.value })}
                className="bg-transparent outline-none cursor-pointer"
              >
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-[#F3F2EE] text-[#8B7E74] text-[10px] font-bold uppercase tracking-widest rounded-full">
              <Hash size={12} />
              <input 
                type="number" 
                value={localLesson.order || ''}
                onChange={(e) => setLocalLesson({ ...localLesson, order: parseInt(e.target.value) })}
                placeholder="순서"
                className="w-8 bg-transparent outline-none"
              />
            </div>
          </div>
          <input 
            type="text" 
            value={localLesson.title}
            onChange={(e) => setLocalLesson({ ...localLesson, title: e.target.value })}
            placeholder="수업 제목을 입력하세요"
            className="text-4xl font-serif font-bold text-[#4A3728] bg-transparent border-b border-transparent hover:border-[#E5E3DD] focus:border-[#8B5E3C] outline-none w-full transition-all"
          />
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => onSave(localLesson)}
            className="px-6 py-3 bg-[#8B5E3C] text-white rounded-2xl font-bold hover:bg-[#724D31] transition-all shadow-lg shadow-[#8B5E3C]/20 flex items-center gap-2"
          >
            <Save size={20} />
            <span>수업 저장하기</span>
          </button>
        </div>
      </div>

      {/* Content Selection */}
      <div className="bg-white p-8 rounded-[32px] border border-[#E5E3DD] shadow-sm mb-8">
        <div className="flex items-center justify-between mb-4">
          <label className="text-xs font-bold text-[#8B5E3C] uppercase tracking-widest flex items-center gap-2">
            <FileText size={14} /> 콘텐츠 라이브러리에서 가져오기
          </label>
          <span className="text-[10px] text-[#8B7E74]">
            * 콘텐츠를 선택하면 제목과 HTML 내용이 자동으로 채워집니다.
          </span>
        </div>
        <select 
          value={localLesson.contentId || ''}
          onChange={(e) => handleContentSelect(e.target.value)}
          className="w-full bg-[#F3F2EE] border-none rounded-xl px-4 py-3 text-[#4A3728] font-bold focus:ring-2 focus:ring-[#8B5E3C] outline-none"
        >
          <option value="">콘텐츠 선택...</option>
          {contents.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Content & Attendance */}
        <section className="lg:col-span-2 space-y-8">
          {/* HTML Content Editor */}
          <div className="bg-white rounded-[32px] border border-[#E5E3DD] p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <Type className="text-[#8B5E3C]" size={24} />
              <h2 className="text-xl font-bold text-[#4A3728]">수업 내용 (HTML)</h2>
            </div>
            <textarea 
              value={localLesson.content}
              onChange={(e) => setLocalLesson({ ...localLesson, content: e.target.value })}
              placeholder="HTML 코드를 입력하세요..."
              className="w-full h-[400px] p-6 bg-[#FBFBFA] border border-[#F3F2EE] rounded-2xl font-mono text-sm outline-none focus:border-[#8B5E3C] transition-all resize-none"
            />
            <div className="mt-4 p-4 bg-[#FFF5E9] rounded-xl border border-[#EBD9C1]">
              <p className="text-[11px] text-[#8B5E3C] leading-relaxed">
                💡 HTML 태그를 사용하여 수업 내용을 구성할 수 있습니다. 학생 페이지에서 렌더링되어 보여집니다.
              </p>
            </div>
          </div>

          {/* Attendance Check */}
          <div className="bg-white rounded-[32px] border border-[#E5E3DD] overflow-hidden shadow-sm">
            <div className="p-8 border-b border-[#F3F2EE] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="text-[#8B5E3C]" size={24} />
                <h2 className="text-xl font-bold text-[#4A3728]">출석 체크 ({localLesson.date})</h2>
              </div>
              <input 
                type="date" 
                value={localLesson.date}
                onChange={(e) => setLocalLesson({ ...localLesson, date: e.target.value })}
                className="text-sm font-bold text-[#8B5E3C] bg-[#FFF5E9] px-3 py-1 rounded-full outline-none"
              />
            </div>
            
            <div className="p-8">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[11px] font-bold text-[#A89F94] uppercase tracking-widest border-b border-[#F3F2EE]">
                    <th className="pb-4">학생 이름</th>
                    <th className="pb-4 text-right">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F2EE]">
                  {(localLesson.attendance || []).map((record) => (
                    <tr key={record.studentId} className="group">
                      <td className="py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-[#EBD9C1] flex items-center justify-center text-[#8B5E3C] font-bold text-xs">
                            {record.initials}
                          </div>
                          <span className="font-bold text-[#4A3728]">{record.studentName}</span>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center justify-end gap-2">
                          {(['Present', 'Absent', 'Late'] as const).map((status) => (
                            <button 
                              key={status}
                              onClick={() => handleAttendanceChange(record.studentId, status)}
                              className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all ${
                                record.status === status 
                                  ? status === 'Present' ? 'bg-[#D1F3E0] text-[#2D7A4D]' : status === 'Absent' ? 'bg-[#F3D1D1] text-[#7A2D2D]' : 'bg-[#F3EBD1] text-[#7A6A2D]'
                                  : 'bg-[#F3F2EE] text-[#8B7E74] hover:bg-[#EAE8E2]'
                              }`}
                            >
                              {status === 'Present' ? '출석' : status === 'Absent' ? '결석' : '지각'}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!localLesson.attendance || localLesson.attendance.length === 0) && (
                    <tr>
                      <td colSpan={2} className="py-12 text-center text-[#8B7E74]">
                        이 클래스에 등록된 학생이 없습니다. <br/>
                        사이드바의 '인원 관리'에서 학생을 먼저 추가해주세요.
                      </td>
                    </tr>
                  )}
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
                <h2 className="text-lg font-bold text-[#4A3728]">수업 자료</h2>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex flex-col gap-2">
                <input 
                  type="text" 
                  placeholder="자료 이름"
                  value={newResourceName}
                  onChange={(e) => setNewResourceName(e.target.value)}
                  className="w-full px-4 py-2 bg-[#FBFBFA] border border-[#F3F2EE] rounded-xl text-sm outline-none"
                />
                <input 
                  type="text" 
                  placeholder="URL 또는 정보"
                  value={newResourceUrl}
                  onChange={(e) => setNewResourceUrl(e.target.value)}
                  className="w-full px-4 py-2 bg-[#FBFBFA] border border-[#F3F2EE] rounded-xl text-sm outline-none"
                />
                <div className="flex gap-2">
                  <select 
                    value={newResourceType}
                    onChange={(e) => setNewResourceType(e.target.value as 'pdf' | 'link')}
                    className="px-4 py-2 bg-[#FBFBFA] border border-[#F3F2EE] rounded-xl text-sm outline-none"
                  >
                    <option value="link">링크</option>
                    <option value="pdf">PDF</option>
                  </select>
                  <button 
                    onClick={handleAddResource}
                    className="flex-1 py-2 bg-[#8B5E3C] text-white rounded-xl font-bold text-sm hover:bg-[#724D31]"
                  >
                    자료 추가
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {(localLesson.resources || []).map((res, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-[#FBFBFA] rounded-xl border border-[#F3F2EE] group">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${res.type === 'pdf' ? 'bg-[#F3D1D1] text-[#7A2D2D]' : 'bg-[#D1E4F3] text-[#4A86B0]'}`}>
                    {res.type === 'pdf' ? <Download size={14} /> : <ExternalLink size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-[#4A3728] truncate">{res.name}</h4>
                  </div>
                  <button 
                    onClick={() => handleRemoveResource(idx)}
                    className="p-1 text-[#A89F94] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
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
            <textarea 
              className="w-full bg-[#FBFBFA] border border-[#F3F2EE] rounded-2xl p-6 text-sm text-[#4A3728] leading-relaxed min-h-[200px] outline-none focus:border-[#8B5E3C] transition-all resize-none"
              value={localLesson.memo}
              onChange={(e) => setLocalLesson({ ...localLesson, memo: e.target.value })}
              placeholder="선생님만 볼 수 있는 메모입니다..."
            />
          </div>
        </section>
      </div>
    </div>
  );
};
