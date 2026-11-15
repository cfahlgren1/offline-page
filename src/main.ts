import type { Editor, JSONContent } from "@tiptap/core";
import { MODELS, hubUrl, type ModelId } from "./brand";
import { createEditor } from "./editor";
import { revertFix } from "./extensions/autocorrect";
import { suggestionsKey } from "./extensions/suggestions";
import { FixPopover } from "./fixPopover";
import type { Models } from "./models";
import { settings } from "./settings";
import { store, type DocRecord, type DocSummary } from "./store";
import { TinyNextClient } from "./tinynext/client";
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
  pages: element("pages"),
  newPage: element<HTMLButtonElement>("new-page"),
  sidebarClose: element<HTMLButtonElement>("sidebar-close"),
  sidebarOpen: element<HTMLButtonElement>("sidebar-open"),
  sidebarOpenSpine: element<HTMLButtonElement>("sidebar-open-spine"),
  backdrop: element("backdrop"),
  saveChip: element("save-chip"),
  moreMenu: element("more-menu"),
  saveStatus: element("save-status"),
  exportButton: element<HTMLButtonElement>("export"),
  copyButton: element<HTMLButtonElement>("copy"),
  themeButton: element<HTMLButtonElement>("theme"),
  meta: element("meta"),
  editorHost: element("editor"),
  modelsStatus: element("models-status"),
  modelsInfo: element("models-info"),
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
  const date = new Date(current.createdAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
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

const openWelcome = () => open(store.create({ type: "doc" }, WELCOME_TITLE), { type: "markdown", content: WELCOME_MARKDOWN });
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

/** Today's pages show the time; older ones the date. */
function when(timestamp: number): string {
  const date = new Date(timestamp);
  if (date.toDateString() === new Date().toDateString()) {
    // The time without AM/PM, which the sidebar has no room for: "9:41".
    const parts = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).formatToParts(date);
    return parts.filter((part) => part.type === "hour" || part.type === "minute" || (part.type === "literal" && part.value.trim())).map((part) => part.value).join("");
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function span(className: string, text = ""): HTMLSpanElement {
  const created = document.createElement("span");
  created.className = className;
  created.textContent = text;
  return created;
}

function deletePage(summary: DocSummary): void {
  if (!confirm(`Delete “${summary.title}”? This can’t be undone.`)) return;
  const wasCurrent = summary.id === current?.id;
  store.remove(summary.id);
  if (!wasCurrent) return renderPages();
  current = null;
  openMostRecent();
}

function pageItem(summary: DocSummary, index: number): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "relative";
  const row = document.createElement("button");
  row.type = "button";
  row.className = "page-row";
  if (summary.id === current?.id) row.setAttribute("aria-current", "page");
  const body = span("min-w-0 flex-1");
  const line = span("page-line");
  line.append(span("page-title", summary.title), span("leader"), span("page-when", when(summary.updatedAt)));
  body.append(line);
  if (summary.preview) body.append(span("page-preview", summary.preview));
  row.append(span("page-n", String(index + 1).padStart(2, "0")), body);
  row.addEventListener("click", () => {
    if (summary.id === current?.id) return isDrawer() ? setSidebar(false) : undefined;
    const doc = store.load(summary.id);
    if (doc) open(doc);
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "page-delete";
  remove.textContent = "Delete";
  remove.setAttribute("aria-label", `Delete ${summary.title}`);
  remove.addEventListener("click", () => deletePage(summary));
  item.append(row, remove);
  return item;
}

function renderPages(): void {
  ui.pages.replaceChildren(...store.list().map(pageItem));
}

function setSidebar(open: boolean, remember = false): void {
  if (!open) closeModelInfo();
  closeMenu();
  document.documentElement.dataset.sidebar = open ? "open" : "closed";
  if (remember && !isDrawer()) settings.setSidebarOpen(open);
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
  closeMenu();
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

function isDark(): boolean {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: Theme | null): void {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  ui.themeButton.textContent = isDark() ? "Light mode" : "Dark mode";
}

ui.themeButton.addEventListener("click", () => {
  const next: Theme = isDark() ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
  closeMenu();
});

// ---- The ⋯ menu ------------------------------------------------------------------

const moreButtons = [...document.querySelectorAll<HTMLButtonElement>(".more-button")];

const closeOnOutsideClick = (event: MouseEvent): void => {
  const target = event.target as Node;
  if (!ui.moreMenu.contains(target) && !moreButtons.some((button) => button.contains(target))) closeMenu();
};

function closeMenu(): void {
  ui.moreMenu.hidden = true;
  for (const button of moreButtons) button.setAttribute("aria-expanded", "false");
  document.removeEventListener("mousedown", closeOnOutsideClick);
}

function openMenu(from: HTMLButtonElement): void {
  const box = from.getBoundingClientRect();
  ui.moreMenu.style.top = `${box.bottom + 6}px`;
  ui.moreMenu.style.left = `${Math.max(8, box.left - 4)}px`;
  ui.moreMenu.hidden = false;
  from.setAttribute("aria-expanded", "true");
  document.addEventListener("mousedown", closeOnOutsideClick);
}

for (const button of moreButtons) {
  button.addEventListener("click", () => (ui.moreMenu.hidden ? openMenu(button) : closeMenu()));
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !ui.moreMenu.hidden) closeMenu();
});

// ---- Models and offline -------------------------------------------------------

const MODEL_IDS = Object.keys(MODELS) as ModelId[];
type ModelState = "loading" | "ready" | "error";
let modelState: ModelState = "loading";
let worksOffline = false;
let loadError = "";

/** The sidebar only says something while the models load or when they fail. Once they're ready it stays quiet. */
function renderStatus(): void {
  ui.modelsStatus.textContent = { loading: "Loading…", ready: "", error: "Couldn’t load" }[modelState];
  ui.modelsStatus.title = modelState === "error" ? `Writing and saving still work. ${loadError}` : "";
  ui.modelsStatus.toggleAttribute("data-ready", modelState === "ready");
  ui.modelsStatus.toggleAttribute("data-error", modelState === "error");
  if (openInfo) renderModelInfo(openInfo);
}

function modelInfoFooter(): string {
  if (modelState === "error") return "The models couldn’t load. Writing and saving still work.";
  if (modelState === "loading") return "Loading…";
  return worksOffline ? "Runs in this tab and is saved for offline use." : "Runs in this tab.";
}

/** The model whose info card is open, if any. */
let openInfo: ModelId | null = null;
const infoButton = (id: ModelId) => element<HTMLButtonElement>(`info-${id}`);

/** What a model does, in a sentence, with a link to it. All of the text comes from brand.ts. */
function renderModelInfo(id: ModelId): void {
  ui.modelsInfo.innerHTML = `<div class="flex items-baseline justify-between gap-3">
      <span><span class="info-name">${MODELS[id].name}</span> <span class="info-kind">${MODELS[id].role} · ${MODELS[id].size}</span></span>
      <a class="info-link" href="${hubUrl(id)}" target="_blank" rel="noopener">Model ↗</a>
    </div>
    <p class="info-text">${MODELS[id].caveat}</p>
    <p class="info-text text-faint">${modelInfoFooter()}</p>`;
}

const closeInfoOnOutsidePress = (event: PointerEvent): void => {
  const target = event.target as Node;
  if (!ui.modelsInfo.contains(target) && !MODEL_IDS.some((id) => infoButton(id).contains(target))) closeModelInfo();
};

function closeModelInfo(): void {
  if (!openInfo) return;
  infoButton(openInfo).setAttribute("aria-expanded", "false");
  openInfo = null;
  ui.modelsInfo.hidden = true;
  document.removeEventListener("pointerdown", closeInfoOnOutsidePress);
}

const INFO_CARD_MARGIN = 12;

/** Opens the card above the model's row, since the rows sit at the bottom of the sidebar, and keeps it on screen. */
function openModelInfo(id: ModelId): void {
  closeModelInfo();
  openInfo = id;
  renderModelInfo(id);
  ui.modelsInfo.hidden = false;
  const box = infoButton(id).getBoundingClientRect();
  const furthestLeft = window.innerWidth - ui.modelsInfo.offsetWidth - INFO_CARD_MARGIN;
  ui.modelsInfo.style.bottom = `${window.innerHeight - box.top + 6}px`;
  ui.modelsInfo.style.left = `${Math.max(INFO_CARD_MARGIN, Math.min(box.right - ui.modelsInfo.offsetWidth, furthestLeft))}px`;
  infoButton(id).setAttribute("aria-expanded", "true");
  document.addEventListener("pointerdown", closeInfoOnOutsidePress);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModelInfo();
});
// The card is placed against the window, so it's closed rather than left behind when the window changes.
window.addEventListener("resize", closeModelInfo);

function renderModelToggles(): void {
  for (const id of MODEL_IDS) {
    const on = settings.isModelOn(id);
    element(`model-${id}`).toggleAttribute("data-on", on);
    const toggle = element<HTMLButtonElement>(`toggle-${id}`);
    toggle.setAttribute("aria-checked", String(on));
    toggle.title = `Turn ${MODELS[id].name} ${on ? "off" : "on"}`;
    element(`spine-${id}`).toggleAttribute("data-on", on);
  }
}

for (const id of MODEL_IDS) {
  element<HTMLButtonElement>(`toggle-${id}`).addEventListener("click", () => {
    settings.setModelOn(id, !settings.isModelOn(id));
    renderModelToggles();
    if (id === "tinynext" && editor && !settings.isModelOn(id)) editor.view.dispatch(editor.state.tr.setMeta(suggestionsKey, { type: "clear" }));
  });
  infoButton(id).addEventListener("click", () => (openInfo === id ? closeModelInfo() : openModelInfo(id)));
}

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
async function startModels(offlineCache: Promise<void>): Promise<void> {
  await offlineCache;
  try {
    // Loaded on demand, so the ONNX runtime isn't part of the script the first paint waits for.
    const { loadModels } = await import("./models");
    const [loaded, client] = await Promise.all([loadModels(), loadTinyNext()]);
    models = loaded;
    tinynext = client;
    window.offlinePageDebug = { suggestionTimings: client.timings };
    modelState = "ready";
  } catch (error) {
    modelState = "error";
    loadError = error instanceof Error ? error.message : String(error);
    console.error("Loading models failed", error);
  }
  renderStatus();
}

/** Resolves when a service worker stops installing: it's active, or it failed and was dropped. */
function settled(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (worker.state === "activated" || worker.state === "redundant") resolve();
    };
    worker.addEventListener("statechange", check);
    check();
  });
}

/**
 * Resolves once the offline cache is filled, or couldn't be. Never rejects, so the models load either way. A page the
 * service worker already serves doesn't wait: its cache is filled, and offline the update check would only stall.
 */
async function startOfflineCache(): Promise<void> {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  if (navigator.serviceWorker.controller) {
    worksOffline = true;
    navigator.serviceWorker.register("./sw.js").catch((error: unknown) => console.error("Offline cache update failed", error));
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    const installing = registration.installing ?? registration.waiting;
    if (installing) await settled(installing);
    worksOffline = !!registration.active;
  } catch (error) {
    console.error("Offline cache failed to start", error);
  }
}

applyTheme(readTheme());
setSidebar(!isDrawer() && settings.isSidebarOpen());
renderModelToggles();
renderStatus();
// In its own task, so starting the editor doesn't add to the time the script itself takes to run. On a first visit
// index.html already shows the welcome page, so the editor waits until that has been drawn once.
if ("returning" in document.documentElement.dataset) setTimeout(openInitial);
else requestAnimationFrame(() => setTimeout(openInitial));
// Animations start once the first frame is drawn, so the sidebar doesn't slide in on load.
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove("preload")));
window.addEventListener("pagehide", saveNow);
void startModels(startOfflineCache());
