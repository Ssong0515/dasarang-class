(function () {
  const currentPath = window.location.pathname;
  const scriptSrc = document.currentScript ? document.currentScript.src : "";
  const repoRoot = scriptSrc ? new URL("../", scriptSrc).href.replace(/\/$/, "") : "";

  const sections = [
    {
      title: "개요",
      items: [
        { label: "메인 허브", href: "__ROOT__/index.html" },
        { label: "프로젝트 기준", href: "__ROOT__/README.md" },
      ],
    },
    {
      title: "수업 자료",
      items: [
        { label: "3월 14일 A반 첫 수업", href: "__ROOT__/classes/260314_computer-a_01/index.html" },
        { label: "학생용 첫 수업 페이지", href: "__ROOT__/260314_%EC%B2%AB%EC%88%98%EC%97%85/materials/index.html" },
      ],
    },
    {
      title: "강의 목록",
      items: [
        { label: "전체 강의 목록", href: "__ROOT__/classes/index.html" },
        { label: "3월", href: "__ROOT__/classes/index.html#month-3", child: true },
        { label: "4월", href: "__ROOT__/classes/index.html#month-4", child: true },
        { label: "5월", href: "__ROOT__/classes/index.html#month-5", child: true },
        { label: "6월", href: "__ROOT__/classes/index.html#month-6", child: true },
        { label: "7월", href: "__ROOT__/classes/index.html#month-7", child: true },
      ],
    },
  ];

  function normalize(path) {
    return path.replace(/\/+$/, "");
  }

  function resolveHref(rawHref) {
    return rawHref.replace("__ROOT__", repoRoot);
  }

  function isActive(href) {
    const url = new URL(resolveHref(href), window.location.href);
    return normalize(url.pathname) === normalize(currentPath);
  }

  function buildLink(item) {
    const link = document.createElement("a");
    link.className = "shared-sidebar__link";
    if (item.child) {
      link.classList.add("is-child");
    }
    link.href = resolveHref(item.href);
    link.textContent = item.label;
    if (isActive(item.href)) {
      link.classList.add("is-active");
    }
    return link;
  }

  function buildGroup(section) {
    const group = document.createElement("div");
    group.className = "shared-sidebar__group";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "shared-sidebar__toggle";
    toggle.innerHTML = `<span>${section.title}</span><span class="shared-sidebar__arrow">▸</span>`;

    const items = document.createElement("div");
    items.className = "shared-sidebar__items";

    let hasActiveChild = false;
    section.items.forEach((item) => {
      const link = buildLink(item);
      if (link.classList.contains("is-active")) {
        hasActiveChild = true;
      }
      items.appendChild(link);
    });

    if (hasActiveChild) {
      group.classList.add("is-open");
      toggle.querySelector(".shared-sidebar__arrow").textContent = "▾";
    }

    toggle.addEventListener("click", function () {
      const isOpen = group.classList.toggle("is-open");
      toggle.querySelector(".shared-sidebar__arrow").textContent = isOpen ? "▾" : "▸";
    });

    group.appendChild(toggle);
    group.appendChild(items);
    return group;
  }

  const sidebar = document.createElement("aside");
  sidebar.className = "shared-sidebar";
  sidebar.innerHTML = `
    <div class="shared-sidebar__inner">
      <div class="shared-sidebar__filter">필터</div>
      <div class="shared-sidebar__brand">
        <strong>다사랑 강의 허브</strong>
        <span>어느 페이지에서도 같은 사이드바를 사용합니다.</span>
      </div>
    </div>
  `;

  const inner = sidebar.querySelector(".shared-sidebar__inner");
  sections.forEach((section) => {
    inner.appendChild(buildGroup(section));
  });

  document.body.classList.add("with-shared-sidebar");
  document.body.insertBefore(sidebar, document.body.firstChild);
})();
