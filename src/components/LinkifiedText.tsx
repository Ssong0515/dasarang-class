import React from 'react';

// 채팅 메시지 본문 속 URL을 클릭 가능한 링크로 바꿔 그린다. 학생↔교사가 제출물·과제 링크를
// 주고받는 용도라 http(s) URL만 인식한다(스킴 없는 www.… 는 오탐이 많아 제외).
// split의 캡처 그룹 덕에 URL 조각이 결과 배열에 그대로 남는다.
const URL_SPLIT_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/gi;

/** 텍스트에 http(s) URL이 있는지 — 있으면 기계번역이 주소를 변형해 링크가 깨질 수 있어 번역을 건너뛰는 판단에 쓴다. */
export const containsUrl = (text: string): boolean => /https?:\/\//i.test(text);

export interface LinkifiedTextProps {
  text: string;
  /** 링크 <a>에 줄 클래스 — 어두운 말풍선(흰 글자) 위에서는 밝은 색으로 덮어쓴다. */
  linkClassName?: string;
}

export const LinkifiedText: React.FC<LinkifiedTextProps> = ({
  text,
  linkClassName = 'break-all font-semibold text-[#2563EB] underline underline-offset-2',
}) => (
  <>
    {text.split(URL_SPLIT_PATTERN).map((part, index) =>
      /^https?:\/\//i.test(part) ? (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
          // 말풍선 자체에 클릭 핸들러가 생겨도 링크 클릭이 그 동작을 함께 트리거하지 않게 한다.
          onClick={(event) => event.stopPropagation()}
        >
          {part}
        </a>
      ) : (
        <React.Fragment key={index}>{part}</React.Fragment>
      )
    )}
  </>
);
