import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type SlideStateRecord = {
  order: string[];
  deleted: string[];
};

type SlideStateMap = Record<string, SlideStateRecord>;

const getSlideStatePath = () => {
  return fileURLToPath(new URL("../../.local/slide-state.json", import.meta.url));
};

const readSlideState = async (): Promise<SlideStateMap> => {
  const filePath = getSlideStatePath();

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as SlideStateMap;
    return parsed ?? {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }
};

const writeSlideState = async (state: SlideStateMap) => {
  const filePath = getSlideStatePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
};

const normalizeRecord = (record?: Partial<SlideStateRecord>): SlideStateRecord => ({
  order: Array.isArray(record?.order) ? record.order.filter(Boolean) : [],
  deleted: Array.isArray(record?.deleted) ? record.deleted.filter(Boolean) : [],
});

export const getSlideState = async (slug: string): Promise<SlideStateRecord> => {
  const state = await readSlideState();
  return normalizeRecord(state[slug]);
};

export const saveSlideOrder = async (slug: string, order: string[]) => {
  const state = await readSlideState();
  const current = normalizeRecord(state[slug]);

  state[slug] = {
    ...current,
    order: Array.from(new Set(order.filter(Boolean))),
  };

  await writeSlideState(state);
};

export const deleteSlideFromSession = async (slug: string, slideId: string) => {
  const state = await readSlideState();
  const current = normalizeRecord(state[slug]);

  state[slug] = {
    order: current.order.filter((entry) => entry !== slideId),
    deleted: Array.from(new Set([...current.deleted, slideId])),
  };

  await writeSlideState(state);
};
