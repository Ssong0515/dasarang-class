# 다사랑 수업 자동생성 파이프라인 — 핸드오프

> 이 문서 하나로 새 세션(팀 다른 계정)이 이전 대화 없이 작업을 이어갈 수 있게 정리한 것.
> **새 세션은 이 파일부터 읽고**, [6. 남은 할 일]부터 시작하면 된다.

## 0. 한 줄 요약
class.damuna.org 수업관리 앱에서, **커리큘럼 회차별 수업 자료를 반자동 생성**한다. 매일 새벽 클라우드 루틴이 다가오는 회차의 **인터랙티브 실습 HTML**을 만들어 **그 반·그 날짜 날짜기록에 저장**(학생 비공개) → 강사가 앱에서 검수·공개. (이론 슬라이드는 NotebookLM으로 강사가 수동 제작.)

## 1. 환경
- repo: `C:\Coding\dasarang-class` → **class.damuna.org**. React + Vite + Express(`server.ts`), Firebase App Hosting(main push 자동배포).
- Firestore: **named DB**(`ai-studio-...`)는 class 데이터, **default DB**는 calendar.damuna.org 데이터. (둘이 같은 Firebase 프로젝트 `gen-lang-client-0507712225`)
- 로컬 dev: `npm run dev`(=`tsx server.ts`). `.env`에 `ADMIN_API_KEY` 등 8개 키. dev는 `dev-admin` uid 사용.
- 같은 OS 사용자(`C:\Users\40660`)라 `.claude` 메모리/이 repo는 계정 바뀌어도 그대로 보임.

## 2. 확정된 설계 결정
- 1 회차(수업 1회) = 보통 **2시수**. **시수당 1이론 + 1실습** (2시수 회차 → 이론2 + 실습2).
- **이론 = NotebookLM (수동)**. NotebookLM은 공개 API가 없어 자동화 제외. 공통 지침: `docs/lesson-automation/notebooklm-guidelines.md` (① 디자인 ② 내용). 내용 프롬프트는 시수마다 강사가 따로 입력.
- **실습 = Claude 인터랙티브 HTML (자동화 대상)**.
- **자동 실행 = 클라우드 루틴(cron), 팀의 다른 계정 토큰으로.**
  - ⚠️ 그래서 루틴은 **로컬 `.env`/Firebase 자격증명에 의존하면 안 된다.** 오직 **배포된 MCP + `ADMIN_API_KEY`** 로 class 앱에 접속해 읽고 쓴다.
- **검수 = class 앱 UI.** `create_practice_content`로 등록한 콘텐츠는 **이미 게이팅**되어 있어(학생에겐 안 보이고, 강사가 "수업 진행"에서 "공개"를 눌러야 열림 — 학생은 오늘 `publishedLessons`에 공개된 것만 봄, `StudentPage.tsx`) → 자동 생성물은 자동으로 안전한 **비공개 초안**. 별도 알림 없이 앱에서 검수.
- ⚠️ **연결 타깃 = 날짜기록(`classroomDateRecords`), 커리큘럼 회차가 아님**(2026-06-21 사용자 정정). 자동 생성물은 `upsert_lesson_record`로 **그 반·그 날짜 "날짜별 수업기록"에 미리 선택**해 둬야(학생 공개 아님) 강사가 전체 콘텐츠를 뒤지지 않고 바로 검수·공개할 수 있다. 회차 plan의 contentIds에만 연결하면 날짜기록 화면엔 안 떠서 못 쓴다.
- **빈 회차 판정 = 반별 + 그 날짜기록의 콘텐츠 존재 여부(`contentIds`)** 로 — 제목 접두로 판단하지 않는다. 제목은 내용에 맞게(접두 없음). 학생 비공개는 **`publishedLessons` 게이팅으로만**(제목과 무관, 스키마 변경 없음).

## 3. 대상 학습자 & 스타일 (실습·이론 공통)
**9~24세 외국인(이주민) 학생, 한국어 학습 중**(컴퓨터 처음). ❌어르신/고령 전제 아님(2026-06-21 정정).
→ **큰 글씨 / 쉬운 짧은 한국어 / 한 화면 한 동작 / 활기찬 게임형(점수·레벨·뱃지 OK) / 따뜻한 격려 톤.** 마우스·터치 모두 동작. 외부 리소스 0(자체 완결 HTML).
→ **실습 1개 = 약 20분 분량**(1시수=1시간, 실수업 ~40분, 이론20+실습20). 단발 미션 몇 개로 끝내지 말 것.

## 4. 데이터 구조 (가장 중요)
- 컬렉션: `classrooms`, `curriculums`(회차 sessions 내장 배열), `contents`(학생 콘텐츠/실습 HTML), `classroomDateRecords`, `publishedLessons`, `studentPosts`, `memos` 등. 타입은 `src/types.ts` 참고.
- `Classroom`: { id, name, curriculumId, calendarClassId, hidden, ... }
- `CurriculumSession`: { id, order(1-based), topic, **details**, plannedDate(YYYY-MM-DD), contentIds[], status('planned'|'done'|'skipped') }
- **`details` 필드가 구조화된 스펙이다.** 형식:
  ```
  총 N시수

  1시수. <제목>
  - 모듈: <...>
  - 주요 활동: <...>
  - 결과물: <...>

  2시수. <제목>
  - 모듈/주요 활동/결과물 ...
  ```
  → 파싱해서 **시수 개수**와 시수별 **(제목/모듈/주요활동/결과물)** 추출. **결과물이 실습의 목표**가 된다. (calendar로 시수 환산할 필요 없음.)
- 현재 컴퓨터 수업: **"디지털.AI 문해교육 1반 / 2반"** — 둘 다 `curriculumId = 3u4YLYCstBfvW4sz5occ` ("20회차 40시수" 커리큘럼) 공유. plannedDate는 **매주 월요일, 6/22부터**(2026-06-21 조회 기준 — 초안의 '목요일/6-25'에서 재배정됨), 모든 회차 contentIds 비어 있음(아직 자료 없음).

## 5. 기존 도구 (이미 구현됨 — 재사용)
adminApi 레이어: **MCP**(`POST /mcp`) + **REST**(`/api/gpt/*`). 인증 = Bearer `ADMIN_API_KEY`(또는 `MCP_API_KEY`). MCP는 헤더 못 넣는 클라이언트용으로 `?key=` / `?token=` 쿼리도 지원.
- 배포 엔드포인트(루틴이 쓸 것): `https://class.damuna.org/mcp?key=<ADMIN_API_KEY>` (POST), REST는 `https://class.damuna.org/api/gpt/...`
  - (경로 prefix는 env `APP_BASE_PATH`로 결정 — 기본 빈 값이라 루트. 배포값 확인.)
- 주요 MCP 툴 (`server/adminApi/mcp.ts`):
  - `get_overview` — 교실/커리큘럼/오늘 수업 등 id 파악(대화 시작 시 먼저 호출)
  - `list_resource` / `get_resource` — 리소스 조회(curriculums, classrooms, contents 등). contents 목록은 html 생략.
  - **`create_practice_content`** — 실습 HTML을 학생 콘텐츠로 등록(게이팅됨). title/description/html/categoryName. → 실습 저장에 사용.
  - **`mutate_curriculum_sessions`** — 회차 추가/수정. session.contentIds에 생성한 콘텐츠 id append, status 변경. → 회차 연결에 사용.
  - 기타: `upsert_lesson_record`, `list_calendar_classes`, `assign_curriculum_dates`, `sync_calendar`, `review_student_post`, `create/update/delete_resource`.
- 서버 코드 위치: `server/adminApi/` (router.ts=REST, mcp.ts=MCP 툴, services.ts=구현, calendarClasses.ts=시간표→회차날짜).

## 6. 남은 할 일 (TODO — 여기서 시작)
- **A. 실습 생성 레시피를 스킬/프롬프트로 고정.** 입력=회차 `details` 1개. 출력=시수마다 자체 완결 인터랙티브 HTML 1개. 디자인 언어는 `notebooklm-guidelines.md`와 공유해 이론↔실습 톤 일치. **품질 기준선 = `docs/lesson-automation/sample-practice-mouse-mission.html`**. → **2026-06-21: 사용자 확인 — 스타일/구조는 OK. 단 정정: (1) 실습 1개 = ~20분 분량(단발 미션 몇 개로는 짧음), (2) 대상 = 9~24세 외국인(어르신 아님).** 레시피 고정 완료 → **`docs/lesson-automation/practice-recipe.md`** (아키타입 7종 + 활동→인터랙션 매핑 + 20분 분량 규칙 + 40시수 매핑표).
- **B. "다가오는 회차 중 콘텐츠 없는 것" 선택 로직.** `get_overview`/`list_resource`로 계산하거나, 작은 MCP 툴/REST(`next_session_needing_content`) 추가. 규칙: status done/skipped 제외, date>=오늘, **그 반 날짜기록의 contentIds가 비어있는 것** 중 가장 가까운 회차. 이미 차 있으면 skip. **(2026-06-24: 회차 날짜·상태는 커리큘럼이 아니라 반별 `classrooms.sessionStates[sessionId]={date,status}`에 있다 — `get_resource(classrooms, id)`로 읽을 것. 커리큘럼 회차엔 plannedDate/status 없음. ★ 반별 독립 판정: 같은 커리큘럼이라도 1반·2반은 각자 본다 — 제목이 아니라 그 반 날짜기록의 contentIds 존재 여부로.)** ★ **(2026-06-24 정정) 한 번 실행 = 전체에서 딱 1회차**: 모든 반을 독립 판정해 빈 회차를 모은 뒤, 그 중 date가 가장 이른 1개만 고른다(반마다 1개씩 아님). 특정 날짜/회차 지정 시 그걸 조준(강제 재생성).
- **C. 새벽 클라우드 루틴.** (전체에서 선정된 1회차) → `details` 파싱 → 시수마다 실습 HTML 생성 → `create_practice_content`(title `{시수제목}` — 내용에 맞게, 회차/시수·접두 없음) → 반환 id를 **`upsert_lesson_record`로 그 반의 그 날짜(반별 `sessionStates[sessionId].date`) "날짜별 수업기록" `contentIds`에 넣기**(= 강사 화면에 바로 선택됨, `curriculumSessionId` 연결). ★ **한 번 실행에 딱 1회차**(가장 가까운 빈 회차 1개)만 — 반마다 1개씩 아님. ★ **반별 독립 — 같은 커리큘럼이라도 반마다 새로 생성**(다른 반 자료 재사용·공유 안 함). **학생 공개 아님**(`publishedLessons` 안 건드림). (선택) `mutate_curriculum_sessions`로 회차 plan contentIds도 동기화. **공개하지 않음.** 팀 이 계정 토큰으로, **MCP+키로만** 접속(로컬 비밀 X).
- **D. 정할 것:** 루틴 주기/시각(예: 매일 새벽), 며칠 앞 회차까지 미리 만들지(예: 다음 1회분만 vs 한 주치), 실패/재시도, 동일 회차 중복생성 방지(B의 skip 규칙으로). 알림은 현재 "앱 UI에서만"으로 합의됨.

## 7. 참고 파일
- `docs/lesson-automation/practice-recipe.md` — **실습 생성 레시피(A 결과물).** 입력=회차 details → 출력=시수별 인터랙티브 HTML. 아키타입 카탈로그·20분 분량 규칙·출력 규약·40시수 매핑표.
- `docs/lesson-automation/sample-practice-mouse-mission.html` — 실습 품질 기준선(2시수 「마우스 미션」: 전원→마우스이동→클릭→더블클릭→드래그분류→미션표 인쇄). claude.ai 아티팩트로도 띄웠음.
- `docs/lesson-automation/notebooklm-guidelines.md` — 이론(NotebookLM) 공통 지침 ①디자인 ②내용 + 시수별 내용 프롬프트 템플릿.
- `docs/lesson-automation/theory-html-recipe.md` — **이론을 Claude가 자체 완결 HTML 덱으로 직접 생성**하는 레시피(NotebookLM 수동 경로의 자동화 대안, practice-recipe.md와 짝). 향후 이론+실습 함께 생성 루틴 목표. 시각 우선 + 모국어 병기(현재 러시아어).
- `docs/lesson-automation/sample-theory-files-and-storage.html` — 이론 HTML 품질 기준선(2회차 심화 "파일의 실제 위치와 저장 구조", 16장, RU 병기).

## 8. 주의사항
- 새 세션은 **다른 계정** → 클라우드 루틴 토큰을 그 계정으로. 로컬 `.env`/Firebase 자격증명 의존 금지. class 접속은 배포 MCP + `ADMIN_API_KEY`만.
- `ADMIN_API_KEY`는 **팀 공유 비밀**(그 키로 class DB 쓰기 가능) — 취급 주의.
- 클라우드에서 루틴이 repo 파일(레시피/지침/샘플)을 읽어야 하면 **commit & push** 필요(현재 이 docs는 아직 미커밋일 수 있음). 같은 머신 인터랙티브 세션이면 작업트리로 바로 읽힘.
- PowerShell 5.1: 한글 body는 `Invoke-RestMethod`가 ASCII로 깨뜨림 — 테스트 시 UTF8 바이트로 전송.
- 생성 HTML은 자체 완결(외부 리소스 0), 약 900KB 이내.
