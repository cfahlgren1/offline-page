import type { Editor, JSONContent } from "@tiptap/core";
import { element } from "./dom";
import { createEditor } from "./editor";
import { revertFix } from "./extensions/autocorrect";
import { suggestionsKey } from "./extensions/suggestions";
import { FixPopover } from "./fixPopover";
import { setupModelPanel } from "./modelPanel";
import type { Models } from "./models";
import { setupMoreMenu } from "./moreMenu";
import { startOfflineCache } from "./offlineCache";
import { renderPageList } from "./pageList";
import { settings } from "./settings";
import { store, type DocRecord, type DocSummary } from "./store";
import { TinyNextClient } from "./tinynext/client";
import "./styles.css";
import { WELCOME_MARKDOWN, WELCOME_TITLE } from "./welcome";

const SAVE_DELAY_MS = 400;

const ui = {
  pages: element("pages"),
  newPage: element<HTMLButtonElement>("new-page"),
  sidebarClose: element<HTMLButtonElement>("sidebar-close"),
  sidebarOpen: element<HTMLButtonElement>("sidebar-open"),
  sidebarOpenSpine: element<HTMLButtonElement>("sidebar-open-spine"),
  backdrop: element("backdrop"),
  saveChip: element("save-chip"),
  saveStatus: element("save-status"),
  meta: element("meta"),
  editorHost: element("editor"),
};

let models: Models | null = null;
let tinynext: TinyNextClient | null = null;
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

/** The bar shows only a dot once a page is saved; words appear while saving and when saving fails. */
function setSaveStatus(text: string, state: "saved" | "busy" | "error"): void {
  ui.saveStatus.textContent = text;
  ui.saveChip.title = state === "saved" ? "Saved on this device" : text;
  ui.saveChip.toggleAttribute("data-busy", state === "busy");
  ui.saveChip.toggleAttribute("data-error", state === "error");
}

function saveNow(): void {
  window.clearTimeout(saveTimer);
  if (!editor || !current) return;
  current = { ...current, title: titleOf(editor), content: editor.getJSON(), updatedAt: Date.now() };
  try {
    store.save(current);
    setSaveStatus("Saved", "saved");
    renderPages();
  } catch (error) {
    setSaveStatus("Couldn’t save in this browser", "error");
    console.error("Saving failed", error);
  }
}

function renderMeta(): void {
  if (!editor || !current) return;
  const date = new Date(current.createdAt).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const words = countWords(editor);
  const title = titleOf(editor);
  ui.meta.textContent = `${date} · ${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;
  document.title = `${title} · offlinepage.app`;
}

// ---- Documents ---------------------------------------------------------------

type OpenContent = { type: "json"; content: JSONContent } | { type: "markdown"; content: string };

/** Model output is only used while its switch is on. Switching tinynext off also clears the suggestion on screen. */
const activeModels = (): Models | null => (settings.isModelOn("tinyfix") ? models : null);
const activeTinyNext = (): TinyNextClient | null => (settings.isModelOn("tinynext") ? tinynext : null);

/** New pages start with the cursor in the title; existing ones open at the top. */
function open(saved: DocRecord, opened?: OpenContent, focus: "start" | "end" = "start"): void {
  const doc = withoutEmptyLastHeading(saved);
  const source: OpenContent = opened ?? { type: "json", content: doc.content };
  saveNow();
  popover.hide();
  editor?.destroy();
  // Clears the plain-HTML welcome page that index.html shows until the editor is ready.
  ui.editorHost.replaceChildren();
  current = doc;
  store.setLastOpened(doc.id);
  editor = createEditor({
    element: ui.editorHost,
    content: source.content,
    contentType: source.type,
    focus,
    getModels: activeModels,
    getTinyNext: activeTinyNext,
    onFixClick: (fix, anchor) => popover.show(fix, anchor),
    onUpdate: () => {
      renderMeta();
      setSaveStatus("Saving…", "busy");
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(saveNow, SAVE_DELAY_MS);
    },
  });
  renderMeta();
  if (source.type === "markdown") saveNow();
  renderPages();
  if (isDrawer()) setSidebar(false);
}

const openWelcome = () =>
  open(store.create({ type: "doc" }, WELCOME_TITLE), { type: "markdown", content: WELCOME_MARKDOWN });
const openNew = () => {
  const doc = store.create({ type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] }, "Untitled");
  open(doc, { type: "json", content: doc.content }, "end");
};

/** Opens the most recent page, or a fresh one when there are none left. */
function openMostRecent(): void {
  const next = store.list()[0];
  const doc = next ? store.load(next.id) : null;
  if (doc) open(doc);
  else openNew();
}

/**
 * Pages saved before the editor's last line became a paragraph end with an empty heading. It's dropped on opening, and
 * the editor adds the paragraph in its place.
 */
function withoutEmptyLastHeading(doc: DocRecord): DocRecord {
  const blocks = doc.content.content ?? [];
  const last = blocks.at(-1);
  if (blocks.length < 2 || last?.type !== "heading" || last.content?.length) return doc;
  return { ...doc, content: { ...doc.content, content: blocks.slice(0, -1) } };
}

function openInitial(): void {
  const lastId = store.lastOpened();
  const last = lastId ? store.load(lastId) : null;
  if (last) open(last);
  else if (store.list().length > 0) openMostRecent();
  else openWelcome();
}

// ---- Sidebar -----------------------------------------------------------------

const DRAWER_QUERY = matchMedia("(max-width: 899px)");
const isDrawer = (): boolean => DRAWER_QUERY.matches;

function deletePage(summary: DocSummary): void {
  if (!confirm(`Delete “${summary.title}”? This can’t be undone.`)) return;
  const wasCurrent = summary.id === current?.id;
  store.remove(summary.id);
  if (!wasCurrent) return renderPages();
  current = null;
  openMostRecent();
}

/** Opens the page a row stands for. Tapping the open page just closes the drawer on a phone. */
function openFromList(summary: DocSummary): void {
  if (summary.id === current?.id) {
    if (isDrawer()) setSidebar(false);
    return;
  }
  const doc = store.load(summary.id);
  if (doc) open(doc);
}

function renderPages(): void {
  renderPageList(ui.pages, {
    summaries: store.list(),
    currentId: current?.id,
    onOpen: openFromList,
    onDelete: deletePage,
  });
}

const closeMenu = setupMoreMenu({ getEditor: () => editor, titleOf });

const modelPanel = setupModelPanel((id, on) => {
  // Switching tinynext off also clears the suggestion on screen.
  if (id === "tinynext" && !on) editor?.view.dispatch(editor.state.tr.setMeta(suggestionsKey, { type: "clear" }));
});

function setSidebar(isOpen: boolean, remember = false): void {
  if (!isOpen) modelPanel.closeInfo();
  closeMenu();
  document.documentElement.dataset.sidebar = isOpen ? "open" : "closed";
  if (remember && !isDrawer()) settings.setSidebarOpen(isOpen);
}

const toggleSidebar = () => setSidebar(document.documentElement.dataset.sidebar !== "open", true);

ui.newPage.addEventListener("click", openNew);
ui.sidebarClose.addEventListener("click", () => setSidebar(false, true));
ui.sidebarOpen.addEventListener("click", () => setSidebar(true, true));
ui.sidebarOpenSpine.addEventListener("click", () => setSidebar(true, true));
ui.backdrop.addEventListener("click", () => setSidebar(false));
DRAWER_QUERY.addEventListener("change", () => setSidebar(!isDrawer() && settings.isSidebarOpen()));
document.addEventListener("keydown", (event) => {
  if (event.key === "\\" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    toggleSidebar();
  } else if (event.key === "Escape" && isDrawer() && document.documentElement.dataset.sidebar === "open") {
    setSidebar(false);
  }
});

// ---- Models ------------------------------------------------------------------

/** Exposed for latency checks: milliseconds per tinynext suggestion, measured in its worker. */
declare global {
  interface Window {
    offlinePageDebug?: { suggestionTimings: number[] };
  }
}

// Absolute, because the worker resolves relative URLs against its own script in assets/, not the page.
const TINYNEXT_URL = new URL(`${import.meta.env.BASE_URL}models/tinynext/`, location.href).href;

async function loadTinyNext(): Promise<TinyNextClient> {
  const client = new TinyNextClient();
  await client.load(TINYNEXT_URL);
  return client;
}

/**
 * The models load once the offline cache is filled, so they're read from that cache instead of being downloaded a
 * second time alongside the service worker.
 */
async function startModels(offlineCache: Promise<boolean>): Promise<void> {
  const worksOffline = await offlineCache;
  try {
    // Loaded on demand, so the ONNX runtime isn't part of the script the first paint waits for.
    const { loadModels } = await import("./models");
    const [loaded, client] = await Promise.all([loadModels(), loadTinyNext()]);
    models = loaded;
    tinynext = client;
    window.offlinePageDebug = { suggestionTimings: client.timings };
    modelPanel.setStatus({ state: "ready", worksOffline });
  } catch (error) {
    modelPanel.setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
    console.error("Loading models failed", error);
  }
}

// ---- Startup -----------------------------------------------------------------

setSidebar(!isDrawer() && settings.isSidebarOpen());
// In its own task, so starting the editor doesn't add to the time the script itself takes to run. On a first visit
// index.html already shows the welcome page, so the editor waits until that has been drawn once.
if ("returning" in document.documentElement.dataset) setTimeout(openInitial);
else requestAnimationFrame(() => setTimeout(openInitial));
// Animations start once the first frame is drawn, so the sidebar doesn't slide in on load.
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove("preload")));
window.addEventListener("pagehide", saveNow);
void startModels(startOfflineCache());
