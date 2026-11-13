import serifFont from "@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2?url";
import type { Editor, JSONContent } from "@tiptap/core";
import { MODELS, hubUrl, type ModelId } from "./brand";
import { createEditor } from "./editor";
import { revertFix } from "./extensions/autocorrect";
import { FixPopover } from "./fixPopover";
import { loadModels, type Models } from "./models";
import { store, type DocRecord } from "./store";
import "./styles.css";
import { WELCOME_MARKDOWN, WELCOME_TITLE } from "./welcome";

const SAVE_DELAY_MS = 400;
const THEME_KEY = "offline.page/theme";

type Theme = "light" | "dark";

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in index.html.`);
  return found as T;
}

const ui = {
  title: element("doc-title"),
  docsButton: element<HTMLButtonElement>("docs-button"),
  docsMenu: element("docs-menu"),
  saveChip: element("save-chip"),
  saveStatus: element("save-status"),
  exportButton: element<HTMLButtonElement>("export"),
  copyButton: element<HTMLButtonElement>("copy"),
  themeButton: element<HTMLButtonElement>("theme"),
  meta: element("meta"),
  editorHost: element("editor"),
  models: element("models"),
  modelStatus: element("model-status"),
  offlineStatus: element("offline-status"),
};

let models: Models | null = null;
let editor: Editor | null = null;
let current: DocRecord | null = null;
let saveTimer: number | undefined;

const popover = new FixPopover((fix) => {
  if (!editor) return;
  revertFix(editor.view, models, fix.id);
  editor.commands.focus();
});

// ---- Saving ------------------------------------------------------------------

const titleOf = (target: Editor): string => target.state.doc.firstChild?.textContent.trim() || "Untitled";

function countWords(target: Editor): number {
  const { doc } = target.state;
  return doc.textBetween(0, doc.content.size, " ", " ").match(/\S+/g)?.length ?? 0;
}

function setSaveStatus(text: string, isError = false): void {
  ui.saveStatus.textContent = text;
  ui.saveChip.toggleAttribute("data-error", isError);
}

function saveNow(): void {
  window.clearTimeout(saveTimer);
  if (!editor || !current) return;
  current = { ...current, title: titleOf(editor), content: editor.getJSON(), updatedAt: Date.now() };
  try {
    store.save(current);
    setSaveStatus("Saved on this device");
  } catch (error) {
    setSaveStatus("Couldn’t save in this browser", true);
    console.error("Saving failed", error);
  }
}

function renderMeta(): void {
  if (!editor || !current) return;
  const date = new Date(current.createdAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const words = countWords(editor);
  const title = titleOf(editor);
  ui.meta.textContent = `${date} · ${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;
  ui.title.textContent = title;
  document.title = `${title} · offline.page`;
}

// ---- Documents ---------------------------------------------------------------

type OpenContent = { type: "json"; content: JSONContent } | { type: "markdown"; content: string };

function open(doc: DocRecord, source: OpenContent = { type: "json", content: doc.content }): void {
  saveNow();
  popover.hide();
  editor?.destroy();
  current = doc;
  store.setLastOpened(doc.id);
  editor = createEditor({
    element: ui.editorHost,
    content: source.content,
    contentType: source.type,
    getModels: () => models,
    onFixClick: (fix, anchor) => popover.show(fix, anchor),
    onUpdate: () => {
      renderMeta();
      setSaveStatus("Saving…");
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(saveNow, SAVE_DELAY_MS);
    },
  });
  renderMeta();
  if (source.type === "markdown") saveNow();
}

const openWelcome = () => open(store.create({ type: "doc" }, WELCOME_TITLE), { type: "markdown", content: WELCOME_MARKDOWN });
const openNew = () => open(store.create({ type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] }, "Untitled"));

/** Opens the most recent page, or a fresh one when there are none left. */
function openMostRecent(): void {
  const next = store.list()[0];
  const doc = next ? store.load(next.id) : null;
  if (doc) open(doc);
  else openNew();
}

function openInitial(): void {
  const lastId = store.lastOpened();
  const last = lastId ? store.load(lastId) : null;
  if (last) open(last);
  else if (store.list().length > 0) openMostRecent();
  else openWelcome();
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const created = document.createElement("button");
  created.type = "button";
  created.className = className;
  created.textContent = text;
  created.addEventListener("click", onClick);
  return created;
}

function renderDocsMenu(): void {
  const newPage = button("w-full rounded-[9px] px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-hover", "New page", () => {
    closeDocsMenu();
    openNew();
  });

  const rows = store.list().map((summary) => {
    const row = document.createElement("div");
    row.className = "group/row flex items-center rounded-[9px] hover:bg-hover data-[current]:bg-hover";
    row.toggleAttribute("data-current", summary.id === current?.id);

    const openPage = button("flex min-w-0 flex-1 justify-between gap-3 px-3 py-[9px] text-left text-sm text-ink", "", () => {
      closeDocsMenu();
      const doc = store.load(summary.id);
      if (doc) open(doc);
    });
    const title = document.createElement("span");
    title.className = "truncate";
    title.textContent = summary.title;
    const date = document.createElement("small");
    date.className = "flex-none text-xs text-faint";
    date.textContent = new Date(summary.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    openPage.append(title, date);

    const remove = button(
      "px-3 py-[9px] text-xs text-faint opacity-0 group-hover/row:opacity-100 hover:text-error focus-visible:opacity-100 pointer-coarse:opacity-100",
      "Delete",
      () => {
        if (!confirm(`Delete “${summary.title}”? This can’t be undone.`)) return;
        const wasCurrent = summary.id === current?.id;
        store.remove(summary.id);
        if (wasCurrent) {
          current = null;
          openMostRecent();
        }
        renderDocsMenu();
      },
    );
    remove.setAttribute("aria-label", `Delete ${summary.title}`);
    row.append(openPage, remove);
    return row;
  });

  ui.docsMenu.replaceChildren(newPage, ...rows);
}

const closeOnOutsideClick = (event: MouseEvent): void => {
  const target = event.target as Node;
  if (!ui.docsMenu.contains(target) && !ui.docsButton.contains(target)) closeDocsMenu();
};

function closeDocsMenu(): void {
  ui.docsMenu.hidden = true;
  ui.docsButton.setAttribute("aria-expanded", "false");
  document.removeEventListener("mousedown", closeOnOutsideClick);
}

ui.docsButton.addEventListener("click", () => {
  if (!ui.docsMenu.hidden) return closeDocsMenu();
  saveNow();
  renderDocsMenu();
  ui.docsMenu.hidden = false;
  ui.docsButton.setAttribute("aria-expanded", "true");
  document.addEventListener("mousedown", closeOnOutsideClick);
});

// ---- Export ------------------------------------------------------------------

const slug = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";

function flash(target: HTMLButtonElement, text: string): void {
  const label = target.dataset.label ?? target.textContent ?? "";
  target.dataset.label = label;
  target.textContent = text;
  window.setTimeout(() => (target.textContent = label), 1400);
}

ui.exportButton.addEventListener("click", () => {
  if (!editor) return;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([editor.getMarkdown()], { type: "text/markdown" }));
  link.download = `${slug(titleOf(editor))}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
});

ui.copyButton.addEventListener("click", async () => {
  if (!editor) return;
  try {
    await navigator.clipboard.writeText(editor.getMarkdown());
    flash(ui.copyButton, "Copied");
  } catch (error) {
    flash(ui.copyButton, "Couldn’t copy");
    console.error("Copy failed", error);
  }
});

// ---- Theme -------------------------------------------------------------------

function readTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme | null): void {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

ui.themeButton.addEventListener("click", () => {
  const chosen = document.documentElement.dataset.theme;
  const isDark = chosen ? chosen === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const next: Theme = isDark ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

// ---- Models and offline -------------------------------------------------------

function renderModelLinks(): void {
  for (const id of Object.keys(MODELS) as ModelId[]) {
    const link = element<HTMLAnchorElement>(`${id}-link`);
    link.href = hubUrl(id);
    link.title = `${MODELS[id].role}. ${MODELS[id].caveat}`;
    element(`${id}-size`).textContent = MODELS[id].size;
  }
}

async function startModels(): Promise<void> {
  const began = performance.now();
  try {
    models = await loadModels();
    ui.modelStatus.textContent = `ready in ${Math.round(performance.now() - began)} ms`;
  } catch (error) {
    ui.modelStatus.textContent = "couldn’t load. Writing and saving still work.";
    ui.models.toggleAttribute("data-error", true);
    console.error("Loading models failed", error);
  }
}

async function startOfflineCache(): Promise<void> {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    ui.offlineStatus.hidden = false;
  } catch (error) {
    console.error("Offline cache failed to start", error);
  }
}

// The serif for systems without Iowan Old Style or Charter. It's bundled, so it works offline too.
document.fonts.add(new FontFace("Newsreader", `url(${serifFont}) format("woff2")`, { weight: "200 800" }));
applyTheme(readTheme());
renderModelLinks();
openInitial();
window.addEventListener("pagehide", saveNow);
void startModels();
void startOfflineCache();
