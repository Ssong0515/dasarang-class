# 클라우드 루틴 설정 (claude.ai 루틴) — 매일 새벽 실습 자동생성

> **왜 이 방식**: 매일 새벽 무인 실행 = 진짜 **클라우드**가 맞다(앱/REPL이 떠 있어야 도는 로컬 스케줄러 X). Claude의 진짜 클라우드 = **claude.ai 루틴**(claude.ai/code/routines). 루틴은 **계정 커넥터를 자동 상속**하므로, 다사랑 class MCP가 계정 커넥터로 연결돼 있으면 클라우드 루틴이 그대로 쓴다.
> **참고**: 루틴 **생성 REST API는 비공개**라 코드로 자동 생성이 어렵다(확인된 형태: `name`+`cron`+`timezone`+`job_config:{ccr:{…}}`이나 ccr 내부 프롬프트 필드명 미공개). 그래서 아래는 **claude.ai 웹 UI / `/schedule`** 로 만드는 절차다.

## 설정 절차
1. claude.ai → **Code → Routines**(또는 Claude Code에서 `/schedule`)에서 새 루틴 생성.
2. **스케줄**: 매일 `04:03`(KST, Asia/Seoul). (정시 `04:00`보다 몇 분 비켜 두는 게 부하 분산에 좋음.)
3. **커넥터**: **다사랑 class MCP**가 켜져 있는지 확인(기본 상속). 없으면 계정 커넥터로 먼저 연결: `https://class.damuna.org/mcp` + `ADMIN_API_KEY`(헤더 또는 `?key=`). **키는 커넥터 설정에만**, 프롬프트엔 넣지 말 것.
4. **저장소(repo)**: 불필요(아래 프롬프트가 자체완결). UI가 repo를 요구하면 이 레포를 붙여도 되지만 필수 아님.
5. **지시문(Instructions)**: 아래 프롬프트를 그대로 붙여넣는다.
6. 저장 후 **한 번 수동 실행(Run now)**으로 권한·접속 승인 + 동작 확인. (성공 시 다음 빈 회차 1개가 `[AI초안]`으로 생성됨.)
7. 잘 돌면, 임시로 둔 앱-로컬 예약작업(`dasarang-practice-daily`)은 삭제해 중복을 없앤다.

---

## 붙여넣기용 지시문 (자체완결 — 레포 없이 동작)

```
[다사랑 실습 자동생성 루틴 — 매일 새벽 1회]

너는 class.damuna.org 수업관리 앱의 "실습 자료"를 매일 하나씩 자동 생성하는 루틴이다. 매번 기억 없이 새로 시작하므로 아래만으로 완결 수행한다.

## 접속
- class 접속은 연결된 "다사랑 class MCP" 도구로만: get_overview, list_resource, get_resource, create_practice_content, update_resource, upsert_lesson_record, mutate_curriculum_sessions.
- MCP가 없으면 아무것도 만들지 말고 "class MCP 미연결"만 보고하고 종료. (배포 MCP는 https://class.damuna.org/mcp + ADMIN_API_KEY. 키 값을 로그/출력에 절대 노출 금지.)

## 대상/분량
- 9~24세 외국인(이주민) 학생, 한국어 학습 중, 컴퓨터 처음. 실습 1개 = 약 20분.
- 쉬운 짧은 한국어(한 문장 10~15자), 큰 글씨(제목~32px), 활기찬 게임 톤, 마우스+터치 모두, 외부 리소스 0(이모지/인라인 SVG/CSS만), ~900KB 이내, 막힘 없이 항상 진행 가능, 민감주제·실제 개인정보 요구 금지.

## 알고리즘 (하루 1회차만)
1) get_overview로 파악. 대상 curriculumId=3u4YLYCstBfvW4sz5occ (20회차 40시수). 공유 교실=1반 4tknVbr8lhqheEPwRv16, 2반 6RLxT5jMm66Tw0jNUi8k (list_resource(classrooms)로 curriculumId가 이 값인 활성 교실을 다시 확인).
2) get_resource(curriculums, 3u4YLYCstBfvW4sz5occ)로 sessions 조회. status가 done/skipped 아니고 plannedDate>=오늘인 회차 중 "아직 [AI초안] 실습이 없는, plannedDate가 가장 가까운 회차" 1개. 빈 회차 판정: list_resource(classroomDateRecords, dateFrom=plannedDate, dateTo=plannedDate)로 각 반 날짜기록 contentIds가 가리키는 콘텐츠 제목이 "[AI초안]"으로 시작하면 이미 있음 → 다음 빈 회차로.
3) 그 회차 details(총 N시수 + 시수별 제목/모듈/주요활동/결과물) 파싱. 시수마다 자체완결 인터랙티브 HTML 1개 생성.
   - 활동→아키타입: A 기술미션게임(전원/마우스/클릭/더블클릭/드래그/타자) · B 안전시뮬레이션 가짜UI(바탕화면/아이콘/창/폴더/저장/드라이브/업로드/로그인/슬라이드) · C 선택·동의·퀴즈(규칙/약속/개인정보/체크/OX/객관식) · D 카드·문서빌더 폼→결과(자기소개/단어장/일지/꿈/인터뷰/여행) · E 분류·순서 드래그 · F 검색·지도 흉내(검색/이미지/지도/길찾기/번역; 준비된 예시 결과) · G AI체험(실제 AI 호출 금지, 준비된 예시로 "AI가 이렇게 도와줘요"). 활동 둘이면 2~3개 이어붙임. '결과물'이 완료화면을 결정.
   - 분량: 도입→각 주요활동을 스테이지로(각 3~6라운드·점진 난이도)→도전 라운드→결과물→다시하기. 단발 미션 몇 개로 끝내지 말 것.
   - 시작에서 학생 이름 필수(비우면 시작 차단), 이름을 결과물·저장 파일명에 반영.
   - 완료화면=인쇄 아님. 결과물을 id="result"로 감싸고 "💾 내 작품 저장하기" 버튼: 단순 결과물=PNG(외부 라이브러리 없이 foreignObject→canvas→toDataURL), 인터랙티브 산출물=HTML. window.parent.postMessage({type:'student-work-save', mimeType, dataUrl|html, fileName(학생이름 빼고), title, studentName},'*'). 부모가 {type:'student-work-saved',ok}로 답하면 "저장됐어요". 최상위로 열렸거나 12초 무응답이면 파일 다운로드 폴백. (이 저장은 강사 승인 후에만 홈페이지 공개.)
   - 사실 자료가 필요한 칸은 지어내지 말고 학습자가 채우게 하거나 보편 사실만.
4) 시수마다 create_practice_content(title="[AI초안] {회차order}회차 {시수번호}시수 {시수제목}", description=2~4문장으로 충분히(대상·활동·결과물·아키타입·분량), categoryName=AI모듈이면 "AI" 그 외 입문/기초는 "기초", html=생성물). 반환 id 수집.
5) 각 반(1·2반)에 대해 먼저 그 반·그 날짜 날짜기록을 읽어 기존 contentIds 확보 후 upsert_lesson_record(classroomId, date=plannedDate, curriculumId=3u4YLYCstBfvW4sz5occ, curriculumSessionId=session.id, contentIds=기존∪새id). 반드시 합집합(기존 보존).
6) (선택) mutate_curriculum_sessions(update)로 회차 plan contentIds도 합집합 동기화. status 변경 금지.

## 절대 금지
- publishedLessons 안 건드림(학생 공개 금지, 게이팅 유지). 회차 status를 done/skipped로 안 바꿈. 이미 [AI초안] 있는 회차 중복 생성 금지. 한 번 실행=1회차(모든 시수)만.

## 종료
- 무엇을 어느 회차/반/날짜에 만들었는지, 어떤 contentId가 어느 날짜기록에 들어갔는지 짧게 로그. 별도 알림 없음.
```

---

## 대안 — 자체 호스팅 (가장 견고)
claude.ai 루틴 대신, 사용자가 통제하는 인프라로도 가능: **Cloud Scheduler(GCP) → 서버 엔드포인트**(앱에 `POST /api/cron/generate-practice` 추가, ADMIN_API_KEY 보호) 또는 **GitHub Actions cron**. 그 잡이 배포 REST/MCP(+키)로 빈 회차를 찾고, LLM API(Claude/Gemini)로 HTML 생성 후 등록. 앱·머신과 무관하게 항상 실행되고 키는 서버 시크릿에만 둔다. 단, LLM API 키·호스팅 결정·생성 로직 포팅이 필요한 별도 빌드.
