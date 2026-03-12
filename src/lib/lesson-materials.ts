import slideManifest from "../generated/slide-manifest";
import { getSlideState } from "./slide-state";

type ComponentSlideMeta = {
  title: string;
  helpLabel?: string;
  order?: number;
};

type ComponentSlideModule = {
  default: unknown;
  slideMeta?: ComponentSlideMeta;
};

type LegacySlideDocument = {
  kind: "legacy";
  fileName: string;
  order: number;
  title: string;
  helpLabel: string;
  html: string;
};

type ComponentSlideDocument = {
  kind: "component";
  fileName: string;
  order: number;
  title: string;
  helpLabel: string;
  previewPath: string;
  slideId: string;
};

type ComponentSlideRecord = {
  fileName: string;
  order: number;
  title: string;
  helpLabel: string;
  slideId: string;
  modulePath: string;
};

export type SlideDocument = LegacySlideDocument | ComponentSlideDocument;
export type LoadedComponentSlide = {
  component: ComponentSlideModule["default"];
  meta: ComponentSlideDocument;
};

type SlideManifestEntry = {
  lessonFolder: string | null;
  slidesDir: string | null;
  slides: SlideDocument[];
  source: "component" | "legacy" | "none";
};

const lessonFolderPattern = /^\d{6}_.+/;
const slideModuleLoaders = import.meta.glob("../slides/**/*.astro");

const parseOrder = (fileName: string) => {
  const match = fileName.match(/^(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

const getComponentModuleEntries = (slug: string) => {
  const dateKey = slug.slice(0, 6);
  const entries = Object.entries(slideModuleLoaders);
  const exactPrefix = `../slides/${slug}/`;
  const exactEntries = entries.filter(([modulePath]) => modulePath.startsWith(exactPrefix));
  const componentKey = exactEntries.length > 0 ? slug : dateKey;
  const prefix = `../slides/${componentKey}/`;

  return entries
    .filter(([modulePath]) => modulePath.startsWith(prefix))
    .sort(([left], [right]) => left.localeCompare(right, "ko"))
    .map(([modulePath, loader]) => ({
      componentKey,
      modulePath,
      loader,
    }));
};

const getComponentSlidesForSlug = async (slug: string) => {
  const componentModules = getComponentModuleEntries(slug);

  if (componentModules.length === 0) {
    return undefined;
  }

  const slides = await Promise.all(
    componentModules.map(async ({ componentKey, modulePath, loader }) => {
      const match = modulePath.match(/^\.\.\/slides\/([^/]+)\/([^/]+)\.astro$/);

      if (!match) {
        return undefined;
      }

      const loaded = (await loader()) as ComponentSlideModule;
      const slideId = match[2];
      const slideMeta = loaded.slideMeta ?? {
        title: slideId,
      };

      return {
        componentKey,
        fileName: `${slideId}.astro`,
        slideId,
        modulePath,
        order: slideMeta.order ?? parseOrder(slideId),
        title: slideMeta.title ?? slideId,
        helpLabel: slideMeta.helpLabel ?? "",
      } satisfies ComponentSlideRecord & { componentKey: string };
    }),
  );

  const orderedSlides = slides
    .filter((entry): entry is ComponentSlideRecord & { componentKey: string } => Boolean(entry))
    .sort((left, right) => left.order - right.order);

  const state = await getSlideState(slug);
  const deleted = new Set(state.deleted);
  const orderIndex = new Map(state.order.map((slideId, index) => [slideId, index]));

  return orderedSlides
    .filter((entry) => !deleted.has(entry.slideId))
    .sort((left, right) => {
      const leftIndex = orderIndex.get(left.slideId);
      const rightIndex = orderIndex.get(right.slideId);

      if (leftIndex === undefined && rightIndex === undefined) {
        return left.order - right.order;
      }

      if (leftIndex === undefined) {
        return 1;
      }

      if (rightIndex === undefined) {
        return -1;
      }

      return leftIndex - rightIndex;
    });
};

export const getLessonFolders = () =>
  Object.values(slideManifest)
    .map((entry) => entry.lessonFolder)
    .filter((entry): entry is string => Boolean(entry) && lessonFolderPattern.test(entry))
    .sort();

export const getLessonFolderByDateKey = (dateKey: string) =>
  getLessonFolders().find((folderName) => folderName.startsWith(`${dateKey}_`));

export const getSlidesForSession = async (slug: string): Promise<SlideManifestEntry> => {
  const componentSlides = await getComponentSlidesForSlug(slug);

  if (componentSlides && componentSlides.length > 0) {
    const componentKey = componentSlides[0].componentKey;

    return {
      lessonFolder: componentKey,
      slidesDir: `src/slides/${componentKey}`,
      source: "component",
      slides: componentSlides.map((slide) => ({
        kind: "component",
        fileName: slide.fileName,
        order: slide.order,
        title: slide.title,
        helpLabel: slide.helpLabel,
        slideId: slide.slideId,
        previewPath: `/preview/${slug}/${slide.slideId}/`,
      })),
    };
  }

  const dateKey = slug.slice(0, 6);
  const exactMatch = slideManifest[slug];
  const dateMatch = slideManifest[dateKey];

  if (exactMatch) {
    return {
      lessonFolder: exactMatch.lessonFolder,
      slidesDir: exactMatch.slidesDir,
      source: "legacy",
      slides: exactMatch.slides.map((slide) => ({
        kind: "legacy",
        ...slide,
      })),
    };
  }

  if (dateMatch) {
    return {
      lessonFolder: dateMatch.lessonFolder,
      slidesDir: dateMatch.slidesDir,
      source: "legacy",
      slides: dateMatch.slides.map((slide) => ({
        kind: "legacy",
        ...slide,
      })),
    };
  }

  const lessonFolder = getLessonFolderByDateKey(dateKey);

  if (!lessonFolder) {
    return {
      lessonFolder: null,
      slidesDir: null,
      slides: [],
      source: "none",
    };
  }

  const target = Object.values(slideManifest).find((entry) => entry.lessonFolder === lessonFolder);

  if (!target) {
    return {
      lessonFolder,
      slidesDir: null,
      slides: [],
      source: "none",
    };
  }

  return {
    lessonFolder: target.lessonFolder,
    slidesDir: target.slidesDir,
    source: "legacy",
    slides: target.slides.map((slide) => ({
      kind: "legacy",
      ...slide,
    })),
  };
};

export const loadComponentSlide = async (slug: string, slideId: string) => {
  const slides = await getComponentSlidesForSlug(slug);
  const target = slides?.find((slide) => slide.slideId === slideId);

  if (!target) {
    return undefined;
  }

  const loader = slideModuleLoaders[target.modulePath];

  if (!loader) {
    return undefined;
  }

  const loaded = (await loader()) as ComponentSlideModule;

  return {
    component: loaded.default,
    meta: {
      fileName: target.fileName,
      order: target.order,
      title: target.title,
      helpLabel: target.helpLabel,
      slideId: target.slideId,
      previewPath: `/preview/${slug}/${target.slideId}/`,
    } satisfies ComponentSlideDocument,
  };
};

export const loadComponentSlides = async (slug: string): Promise<LoadedComponentSlide[]> => {
  const slides = await getComponentSlidesForSlug(slug);

  if (!slides || slides.length === 0) {
    return [];
  }

  const loadedSlides = await Promise.all(
    slides.map(async (target) => {
      const loader = slideModuleLoaders[target.modulePath];

      if (!loader) {
        return undefined;
      }

      const loaded = (await loader()) as ComponentSlideModule;

      return {
        component: loaded.default,
        meta: {
          kind: "component",
          fileName: target.fileName,
          order: target.order,
          title: target.title,
          helpLabel: target.helpLabel,
          slideId: target.slideId,
          previewPath: `/preview/${slug}/${target.slideId}/`,
        } satisfies ComponentSlideDocument,
      } satisfies LoadedComponentSlide;
    }),
  );

  return loadedSlides.filter((slide): slide is LoadedComponentSlide => Boolean(slide));
};
