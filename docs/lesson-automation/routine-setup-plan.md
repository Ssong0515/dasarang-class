# 실습 자동생성 루틴(C) 등록 계획서 — 집 컴퓨터에서 이어서

> 다른 컴퓨터의 Claude Code 세션이 **이 문서 + 레포 파일만으로** 매일 새벽 실습 자동생성 루틴을 등록할 수 있게 정리한 핸드오프.
> 집에서: `git pull` → 이 문서를 Claude Code에 읽히고 [4. 등록 절차]대로 진행.

## 1. 지금까지 된 것 (2026-06-21)

- **A. 레시피 완성** → [`practice-recipe.md`](./practice-recipe.md) (아키타입 7종 + 활동→인터랙션 매핑 + 20분 분량 규칙 + 40시수 매핑표).
- **1회차(6/22) 시딩 완료**: `[AI초안]` 약속카드(1시수) + 마우스미션(2시수)을 1·2반 **6/22 날짜기록**에 등록. 게이팅(학생 비공개).
- **강사 미리보기 날짜 기능 배포**: 학생 페이지 보기에서 🔧 미리보기 날짜로 특정 날짜 공개분을 강사가 미리 확인(학생엔 영향 없음).
- **남은 것 = 이 루틴(C) 등록.** (B 선택로직은 루틴 안에 포함.)

## 2. 핵심 개념 (꼭 기억)

- **연결 타깃 = 날짜기록(`classroomDateRecords`)**, 커리큘럼 회차 아님. `upsert_lesson_record`로 그 반·그 날짜 기록 `contentIds`에 넣어야 강사 화면에 "선택됨"으로 뜬다.
- **학생 공개 = `publishedLessons`(별도).** 루틴은 **절대 건드리지 않는다.** 공개는 강사가 앱 "수업 진행"에서 수동.
- **게이팅**: 학생은 "오늘 publishedLessons에 공개된 것"만 봄. 그래서 `[AI초안]`을 미리 만들어 날짜기록에 넣어둬도 안전(비공개).
- 한 커리큘럼을 **여러 반**이 공유할 수 있음(지금 1·2반) → 생성한 콘텐츠를 **그 커리큘럼 쓰는 모든 반**의 그 날짜 기록에 넣는다.

## 3. 루틴이 매일 하는 일 (알고리즘)

> ⚠️ **2026-06-24 변경 — 회차 날짜·상태가 커리큘럼에서 빠졌다.** 커리큘럼은 이제 순수 템플릿(주제·상세·순서)이라 `session.plannedDate`/`session.status`가 **없다**. 회차 날짜·진행상태는 **반별**(`classrooms/{id}.sessionStates[sessionId] = {date, status}`)에만 있다. 아래 알고리즘에서 날짜·상태는 커리큘럼이 아니라 **각 반 문서**(`get_resource(classrooms, <classroomId>)`의 `sessionStates`)에서 읽어야 한다. 루틴을 실제 구현·등록하기 전에 이 절(및 §6 프롬프트)의 `session.plannedDate`·`session.status` 참조를 반별 `sessionStates[sessionId].date/.status`로 바꿀 것.

매일 새벽 1회:
1. `get_overview` → 커리큘럼/교실 파악. 대상 = `curriculumId`가 연결된 활성 교실의 커리큘럼(현재 `3u4YLYCstBfvW4sz5occ`).
2. `get_resource(curriculums, <id>)`로 `sessions` 조회 → **"아직 콘텐츠 없는, plannedDate가 오늘 이후로 가장 가까운 회차 1개"** 선택:
   - `status`가 done/skipped면 제외.
   - "콘텐츠 없음" 판정: 그 회차 `plannedDate`에 대해, 그 커리큘럼 쓰는 각 반의 날짜기록(`list_resource classroomDateRecords`, date 필터)에 **`[AI초안]` 콘텐츠가 아직 없으면** "없음". 이미 있으면 그 회차는 건너뛰고 **다음 빈 회차**로(매일 하나씩 앞으로).
3. 그 회차 `details` 파싱(총 N시수 + 시수별 제목/모듈/주요활동/결과물). **시수마다**:
   - [`practice-recipe.md`](./practice-recipe.md)대로 자체완결 인터랙티브 HTML 생성(~20분, 9~24세 외국인 학습자, 활동→아키타입 매핑, 외부 리소스 0, 마우스+터치, 결과물 인쇄).
   - `create_practice_content(title="[AI초안] {회차order}회차 {시수번호}시수 {시수제목}", description, categoryName, html)` → 반환 `id` 보관.
4. 그 커리큘럼 쓰는 **각 반**에 대해: 기존 날짜기록을 먼저 읽고 `upsert_lesson_record(classroomId, date=session.plannedDate, contentIds=기존∪새id들, curriculumSessionId=session.id)`. **합집합**으로 넣어 기존 것 보존.
5. (선택) `mutate_curriculum_sessions`로 그 회차 plan `contentIds`도 동기화.
6. **공개 금지**(`publishedLessons` 안 건드림). 만든 것만 로그로 남기고 종료(알림 없음).

중복 방지: 이미 `[AI초안]`이 있으면 만들지 말고 다음 빈 회차로. 한 번 실행 = **1회차(그 회차의 모든 시수)만**.

## 4. 등록 절차 (집 Claude Code에서)

1. `git pull`로 최신 받기(이 문서 + practice-recipe.md 포함).
2. **class MCP 연결 확인**(아래 [5] 필수) → `get_overview`가 호출되는지 먼저 테스트.
3. `schedule` 스킬(또는 `/schedule`)로 **새 예약 클라우드 루틴** 생성:
   - 주기: **매일 새벽**(예: 매일 04:00 KST). cron 예: `0 4 * * *`.
   - 프롬프트: 아래 [6]의 지시문을 그대로 사용.
4. **첫 실행 검증(권장)**: 등록 직후 수동으로 1회 실행(또는 dry-run) → **2회차(6/29)** 의 두 시수가 `[AI초안]`으로 생성되고 1·2반 6/29 날짜기록에 들어갔는지, **학생엔 비공개**인지 앱에서 확인.

## 5. ⚠️ 가장 중요한 설정 — 클라우드 루틴의 class 접속

루틴은 클라우드에서 실행되므로 **로컬 `.env`/Firebase 자격증명을 못 쓴다.** class 접속은 **배포된 MCP + `ADMIN_API_KEY`** 로만:

- **방법 A (권장)**: 루틴 환경에 **class MCP 서버**를 등록한다. URL: `https://class.damuna.org/mcp?key=<ADMIN_API_KEY>` (헤더 못 넣는 경우 `?key=` 쿼리 지원). → 이 세션에서 쓰는 `get_overview / list_resource / get_resource / create_practice_content / upsert_lesson_record / mutate_curriculum_sessions` 와 동일한 도구를 루틴도 쓰게 됨.
- **방법 B**: 루틴 프롬프트가 REST(`https://class.damuna.org/api/gpt/...`)를 `Authorization: Bearer <ADMIN_API_KEY>` 로 호출.
- `ADMIN_API_KEY`는 **팀 공유 비밀**(이 키로 class DB 쓰기 가능). 루틴 설정의 시크릿/헤더에 넣고 **프롬프트·로그에 노출 금지.**
- 집에서 할 일: 그 Claude Code 환경에 class MCP가 연결돼 있는지 확인(`claude mcp` 설정). 안 돼 있으면 위 URL+키로 추가.

## 6. 루틴 지시문 (schedule 프롬프트 — 복붙용)

```
[다사랑 실습 자동생성 루틴 — 매일 새벽 1회]
너는 class.damuna.org 수업관리 앱의 "실습 자료"를 매일 하나씩 자동 생성하는 루틴이다.
class 접속은 오직 배포된 MCP(또는 REST) + ADMIN_API_KEY로만 한다(로컬 자격증명 금지). 절대 학생에게 공개하지 않는다.

레시피는 레포의 docs/lesson-automation/practice-recipe.md를 따른다(없으면 git pull). 대상 학습자: 9~24세 외국인(이주민) 학생, 한국어 학습 중. 실습 1개 = 약 20분 분량.

매 실행:
1) get_overview로 커리큘럼/교실 파악. curriculumId가 연결된 활성 교실의 커리큘럼을 대상으로 한다(현재 3u4YLYCstBfvW4sz5occ).
2) get_resource(curriculums, <id>)로 sessions 조회. status가 done/skipped가 아니고 plannedDate가 오늘 이후인 회차 중에서, "아직 [AI초안] 콘텐츠가 없는, plannedDate가 가장 가까운 회차" 1개만 고른다.
   - 판정: list_resource(classroomDateRecords, date=plannedDate)로 그 커리큘럼 쓰는 각 반의 날짜기록을 보고, [AI초안] 콘텐츠가 이미 있으면 그 회차는 건너뛴다(다음 빈 회차로). 하루 1회차만.
3) 그 회차 details(총 N시수 + 시수별 제목/모듈/주요활동/결과물)를 파싱. 시수마다 practice-recipe.md대로 자체완결 인터랙티브 HTML을 만든다(~20분, 활동→아키타입 매핑, 외부 리소스 0, 마우스+터치 모두, 결과물은 화면+인쇄). 사실 자료가 필요한 칸은 지어내지 말고 학습자가 채우게 하거나 보편 사실만.
4) 시수마다 create_practice_content(title="[AI초안] {회차order}회차 {시수번호}시수 {시수제목}", description=한 줄, categoryName=모듈에 맞게(기본 "기초", AI 모듈은 "AI"), html=생성물). 반환 id를 모은다.
5) 그 커리큘럼 쓰는 각 반에 대해, 기존 날짜기록을 먼저 읽고 upsert_lesson_record(classroomId, date=session.plannedDate, contentIds=기존contentIds와 이번에 만든 id들의 합집합, curriculumSessionId=session.id)로 그 날짜기록에 넣는다. 기존 것을 지우지 않는다.
6) publishedLessons는 절대 건드리지 않는다(공개 금지). 무엇을 어느 회차/반에 만들었는지 짧게 로그로 남기고 종료. 별도 알림 없음.

중복 생성 금지: 이미 [AI초안]이 있으면 만들지 않는다. 한 번 실행에 1회차(그 회차 모든 시수)만 처리한다.
```

## 7. 키·ID 레퍼런스

- 커리큘럼: `3u4YLYCstBfvW4sz5occ` (디지털.AI 문해교육, 20회차 40시수, 매주 월요일·6/22~)
- 교실: 1반 `4tknVbr8lhqheEPwRv16`, 2반 `6RLxT5jMm66Tw0jNUi8k` (둘 다 위 커리큘럼 공유)
- 카테고리(categoryName으로 지정 가능): 기초 / WorkSpace / 앱스 / 학생 자료 / AI
- 이미 만든 1회차 콘텐츠: 1시수 약속카드 `L4l6m6QqJpKPBuIvItTt`, 2시수 마우스미션 `Xpz8nAD197bO4vl1dqwR` (참고용; 2회차부터 자동 생성 대상)
- MCP 도구: `get_overview`, `list_resource`, `get_resource`, `create_practice_content`, `upsert_lesson_record`, `mutate_curriculum_sessions`

## 8. 결정해야 할 것 (집에서 정하면 됨)

- 새벽 정확한 시각(예 04:00 KST).
- 며칠 앞까지 만들지: 현재 합의 = **하루 1회차씩, 가장 가까운 빈 회차부터**(이미 차면 다음 빈 회차). 그대로 가면 됨.
- 실패 시 재시도/알림 정책(현재 = 알림 없음, 앱에서 검수).

## 9. 참고 파일

- [`practice-recipe.md`](./practice-recipe.md) — 실습 생성 레시피(필수).
- [`HANDOFF.md`](./HANDOFF.md) — 파이프라인 전체 컨텍스트.
- [`sample-practice-mouse-mission.html`](./sample-practice-mouse-mission.html), [`sample-practice-promise-card.html`](./sample-practice-promise-card.html) — 품질 기준선(A·C·D 아키타입 예시).
