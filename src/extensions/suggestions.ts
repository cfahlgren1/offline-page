import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Models } from "../models";

interface Ghost {
  /** The text the model continued from: the block up to the cursor. */
  context: string;
  text: string;
  pos: number;
}

type Meta = { type: "show"; ghost: Ghost } | { type: "clear" };

export interface SuggestionsOptions {
  getModels: () => Models | null;
}

/** While the slash menu is open, the text before the cursor is a command, not writing. */
const SLASH_COMMAND = /(^|\s)\/\S*$/;

export const suggestionsKey = new PluginKey<Ghost | null>("suggestions");

/** The block text before the cursor, when the cursor sits at the end of a plain textblock. Suggestions only go there. */
function contextAtCursor(state: EditorState): { context: string; pos: number } | null {
  const { $head, empty } = state.selection;
  if (!empty || !$head.parent.isTextblock || $head.parent.type.spec.code) return null;
  if ($head.parentOffset !== $head.parent.content.size) return null;
  const context = $head.parent.textBetween(0, $head.parentOffset, undefined, "\n");
  if (!context.trim() || SLASH_COMMAND.test(context)) return null;
  return { context, pos: $head.pos };
}

function ghostElement(text: string): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "ghost";
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.textContent = text;
  const key = document.createElement("kbd");
  key.className = "ghost-key";
  key.textContent = "tab";
  wrapper.append(key);
  return wrapper;
}

/** Gray suggested text from the autocomplete model at the end of the current block. Tab accepts it. */
export const Suggestions = Extension.create<SuggestionsOptions>({
  name: "suggestions",
  priority: 1000,

  addOptions() {
    return { getModels: () => null };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const ghost = suggestionsKey.getState(this.editor.state);
        if (!ghost?.text) return false;
        this.editor.view.dispatch(this.editor.state.tr.insertText(ghost.text, ghost.pos));
        return true;
      },
      Escape: () => {
        if (!suggestionsKey.getState(this.editor.state)) return false;
        const meta: Meta = { type: "clear" };
        this.editor.view.dispatch(this.editor.state.tr.setMeta(suggestionsKey, meta));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    let request = 0;

    const ask = (view: EditorView): void => {
      const models = options.getModels();
      const at = contextAtCursor(view.state);
      const asked = ++request;
      if (!models || !at) return;
      const current = suggestionsKey.getState(view.state);
      if (current && current.context === at.context && current.pos === at.pos) return;
      models.autocomplete
        .suggest(at.context)
        .then((text) => {
          if (asked !== request || view.isDestroyed) return;
          const now = contextAtCursor(view.state);
          if (!now || now.context !== at.context || now.pos !== at.pos) return;
          const meta: Meta = text ? { type: "show", ghost: { ...at, text } } : { type: "clear" };
          view.dispatch(view.state.tr.setMeta(suggestionsKey, meta));
        })
        .catch((error: unknown) => console.error("Suggestion failed", error));
    };

    return [
      new Plugin<Ghost | null>({
        key: suggestionsKey,
        state: {
          init: () => null,
          apply(tr, ghost, _oldState, newState) {
            const meta = tr.getMeta(suggestionsKey) as Meta | undefined;
            if (meta) return meta.type === "show" ? meta.ghost : null;
            if (!ghost || (!tr.docChanged && !tr.selectionSet)) return ghost;
            // Typing what the suggestion already says keeps the rest of it on screen until the model answers.
            const at = contextAtCursor(newState);
            if (!at || !at.context.startsWith(ghost.context)) return null;
            const typed = at.context.slice(ghost.context.length);
            if (!typed || !ghost.text.startsWith(typed) || typed === ghost.text) return null;
            return { context: at.context, pos: at.pos, text: ghost.text.slice(typed.length) };
          },
        },
        props: {
          decorations(state) {
            const ghost = suggestionsKey.getState(state);
            if (!ghost?.text) return null;
            return DecorationSet.create(state.doc, [Decoration.widget(ghost.pos, () => ghostElement(ghost.text), { side: 1, key: `ghost-${ghost.text}` })]);
          },
        },
        view: () => ({
          update(view, previous) {
            if (view.state.doc.eq(previous.doc) && view.state.selection.eq(previous.selection)) return;
            ask(view);
          },
        }),
      }),
    ];
  },
});
