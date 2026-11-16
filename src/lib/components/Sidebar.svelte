<script lang="ts">
  import { MODELS, type ModelId } from "#lib/brand";
  import { menu, toggleMenu } from "#lib/menu.svelte";
  import { clickModelInfo, hoverModelInfo, leaveModelInfo, modelInfo, type ModelStatus } from "#lib/modelInfo.svelte";
  import { setSidebar } from "#lib/sidebar.svelte";
  import type { DocSummary } from "#lib/store";
  import { when } from "#lib/when";
  import Icon from "./Icon.svelte";
  import IconButton from "./IconButton.svelte";
  import Leader from "./Leader.svelte";

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
  const CAPTION = "font-sans text-[10.5px] font-semibold tracking-[0.14em] text-side-faint uppercase";

  let rows: HTMLElement | undefined = $state();
</script>

<!--
  The notebook's table of contents: serif titles, numbered, with dotted leaders out to the time. On a wide screen it
  sits beside the page with a curved edge, and hides down to the spine. On a narrow one it's a drawer.
-->
<aside
  id="sidebar"
  aria-label="Pages and models"
  class="fixed inset-y-0 left-0 z-30 flex w-[272px] flex-col rounded-r-[34px] bg-side px-[22px] pt-[22px] pb-4 font-serif text-side-ink shadow-side transition-[translate] duration-280 ease-sheet narrow:w-[min(300px,86vw)] narrow:pb-[calc(16px+env(safe-area-inset-bottom))] sidebar-closed:-translate-x-[calc(100%+40px)] preload:transition-none motion-reduce:transition-none"
>
  <div class="flex items-center justify-between">
    <span class="text-[22px] font-medium tracking-[-0.01em]">offlinepage<i class="text-side-sub">.app</i></span>
    <span class="ml-auto"></span>
    <IconButton
      aria-label="More"
      aria-haspopup="menu"
      aria-expanded={menu.open}
      onclick={(event) => toggleMenu(event.currentTarget)}
    >
      <Icon name="more" />
    </IconButton>
    <IconButton
      id="sidebar-close"
      aria-label="Hide the sidebar"
      title="Hide the sidebar (⌘\)"
      onclick={() => setSidebar(false, true)}
    >
      <Icon name="panel" />
    </IconButton>
  </div>
  <p class="mt-0.5 text-sm text-side-sub italic">a notebook that works offline</p>

  <p class={["mt-7", CAPTION]}>Contents</p>
  <ol
    id="pages"
    class="-mx-2 mt-2 min-h-0 overflow-y-auto overscroll-contain [scrollbar-color:var(--leader)_transparent] [scrollbar-width:thin]"
  >
    {#each pages as summary, index (summary.id)}
      <li class="group/page relative">
        <button
          type="button"
          class="group/row relative flex w-full items-start gap-2 rounded-[10px] px-2 py-1.5 text-left hover:bg-side-hover"
          aria-current={summary.id === currentId ? "page" : undefined}
          onclick={() => onOpen(summary)}
        >
          <span
            class="w-[18px] flex-none pt-[5px] font-sans text-[11px] font-medium text-side-faint group-aria-[current=page]/row:text-context"
            >{String(index + 1).padStart(2, "0")}</span
          >
          <span class="min-w-0 flex-1">
            <span class="flex min-w-0 items-baseline gap-2">
              <span class="min-w-0 truncate text-base group-aria-[current=page]/row:italic" data-page-title
                >{summary.title}</span
              >
              <Leader />
              <span class="flex-none font-sans text-[11px] font-medium text-side-faint group-hover/page:invisible"
                >{when(summary.updatedAt)}</span
              >
            </span>
            {#if summary.preview}
              <span class="mt-px block truncate text-[13px] text-side-sub italic">{summary.preview}</span>
            {/if}
          </span>
        </button>
        <button
          type="button"
          class="absolute top-1.5 right-1.5 hidden rounded-md bg-side px-1.5 font-sans text-[11px] text-side-faint group-hover/page:block hover:text-error focus-visible:block"
          aria-label="Delete {summary.title}"
          onclick={() => onDelete(summary)}
        >
          Delete
        </button>
      </li>
    {/each}
  </ol>
  <button
    id="new-page"
    type="button"
    class="mt-2.5 self-start text-[15px] text-side-sub italic hover:text-side-ink pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
    onclick={onNew}>+ a new page</button
  >

  <div class="min-h-6 flex-1"></div>

  <div class="flex flex-col gap-0.5 border-t border-side-line pt-3" role="group" aria-label="On-device models">
    <div class="flex items-baseline gap-2">
      <p class={CAPTION}>On this device</p>
      <span
        id="models-status"
        class="min-w-0 flex-1 truncate font-sans text-[11px] text-side-faint data-error:text-error"
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
          class="flex min-h-7 w-full items-baseline gap-2 pointer-coarse:min-h-11 pointer-coarse:items-center"
          data-on={modelOn[id] ? "" : undefined}
          onpointerenter={(event) => rows && hoverModelInfo(event, id, rows)}
          onpointerleave={leaveModelInfo}
        >
          <!-- A model that's off fades back, so the two states differ by more than one word. -->
          <button
            id="info-{id}"
            type="button"
            class={[
              "flex-none font-sans text-[13px] font-[650] tracking-[-0.01em] pointer-coarse:py-2.5",
              !modelOn[id] && "opacity-45",
            ]}
            aria-label="About {id}"
            aria-haspopup="dialog"
            aria-expanded={modelInfo.id === id}
            onclick={() => rows && clickModelInfo(id, rows)}
          >
            tiny<i class={["font-serif text-[1.1em] font-medium", id === "tinyfix" ? "text-context" : "opacity-55"]}
              >{id.slice(4)}</i
            >
          </button>
          <span class={["flex min-w-3 flex-1", !modelOn[id] && "opacity-45"]}><Leader /></span>
          <!-- The word at the end of the row is the switch: ON or OFF, and a click flips it. -->
          <button
            id="toggle-{id}"
            type="button"
            role="switch"
            class={[
              "-my-1 -mr-1.5 flex-none rounded-md px-1.5 py-1 font-sans text-[10px] font-semibold tracking-[0.12em] text-side-sub hover:bg-side-hover hover:text-side-ink pointer-coarse:-my-2 pointer-coarse:-mr-2.5 pointer-coarse:min-w-11 pointer-coarse:px-2.5 pointer-coarse:py-3 pointer-coarse:text-[11px]",
              !modelOn[id] && "opacity-45",
            ]}
            aria-checked={modelOn[id]}
            aria-label={id}
            title="Turn {MODELS[id].name} {modelOn[id] ? 'off' : 'on'}"
            onclick={() => onToggle(id)}>{modelOn[id] ? "ON" : "OFF"}</button
          >
        </div>
      {/each}
    </div>
  </div>
  <div class="pt-2.5 font-sans text-[11.5px] text-side-faint">
    <a class="hover:text-side-ink" href="https://huggingface.co/paperweight" target="_blank" rel="noopener"
      >🤗 Hugging Face ↗</a
    >
  </div>
</aside>
