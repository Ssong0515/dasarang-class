const slideManifest = {
  "260314": {
    "lessonFolder": "260314_첫수업",
    "slidesDir": "C:/dev/dasarang-class/260314_첫수업/slides",
    "slides": [
      {
        "fileName": "01_first_slide_only.html",
        "order": 1,
        "title": "컴퓨터 수업 - 1페이지",
        "helpLabel": "",
        "html": "<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>컴퓨터 수업 - 1페이지</title>\n  <style>\n    * { box-sizing: border-box; }\n    body {\n      margin: 0;\n      font-family: Arial, Helvetica, sans-serif;\n      background: linear-gradient(180deg, #0f172a 0%, #111827 100%);\n      color: #fff;\n      overflow: hidden;\n    }\n    \n    \n    .slide {\n      width: 100vw;\n      height: 100vh;\n      position: relative;\n      background-image: url('https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1800&q=80');\n      background-size: cover;\n      background-position: center;\n      background-repeat: no-repeat;\n      overflow: hidden;\n    }\n    .overlay {\n      position: absolute;\n      inset: 0;\n      background: linear-gradient(180deg, rgba(15,23,42,.35), rgba(15,23,42,.72));\n    }\n    .content {\n      position: relative;\n      z-index: 2;\n      width: 100%;\n      min-height: 100%;\n      display: flex;\n      flex-direction: column;\n      justify-content: center;\n      align-items: center;\n      text-align: center;\n      gap: 18px;\n      padding: 32px 40px 92px;\n    }\n    .hero-icon {\n      font-size: 92px;\n      line-height: 1;\n      filter: drop-shadow(0 8px 18px rgba(0,0,0,.3));\n    }\n    .title {\n      font-size: clamp(40px, 6vw, 76px);\n      font-weight: 800;\n      line-height: 1.1;\n      margin: 0;\n      text-shadow: 0 10px 30px rgba(0,0,0,.3);\n    }\n    .subtitle {\n      font-size: clamp(22px, 2.4vw, 34px);\n      line-height: 1.45;\n      margin: 0;\n      max-width: 1100px;\n      text-shadow: 0 6px 20px rgba(0,0,0,.28);\n    }\n    .subtitle-small{\n      font-size:16px;\n      opacity:0.9;\n      margin-top:4px;\n    }\n    .chip-row {\n      display: flex;\n      flex-wrap: wrap;\n      gap: 14px;\n      justify-content: center;\n      margin-top: 8px;\n    }\n    .chip {\n      background: rgba(255,255,255,.12);\n      border: 1px solid rgba(255,255,255,.14);\n      border-radius: 999px;\n      padding: 12px 18px;\n      font-size: 22px;\n      font-weight: 700;\n      backdrop-filter: blur(8px);\n    }\n    @media (max-width: 1100px) {\n      .content { padding: 24px 20px 92px; }\n    }\n  </style>\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\n<body>\n  <section class=\"slide\">\n    <div class=\"overlay\"></div>\n    <div class=\"content\">\n      <div class=\"hero-icon\">👨‍💻</div>\n      <h1 class=\"title\">컴퓨터 수업</h1>\n      <div>\n      <p class=\"subtitle\">보고 따라하고, 손으로 직접 해보는 수업입니다</p>\n      <div class=\"subtitle-small\">Learn by watching and following</div>\n      <div class=\"subtitle-small\">Учимся, смотря и повторяя</div>\n      </div>\n      <div class=\"chip-row\">\n        <div class=\"chip\">컴퓨터<br><span style=\"font-size:12px;opacity:.8\">Computer / Компьютер</span></div>\n        <div class=\"chip\">마우스<br><span style=\"font-size:12px;opacity:.8\">Mouse / Мышь</span></div>\n        <div class=\"chip\">키보드<br><span style=\"font-size:12px;opacity:.8\">Keyboard / Клавиатура</span></div>\n        <div class=\"chip\">타이핑<br><span style=\"font-size:12px;opacity:.8\">Typing / Печать</span></div>\n      </div>\n    </div>\n  </section>\n</body>\n</html>\n"
      },
      {
        "fileName": "02_teacher.html",
        "order": 2,
        "title": "컴퓨터 수업 - 2페이지",
        "helpLabel": "",
        "html": "<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>컴퓨터 수업 - 2페이지</title>\n  <style>\n    *{box-sizing:border-box}\n    html,body{height:100%}\n    body{\n      margin:0;\n      font-family:Arial,Helvetica,sans-serif;\n      background:#0f172a;\n      color:#fff;\n      overflow:hidden;\n    }\n    .slide{\n      width:100vw;\n      height:100svh;\n      min-height:100vh;\n      position:relative;\n      background-image:url('https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1800&q=80');\n      background-size:cover;\n      background-position:center;\n      background-repeat:no-repeat;\n      overflow:hidden;\n      padding:32px;\n      display:flex;\n      align-items:center;\n      justify-content:center;\n    }\n    .overlay{\n      position:absolute;\n      inset:0;\n      background:linear-gradient(180deg,rgba(15,23,42,.45),rgba(15,23,42,.82));\n    }\n    .frame{\n      position:relative;\n      z-index:2;\n      width:min(1080px,100%);\n      background:rgba(15,23,42,.54);\n      border:1px solid rgba(255,255,255,.14);\n      border-radius:28px;\n      backdrop-filter:blur(12px);\n      box-shadow:0 24px 60px rgba(0,0,0,.28);\n      padding:28px;\n    }\n    .header{\n      text-align:center;\n      margin-bottom:22px;\n    }\n    .hero-icon{\n      font-size:52px;\n      line-height:1;\n      margin-bottom:12px;\n    }\n    .title{\n      margin:0;\n      font-size:clamp(30px,4vw,48px);\n      font-weight:800;\n      line-height:1.1;\n    }\n    .subtitle-wrap{\n      margin-top:10px;\n    }\n    .subtitle{\n      font-size:clamp(17px,1.7vw,22px);\n      line-height:1.35;\n      margin:0;\n    }\n    .subtitle-small{\n      font-size:13px;\n      line-height:1.35;\n      opacity:.88;\n      margin-top:3px;\n    }\n    .grid{\n      display:grid;\n      grid-template-columns:repeat(2,minmax(0,1fr));\n      gap:18px;\n      align-items:stretch;\n    }\n    .card{\n      background:rgba(255,255,255,.08);\n      border:1px solid rgba(255,255,255,.14);\n      border-radius:22px;\n      overflow:hidden;\n      display:flex;\n      flex-direction:column;\n      min-width:0;\n    }\n    .card img{\n      width:100%;\n      height:180px;\n      object-fit:cover;\n      display:block;\n    }\n    .card-body{\n      padding:14px 16px 16px;\n      display:flex;\n      flex-direction:column;\n      gap:6px;\n      flex:1;\n    }\n    .card-title{\n      margin:0;\n      font-size:22px;\n      font-weight:800;\n      line-height:1.2;\n    }\n    .card-text{\n      margin:0;\n      font-size:16px;\n      line-height:1.4;\n      opacity:.98;\n    }\n    .trans{\n      margin-top:auto;\n      font-size:12px;\n      line-height:1.35;\n      opacity:.82;\n    }\n    @media (max-width:900px){\n      .slide{padding:20px;}\n      .frame{padding:20px;}\n      .card img{height:150px;}\n    }\n    @media (max-width:640px){\n      .slide{padding:14px;}\n      .frame{padding:16px;border-radius:20px;}\n      .grid{gap:12px;}\n      .card img{height:110px;}\n      .hero-icon{font-size:42px;margin-bottom:8px;}\n      .title{font-size:28px;}\n      .subtitle{font-size:15px;}\n      .subtitle-small{font-size:11px;}\n      .card-title{font-size:17px;}\n      .card-text{font-size:13px;}\n      .trans{font-size:10px;}\n    }\n  </style>\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\n<body>\n  <section class=\"slide\">\n    <div class=\"overlay\"></div>\n\n    <div class=\"frame\">\n      <div class=\"header\">\n        <div class=\"hero-icon\">🙋‍♂️</div>\n        <h1 class=\"title\">선생님 소개</h1>\n        <div class=\"subtitle-wrap\">\n          <p class=\"subtitle\">앞으로 함께 컴퓨터 수업을 진행합니다</p>\n          <div class=\"subtitle-small\">We will learn computer together</div>\n          <div class=\"subtitle-small\">Мы будем изучать компьютер вместе</div>\n        </div>\n      </div>\n\n      <div class=\"grid\">\n        <div class=\"card\">\n          <img src=\"https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80\" alt=\"설명하는 모습\" />\n          <div class=\"card-body\">\n            <p class=\"card-title\">설명</p>\n            <p class=\"card-text\">화면을 보면서 천천히 설명합니다</p>\n            <div class=\"trans\">Explain step by step / Объяснение</div>\n          </div>\n        </div>\n\n        <div class=\"card\">\n          <img src=\"https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80\" alt=\"함께 연습하는 모습\" />\n          <div class=\"card-body\">\n            <p class=\"card-title\">연습</p>\n            <p class=\"card-text\">보고 따라하면서 같이 연습합니다</p>\n            <div class=\"trans\">Practice together / Практика</div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </section>\n</body>\n</html>"
      },
      {
        "fileName": "03_today.html",
        "order": 3,
        "title": "컴퓨터 수업 - 3페이지",
        "helpLabel": "",
        "html": "<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>컴퓨터 수업 - 3페이지</title>\n  <style>\n    *{box-sizing:border-box}\n    html,body{height:100%}\n    body{\n      margin:0;\n      font-family:Arial,Helvetica,sans-serif;\n      background:#0f172a;\n      color:#fff;\n      overflow:hidden;\n    }\n    .slide{\n      width:100vw;\n      height:100svh;\n      min-height:100vh;\n      position:relative;\n      background-image:url('https://images.unsplash.com/photo-1496171367470-9ed9a91ea931?auto=format&fit=crop&w=1800&q=80');\n      background-size:cover;\n      background-position:center;\n      background-repeat:no-repeat;\n      overflow:hidden;\n      padding:16px 40px;\n      display:flex;\n      align-items:center;\n      justify-content:center;\n    }\n    .overlay{\n      position:absolute;\n      inset:0;\n      background:linear-gradient(180deg,rgba(15,23,42,.48),rgba(15,23,42,.84));\n    }\n    .frame{\n      position:relative;\n      z-index:2;\n      width:min(1080px,100%);\n      background:rgba(15,23,42,.56);\n      border:1px solid rgba(255,255,255,.14);\n      border-radius:28px;\n      backdrop-filter:blur(12px);\n      box-shadow:0 24px 60px rgba(0,0,0,.28);\n      padding:18px 24px;\n    }\n    .header{\n      text-align:center;\n      margin-bottom:12px;\n    }\n    .hero-icon{\n      font-size:42px;\n      line-height:1;\n      margin-bottom:6px;\n    }\n    .title{\n      margin:0;\n      font-size:clamp(28px,3.8vw,44px);\n      font-weight:800;\n      line-height:1.1;\n    }\n    .subtitle-wrap{\n      margin-top:4px;\n    }\n    .subtitle{\n      font-size:clamp(16px,1.6vw,20px);\n      line-height:1.3;\n      margin:0;\n    }\n    .subtitle-small{\n      font-size:12px;\n      line-height:1.25;\n      opacity:.88;\n      margin-top:2px;\n    }\n    .grid{\n      display:grid;\n      grid-template-columns:repeat(3,minmax(0,1fr));\n      gap:14px;\n      align-items:stretch;\n      padding:0 4px;\n    }\n    .card{\n      background:rgba(255,255,255,.08);\n      border:1px solid rgba(255,255,255,.14);\n      border-radius:22px;\n      overflow:hidden;\n      display:flex;\n      flex-direction:column;\n      min-width:0;\n    }\n    .card img{\n      width:100%;\n      height:150px;\n      object-fit:cover;\n      display:block;\n    }\n    .card-body{\n      padding:12px 14px 14px;\n      display:flex;\n      flex-direction:column;\n      gap:5px;\n      flex:1;\n    }\n    .card-step{\n      display:inline-flex;\n      align-items:center;\n      justify-content:center;\n      width:30px;\n      height:30px;\n      border-radius:50%;\n      background:#fff;\n      color:#111827;\n      font-size:14px;\n      font-weight:900;\n      margin-bottom:2px;\n    }\n    .card-title{\n      margin:0;\n      font-size:20px;\n      font-weight:800;\n      line-height:1.15;\n    }\n    .card-text{\n      margin:0;\n      font-size:14px;\n      line-height:1.3;\n      opacity:.98;\n    }\n    .trans{\n      margin-top:auto;\n      font-size:11px;\n      line-height:1.25;\n      opacity:.82;\n    }\n    @media (max-width:900px){\n      .slide{padding:14px 26px;}\n      .frame{padding:16px 22px;}\n      .header{margin-bottom:12px;}\n      .grid{gap:12px;}\n      .card img{height:132px;}\n      .card-title{font-size:18px;}\n      .card-text{font-size:13px;}\n    }\n    @media (max-width:640px){\n      .slide{padding:14px;}\n      .frame{padding:16px;border-radius:20px;}\n      .grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}\n      .card img{height:90px;}\n      .hero-icon{font-size:42px;margin-bottom:8px;}\n      .title{font-size:28px;}\n      .subtitle{font-size:15px;}\n      .subtitle-small{font-size:11px;}\n      .card-body{padding:10px 10px 12px;}\n      .card-step{width:28px;height:28px;font-size:13px;}\n      .card-title{font-size:15px;}\n      .card-text{font-size:12px;line-height:1.3;}\n      .trans{font-size:10px;line-height:1.25;}\n    }\n  </style>\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\n<body>\n  <section class=\"slide\">\n    <div class=\"overlay\"></div>\n\n    <div class=\"frame\">\n      <div class=\"header\">\n        <div class=\"hero-icon\">📚</div>\n        <h1 class=\"title\">오늘 할 것</h1>\n        <div class=\"subtitle-wrap\">\n          <p class=\"subtitle\">오늘 수업에서 배우는 핵심 내용입니다</p>\n          <div class=\"subtitle-small\">What we do today</div>\n          <div class=\"subtitle-small\">Что будем делать сегодня</div>\n        </div>\n      </div>\n\n      <div class=\"grid\">\n        <div class=\"card\">\n          <img src=\"https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=1200&q=80\" alt=\"컴퓨터 장치 배우기\" />\n          <div class=\"card-body\">\n            <div class=\"card-step\">1</div>\n            <p class=\"card-title\">이름 알기</p>\n            <p class=\"card-text\">모니터, 키보드, 마우스 이름을 정확히 배웁니다</p>\n            <div class=\"trans\">Learn device names / Названия устройств</div>\n          </div>\n        </div>\n\n        <div class=\"card\">\n          <img src=\"https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=80\" alt=\"타이핑 연습\" />\n          <div class=\"card-body\">\n            <div class=\"card-step\">2</div>\n            <p class=\"card-title\">타이핑</p>\n            <p class=\"card-text\">손가락으로 글자와 숫자를 입력하는 연습을 합니다</p>\n            <div class=\"trans\">Typing practice / Печатание</div>\n          </div>\n        </div>\n\n        <div class=\"card\">\n          <img src=\"https://images.unsplash.com/photo-1516321165247-4aa89a48be28?auto=format&fit=crop&w=1200&q=80\" alt=\"직접 연습\" />\n          <div class=\"card-body\">\n            <div class=\"card-step\">3</div>\n            <p class=\"card-title\">직접 연습</p>\n            <p class=\"card-text\">사이트에서 직접 눌러 보고 따라 하면서 익힙니다</p>\n            <div class=\"trans\">Practice on website / Практика на сайте</div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </section>\n</body>\n</html>\n"
      },
      {
        "fileName": "04_examples.html",
        "order": 4,
        "title": "컴퓨터로 할 수 있는 것",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>컴퓨터로 할 수 있는 것</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">4 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>컴퓨터로 할 수 있는 것</h1><p>검색 · 번역 · 길찾기 · 쇼핑</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "05_life.html",
        "order": 5,
        "title": "생활 도구",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>생활 도구</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">5 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>컴퓨터는 생활 도구</h1><p>한국 생활에 필요한 정보를 찾습니다</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "06_input.html",
        "order": 6,
        "title": "입력 도구",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>입력 도구</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">6 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>입력 도구</h1><p>마우스와 키보드를 사용합니다</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "07_typing.html",
        "order": 7,
        "title": "타이핑",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>타이핑</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">7 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>가장 중요한 기술</h1><p>타이핑 연습</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "08_devices.html",
        "order": 8,
        "title": "컴퓨터 장치",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>컴퓨터 장치</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">8 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>컴퓨터 장치</h1><p>모니터 · 키보드 · 마우스</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "09_power_on.html",
        "order": 9,
        "title": "컴퓨터 켜기",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>컴퓨터 켜기</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">9 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>컴퓨터 켜기</h1><p>전원 버튼을 누릅니다</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "10_typing_site.html",
        "order": 10,
        "title": "타자 연습",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>타자 연습</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">10 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>타자 연습</h1><p>tt.hancomtaja.com</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "11_typing_order.html",
        "order": 11,
        "title": "타자 순서",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>타자 순서</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">11 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>타자 연습 순서</h1><p>자리 → 기본 → 전체 → 숫자</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "12_rule.html",
        "order": 12,
        "title": "수업 규칙",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>수업 규칙</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">12 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>수업 규칙</h1><p>매 수업 시작은 타자 연습</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "13_power_off.html",
        "order": 13,
        "title": "컴퓨터 끄기",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>컴퓨터 끄기</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">13 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>컴퓨터 끄기</h1><p>시작 → 전원 → 종료</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "14_cleanup.html",
        "order": 14,
        "title": "자리 정리",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>자리 정리</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">14 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>자리 정리</h1><p>마우스 정리 · 노트북 닫기</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      }
    ]
  },
  "260321": {
    "lessonFolder": "260321_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260328": {
    "lessonFolder": "260328_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260404": {
    "lessonFolder": "260404_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260411": {
    "lessonFolder": "260411_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260418": {
    "lessonFolder": "260418_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260425": {
    "lessonFolder": "260425_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260502": {
    "lessonFolder": "260502_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260509": {
    "lessonFolder": "260509_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260516": {
    "lessonFolder": "260516_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260523": {
    "lessonFolder": "260523_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260530": {
    "lessonFolder": "260530_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260613": {
    "lessonFolder": "260613_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260620": {
    "lessonFolder": "260620_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260627": {
    "lessonFolder": "260627_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260704": {
    "lessonFolder": "260704_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260707": {
    "lessonFolder": "260707_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260709": {
    "lessonFolder": "260709_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260711": {
    "lessonFolder": "260711_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260714": {
    "lessonFolder": "260714_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260716": {
    "lessonFolder": "260716_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260718": {
    "lessonFolder": "260718_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260721": {
    "lessonFolder": "260721_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260723": {
    "lessonFolder": "260723_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260725": {
    "lessonFolder": "260725_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260314_첫수업": {
    "lessonFolder": "260314_첫수업",
    "slidesDir": "C:/dev/dasarang-class/260314_첫수업/slides",
    "slides": [
      {
        "fileName": "01_first_slide_only.html",
        "order": 1,
        "title": "컴퓨터 수업 - 1페이지",
        "helpLabel": "",
        "html": "<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>컴퓨터 수업 - 1페이지</title>\n  <style>\n    * { box-sizing: border-box; }\n    body {\n      margin: 0;\n      font-family: Arial, Helvetica, sans-serif;\n      background: linear-gradient(180deg, #0f172a 0%, #111827 100%);\n      color: #fff;\n      overflow: hidden;\n    }\n    \n    \n    .slide {\n      width: 100vw;\n      height: 100vh;\n      position: relative;\n      background-image: url('https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1800&q=80');\n      background-size: cover;\n      background-position: center;\n      background-repeat: no-repeat;\n      overflow: hidden;\n    }\n    .overlay {\n      position: absolute;\n      inset: 0;\n      background: linear-gradient(180deg, rgba(15,23,42,.35), rgba(15,23,42,.72));\n    }\n    .content {\n      position: relative;\n      z-index: 2;\n      width: 100%;\n      min-height: 100%;\n      display: flex;\n      flex-direction: column;\n      justify-content: center;\n      align-items: center;\n      text-align: center;\n      gap: 18px;\n      padding: 32px 40px 92px;\n    }\n    .hero-icon {\n      font-size: 92px;\n      line-height: 1;\n      filter: drop-shadow(0 8px 18px rgba(0,0,0,.3));\n    }\n    .title {\n      font-size: clamp(40px, 6vw, 76px);\n      font-weight: 800;\n      line-height: 1.1;\n      margin: 0;\n      text-shadow: 0 10px 30px rgba(0,0,0,.3);\n    }\n    .subtitle {\n      font-size: clamp(22px, 2.4vw, 34px);\n      line-height: 1.45;\n      margin: 0;\n      max-width: 1100px;\n      text-shadow: 0 6px 20px rgba(0,0,0,.28);\n    }\n    .subtitle-small{\n      font-size:16px;\n      opacity:0.9;\n      margin-top:4px;\n    }\n    .chip-row {\n      display: flex;\n      flex-wrap: wrap;\n      gap: 14px;\n      justify-content: center;\n      margin-top: 8px;\n    }\n    .chip {\n      background: rgba(255,255,255,.12);\n      border: 1px solid rgba(255,255,255,.14);\n      border-radius: 999px;\n      padding: 12px 18px;\n      font-size: 22px;\n      font-weight: 700;\n      backdrop-filter: blur(8px);\n    }\n    @media (max-width: 1100px) {\n      .content { padding: 24px 20px 92px; }\n    }\n  </style>\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\n<body>\n  <section class=\"slide\">\n    <div class=\"overlay\"></div>\n    <div class=\"content\">\n      <div class=\"hero-icon\">👨‍💻</div>\n      <h1 class=\"title\">컴퓨터 수업</h1>\n      <div>\n      <p class=\"subtitle\">보고 따라하고, 손으로 직접 해보는 수업입니다</p>\n      <div class=\"subtitle-small\">Learn by watching and following</div>\n      <div class=\"subtitle-small\">Учимся, смотря и повторяя</div>\n      </div>\n      <div class=\"chip-row\">\n        <div class=\"chip\">컴퓨터<br><span style=\"font-size:12px;opacity:.8\">Computer / Компьютер</span></div>\n        <div class=\"chip\">마우스<br><span style=\"font-size:12px;opacity:.8\">Mouse / Мышь</span></div>\n        <div class=\"chip\">키보드<br><span style=\"font-size:12px;opacity:.8\">Keyboard / Клавиатура</span></div>\n        <div class=\"chip\">타이핑<br><span style=\"font-size:12px;opacity:.8\">Typing / Печать</span></div>\n      </div>\n    </div>\n  </section>\n</body>\n</html>\n"
      },
      {
        "fileName": "02_teacher.html",
        "order": 2,
        "title": "컴퓨터 수업 - 2페이지",
        "helpLabel": "",
        "html": "<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>컴퓨터 수업 - 2페이지</title>\n  <style>\n    *{box-sizing:border-box}\n    html,body{height:100%}\n    body{\n      margin:0;\n      font-family:Arial,Helvetica,sans-serif;\n      background:#0f172a;\n      color:#fff;\n      overflow:hidden;\n    }\n    .slide{\n      width:100vw;\n      height:100svh;\n      min-height:100vh;\n      position:relative;\n      background-image:url('https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1800&q=80');\n      background-size:cover;\n      background-position:center;\n      background-repeat:no-repeat;\n      overflow:hidden;\n      padding:32px;\n      display:flex;\n      align-items:center;\n      justify-content:center;\n    }\n    .overlay{\n      position:absolute;\n      inset:0;\n      background:linear-gradient(180deg,rgba(15,23,42,.45),rgba(15,23,42,.82));\n    }\n    .frame{\n      position:relative;\n      z-index:2;\n      width:min(1080px,100%);\n      background:rgba(15,23,42,.54);\n      border:1px solid rgba(255,255,255,.14);\n      border-radius:28px;\n      backdrop-filter:blur(12px);\n      box-shadow:0 24px 60px rgba(0,0,0,.28);\n      padding:28px;\n    }\n    .header{\n      text-align:center;\n      margin-bottom:22px;\n    }\n    .hero-icon{\n      font-size:52px;\n      line-height:1;\n      margin-bottom:12px;\n    }\n    .title{\n      margin:0;\n      font-size:clamp(30px,4vw,48px);\n      font-weight:800;\n      line-height:1.1;\n    }\n    .subtitle-wrap{\n      margin-top:10px;\n    }\n    .subtitle{\n      font-size:clamp(17px,1.7vw,22px);\n      line-height:1.35;\n      margin:0;\n    }\n    .subtitle-small{\n      font-size:13px;\n      line-height:1.35;\n      opacity:.88;\n      margin-top:3px;\n    }\n    .grid{\n      display:grid;\n      grid-template-columns:repeat(2,minmax(0,1fr));\n      gap:18px;\n      align-items:stretch;\n    }\n    .card{\n      background:rgba(255,255,255,.08);\n      border:1px solid rgba(255,255,255,.14);\n      border-radius:22px;\n      overflow:hidden;\n      display:flex;\n      flex-direction:column;\n      min-width:0;\n    }\n    .card img{\n      width:100%;\n      height:180px;\n      object-fit:cover;\n      display:block;\n    }\n    .card-body{\n      padding:14px 16px 16px;\n      display:flex;\n      flex-direction:column;\n      gap:6px;\n      flex:1;\n    }\n    .card-title{\n      margin:0;\n      font-size:22px;\n      font-weight:800;\n      line-height:1.2;\n    }\n    .card-text{\n      margin:0;\n      font-size:16px;\n      line-height:1.4;\n      opacity:.98;\n    }\n    .trans{\n      margin-top:auto;\n      font-size:12px;\n      line-height:1.35;\n      opacity:.82;\n    }\n    @media (max-width:900px){\n      .slide{padding:20px;}\n      .frame{padding:20px;}\n      .card img{height:150px;}\n    }\n    @media (max-width:640px){\n      .slide{padding:14px;}\n      .frame{padding:16px;border-radius:20px;}\n      .grid{gap:12px;}\n      .card img{height:110px;}\n      .hero-icon{font-size:42px;margin-bottom:8px;}\n      .title{font-size:28px;}\n      .subtitle{font-size:15px;}\n      .subtitle-small{font-size:11px;}\n      .card-title{font-size:17px;}\n      .card-text{font-size:13px;}\n      .trans{font-size:10px;}\n    }\n  </style>\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\n<body>\n  <section class=\"slide\">\n    <div class=\"overlay\"></div>\n\n    <div class=\"frame\">\n      <div class=\"header\">\n        <div class=\"hero-icon\">🙋‍♂️</div>\n        <h1 class=\"title\">선생님 소개</h1>\n        <div class=\"subtitle-wrap\">\n          <p class=\"subtitle\">앞으로 함께 컴퓨터 수업을 진행합니다</p>\n          <div class=\"subtitle-small\">We will learn computer together</div>\n          <div class=\"subtitle-small\">Мы будем изучать компьютер вместе</div>\n        </div>\n      </div>\n\n      <div class=\"grid\">\n        <div class=\"card\">\n          <img src=\"https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80\" alt=\"설명하는 모습\" />\n          <div class=\"card-body\">\n            <p class=\"card-title\">설명</p>\n            <p class=\"card-text\">화면을 보면서 천천히 설명합니다</p>\n            <div class=\"trans\">Explain step by step / Объяснение</div>\n          </div>\n        </div>\n\n        <div class=\"card\">\n          <img src=\"https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80\" alt=\"함께 연습하는 모습\" />\n          <div class=\"card-body\">\n            <p class=\"card-title\">연습</p>\n            <p class=\"card-text\">보고 따라하면서 같이 연습합니다</p>\n            <div class=\"trans\">Practice together / Практика</div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </section>\n</body>\n</html>"
      },
      {
        "fileName": "03_today.html",
        "order": 3,
        "title": "컴퓨터 수업 - 3페이지",
        "helpLabel": "",
        "html": "<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>컴퓨터 수업 - 3페이지</title>\n  <style>\n    *{box-sizing:border-box}\n    html,body{height:100%}\n    body{\n      margin:0;\n      font-family:Arial,Helvetica,sans-serif;\n      background:#0f172a;\n      color:#fff;\n      overflow:hidden;\n    }\n    .slide{\n      width:100vw;\n      height:100svh;\n      min-height:100vh;\n      position:relative;\n      background-image:url('https://images.unsplash.com/photo-1496171367470-9ed9a91ea931?auto=format&fit=crop&w=1800&q=80');\n      background-size:cover;\n      background-position:center;\n      background-repeat:no-repeat;\n      overflow:hidden;\n      padding:16px 40px;\n      display:flex;\n      align-items:center;\n      justify-content:center;\n    }\n    .overlay{\n      position:absolute;\n      inset:0;\n      background:linear-gradient(180deg,rgba(15,23,42,.48),rgba(15,23,42,.84));\n    }\n    .frame{\n      position:relative;\n      z-index:2;\n      width:min(1080px,100%);\n      background:rgba(15,23,42,.56);\n      border:1px solid rgba(255,255,255,.14);\n      border-radius:28px;\n      backdrop-filter:blur(12px);\n      box-shadow:0 24px 60px rgba(0,0,0,.28);\n      padding:18px 24px;\n    }\n    .header{\n      text-align:center;\n      margin-bottom:12px;\n    }\n    .hero-icon{\n      font-size:42px;\n      line-height:1;\n      margin-bottom:6px;\n    }\n    .title{\n      margin:0;\n      font-size:clamp(28px,3.8vw,44px);\n      font-weight:800;\n      line-height:1.1;\n    }\n    .subtitle-wrap{\n      margin-top:4px;\n    }\n    .subtitle{\n      font-size:clamp(16px,1.6vw,20px);\n      line-height:1.3;\n      margin:0;\n    }\n    .subtitle-small{\n      font-size:12px;\n      line-height:1.25;\n      opacity:.88;\n      margin-top:2px;\n    }\n    .grid{\n      display:grid;\n      grid-template-columns:repeat(3,minmax(0,1fr));\n      gap:14px;\n      align-items:stretch;\n      padding:0 4px;\n    }\n    .card{\n      background:rgba(255,255,255,.08);\n      border:1px solid rgba(255,255,255,.14);\n      border-radius:22px;\n      overflow:hidden;\n      display:flex;\n      flex-direction:column;\n      min-width:0;\n    }\n    .card img{\n      width:100%;\n      height:150px;\n      object-fit:cover;\n      display:block;\n    }\n    .card-body{\n      padding:12px 14px 14px;\n      display:flex;\n      flex-direction:column;\n      gap:5px;\n      flex:1;\n    }\n    .card-step{\n      display:inline-flex;\n      align-items:center;\n      justify-content:center;\n      width:30px;\n      height:30px;\n      border-radius:50%;\n      background:#fff;\n      color:#111827;\n      font-size:14px;\n      font-weight:900;\n      margin-bottom:2px;\n    }\n    .card-title{\n      margin:0;\n      font-size:20px;\n      font-weight:800;\n      line-height:1.15;\n    }\n    .card-text{\n      margin:0;\n      font-size:14px;\n      line-height:1.3;\n      opacity:.98;\n    }\n    .trans{\n      margin-top:auto;\n      font-size:11px;\n      line-height:1.25;\n      opacity:.82;\n    }\n    @media (max-width:900px){\n      .slide{padding:14px 26px;}\n      .frame{padding:16px 22px;}\n      .header{margin-bottom:12px;}\n      .grid{gap:12px;}\n      .card img{height:132px;}\n      .card-title{font-size:18px;}\n      .card-text{font-size:13px;}\n    }\n    @media (max-width:640px){\n      .slide{padding:14px;}\n      .frame{padding:16px;border-radius:20px;}\n      .grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}\n      .card img{height:90px;}\n      .hero-icon{font-size:42px;margin-bottom:8px;}\n      .title{font-size:28px;}\n      .subtitle{font-size:15px;}\n      .subtitle-small{font-size:11px;}\n      .card-body{padding:10px 10px 12px;}\n      .card-step{width:28px;height:28px;font-size:13px;}\n      .card-title{font-size:15px;}\n      .card-text{font-size:12px;line-height:1.3;}\n      .trans{font-size:10px;line-height:1.25;}\n    }\n  </style>\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\n<body>\n  <section class=\"slide\">\n    <div class=\"overlay\"></div>\n\n    <div class=\"frame\">\n      <div class=\"header\">\n        <div class=\"hero-icon\">📚</div>\n        <h1 class=\"title\">오늘 할 것</h1>\n        <div class=\"subtitle-wrap\">\n          <p class=\"subtitle\">오늘 수업에서 배우는 핵심 내용입니다</p>\n          <div class=\"subtitle-small\">What we do today</div>\n          <div class=\"subtitle-small\">Что будем делать сегодня</div>\n        </div>\n      </div>\n\n      <div class=\"grid\">\n        <div class=\"card\">\n          <img src=\"https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=1200&q=80\" alt=\"컴퓨터 장치 배우기\" />\n          <div class=\"card-body\">\n            <div class=\"card-step\">1</div>\n            <p class=\"card-title\">이름 알기</p>\n            <p class=\"card-text\">모니터, 키보드, 마우스 이름을 정확히 배웁니다</p>\n            <div class=\"trans\">Learn device names / Названия устройств</div>\n          </div>\n        </div>\n\n        <div class=\"card\">\n          <img src=\"https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=80\" alt=\"타이핑 연습\" />\n          <div class=\"card-body\">\n            <div class=\"card-step\">2</div>\n            <p class=\"card-title\">타이핑</p>\n            <p class=\"card-text\">손가락으로 글자와 숫자를 입력하는 연습을 합니다</p>\n            <div class=\"trans\">Typing practice / Печатание</div>\n          </div>\n        </div>\n\n        <div class=\"card\">\n          <img src=\"https://images.unsplash.com/photo-1516321165247-4aa89a48be28?auto=format&fit=crop&w=1200&q=80\" alt=\"직접 연습\" />\n          <div class=\"card-body\">\n            <div class=\"card-step\">3</div>\n            <p class=\"card-title\">직접 연습</p>\n            <p class=\"card-text\">사이트에서 직접 눌러 보고 따라 하면서 익힙니다</p>\n            <div class=\"trans\">Practice on website / Практика на сайте</div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </section>\n</body>\n</html>\n"
      },
      {
        "fileName": "04_examples.html",
        "order": 4,
        "title": "컴퓨터로 할 수 있는 것",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>컴퓨터로 할 수 있는 것</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">4 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>컴퓨터로 할 수 있는 것</h1><p>검색 · 번역 · 길찾기 · 쇼핑</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "05_life.html",
        "order": 5,
        "title": "생활 도구",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>생활 도구</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">5 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>컴퓨터는 생활 도구</h1><p>한국 생활에 필요한 정보를 찾습니다</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "06_input.html",
        "order": 6,
        "title": "입력 도구",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>입력 도구</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">6 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>입력 도구</h1><p>마우스와 키보드를 사용합니다</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "07_typing.html",
        "order": 7,
        "title": "타이핑",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>타이핑</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">7 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>가장 중요한 기술</h1><p>타이핑 연습</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "08_devices.html",
        "order": 8,
        "title": "컴퓨터 장치",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>컴퓨터 장치</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">8 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>컴퓨터 장치</h1><p>모니터 · 키보드 · 마우스</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "09_power_on.html",
        "order": 9,
        "title": "컴퓨터 켜기",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>컴퓨터 켜기</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">9 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>컴퓨터 켜기</h1><p>전원 버튼을 누릅니다</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "10_typing_site.html",
        "order": 10,
        "title": "타자 연습",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>타자 연습</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">10 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>타자 연습</h1><p>tt.hancomtaja.com</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "11_typing_order.html",
        "order": 11,
        "title": "타자 순서",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>타자 순서</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">11 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>타자 연습 순서</h1><p>자리 → 기본 → 전체 → 숫자</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "12_rule.html",
        "order": 12,
        "title": "수업 규칙",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>수업 규칙</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">12 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>수업 규칙</h1><p>매 수업 시작은 타자 연습</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "13_power_off.html",
        "order": 13,
        "title": "컴퓨터 끄기",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>컴퓨터 끄기</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">13 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>컴퓨터 끄기</h1><p>시작 → 전원 → 종료</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      },
      {
        "fileName": "14_cleanup.html",
        "order": 14,
        "title": "자리 정리",
        "helpLabel": "🖐 모르면 손!",
        "html": "<!DOCTYPE html>\r\n<html lang=\"ko\">\r\n<head>\r\n<meta charset=\"UTF-8\">\r\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n<title>자리 정리</title>\r\n<style>\r\nbody{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:white}\r\n.page{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;text-align:center}\r\nh1{font-size:56px;margin-bottom:20px}\r\np{font-size:28px;max-width:900px}\r\n.page-no{position:fixed;top:20px;left:20px;background:rgba(255,255,255,0.15);padding:10px 16px;border-radius:10px;font-size:18px}\r\n.help{position:fixed;top:20px;right:20px;background:#2563eb;padding:12px 18px;border-radius:12px;font-weight:bold}\r\n</style>\r\n<style data-slide-frame-preset>\n  html,\n  body {\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  body {\n    margin: 0 !important;\n    overscroll-behavior: none !important;\n  }\n\n  *,\n  *::before,\n  *::after {\n    box-sizing: border-box !important;\n  }\n</style>\n</head>\r\n<body>\r\n<div class=\"page-no\">14 / 14</div>\r\n<div class=\"help\">🖐 모르면 손!</div>\r\n<div class=\"page\">\r\n<h1>자리 정리</h1><p>마우스 정리 · 노트북 닫기</p>\r\n</div>\r\n</body>\r\n</html>\r\n"
      }
    ]
  },
  "260321_수업자료": {
    "lessonFolder": "260321_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260328_수업자료": {
    "lessonFolder": "260328_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260404_수업자료": {
    "lessonFolder": "260404_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260411_수업자료": {
    "lessonFolder": "260411_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260418_수업자료": {
    "lessonFolder": "260418_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260425_수업자료": {
    "lessonFolder": "260425_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260502_수업자료": {
    "lessonFolder": "260502_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260509_수업자료": {
    "lessonFolder": "260509_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260516_수업자료": {
    "lessonFolder": "260516_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260523_수업자료": {
    "lessonFolder": "260523_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260530_수업자료": {
    "lessonFolder": "260530_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260613_수업자료": {
    "lessonFolder": "260613_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260620_수업자료": {
    "lessonFolder": "260620_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260627_수업자료": {
    "lessonFolder": "260627_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260704_수업자료": {
    "lessonFolder": "260704_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260707_수업자료": {
    "lessonFolder": "260707_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260709_수업자료": {
    "lessonFolder": "260709_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260711_수업자료": {
    "lessonFolder": "260711_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260714_수업자료": {
    "lessonFolder": "260714_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260716_수업자료": {
    "lessonFolder": "260716_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260718_수업자료": {
    "lessonFolder": "260718_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260721_수업자료": {
    "lessonFolder": "260721_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260723_수업자료": {
    "lessonFolder": "260723_수업자료",
    "slidesDir": null,
    "slides": []
  },
  "260725_수업자료": {
    "lessonFolder": "260725_수업자료",
    "slidesDir": null,
    "slides": []
  }
} as const;

export default slideManifest;
