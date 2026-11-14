import type { JSONContent } from "@tiptap/core";

export interface DocSummary {
  id: string;
  title: string;
  /** The start of the text after the title, for the sidebar. Missing on pages saved before it existed. */
  preview?: string;
  createdAt: number;
  updatedAt: number;
}

const PREVIEW_CHARS = 90;

function textOf(node: JSONContent): string {
  if (node.text) return node.text;
  return (node.content ?? []).map(textOf).join(" ");
}

/** The first words after the title, collapsed onto one line. */
function previewOf(content: JSONContent): string {
  const body = (content.content ?? []).slice(1);
  let text = "";
  for (const block of body) {
    text = `${text} ${textOf(block)}`.replace(/\s+/g, " ").trim();
    if (text.length >= PREVIEW_CHARS) break;
  }
  return text.slice(0, PREVIEW_CHARS);
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
    const summary: DocSummary = {
      id: doc.id,
      title: doc.title,
      preview: previewOf(doc.content),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
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
