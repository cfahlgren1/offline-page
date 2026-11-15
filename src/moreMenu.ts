import type { Editor } from "@tiptap/core";
import { element } from "./dom";
import { setupTheme } from "./theme";

export interface MoreMenuSetup {
  getEditor: () => Editor | null;
  /** The open page's title, for the exported file's name. */
  titleOf: (editor: Editor) => string;
}

const slug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";

/** Shows `text` on a button for a moment, then puts its label back. */
function flash(target: HTMLButtonElement, text: string): void {
  const label = target.dataset.label ?? target.textContent ?? "";
  target.dataset.label = label;
  target.textContent = text;
  window.setTimeout(() => (target.textContent = label), 1400);
}

/** The ⋯ menu: export, copy and the theme. Returns a function that closes it. */
export function setupMoreMenu(setup: MoreMenuSetup): () => void {
  const menu = element("more-menu");
  const exportButton = element<HTMLButtonElement>("export");
  const copyButton = element<HTMLButtonElement>("copy");
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(".more-button")];

  const closeOnOutsideClick = (event: MouseEvent): void => {
    const target = event.target as Node;
    if (!menu.contains(target) && !buttons.some((button) => button.contains(target))) close();
  };

  function close(): void {
    menu.hidden = true;
    for (const button of buttons) button.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", closeOnOutsideClick);
  }

  function open(from: HTMLButtonElement): void {
    const box = from.getBoundingClientRect();
    menu.style.top = `${box.bottom + 6}px`;
    menu.style.left = `${Math.max(8, box.left - 4)}px`;
    menu.hidden = false;
    from.setAttribute("aria-expanded", "true");
    document.addEventListener("mousedown", closeOnOutsideClick);
  }

  for (const button of buttons) {
    button.addEventListener("click", () => (menu.hidden ? open(button) : close()));
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) close();
  });

  exportButton.addEventListener("click", () => {
    const editor = setup.getEditor();
    if (!editor) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([editor.getMarkdown()], { type: "text/markdown" }));
    link.download = `${slug(setup.titleOf(editor))}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
    close();
  });

  copyButton.addEventListener("click", async () => {
    const editor = setup.getEditor();
    if (!editor) return;
    try {
      await navigator.clipboard.writeText(editor.getMarkdown());
      flash(copyButton, "Copied");
    } catch (error) {
      flash(copyButton, "Couldn’t copy");
      console.error("Copy failed", error);
    }
  });

  setupTheme(element<HTMLButtonElement>("theme"), close);
  return close;
}
