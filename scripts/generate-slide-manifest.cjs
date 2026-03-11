const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, "src", "generated");
const outputFile = path.join(outputDir, "slide-manifest.ts");
const componentSlidesRoot = path.join(projectRoot, "src", "slides");
const lessonFolderPattern = /^\d{6}_.+/;
const htmlPattern = /\.html?$/i;

const extractTagContent = (html, tag) => {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].trim() : "";
};

const extractHelpLabel = (html) => {
  const match = html.match(/<[^>]*class=["'][^"']*\bhelp\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  if (!match) return "";
  return match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
};

const framePresetStyle = `
<style data-slide-frame-preset>
  :root {
    --slide-shell-padding: clamp(16px, 2.6vw, 32px);
    --slide-frame-width: min(1100px, calc(100vw - (var(--slide-shell-padding) * 2)));
    --slide-frame-height: calc(100vh - (var(--slide-shell-padding) * 2));
  }

  html,
  body {
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
  }

  body {
    margin: 0 !important;
    overscroll-behavior: none !important;
    display: grid !important;
    place-items: center !important;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box !important;
  }

  body > .slide,
  .slide {
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    padding: var(--slide-shell-padding) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  .slide > .frame,
  .slide > .overlay + .frame,
  .slide .frame:first-of-type {
    width: var(--slide-frame-width) !important;
    max-width: var(--slide-frame-width) !important;
    margin: 0 auto !important;
  }

  .slide .frame {
    position: relative !important;
  }

  .slide .grid,
  .slide .panel {
    width: 100% !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }

  @media (max-width: 640px) {
    :root {
      --slide-shell-padding: 12px;
      --slide-frame-width: calc(100vw - 24px);
    }
  }

  @media (min-width: 1200px) and (min-height: 720px) {
    .slide .hero-icon,
    .slide .info-icon {
      font-size: 44px !important;
      line-height: 1 !important;
    }

    .slide .title {
      font-size: clamp(36px, 4vw, 54px) !important;
      line-height: 1.12 !important;
    }

    .slide .subtitle {
      font-size: clamp(21px, 2vw, 28px) !important;
      line-height: 1.35 !important;
    }

    .slide .subtitle-small,
    .slide .card-trans,
    .slide .trans,
    .slide .info-trans {
      font-size: 15px !important;
      line-height: 1.4 !important;
    }

    .slide .card-title,
    .slide .name,
    .slide .site-title,
    .slide .mini-title,
    .slide .info-title {
      font-size: 25px !important;
      line-height: 1.2 !important;
    }

    .slide .card-text,
    .slide .desc,
    .slide .step-text,
    .slide .site-url,
    .slide .mini-text,
    .slide .info-text {
      font-size: 18px !important;
      line-height: 1.45 !important;
    }

    .slide .chip-btn {
      font-size: 16px !important;
      padding: 10px 14px !important;
    }

    .slide .step-no,
    .slide .card-step {
      width: 30px !important;
      height: 30px !important;
      font-size: 15px !important;
    }
  }
</style>
`.trim();

const withFramePreset = (html) => {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${framePresetStyle}\n</head>`);
  }

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<head>${framePresetStyle}</head><body$1>`);
  }

  return `<!DOCTYPE html><html lang="ko"><head>${framePresetStyle}</head><body>${html}</body></html>`;
};

const parseOrder = (fileName, index) => {
  const match = fileName.match(/^(\d+)/);
  return match ? Number(match[1]) : index + 1;
};

const parseSlideDocument = (fileName, html, index) => {
  const cleanFileName = fileName.replace(htmlPattern, "");
  return {
    fileName,
    order: parseOrder(fileName, index),
    title: extractTagContent(html, "title") || cleanFileName,
    helpLabel: extractHelpLabel(html),
    html: withFramePreset(html),
  };
};

const getLessonFolders = () =>
  fs
    .readdirSync(projectRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && lessonFolderPattern.test(entry.name))
    .map((entry) => entry.name)
    .sort();

const getComponentSlideKeys = () => {
  if (!fs.existsSync(componentSlidesRoot)) {
    return new Set();
  }

  return new Set(
    fs
      .readdirSync(componentSlidesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
};

const getSlidesForFolder = (lessonFolder) => {
  const slidesDir = path.join(projectRoot, lessonFolder, "slides");

  if (fs.existsSync(slidesDir)) {
    const files = fs
      .readdirSync(slidesDir)
      .filter((fileName) => htmlPattern.test(fileName))
      .sort((left, right) => left.localeCompare(right, "ko"));

    if (files.length > 0) {
      return {
        slidesDir,
        slides: files.map((fileName, index) =>
          parseSlideDocument(fileName, fs.readFileSync(path.join(slidesDir, fileName), "utf8"), index),
        ),
      };
    }
  }

  const legacyFile = path.join(projectRoot, lessonFolder, "materials", "index.html");

  if (fs.existsSync(legacyFile)) {
    return {
      slidesDir: path.dirname(legacyFile),
      slides: [parseSlideDocument("01_main.html", fs.readFileSync(legacyFile, "utf8"), 0)],
    };
  }

  return {
    slidesDir: null,
    slides: [],
  };
};

const manifest = {};
const componentSlideKeys = getComponentSlideKeys();

for (const lessonFolder of getLessonFolders()) {
  const dateKey = lessonFolder.slice(0, 6);

  if (componentSlideKeys.has(lessonFolder) || componentSlideKeys.has(dateKey)) {
    continue;
  }

  const { slidesDir, slides } = getSlidesForFolder(lessonFolder);
  const entry = {
    lessonFolder,
    slidesDir: slidesDir ? slidesDir.replaceAll("\\", "/") : null,
    slides,
  };

  manifest[dateKey] = entry;
  manifest[lessonFolder] = entry;
}

const fileContents = `const slideManifest = ${JSON.stringify(manifest, null, 2)} as const;\n\nexport default slideManifest;\n`;

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, fileContents, "utf8");
