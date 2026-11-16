<script lang="ts">
  import type { ModelId } from "#lib/brand";
  import { menu, toggleMenu } from "#lib/menu.svelte";
  import { setSidebar } from "#lib/sidebar.svelte";

  let { modelOn }: { modelOn: Record<ModelId, boolean> } = $props();
</script>

<!-- Shown instead of the sidebar when it's hidden on a wide screen: the closed notebook's spine. -->
<div id="spine" class="spine">
  <button
    id="sidebar-open-spine"
    class="side-icon"
    type="button"
    aria-label="Show the sidebar"
    title="Show the sidebar (⌘\)"
    onclick={() => setSidebar(true, true)}
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2.5" width="12" height="11" rx="2.5" />
      <path d="M6.5 2.5v11" />
    </svg>
  </button>
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
  <span class="spine-title">offlinepage<i>.app</i></span>
  <span class="spine-dots" aria-hidden="true">
    <i id="spine-tinyfix" data-on={modelOn.tinyfix ? "" : undefined}></i>
    <i id="spine-tinynext" data-on={modelOn.tinynext ? "" : undefined}></i>
  </span>
</div>
