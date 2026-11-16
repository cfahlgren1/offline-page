<script lang="ts">
  import type { Editor, JSONContent } from "@tiptap/core";
  import { onMount, tick } from "svelte";
  import type { Tinyfix } from "tinyfix";
  import type { ModelId } from "#lib/brand";
  import ModelInfoCard from "#lib/components/ModelInfoCard.svelte";
  import MoreMenu from "#lib/components/MoreMenu.svelte";
  import Sidebar from "#lib/components/Sidebar.svelte";
  import Spine from "#lib/components/Spine.svelte";
  import { createEditor } from "#lib/editor";
  import { revertFix } from "#lib/extensions/autocorrect";
  import { suggestionsKey } from "#lib/extensions/suggestions";
  import { FixPopover } from "#lib/fixPopover";
  import type { ModelStatus } from "#lib/modelInfo.svelte";
  import { startOfflineCache } from "#lib/offlineCache";
  import { settings } from "#lib/settings";
  import { isDrawer, setSidebar, watchSidebar } from "#lib/sidebar.svelte";
  import { store, type DocRecord, type DocSummary } from "#lib/store";
  import { readTheme } from "#lib/theme.svelte";
  import { TinyNextClient } from "#lib/tinynext/client";
  import { WELCOME_MARKDOWN, WELCOME_TITLE } from "#lib/welcome";

  let { data } = $props();

  const SAVE_DELAY_MS = 400;

  type OpenContent = { type: "json"; content: JSONContent } | { type: "markdown"; content: string };
  type SaveState = "saved" | "busy" | "error";

  // What the page shows.
  let pages = $state<DocSummary[]>([]);
  let currentId = $state<string | undefined>();
  let meta = $state("");
  let saveText = $state("Saved");
  let saveState = $state<SaveState>("saved");
  let modelOn = $state<Record<ModelId, boolean>>({ tinyfix: true, tinynext: true });
  let status = $state<ModelStatus>({ state: "loading" });
  /** False until the editor takes over from the welcome page that was built into the HTML. */
  let started = $state(false);
  let host: HTMLElement | undefined = $state();

  // What the app holds on to. None of it is drawn directly, so it isn't reactive state.
  let tinyfix: Tinyfix | null = null;
  let tinynext: TinyNextClient | null = null;
  let editor: Editor | null = null;
  let current: DocRecord | null = null;
  let saveTimer: number | undefined;
  let popover: FixPopover | null = null;

  // ---- Saving ----------------------------------------------------------------

  const titleOf = (target: Editor): string => target.state.doc.firstChild?.textContent.trim() || "Untitled";

  function countWords(target: Editor): number {
    const { doc } = target.state;
    return doc.textBetween(0, doc.content.size, " ", " ").match(/\S+/g)?.length ?? 0;
  }

  /** The bar shows only a dot once a page is saved; words appear while saving and when saving fails. */
  function setSaveStatus(text: string, state: SaveState): void {
    saveText = text;
    saveState = state;
  }

  const listPages = (): void => {
    pages = store.list();
  };

  function saveNow(): void {
    window.clearTimeout(saveTimer);
    if (!editor || !current) return;
    current = { ...current, title: titleOf(editor), content: editor.getJSON(), updatedAt: Date.now() };
    try {
      store.save(current);
      setSaveStatus("Saved", "saved");
      listPages();
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
    meta = `${date} · ${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;
    document.title = `${titleOf(editor)} · offlinepage.app`;
  }

  // ---- Pages -----------------------------------------------------------------

  /** Model output is only used while its switch is on. */
  const activeTinyfix = (): Tinyfix | null => (modelOn.tinyfix ? tinyfix : null);
  const activeTinyNext = (): TinyNextClient | null => (modelOn.tinynext ? tinynext : null);

  /**
   * Pages saved before the editor's last line became a paragraph end with an empty heading. It's dropped on opening,
   * and the editor adds the paragraph in its place.
   */
  function withoutEmptyLastHeading(doc: DocRecord): DocRecord {
    const blocks = doc.content.content ?? [];
    const last = blocks.at(-1);
    if (blocks.length < 2 || last?.type !== "heading" || last.content?.length) return doc;
    return { ...doc, content: { ...doc.content, content: blocks.slice(0, -1) } };
  }

  /** New pages start with the cursor in the title; existing ones open at the top. */
  function open(saved: DocRecord, opened?: OpenContent, focus: "start" | "end" = "start"): void {
    if (!host) return;
    const doc = withoutEmptyLastHeading(saved);
    const source: OpenContent = opened ?? { type: "json", content: doc.content };
    saveNow();
    popover?.hide();
    editor?.destroy();
    current = doc;
    currentId = doc.id;
    store.setLastOpened(doc.id);
    editor = createEditor({
      element: host,
      content: source.content,
      contentType: source.type,
      focus,
      getTinyfix: activeTinyfix,
      getTinyNext: activeTinyNext,
      onFixClick: (fix, anchor) => popover?.show(fix, anchor),
      onUpdate: () => {
        renderMeta();
        setSaveStatus("Saving…", "busy");
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(saveNow, SAVE_DELAY_MS);
      },
    });
    renderMeta();
    if (source.type === "markdown") saveNow();
    listPages();
    if (isDrawer()) setSidebar(false);
  }

  const openWelcome = () =>
    open(store.create({ type: "doc" }, WELCOME_TITLE), { type: "markdown", content: WELCOME_MARKDOWN });

  function openNew(): void {
    const doc = store.create({ type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] }, "Untitled");
    open(doc, { type: "json", content: doc.content }, "end");
  }

  /** Opens the most recent page, or a fresh one when there are none left. */
  function openMostRecent(): void {
    const next = store.list()[0];
    const doc = next ? store.load(next.id) : null;
    if (doc) open(doc);
    else openNew();
  }

  /** The editor takes over from the welcome page in the HTML: that page goes, then the editor is put in its place. */
  async function openInitial(): Promise<void> {
    started = true;
    await tick();
    const lastId = store.lastOpened();
    const last = lastId ? store.load(lastId) : null;
    if (last) open(last);
    else if (store.list().length > 0) openMostRecent();
    else openWelcome();
  }

  function deletePage(summary: DocSummary): void {
    if (!confirm(`Delete “${summary.title}”? This can’t be undone.`)) return;
    const wasCurrent = summary.id === current?.id;
    store.remove(summary.id);
    if (!wasCurrent) return listPages();
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

  // ---- Models ----------------------------------------------------------------

  function toggleModel(id: ModelId): void {
    modelOn[id] = !modelOn[id];
    settings.setModelOn(id, modelOn[id]);
    // Switching tinynext off also clears the suggestion on screen.
    if (id === "tinynext" && !modelOn[id]) {
      editor?.view.dispatch(editor.state.tr.setMeta(suggestionsKey, { type: "clear" }));
    }
  }

  async function loadTinyNext(): Promise<TinyNextClient> {
    const client = new TinyNextClient();
    // Absolute, because the worker resolves relative URLs against its own script, not the page.
    await client.load(new URL("/models/tinynext/", location.href).href);
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
      const { loadTinyfix } = await import("tinyfix");
      // The model and word lists are served by this site, so they're in the offline cache with everything else.
      const [loaded, client] = await Promise.all([loadTinyfix({ baseUrl: "/models/" }), loadTinyNext()]);
      tinyfix = loaded;
      tinynext = client;
      window.offlinePageDebug = { suggestionTimings: client.timings };
      status = { state: "ready", worksOffline };
    } catch (error) {
      status = { state: "error", message: error instanceof Error ? error.message : String(error) };
      console.error("Loading models failed", error);
    }
  }

  // ---- Startup ---------------------------------------------------------------

  onMount(() => {
    popover = new FixPopover((fix) => {
      if (!editor) return;
      revertFix(editor.view, tinyfix, fix.id);
      editor.commands.focus();
    });
    modelOn = { tinyfix: settings.isModelOn("tinyfix"), tinynext: settings.isModelOn("tinynext") };
    readTheme();
    setSidebar(!isDrawer() && settings.isSidebarOpen());
    const stopWatching = watchSidebar();
    // In its own task, so starting the editor doesn't add to the time the script itself takes to run. On a first
    // visit the HTML already shows the welcome page, so the editor waits until that has been drawn once.
    if ("returning" in document.documentElement.dataset) setTimeout(openInitial);
    else requestAnimationFrame(() => setTimeout(openInitial));
    // Animations start once the first frame is drawn, so the sidebar doesn't slide in on load.
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove("preload")));
    window.addEventListener("pagehide", saveNow);
    void startModels(startOfflineCache());
    return () => {
      stopWatching();
      window.removeEventListener("pagehide", saveNow);
    };
  });
</script>

<Sidebar
  {pages}
  {currentId}
  {modelOn}
  {status}
  onOpen={openFromList}
  onDelete={deletePage}
  onNew={openNew}
  onToggle={toggleModel}
/>
<Spine {modelOn} />
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions: Escape closes the drawer too -->
<div id="backdrop" class="backdrop" onclick={() => setSidebar(false)}></div>
<ModelInfoCard {status} />
<MoreMenu getMarkdown={() => editor?.getMarkdown() ?? null} getTitle={() => (editor ? titleOf(editor) : "Untitled")} />

<div id="shell" class="shell flex min-h-dvh flex-col">
  <header class="flex items-center px-4 pt-4 min-[900px]:hidden">
    <button
      id="sidebar-open"
      class="side-icon"
      type="button"
      aria-label="Show pages"
      onclick={() => setSidebar(true, true)}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2.5" width="12" height="11" rx="2.5" />
        <path d="M6.5 2.5v11" />
      </svg>
    </button>
  </header>

  <main class="mx-auto w-full max-w-[712px] flex-1 px-4 pt-6 pb-30 sm:pt-[96px]">
    <div class="mb-[22px] flex min-h-5 items-center gap-2 text-[13px] tracking-[0.01em] text-faint">
      <span id="meta">{meta}</span>
      <span
        id="save-chip"
        class="group inline-flex items-center gap-1.5 data-[error]:text-error"
        title={saveState === "saved" ? "Saved on this device" : saveText}
        data-busy={saveState === "busy" ? "" : undefined}
        data-error={saveState === "error" ? "" : undefined}
      >
        <i class="size-1.5 flex-none rounded-full bg-ok group-data-[busy]:bg-faint group-data-[error]:bg-error"
        ></i><span id="save-status" class="hidden group-data-[busy]:inline group-data-[error]:inline">{saveText}</span>
      </span>
    </div>
    <div id="editor">
      {#if !started}
        <!-- The welcome page as plain HTML, for a first visit and for search engines. Its text is ours, made at build time. -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <div id="welcome-static" class="tiptap ProseMirror prose">{@html data.welcomeHtml}</div>
      {/if}
      <div bind:this={host}></div>
    </div>
  </main>
</div>
