import { Editor, type Content } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { Autocorrect, type AppliedFix } from "./extensions/autocorrect";
import { SlashMenu } from "./extensions/slashMenu";
import { Suggestions } from "./extensions/suggestions";
import type { Autocompleter } from "./autocompleter";
import type { Models } from "./models";

/** Every page starts with a heading, which is its title. */
const TitledDocument = Document.extend({ content: "heading block*" });

export interface EditorSetup {
  element: HTMLElement;
  content: Content;
  contentType: "json" | "markdown";
  getModels: () => Models | null;
  getAutocompleter: () => Autocompleter | null;
  onFixClick: (fix: AppliedFix, element: HTMLElement) => void;
  onUpdate: (editor: Editor) => void;
}

export function createEditor(setup: EditorSetup): Editor {
  return new Editor({
    element: setup.element,
    content: setup.content,
    contentType: setup.contentType,
    autofocus: "end",
    editorProps: { attributes: { class: "prose", spellcheck: "false", "aria-label": "Page" } },
    extensions: [
      StarterKit.configure({ document: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      TitledDocument,
      Placeholder.configure({
        placeholder: ({ pos }) => (pos === 0 ? "Untitled" : "Write, or press / for blocks"),
      }),
      Markdown,
      Autocorrect.configure({ getModels: setup.getModels, onFixClick: setup.onFixClick }),
      Suggestions.configure({ getAutocompleter: setup.getAutocompleter }),
      SlashMenu,
    ],
    onUpdate: ({ editor }) => setup.onUpdate(editor),
  });
}
