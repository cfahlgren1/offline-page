<script lang="ts">
  import type { ModelId } from "#lib/brand";
  import { menu, toggleMenu } from "#lib/menu.svelte";
  import { setSidebar } from "#lib/sidebar.svelte";
  import Icon from "./Icon.svelte";
  import IconButton from "./IconButton.svelte";

  let { modelOn }: { modelOn: Record<ModelId, boolean> } = $props();
</script>

<!-- Shown instead of the sidebar when it's hidden on a wide screen: the closed notebook's spine. -->
<div
  id="spine"
  class="fixed inset-y-0 left-0 z-20 flex w-11 flex-col items-center gap-[18px] border-r border-side-line bg-side py-[18px] text-side-ink transition-[translate] duration-280 ease-sheet narrow:hidden wide:sidebar-open:-translate-x-full preload:transition-none motion-reduce:transition-none"
>
  <IconButton
    id="sidebar-open-spine"
    aria-label="Show the sidebar"
    title="Show the sidebar (⌘\)"
    onclick={() => setSidebar(true, true)}
  >
    <Icon name="panel" />
  </IconButton>
  <IconButton
    aria-label="More"
    aria-haspopup="menu"
    aria-expanded={menu.open}
    onclick={(event) => toggleMenu(event.currentTarget)}
  >
    <Icon name="more" />
  </IconButton>
  <span class="rotate-180 font-serif text-lg font-medium tracking-[0.02em] [writing-mode:vertical-rl]"
    >offlinepage<i class="text-side-sub">.app</i></span
  >
  <span class="mt-auto flex flex-col gap-1.5" aria-hidden="true">
    <i id="spine-tinyfix" class={["block size-[7px] rounded-full", modelOn.tinyfix ? "bg-context" : "bg-leader"]}></i>
    <i id="spine-tinynext" class={["block size-[7px] rounded-full", modelOn.tinynext ? "bg-ink" : "bg-leader"]}></i>
  </span>
</div>
