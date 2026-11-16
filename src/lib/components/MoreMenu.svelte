<script lang="ts">
  import { closeMenu, menu } from "#lib/menu.svelte";
  import { theme, toggleTheme } from "#lib/theme.svelte";

  interface Props {
    /** The open page as Markdown, or null before the editor has started. */
    getMarkdown: () => string | null;
    /** The open page's title, for the exported file's name. */
    getTitle: () => string;
  }

  let { getMarkdown, getTitle }: Props = $props();

  const COPY = "Copy Markdown";
  const ITEM = "block w-full rounded-lg px-3 py-2 text-left text-[13px] text-ink hover:bg-hover";
  let copyLabel = $state(COPY);
  let element: HTMLElement | undefined = $state();

  const slug = (title: string): string =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "untitled";

  function exportPage(): void {
    const markdown = getMarkdown();
    if (markdown === null) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    link.download = `${slug(getTitle())}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
    closeMenu();
  }

  /** Shows whether the copy worked on the button for a moment, then puts its label back. */
  async function copyPage(): Promise<void> {
    const markdown = getMarkdown();
    if (markdown === null) return;
    try {
      await navigator.clipboard.writeText(markdown);
      copyLabel = "Copied";
    } catch (error) {
      copyLabel = "Couldn’t copy";
      console.error("Copy failed", error);
    }
    window.setTimeout(() => (copyLabel = COPY), 1400);
  }

  function closeOnOutsidePress(event: MouseEvent): void {
    if (!menu.open) return;
    const target = event.target as Element;
    if (!element?.contains(target) && !target.closest('[aria-haspopup="menu"]')) closeMenu();
  }
</script>

<svelte:document onmousedown={closeOnOutsidePress} onkeydown={(event) => event.key === "Escape" && closeMenu()} />

<!-- The ⋯ menu: export, copy and the theme. -->
<div
  id="more-menu"
  class="fixed z-40 w-48 rounded-xl bg-surface p-1 font-sans shadow-float"
  role="menu"
  hidden={!menu.open}
  style:top="{menu.top}px"
  style:left="{menu.left}px"
  bind:this={element}
>
  <button id="export" class={ITEM} type="button" role="menuitem" onclick={exportPage}>Export as Markdown</button>
  <button id="copy" class={ITEM} type="button" role="menuitem" onclick={copyPage}>{copyLabel}</button>
  <button
    id="theme"
    class={ITEM}
    type="button"
    role="menuitem"
    onclick={() => {
      toggleTheme();
      closeMenu();
    }}>{theme.dark ? "Light mode" : "Dark mode"}</button
  >
</div>
