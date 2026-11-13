import type { JSONContent } from "@tiptap/core";

export interface DocSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface DocRecord extends DocSummary {
  content: JSONContent;
}

const INDEX_KEY = "offline.page/docs";
const LAST_OPENED_KEY = "offline.page/last-opened";
const docKey = (id: string) => `offline.page/doc/${id}`;

function readJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

/** Documents live in this browser's localStorage. Nothing is sent anywhere. */
export const store = {
  list(): DocSummary[] {
    return (readJson<DocSummary[]>(INDEX_KEY) ?? []).sort((first, second) => second.updatedAt - first.updatedAt);
  },

  load(id: string): DocRecord | null {
    return readJson<DocRecord>(docKey(id));
  },

  /** Throws when the browser refuses the write, for example when storage is full. */
  save(doc: DocRecord): void {
    localStorage.setItem(docKey(doc.id), JSON.stringify(doc));
    const summary: DocSummary = { id: doc.id, title: doc.title, createdAt: doc.createdAt, updatedAt: doc.updatedAt };
    const others = this.list().filter((entry) => entry.id !== doc.id);
    localStorage.setItem(INDEX_KEY, JSON.stringify([summary, ...others]));
  },

  remove(id: string): void {
    localStorage.removeItem(docKey(id));
    localStorage.setItem(INDEX_KEY, JSON.stringify(this.list().filter((entry) => entry.id !== id)));
  },

  lastOpened(): string | null {
    return localStorage.getItem(LAST_OPENED_KEY);
  },

  setLastOpened(id: string): void {
    localStorage.setItem(LAST_OPENED_KEY, id);
  },

  create(content: JSONContent, title: string): DocRecord {
    const now = Date.now();
    return { id: crypto.randomUUID(), title, createdAt: now, updatedAt: now, content };
  },
};
