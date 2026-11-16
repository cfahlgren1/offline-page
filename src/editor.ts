import { Editor, type Content, type JSONContent } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { Autocorrect, type AppliedFix } from "./extensions/autocorrect";
import { CodeHighlight } from "./extensions/codeHighlight";
import { SlashMenu } from "./extensions/slashMenu";
import { Suggestions } from "./extensions/suggestions";
import type { Tinyfix } from "tinyfix";
import type { TinyNextClient } from "./tinynext/client";

/** Every page starts with a heading, which is its title. */
const TitledDocument = Document.extend({ content: "heading block*" });

export interface EditorSetup {
  element: HTMLElement;
  content: Content;
  contentType: "json" | "markdown";
  /** Where the cursor starts: the top of the page, or the end of it. */
  focus: "start" | "end";
  getTinyfix: () => Tinyfix | null;
  getTinyNext: () => TinyNextClient | null;
  onFixClick: (fix: AppliedFix, element: HTMLElement) => void;
  onUpdate: (editor: Editor) => void;
}

type Schema = Editor["schema"];

/**
 * Drops blocks and marks this editor doesn't know. A page saved by a newer version could hold some, and a single
 * unknown one would otherwise make the editor open the page blank, which the next save would make permanent.
 */
function knownOnly(node: JSONContent, schema: Schema): JSONContent | null {
  if (node.type && !schema.nodes[node.type]) return null;
  const marks = node.marks?.filter((mark) => schema.marks[mark.type]);
  const content = node.content?.flatMap((child) => knownOnly(child, schema) ?? []);
  return { ...node, ...(marks && { marks }), ...(content && { content }) };
}

const hasBlocks = (content: Content): content is JSONContent =>
  typeof content === "object" && content !== null && !Array.isArray(content) && !!content.content?.length;

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
      StarterKit.configure({
        document: false,
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
        trailingNode: { node: "paragraph", notAfter: ["heading"] },
      }),
      TitledDocument,
      Placeholder.configure({
        placeholder: ({ pos }) => (pos === 0 ? "Untitled" : "Write, or press / for blocks"),
      }),
      Markdown,
      Autocorrect.configure({ getTinyfix: setup.getTinyfix, onFixClick: setup.onFixClick }),
      Suggestions.configure({ getTinyNext: setup.getTinyNext }),
      SlashMenu,
      CodeHighlight,
    ],
    onUpdate: ({ editor: updated }) => setup.onUpdate(updated),
  });
  // Tiptap opens a page it can't read as an empty one. If that happened, the parts it does know are put back.
  if (setup.contentType === "json" && hasBlocks(setup.content) && editor.isEmpty) {
    const readable = knownOnly(setup.content, editor.schema);
    if (readable) editor.commands.setContent(readable, { emitUpdate: false });
  }
  // Tiptap applies autofocus on a timer, so a key pressed right after opening a page would be lost. The selection is
  // already where autofocus puts it, so focusing now is enough.
  editor.view.focus();
  return editor;
}
