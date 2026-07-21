import React, { useEffect, useRef, useState } from 'react';

// 여러 나라 학생용 안내 카드 — 교사 화면(프로젝터 미러링)에 띄워 학생들에게 보여준다(교사가 읽는 창이 아님).
// 몇 초마다 언어를 순환 표시한다. 화면 아무 곳이나 누르면 닫힌다.
export type NoticeLang = {
  code: string;
  label: string;
  dir?: 'rtl' | 'ltr';
  title: string;
  lines: string[];
};

// 수업 종료 안내 — '오늘 수업 끝!'.
export const END_NOTICE_LANGS: NoticeLang[] = [
  {
    code: 'ko', label: '한국어', title: '오늘 수업 끝!',
    lines: [
      '오늘 수업은 여기서 마무리합니다.',
      '모두 수고 많으셨습니다! 다음에 또 만나요.',
      '이제 정리해도 좋습니다.',
      '더 연습하고 싶은 학생은 10분 정도 자율 연습 가능합니다.',
    ],
  },
  {
    code: 'ru', label: 'Русский', title: 'Урок окончен!',
    lines: [
      'На этом сегодняшний урок заканчивается.',
      'Все большие молодцы! Увидимся в следующий раз.',
      'Теперь можно собираться.',
      'Кто хочет ещё потренироваться — можно заниматься самостоятельно около 10 минут.',
    ],
  },
  {
    code: 'vi', label: 'Tiếng Việt', title: 'Hết giờ học rồi!',
    lines: [
      'Buổi học hôm nay kết thúc ở đây.',
      'Các em đã làm rất tốt! Hẹn gặp lại lần sau.',
      'Bây giờ các em có thể dọn dẹp.',
      'Bạn nào muốn luyện tập thêm có thể tự học khoảng 10 phút.',
    ],
  },
  {
    code: 'zh', label: '中文', title: '今天的课结束啦！',
    lines: [
      '今天的课到这里就结束了。',
      '大家都辛苦了！下次再见。',
      '现在可以收拾东西了。',
      '想多练习的同学可以自己再练大约 10 分钟。',
    ],
  },
  {
    code: 'en', label: 'English', title: 'Class is over!',
    lines: [
      "That's the end of today's class.",
      'Great job, everyone! See you next time.',
      'You can pack up now.',
      'If you want more practice, you can study on your own for about 10 minutes.',
    ],
  },
  {
    code: 'ur', label: 'اردو', dir: 'rtl', title: 'آج کی کلاس ختم!',
    lines: [
      'آج کی کلاس یہیں ختم ہوتی ہے۔',
      'سب نے بہت اچھا کام کیا! اگلی بار ملیں گے۔',
      'اب آپ سامان سمیٹ سکتے ہیں۔',
      'جو طالب علم مزید مشق کرنا چاہتے ہیں وہ تقریباً 10 منٹ خود سے مشق کر سکتے ہیں۔',
    ],
  },
];

// 쉬는시간 안내 — '10분 쉬고 다시 시작'.
export const BREAK_NOTICE_LANGS: NoticeLang[] = [
  {
    code: 'ko', label: '한국어', title: '쉬는시간!',
    lines: [
      '잠깐 쉬었다 할게요.',
      '10분 뒤에 다시 시작합니다.',
      '물 마시고 화장실 다녀와도 좋아요.',
    ],
  },
  {
    code: 'ru', label: 'Русский', title: 'Перерыв!',
    lines: [
      'Сделаем небольшой перерыв.',
      'Продолжим через 10 минут.',
      'Можно попить воды и отдохнуть.',
    ],
  },
  {
    code: 'vi', label: 'Tiếng Việt', title: 'Giờ giải lao!',
    lines: [
      'Nghỉ một chút nhé.',
      'Chúng ta học tiếp sau 10 phút.',
      'Các em uống nước và thư giãn nhé.',
    ],
  },
  {
    code: 'zh', label: '中文', title: '休息时间！',
    lines: [
      '我们休息一下。',
      '10 分钟后继续上课。',
      '可以喝点水，休息一下。',
    ],
  },
  {
    code: 'en', label: 'English', title: 'Break time!',
    lines: [
      "Let's take a short break.",
      "We'll start again in 10 minutes.",
      'Grab some water and relax.',
    ],
  },
  {
    code: 'ur', label: 'اردو', dir: 'rtl', title: 'وقفہ!',
    lines: [
      'تھوڑا آرام کر لیتے ہیں۔',
      '10 منٹ بعد دوبارہ شروع کریں گے۔',
      'پانی پی لیں اور تھوڑا سستا لیں۔',
    ],
  },
];

export const CyclingNoticeCard: React.FC<{
  emoji: string;
  langs: NoticeLang[];
  onClose: () => void;
  // true면(프로젝터용) 카드가 뜨는 순간 브라우저 크롬 없이 꽉 채운다(이론 발표와 같은 진짜 전체화면).
  fullscreen?: boolean;
}> = ({ emoji, langs, onClose, fullscreen = false }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [langIdx, setLangIdx] = useState(0);
  useEffect(() => {
    setLangIdx(0);
    const id = setInterval(() => setLangIdx((i) => (i + 1) % langs.length), 4500);
    return () => clearInterval(id);
  }, [langs]);

  // 전체화면(프로젝터용) — 카드가 뜨면 카드 컨테이너를 진짜 전체화면으로. 사용자가 Esc로 나가면(브라우저 기본)
  // fullscreenchange로 감지해 카드도 닫는다. 언마운트(클릭 닫기 포함) 시엔 전체화면을 해제한다.
  // requestFullscreen은 버튼 클릭 제스처 직후(transient activation) 실행돼 대개 허용된다 — 막히면 조용히 오버레이로만 뜬다.
  useEffect(() => {
    if (!fullscreen) return;
    const node = containerRef.current;
    if (node?.requestFullscreen) {
      void node.requestFullscreen().catch(() => {});
    }
    const handleFsChange = () => {
      if (!document.fullscreenElement) onClose();
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  const lang = langs[langIdx];
  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[110] flex cursor-pointer items-center justify-center ${
        fullscreen ? 'bg-white' : 'bg-black/50 p-4'
      }`}
      onClick={onClose}
      title="화면을 누르면 닫혀요"
    >
      <div
        className={
          fullscreen
            ? 'flex h-full w-full flex-col items-center justify-center px-6 text-center'
            : 'w-full max-w-lg rounded-[28px] bg-white p-8 text-center shadow-2xl sm:p-12'
        }
      >
        <div className={fullscreen ? 'text-8xl sm:text-9xl' : 'text-6xl'}>{emoji}</div>
        <h2
          className={`font-serif font-bold text-[#141414] ${
            fullscreen ? 'mt-6 text-5xl sm:text-6xl' : 'mt-4 text-3xl'
          }`}
          dir={lang.dir || 'ltr'}
        >
          {lang.title}
        </h2>
        <div
          className={`space-y-3 font-medium leading-relaxed text-[#4A3728] ${
            fullscreen ? 'mt-8 text-3xl sm:text-4xl' : 'mt-6 min-h-[180px] text-xl'
          }`}
          dir={lang.dir || 'ltr'}
        >
          {lang.lines.map((line, idx) => {
            const isLast = idx === lang.lines.length - 1;
            return (
              <p
                key={idx}
                className={isLast ? (fullscreen ? 'text-2xl text-[#8B7E74] sm:text-3xl' : 'text-lg text-[#8B7E74]') : ''}
              >
                {line}
              </p>
            );
          })}
        </div>
        <div
          className={`flex flex-wrap items-center justify-center gap-2 ${fullscreen ? 'mt-12' : 'mt-7'}`}
          dir="ltr"
        >
          {langs.map((l, idx) => (
            <span
              key={l.code}
              className={`rounded-full font-bold transition-colors ${
                fullscreen ? 'px-4 py-1.5 text-sm' : 'px-3 py-1 text-xs'
              } ${idx === langIdx ? 'bg-[#8B5E3C] text-white' : 'bg-[#F3F2EE] text-[#A89F94]'}`}
            >
              {l.label}
            </span>
          ))}
        </div>
        <p className={`text-[#A89F94] ${fullscreen ? 'mt-10 text-sm' : 'mt-4 text-xs'}`}>
          화면을 누르면 닫혀요 · Tap anywhere to close
        </p>
      </div>
    </div>
  );
};
