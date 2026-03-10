export type Session = {
  slug: string;
  label: string;
  course: string;
  date: string;
  time: string;
  month: string;
  status: string;
  summary: string;
  isFirstLesson: boolean;
};

const saturdayDates = [
  "2026-03-14",
  "2026-03-21",
  "2026-03-28",
  "2026-04-04",
  "2026-04-11",
  "2026-04-18",
  "2026-04-25",
  "2026-05-02",
  "2026-05-09",
  "2026-05-16",
  "2026-05-23",
  "2026-05-30",
  "2026-06-13",
  "2026-06-20",
  "2026-06-27",
  "2026-07-04",
  "2026-07-11",
  "2026-07-18",
  "2026-07-25",
];

const julyExtraDates = [
  "2026-07-07",
  "2026-07-09",
  "2026-07-14",
  "2026-07-16",
  "2026-07-21",
  "2026-07-23",
];

const monthLabel = (date: string) => `${Number(date.slice(5, 7))}월`;
const shortDate = (date: string) => date.slice(2).replaceAll("-", "");

export const sessions: Session[] = [];

saturdayDates.forEach((date, index) => {
  const order = String(index + 1).padStart(2, "0");
  const ymd = shortDate(date);
  const isFirstLesson = date === "2026-03-14";

  sessions.push({
    slug: `${ymd}_computer-a_${order}`,
    label: `${ymd}_컴퓨터A_${order}`,
    course: "컴퓨터 A반",
    date,
    time: "토요일 13:00-14:50",
    month: monthLabel(date),
    status: isFirstLesson ? "첫 수업 연결" : "진행 예정",
    summary: "토요일 컴퓨터 A반 수업 자료 자리입니다.",
    isFirstLesson,
  });

  sessions.push({
    slug: `${ymd}_computer-b_${order}`,
    label: `${ymd}_컴퓨터B_${order}`,
    course: "컴퓨터 B반",
    date,
    time: "토요일 15:00-16:50",
    month: monthLabel(date),
    status: "진행 예정",
    summary: "토요일 컴퓨터 B반 수업 자료 자리입니다.",
    isFirstLesson: false,
  });
});

julyExtraDates.forEach((date, index) => {
  const order = String(index + 1).padStart(2, "0");
  const ymd = shortDate(date);

  sessions.push({
    slug: `${ymd}_computer1_${order}`,
    label: `${ymd}_컴퓨터1_${order}`,
    course: "컴퓨터1",
    date,
    time: "화/목 오전 10:00-11:50",
    month: monthLabel(date),
    status: "진행 예정",
    summary: "7월 오전 컴퓨터1 수업 자료 자리입니다.",
    isFirstLesson: false,
  });

  sessions.push({
    slug: `${ymd}_computer2_${order}`,
    label: `${ymd}_컴퓨터2_${order}`,
    course: "컴퓨터2",
    date,
    time: "화/목 오후 17:00-18:30",
    month: monthLabel(date),
    status: "진행 예정",
    summary: "7월 방과후 컴퓨터2 수업 자료 자리입니다.",
    isFirstLesson: false,
  });
});

export const monthOrder = ["3월", "4월", "5월", "6월", "7월"];

export const sessionsByMonth = monthOrder.map((month) => ({
  month,
  sessions: sessions.filter((session) => session.month === month),
}));

export const firstLessonSession = sessions.find(
  (session) => session.slug === "260314_computer-a_01",
);

