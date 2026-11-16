<script lang="ts">
  import { MODELS, type ModelId } from "#lib/brand";
  import { menu, toggleMenu } from "#lib/menu.svelte";
  import { clickModelInfo, hoverModelInfo, leaveModelInfo, modelInfo, type ModelStatus } from "#lib/modelInfo.svelte";
  import { setSidebar } from "#lib/sidebar.svelte";
  import type { DocSummary } from "#lib/store";
  import { when } from "#lib/when";

  interface Props {
    pages: readonly DocSummary[];
    /** The page that's open, which the list marks. */
    currentId: string | undefined;
    modelOn: Record<ModelId, boolean>;
    status: ModelStatus;
    onOpen: (summary: DocSummary) => void;
    onDelete: (summary: DocSummary) => void;
    onNew: () => void;
    onToggle: (id: ModelId) => void;
  }

  let { pages, currentId, modelOn, status, onOpen, onDelete, onNew, onToggle }: Props = $props();

  const MODEL_IDS = Object.keys(MODELS) as ModelId[];
  /** The sidebar only says something while the models load or when they fail. Once they're ready it stays quiet. */
  const STATUS_TEXT = { loading: "Loading…", ready: "", error: "Couldn’t load" };

  let rows: HTMLElement | undefined = $state();
</script>

<aside id="sidebar" class="sidebar" aria-label="Pages and models">
  <div class="flex items-center justify-between">
    <span class="side-brand">offlinepage<i>.app</i></span>
    <span class="ml-auto"></span>
    <button
      class="side-icon more-button"
      type="button"
      aria-label="More"
      aria-haspopup="menu"
      aria-expanded={menu.open}
      onclick={(event) => toggleMenu(event.currentTarget)}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="3.5" cy="8" r="1.1" />
        <circle cx="8" cy="8" r="1.1" />
        <circle cx="12.5" cy="8" r="1.1" />
      </svg>
    </button>
    <button
      id="sidebar-close"
      class="side-icon"
      type="button"
      aria-label="Hide the sidebar"
      title="Hide the sidebar (⌘\)"
      onclick={() => setSidebar(false, true)}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2.5" width="12" height="11" rx="2.5" />
        <path d="M6.5 2.5v11" />
      </svg>
    </button>
  </div>
  <p class="side-tagline">a notebook that works offline</p>

  <p class="side-caption">Contents</p>
  <ol id="pages" class="pages">
    {#each pages as summary, index (summary.id)}
      <li class="relative">
        <button
          type="button"
          class="page-row"
          aria-current={summary.id === currentId ? "page" : undefined}
          onclick={() => onOpen(summary)}
        >
          <span class="page-n">{String(index + 1).padStart(2, "0")}</span>
          <span class="min-w-0 flex-1">
            <span class="page-line">
              <span class="page-title">{summary.title}</span>
              <span class="leader"></span>
              <span class="page-when">{when(summary.updatedAt)}</span>
            </span>
            {#if summary.preview}<span class="page-preview">{summary.preview}</span>{/if}
          </span>
        </button>
        <button type="button" class="page-delete" aria-label="Delete {summary.title}" onclick={() => onDelete(summary)}>
          Delete
        </button>
      </li>
    {/each}
  </ol>
  <button id="new-page" class="new-page" type="button" onclick={onNew}>+ a new page</button>

  <div class="min-h-6 flex-1"></div>

  <div class="models" role="group" aria-label="On-device models">
    <div class="flex items-baseline gap-2">
      <p class="side-caption mt-0">On this device</p>
      <span
        id="models-status"
        class="min-w-0 flex-1 truncate font-sans text-[11px] text-side-faint data-[error]:text-error"
        title={status.state === "error" ? `Writing and saving still work. ${status.message}` : ""}
        data-ready={status.state === "ready" ? "" : undefined}
        data-error={status.state === "error" ? "" : undefined}>{STATUS_TEXT[status.state]}</span
      >
    </div>
    <div bind:this={rows}>
      {#each MODEL_IDS as id (id)}
        <!-- svelte-ignore a11y_no_static_element_interactions: the hover only previews what the name button opens -->
        <div
          id="model-{id}"
          class="model"
          data-on={modelOn[id] ? "" : undefined}
          onpointerenter={(event) => rows && hoverModelInfo(event, id, rows)}
          onpointerleave={leaveModelInfo}
        >
          <button
            id="info-{id}"
            class="model-name"
            type="button"
            aria-label="About {id}"
            aria-haspopup="dialog"
            aria-expanded={modelInfo.id === id}
            onclick={() => rows && clickModelInfo(id, rows)}
          >
            {#if id === "tinyfix"}tiny<i class="text-context">fix</i>{:else}tiny<i class="opacity-55">next</i>{/if}
          </button>
          <span class="leader"></span>
          <button
            id="toggle-{id}"
            class="model-state"
            type="button"
            role="switch"
            aria-checked={modelOn[id]}
            aria-label={id}
            title="Turn {MODELS[id].name} {modelOn[id] ? 'off' : 'on'}"
            onclick={() => onToggle(id)}
          ></button>
        </div>
      {/each}
    </div>
  </div>
  <div class="side-foot">
    <a class="hover:text-side-ink" href="https://huggingface.co/paperweight" target="_blank" rel="noopener"
      >🤗 Hugging Face ↗</a
    >
  </div>
</aside>
