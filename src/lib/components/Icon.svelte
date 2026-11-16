<script lang="ts">
  /** The app's two icons: the sidebar panel and the ⋯ of the menu. */
  let { name }: { name: "panel" | "more" } = $props();
</script>

<svg viewBox="0 0 16 16" aria-hidden="true" class="size-4 fill-none stroke-current stroke-[1.5]">
  {#if name === "panel"}
    <rect x="2" y="2.5" width="12" height="11" rx="2.5" />
    <path d="M6.5 2.5v11" />
  {:else}
    <circle cx="3.5" cy="8" r="1.1" />
    <circle cx="8" cy="8" r="1.1" />
    <circle cx="12.5" cy="8" r="1.1" />
  {/if}
</svg>
