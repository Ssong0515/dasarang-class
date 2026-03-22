export interface Lesson {
  id: string;
  date: string;
  title: string;
  folderName: string;
  attendance?: {
    studentName: string;
    status: 'Present' | 'Absent' | 'Late';
    initials: string;
  }[];
  resources?: {
    name: string;
    type: 'pdf' | 'link';
    info: string;
  }[];
  memo?: string;
  summary?: {
    text: string;
    attendanceRate: string;
    engagement: string;
    resourceCount: string;
  };
}

export interface LessonFolder {
  id: string;
  name: string;
  lessons: Lesson[];
  isOpen?: boolean;
}

export interface Memo {
  id: string;
  content: string;
  date: string;
}
