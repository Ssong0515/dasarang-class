import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { MemoSection } from './components/MemoSection';
import { LessonDetail } from './components/LessonDetail';
import { LessonFolder, Memo, Lesson } from './types';

const MOCK_FOLDERS: LessonFolder[] = [
  {
    id: '1',
    name: '창의적 예술 교육',
    lessons: [
      { id: 'l1', date: '2024-05-20', title: '색채의 마법', folderName: '창의적 예술 교육' },
      { id: 'l2', date: '2024-05-22', title: '모양과 질감', folderName: '창의적 예술 교육' },
    ]
  },
  {
    id: '2',
    name: '기초 한글 교실',
    lessons: []
  }
];

const MOCK_LESSON: Lesson = {
  id: 'l3',
  date: '2024-03-14',
  title: '수업 상세',
  folderName: '창의적 예술 교육',
  attendance: [
    { studentName: '김지수 (Jisoo Kim)', status: 'Present', initials: 'JS' },
    { studentName: '이민호 (Minho Lee)', status: 'Absent', initials: 'MH' },
    { studentName: '박서연 (Seoyeon Park)', status: 'Present', initials: 'SY' },
    { studentName: '최현준 (Hyunjun Choi)', status: 'Late', initials: 'HJ' },
    { studentName: '정지원 (Jiwon Jung)', status: 'Present', initials: 'JW' },
  ],
  resources: [
    { name: 'Spring Flowers PPT.pdf', type: 'pdf', info: '12.4 MB • Updated 2h ago' },
    { name: 'YouTube: Creative Art Intro', type: 'link', info: 'Video link • External' },
  ],
  memo: '오늘 수업은 봄꽃의 형태를 관찰하고 수채화로 표현하는 시간을 가졌습니다. 지수 학생이 색 배합에 아주 뛰어난 재능을 보였고, 대부분의 학생들이 야외 관찰 활동에 적극적으로 참여했습니다. 다음 시간에는 완성된 작품을 발표하는 시간을 가질 예정입니다.',
  summary: {
    text: '오늘 수업의 출석률은 94%이며, 총 2개의 자료가 공유되었습니다. 학생들의 참여도는 전반적으로 \'매우 높음\' 수준으로 기록되었습니다. 지난 수업 대비 과제 제출률이 15% 향상되었습니다.',
    attendanceRate: '94.0%',
    engagement: 'High',
    resourceCount: '2 Files'
  }
};

const MOCK_MEMOS: Memo[] = [
  {
    id: '1',
    content: '창의적 예술 교육 수업 준비물: 팔레트, 붓, 물통 확인 필요.',
    date: '2024-05-20'
  },
  {
    id: '2',
    content: '김철수 학생: 오늘 수업 참여도가 매우 좋았음. 칭찬 스티커 부여.',
    date: '2024-05-21'
  }
];

export default function App() {
  const [folders] = useState<LessonFolder[]>(MOCK_FOLDERS);
  const [memos, setMemos] = useState<Memo[]>(MOCK_MEMOS);
  const [activeTab, setActiveTab] = useState<'home' | 'memo' | 'lesson-detail'>('lesson-detail');

  const handleAddMemo = (content: string) => {
    const newMemo: Memo = {
      id: Date.now().toString(),
      content,
      date: new Date().toISOString().split('T')[0]
    };
    setMemos([newMemo, ...memos]);
  };

  const handleDeleteMemo = (id: string) => {
    setMemos(memos.filter(m => m.id !== id));
  };

  return (
    <div className="flex h-screen bg-[#FBFBFA] font-sans text-[#4A3728]">
      <Sidebar 
        folders={folders} 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        {activeTab === 'home' && <Dashboard />}
        {activeTab === 'memo' && (
          <MemoSection 
            memos={memos} 
            onAddMemo={handleAddMemo} 
            onDeleteMemo={handleDeleteMemo} 
          />
        )}
        {activeTab === 'lesson-detail' && <LessonDetail lesson={MOCK_LESSON} />}
      </div>
    </div>
  );
}
