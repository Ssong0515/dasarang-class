const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, "src", "generated");
const outputFile = path.join(outputDir, "slide-manifest.ts");
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
  html,
  body {
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
  }

  body {
    margin: 0 !important;
    overscroll-behavior: none !important;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box !important;
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

for (const lessonFolder of getLessonFolders()) {
  const { slidesDir, slides } = getSlidesForFolder(lessonFolder);
  const dateKey = lessonFolder.slice(0, 6);
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
