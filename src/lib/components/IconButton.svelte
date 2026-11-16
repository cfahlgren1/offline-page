<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  /** A small square button with one icon, as used along the sidebar and the spine. */
  let { children, class: extra, ...rest }: HTMLButtonAttributes = $props();
</script>

<button
  type="button"
  class={[
    "inline-flex size-7 flex-none items-center justify-center rounded-[7px] text-side-sub hover:bg-side-hover hover:text-side-ink pointer-coarse:size-10",
    extra,
  ]}
  {...rest}
>
  {@render children?.()}
</button>
