# dasarang-class

다사랑 수업 허브를 Astro로 운영하는 프로젝트입니다. Cloudflare Pages 배포를 기준으로 전체 사이트 비밀번호 잠금, 수업별 메모, 수업 슬라이드 뷰어를 함께 관리합니다.

## 주요 구조

- 전체 사이트는 서버측 비밀번호 확인 후에만 열립니다.
- 수업 일정은 `src/data/schedule.ts`에서 관리합니다.
- 수업별 메모는 `src/content/classNotes` 아래 Markdown 파일로 관리합니다.
- 수업 슬라이드는 각 수업 폴더의 `slides/*.html`을 읽어서 상세 페이지에서 합쳐 보여줍니다.
- Git 기반 CMS는 `Pages CMS`를 기준으로 `/.pages.yml`을 포함합니다.

## 로컬 실행

1. `npm install`
2. `.dev.vars.example`을 복사해서 `.dev.vars`를 만듭니다.
3. `.dev.vars`에 아래 값을 넣습니다.
4. `npm run dev`

```env
SITE_PASSWORD=your-password-here
SITE_URL=http://localhost
SITE_BASE_PATH=/
```

## Cloudflare Pages 배포

1. GitHub 저장소를 Cloudflare Pages에 연결합니다.
2. Build command는 `npm run build`
3. Output directory는 `dist`
4. Cloudflare 환경 변수 또는 시크릿에 아래 값을 넣습니다.

```env
SITE_PASSWORD=your-password-here
SITE_URL=https://your-project.pages.dev
SITE_BASE_PATH=/
```

`SITE_PASSWORD`는 저장소에 커밋하지 말고 Cloudflare Secret으로 넣어야 합니다.

## 메모 수정

- 파일 직접 수정: `src/content/classNotes`
- CMS로 수정: [Pages CMS](https://pagescms.org/)에서 저장소 연결
- 파일명은 수업 slug와 동일하게 유지합니다.
