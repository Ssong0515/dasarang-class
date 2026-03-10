import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type SlideDocument = {
  fileName: string;
  order: number;
  title: string;
  helpLabel: string;
  html: string;
};

const projectRoot = process.cwd();
const lessonFolderPattern = /^\d{6}_.+/;
const htmlPattern = /\.html?$/i;

const extractTagContent = (html: string, tag: "title" | "body") => {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].trim() : "";
};

const extractHelpLabel = (html: string) => {
  const match = html.match(/<[^>]*class=["'][^"']*\bhelp\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);

  if (!match) {
    return "";
  }

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

const withFramePreset = (html: string) => {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${framePresetStyle}\n</head>`);
  }

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<head>${framePresetStyle}</head><body$1>`);
  }

  return `<!DOCTYPE html><html lang="ko"><head>${framePresetStyle}</head><body>${html}</body></html>`;
};

const parseOrder = (fileName: string, index: number) => {
  const match = fileName.match(/^(\d+)/);
  return match ? Number(match[1]) : index + 1;
};

const parseSlideDocument = (fileName: string, html: string, index: number): SlideDocument => {
  const cleanFileName = fileName.replace(htmlPattern, "");

  return {
    fileName,
    order: parseOrder(fileName, index),
    title: extractTagContent(html, "title") || cleanFileName,
    helpLabel: extractHelpLabel(html),
    html: withFramePreset(html),
  };
};

export const getLessonFolders = () => {
  try {
    return readdirSync(projectRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && lessonFolderPattern.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

export const getLessonFolderByDateKey = (dateKey: string) =>
  getLessonFolders().find((folderName) => folderName.startsWith(`${dateKey}_`));

export const getSlideDocuments = (lessonFolder: string): SlideDocument[] => {
  const slidesDir = join(projectRoot, lessonFolder, "slides");

  if (existsSync(slidesDir)) {
    const files = readdirSync(slidesDir)
      .filter((fileName) => htmlPattern.test(fileName))
      .sort((left, right) => left.localeCompare(right, "ko"));

    return files.map((fileName, index) =>
      parseSlideDocument(fileName, readFileSync(join(slidesDir, fileName), "utf8"), index),
    );
  }

  const legacyFile = join(projectRoot, lessonFolder, "materials", "index.html");

  if (existsSync(legacyFile)) {
    return [parseSlideDocument("01_main.html", readFileSync(legacyFile, "utf8"), 0)];
  }

  return [];
};

export const getSlidesForSession = (slug: string) => {
  const dateKey = slug.slice(0, 6);
  const lessonFolder = getLessonFolderByDateKey(dateKey);

  if (!lessonFolder) {
    return {
      lessonFolder: null,
      slidesDir: null,
      slides: [] as SlideDocument[],
    };
  }

  const slidesDir = join(projectRoot, lessonFolder, "slides");

  return {
    lessonFolder,
    slidesDir,
    slides: getSlideDocuments(lessonFolder),
  };
};
