type NoteRecord = {
  content: string;
  updatedAt: string;
};

type NoteMap = Record<string, NoteRecord>;

type KVStore = {
  get(key: string, type?: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }>;
};

type RuntimeLocals = {
  runtime?: {
    env?: {
      NOTES?: KVStore;
    };
  };
};

const NOTE_PREFIX = "note:";
const isLocalDev = import.meta.env.DEV;

const getNoteKey = (slug: string) => `${NOTE_PREFIX}${slug}`;

const sanitizeNote = (value: string) => value.replace(/\r\n/g, "\n").trim();

const readJson = (raw: string | null) => {
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw) as NoteRecord;
};

const getKvStore = (locals?: RuntimeLocals) => locals?.runtime?.env?.NOTES;

const getLocalStorePath = async () => {
  const { fileURLToPath } = await import("node:url");
  return fileURLToPath(new URL("../../.local/class-notes.json", import.meta.url));
};

const readLocalNotes = async (): Promise<NoteMap> => {
  const fs = await import("node:fs/promises");

  try {
    const raw = await fs.readFile(await getLocalStorePath(), "utf-8");
    return JSON.parse(raw) as NoteMap;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {};
    }

    throw error;
  }
};

const writeLocalNotes = async (notes: NoteMap) => {
  const fs = await import("node:fs/promises");
  const path = await getLocalStorePath();
  const { dirname } = await import("node:path");

  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(notes, null, 2), "utf-8");
};

export const getNote = async (slug: string, locals?: RuntimeLocals) => {
  const kv = getKvStore(locals);

  if (kv) {
    return readJson(await kv.get(getNoteKey(slug), "text"));
  }

  if (!isLocalDev) {
    return undefined;
  }

  const notes = await readLocalNotes();
  return notes[slug];
};

export const listNotes = async (locals?: RuntimeLocals): Promise<NoteMap> => {
  const kv = getKvStore(locals);

  if (kv) {
    const listed = await kv.list({ prefix: NOTE_PREFIX });
    const entries = await Promise.all(
      listed.keys.map(async ({ name }) => {
        const raw = await kv.get(name, "text");
        const record = readJson(raw);

        if (!record) {
          return undefined;
        }

        return [name.slice(NOTE_PREFIX.length), record] as const;
      }),
    );

    return Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, NoteRecord]>);
  }

  if (!isLocalDev) {
    return {};
  }

  return readLocalNotes();
};

export const saveNote = async (slug: string, content: string, locals?: RuntimeLocals) => {
  const normalized = sanitizeNote(content);
  const kv = getKvStore(locals);

  if (!normalized) {
    if (kv) {
      await kv.delete(getNoteKey(slug));
      return undefined;
    }

    const notes = await readLocalNotes();
    delete notes[slug];
    await writeLocalNotes(notes);
    return undefined;
  }

  const record: NoteRecord = {
    content: normalized,
    updatedAt: new Date().toISOString(),
  };

  if (kv) {
    await kv.put(getNoteKey(slug), JSON.stringify(record));
    return record;
  }

  if (!isLocalDev) {
    throw new Error("NOTES KV binding is not configured.");
  }

  const notes = await readLocalNotes();
  notes[slug] = record;
  await writeLocalNotes(notes);
  return record;
};

export type { NoteRecord };
