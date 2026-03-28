import React, { useEffect, useState } from 'react';
import {
  Users,
  Paperclip,
  Plus,
  Download,
  ExternalLink,
  FileEdit,
  Save,
  Trash2,
  Type,
  Hash,
  FolderOpen,
  FileText,
} from 'lucide-react';
import { Lesson, LessonFolder, AttendanceRecord, LessonResource, LessonContent } from '../types';
import { getAssignedContentIdsForFolder } from '../utils/folderContentAssignments';
import {
  buildLessonRecordContent,
  normalizeLessonContentIds,
} from '../utils/lessonRecordContent';

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

  useEffect(() => {
    setLocalLesson(lesson);
  }, [lesson]);

  const currentFolder = folders.find((folder) => folder.id === localLesson.folderId);
  const assignedContentIds = currentFolder ? getAssignedContentIdsForFolder(currentFolder) : [];
  const assignedContentIdSet = new Set(assignedContentIds);
  const availableContents = contents.filter((content) => assignedContentIdSet.has(content.id));
  const availableContentsById = new Map<string, LessonContent>(
    availableContents.map((content) => [content.id, content])
  );
  const rawSelectedContentIds = normalizeLessonContentIds(localLesson);
  const selectedContentIds = rawSelectedContentIds.filter((contentId) =>
    availableContentsById.has(contentId)
  );
  const selectedContentIdSet = new Set(selectedContentIds);
  const missingSelectedContentCount = Math.max(
    rawSelectedContentIds.length - selectedContentIds.length,
    0
  );

  useEffect(() => {
    if (!currentFolder || (localLesson.attendance && localLesson.attendance.length > 0)) {
      return;
    }

    const initialAttendance: AttendanceRecord[] = (currentFolder.students || []).map((student) => ({
      studentId: student.id,
      studentName: student.name,
      initials: student.initials,
      status: 'Present',
    }));

    setLocalLesson((previousLesson) => ({
      ...previousLesson,
      attendance: initialAttendance,
    }));
  }, [currentFolder, localLesson.attendance]);

  const handleFolderChange = (folderId: string) => {
    const nextFolder = folders.find((folder) => folder.id === folderId);
    const nextAssignedContentIds = nextFolder ? getAssignedContentIdsForFolder(nextFolder) : [];
    const nextAssignedContentIdSet = new Set(nextAssignedContentIds);
    const nextAvailableContents = contents.filter((content) => nextAssignedContentIdSet.has(content.id));
    const nextAvailableContentsById = new Map<string, LessonContent>(
      nextAvailableContents.map((content) => [content.id, content])
    );
    const preservedContentIds = normalizeLessonContentIds(localLesson).filter((contentId) =>
      nextAvailableContentsById.has(contentId)
    );
    const nextLessonContent = buildLessonRecordContent(
      preservedContentIds,
      nextAvailableContentsById
    );

    setLocalLesson((previousLesson) => ({
      ...previousLesson,
      folderId,
      folderName: nextFolder?.name || previousLesson.folderName,
      ...nextLessonContent,
    }));
  };

  const handleAttendanceChange = (studentId: string, status: 'Present' | 'Absent' | 'Late') => {
    const nextAttendance = (localLesson.attendance || []).map((record) =>
      record.studentId === studentId ? { ...record, status } : record
    );
    setLocalLesson((previousLesson) => ({ ...previousLesson, attendance: nextAttendance }));
  };

  const handleContentToggle = (content: LessonContent) => {
    const nextIds = selectedContentIdSet.has(content.id)
      ? selectedContentIds.filter((contentId) => contentId !== content.id)
      : [...selectedContentIds, content.id];
    const nextLessonContent = buildLessonRecordContent(nextIds, availableContentsById);

    setLocalLesson((previousLesson) => ({
      ...previousLesson,
      ...nextLessonContent,
    }));
  };

  const handleAddResource = () => {
    if (!newResourceName || !newResourceUrl) {
      return;
    }

    const newResource: LessonResource = {
      name: newResourceName,
      type: newResourceType,
      info: newResourceType === 'pdf' ? 'PDF Document' : 'External Link',
    };

    setLocalLesson((previousLesson) => ({
      ...previousLesson,
      resources: [...(previousLesson.resources || []), newResource],
    }));
    setNewResourceName('');
    setNewResourceUrl('');
  };

  const handleRemoveResource = (index: number) => {
    const nextResources = [...(localLesson.resources || [])];
    nextResources.splice(index, 1);
    setLocalLesson((previousLesson) => ({ ...previousLesson, resources: nextResources }));
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#FBFBFA] p-8 pb-20">
      <div className="mb-12 flex items-center justify-between">
        <div className="flex-1 max-w-2xl">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-full bg-[#FFF5E9] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#8B5E3C]">
              <FolderOpen size={12} />
              <select
                value={localLesson.folderId}
                onChange={(event) => handleFolderChange(event.target.value)}
                className="cursor-pointer bg-transparent outline-none"
              >
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-[#F3F2EE] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#8B7E74]">
              <Hash size={12} />
              <input
                type="number"
                value={localLesson.order || ''}
                onChange={(event) =>
                  setLocalLesson((previousLesson) => ({
                    ...previousLesson,
                    order: parseInt(event.target.value, 10),
                  }))
                }
                placeholder="순서"
                className="w-8 bg-transparent outline-none"
              />
            </div>
          </div>
          <input
            type="text"
            value={localLesson.title}
            onChange={(event) =>
              setLocalLesson((previousLesson) => ({
                ...previousLesson,
                title: event.target.value,
              }))
            }
            placeholder="수업 제목을 입력하세요"
            className="w-full border-b border-transparent bg-transparent text-4xl font-serif font-bold text-[#4A3728] outline-none transition-all hover:border-[#E5E3DD] focus:border-[#8B5E3C]"
          />
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => onSave(localLesson)}
            className="flex items-center gap-2 rounded-2xl bg-[#8B5E3C] px-6 py-3 font-bold text-white shadow-lg shadow-[#8B5E3C]/20 transition-all hover:bg-[#724D31]"
          >
            <Save size={20} />
            <span>수업 저장하기</span>
          </button>
        </div>
      </div>

      <div className="mb-8 rounded-[32px] border border-[#E5E3DD] bg-white p-8 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#8B5E3C]">
            <FileText size={14} /> 날짜별 수업 기록
          </label>
          <span className="text-[10px] text-[#8B7E74]">
            학생 페이지 노출과 별개로, 이 반에 배정된 콘텐츠 안에서만 기록합니다.
          </span>
        </div>

        {missingSelectedContentCount > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            현재 기록된 수업 중 일부를 찾을 수 없습니다. 삭제되었거나 이 반 배정에서 빠진
            콘텐츠일 수 있습니다.
          </div>
        )}

        {selectedContentIds.length > 0 ? (
          <div className="mb-6 flex flex-wrap gap-2">
            {selectedContentIds.map((contentId) => {
              const selectedContent = availableContentsById.get(contentId);
              if (!selectedContent) {
                return null;
              }

              return (
                <button
                  key={contentId}
                  type="button"
                  onClick={() => handleContentToggle(selectedContent)}
                  className="rounded-full bg-[#4A3728] px-4 py-2 text-sm font-bold text-white shadow-sm"
                >
                  {selectedContent.title}
                </button>
              );
            })}
          </div>
        ) : null}

        {availableContents.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {availableContents.map((content) => {
              const isSelected = selectedContentIdSet.has(content.id);
              return (
                <button
                  key={content.id}
                  type="button"
                  onClick={() => handleContentToggle(content)}
                  className={`rounded-full px-5 py-3 text-left text-sm font-bold transition-all ${
                    isSelected
                      ? 'bg-[#4A3728] text-white shadow-md'
                      : 'bg-[#F3F2EE] text-[#4A3728] hover:bg-[#E5E3DD]'
                  }`}
                >
                  {content.title}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-5 py-6 text-sm text-[#8B7E74]">
            이 반에 배정된 콘텐츠가 없습니다. 먼저 반 관리 화면에서 학생 페이지용 콘텐츠를
            배정해 주세요.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <section className="space-y-8 lg:col-span-2">
          <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <Type className="text-[#8B5E3C]" size={24} />
              <h2 className="text-xl font-bold text-[#4A3728]">수업 내용 (HTML)</h2>
            </div>
            <textarea
              value={localLesson.content}
              onChange={(event) =>
                setLocalLesson((previousLesson) => ({
                  ...previousLesson,
                  content: event.target.value,
                }))
              }
              placeholder="HTML 코드를 입력하세요."
              className="h-[400px] w-full resize-none rounded-2xl border border-[#F3F2EE] bg-[#FBFBFA] p-6 font-mono text-sm outline-none transition-all focus:border-[#8B5E3C]"
            />
            <div className="mt-4 rounded-xl border border-[#EBD9C1] bg-[#FFF5E9] p-4">
              <p className="text-[11px] leading-relaxed text-[#8B5E3C]">
                날짜별 수업 기록에 맞춰 내용을 정리할 수 있습니다. 학생 페이지에 보이는 반 배정
                콘텐츠와는 별개의 관리용 기록입니다.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[32px] border border-[#E5E3DD] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#F3F2EE] p-8">
              <div className="flex items-center gap-3">
                <Users className="text-[#8B5E3C]" size={24} />
                <h2 className="text-xl font-bold text-[#4A3728]">출석 체크 ({localLesson.date})</h2>
              </div>
              <input
                type="date"
                value={localLesson.date}
                onChange={(event) =>
                  setLocalLesson((previousLesson) => ({
                    ...previousLesson,
                    date: event.target.value,
                  }))
                }
                className="rounded-full bg-[#FFF5E9] px-3 py-1 text-sm font-bold text-[#8B5E3C] outline-none"
              />
            </div>

            <div className="p-8">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#F3F2EE] text-left text-[11px] font-bold uppercase tracking-widest text-[#A89F94]">
                    <th className="pb-4">학생 이름</th>
                    <th className="pb-4 text-right">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F2EE]">
                  {(localLesson.attendance || []).map((record) => (
                    <tr key={record.studentId} className="group">
                      <td className="py-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EBD9C1] text-xs font-bold text-[#8B5E3C]">
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
                              className={`rounded-xl px-4 py-2 text-[11px] font-bold transition-all ${
                                record.status === status
                                  ? status === 'Present'
                                    ? 'bg-[#D1F3E0] text-[#2D7A4D]'
                                    : status === 'Absent'
                                      ? 'bg-[#F3D1D1] text-[#7A2D2D]'
                                      : 'bg-[#F3EBD1] text-[#7A6A2D]'
                                  : 'bg-[#F3F2EE] text-[#8B7E74] hover:bg-[#EAE8E2]'
                              }`}
                            >
                              {status === 'Present'
                                ? '출석'
                                : status === 'Absent'
                                  ? '결석'
                                  : '지각'}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!localLesson.attendance || localLesson.attendance.length === 0) && (
                    <tr>
                      <td colSpan={2} className="py-12 text-center text-[#8B7E74]">
                        이 반에 등록된 학생이 없습니다.
                        <br />
                        사이드바의 '인원 관리'에서 학생을 먼저 추가해 주세요.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-8">
          <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Paperclip className="text-[#8B5E3C]" size={20} />
                <h2 className="text-lg font-bold text-[#4A3728]">수업 자료</h2>
              </div>
            </div>

            <div className="mb-6 space-y-4">
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="자료 이름"
                  value={newResourceName}
                  onChange={(event) => setNewResourceName(event.target.value)}
                  className="w-full rounded-xl border border-[#F3F2EE] bg-[#FBFBFA] px-4 py-2 text-sm outline-none"
                />
                <input
                  type="text"
                  placeholder="URL 또는 정보"
                  value={newResourceUrl}
                  onChange={(event) => setNewResourceUrl(event.target.value)}
                  className="w-full rounded-xl border border-[#F3F2EE] bg-[#FBFBFA] px-4 py-2 text-sm outline-none"
                />
                <div className="flex gap-2">
                  <select
                    value={newResourceType}
                    onChange={(event) => setNewResourceType(event.target.value as 'pdf' | 'link')}
                    className="rounded-xl border border-[#F3F2EE] bg-[#FBFBFA] px-4 py-2 text-sm outline-none"
                  >
                    <option value="link">링크</option>
                    <option value="pdf">PDF</option>
                  </select>
                  <button
                    onClick={handleAddResource}
                    className="flex-1 rounded-xl bg-[#8B5E3C] py-2 text-sm font-bold text-white hover:bg-[#724D31]"
                  >
                    자료 추가
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {(localLesson.resources || []).map((resource, index) => (
                <div
                  key={index}
                  className="group flex items-center gap-3 rounded-xl border border-[#F3F2EE] bg-[#FBFBFA] p-3"
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      resource.type === 'pdf'
                        ? 'bg-[#F3D1D1] text-[#7A2D2D]'
                        : 'bg-[#D1E4F3] text-[#4A86B0]'
                    }`}
                  >
                    {resource.type === 'pdf' ? <Download size={14} /> : <ExternalLink size={14} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-xs font-bold text-[#4A3728]">{resource.name}</h4>
                  </div>
                  <button
                    onClick={() => handleRemoveResource(index)}
                    className="p-1 text-[#A89F94] opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <FileEdit className="text-[#8B5E3C]" size={20} />
              <h2 className="text-lg font-bold text-[#4A3728]">오늘의 수업 메모</h2>
            </div>
            <textarea
              className="min-h-[200px] w-full resize-none rounded-2xl border border-[#F3F2EE] bg-[#FBFBFA] p-6 text-sm leading-relaxed text-[#4A3728] outline-none transition-all focus:border-[#8B5E3C]"
              value={localLesson.memo}
              onChange={(event) =>
                setLocalLesson((previousLesson) => ({
                  ...previousLesson,
                  memo: event.target.value,
                }))
              }
              placeholder="선생님만 보는 메모입니다."
            />
          </div>
        </section>
      </div>
    </div>
  );
};
