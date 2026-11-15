import { Editor, type Content } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { Autocorrect, type AppliedFix } from "./extensions/autocorrect";
import { SlashMenu } from "./extensions/slashMenu";
import { Suggestions } from "./extensions/suggestions";
import type { Models } from "./models";
import type { CapitalRules } from "./tinyfix/capitals";
import type { TinyNextClient } from "./tinynext/client";

/** Every page starts with a heading, which is its title. */
const TitledDocument = Document.extend({ content: "heading block*" });

export interface EditorSetup {
  element: HTMLElement;
  content: Content;
  contentType: "json" | "markdown";
  /** Where the cursor starts: the top of the page, or the end of it. */
  focus: "start" | "end";
  getModels: () => Models | null;
  getTinyNext: () => TinyNextClient | null;
  onFixClick: (fix: AppliedFix, element: HTMLElement) => void;
  getCapitals: () => CapitalRules | null;
  onCapitalUndone: (fix: AppliedFix) => void;
  onUpdate: (editor: Editor) => void;
}

export function createEditor(setup: EditorSetup): Editor {
  const editor = new Editor({
    element: setup.element,
    content: setup.content,
    contentType: setup.contentType,
    autofocus: setup.focus,
    editorProps: { attributes: { class: "prose", spellcheck: "false", "aria-label": "Page" } },
    extensions: [
      // The empty line the editor keeps at the end of a page is a paragraph. Left to itself it would copy the first
      // block, which is the title. A page that ends in a heading gets no extra line, so Enter in a new page's title
      // starts the first paragraph instead of skipping past one.
      StarterKit.configure({ document: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false }, trailingNode: { node: "paragraph", notAfter: ["heading"] } }),
      TitledDocument,
      Placeholder.configure({
        placeholder: ({ pos }) => (pos === 0 ? "Untitled" : "Write, or press / for blocks"),
      }),
      Markdown,
      Autocorrect.configure({
        getModels: setup.getModels,
        onFixClick: setup.onFixClick,
        getCapitals: setup.getCapitals,
        onCapitalUndone: setup.onCapitalUndone,
      }),
      Suggestions.configure({ getTinyNext: setup.getTinyNext }),
      SlashMenu,
    ],
    onUpdate: ({ editor }) => setup.onUpdate(editor),
  });
  // Tiptap applies autofocus on a timer, so a key pressed right after opening a page would be lost. The selection is
  // already where autofocus puts it, so focusing now is enough.
  editor.view.focus();
  return editor;
}
