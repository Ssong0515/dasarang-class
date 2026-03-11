import slideManifest from "../generated/slide-manifest";

export type SlideDocument = {
  fileName: string;
  order: number;
  title: string;
  helpLabel: string;
  html: string;
};

type SlideManifestEntry = {
  lessonFolder: string | null;
  slidesDir: string | null;
  slides: SlideDocument[];
};

const lessonFolderPattern = /^\d{6}_.+/;

export const getLessonFolders = () =>
  Object.values(slideManifest)
    .map((entry) => entry.lessonFolder)
    .filter((entry): entry is string => Boolean(entry) && lessonFolderPattern.test(entry))
    .sort();

export const getLessonFolderByDateKey = (dateKey: string) =>
  getLessonFolders().find((folderName) => folderName.startsWith(`${dateKey}_`));

export const getSlideDocuments = (lessonFolder: string): SlideDocument[] => {
  const target = Object.values(slideManifest).find((entry) => entry.lessonFolder === lessonFolder);
  return target?.slides ?? [];
};

export const getSlidesForSession = (slug: string): SlideManifestEntry => {
  const dateKey = slug.slice(0, 6);
  const exactMatch = slideManifest[slug];
  const dateMatch = slideManifest[dateKey];

  if (exactMatch) {
    return exactMatch;
  }

  if (dateMatch) {
    return dateMatch;
  }

  const lessonFolder = getLessonFolderByDateKey(dateKey);

  if (!lessonFolder) {
    return {
      lessonFolder: null,
      slidesDir: null,
      slides: [],
    };
  }

  return (
    Object.values(slideManifest).find((entry) => entry.lessonFolder === lessonFolder) ?? {
      lessonFolder,
      slidesDir: null,
      slides: [],
    }
  );
};
