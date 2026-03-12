const isLocalDev = import.meta.env.DEV;

const parseOrder = (fileName: string) => {
  const match = fileName.match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
};

const buildSlideTemplate = (order: number) => `---
import SlideShell from "../../components/slides/SlideShell.astro";

export const slideMeta = {
  title: "슬라이드 ${order}",
  helpLabel: "",
  order: ${order},
};
---

<SlideShell />
`;

const getSlidesRoot = async () => {
  const { fileURLToPath } = await import("node:url");
  return fileURLToPath(new URL("../slides", import.meta.url));
};

const escapeSingleQuoted = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export const createSlideForSession = async (slug: string) => {
  if (!isLocalDev) {
    throw new Error("slide_file_editing_unavailable");
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const slidesRoot = await getSlidesRoot();
  const dateKey = slug.slice(0, 6);
  const targetDir = path.join(slidesRoot, dateKey);

  await fs.mkdir(targetDir, { recursive: true });

  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  const astroFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".astro"))
    .map((entry) => entry.name);

  const nextOrder = astroFiles.reduce((max, fileName) => Math.max(max, parseOrder(fileName)), 0) + 1;
  const nextPrefix = String(nextOrder).padStart(2, "0");
  const nextFileName = `${nextPrefix}_slide.astro`;
  const filePath = path.join(targetDir, nextFileName);

  await fs.writeFile(filePath, buildSlideTemplate(nextOrder), "utf-8");

  return {
    fileName: nextFileName,
    slideId: nextFileName.replace(/\.astro$/, ""),
  };
};

export const updateSlideMetaForSession = async (
  slug: string,
  slideId: string,
  updates: { title?: string; helpLabel?: string },
) => {
  if (!isLocalDev) {
    throw new Error("slide_file_editing_unavailable");
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const slidesRoot = await getSlidesRoot();
  const dateKey = slug.slice(0, 6);
  const targetDir = path.join(slidesRoot, dateKey);
  const filePath = path.join(targetDir, `${slideId}.astro`);

  const source = await fs.readFile(filePath, "utf-8");

  let nextSource = source;

  if (typeof updates.title === "string") {
    const titlePattern = /(title:\s*)(["'])(.*?)\2/;
    nextSource = nextSource.replace(titlePattern, (_, prefix, quote) => {
      if (quote === "'") {
        return `${prefix}'${escapeSingleQuoted(updates.title ?? "")}'`;
      }

      return `${prefix}"${(updates.title ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    });
  }

  if (typeof updates.helpLabel === "string") {
    const helpPattern = /(helpLabel:\s*)(["'])(.*?)\2/;
    nextSource = nextSource.replace(helpPattern, (_, prefix, quote) => {
      if (quote === "'") {
        return `${prefix}'${escapeSingleQuoted(updates.helpLabel ?? "")}'`;
      }

      return `${prefix}"${(updates.helpLabel ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    });
  }

  await fs.writeFile(filePath, nextSource, "utf-8");
};
