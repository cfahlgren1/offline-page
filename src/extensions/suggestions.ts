import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { TinyNextClient } from "../tinynext/client";

interface Ghost {
  /** The text the model continued from: the document up to the cursor. */
  context: string;
  text: string;
  pos: number;
}

type Meta = { type: "show"; ghost: Ghost } | { type: "clear" };

export interface SuggestionsOptions {
  getTinyNext: () => TinyNextClient | null;
}

/** How much of the document around the cursor to hand the model. The model itself trims to what it can use. */
const BEFORE_POSITIONS = 2400;
const AFTER_POSITIONS = 600;

/**
 * Shorter suggestions are hidden: on real text most right guesses are 1-3 letter word endings,
 * which aren't worth a Tab and make the gray text flicker. See v2/metrics in the tinynext model repo.
 */
const MIN_SUGGESTION_CHARS = 4;

/** While the slash menu is open, the text before the cursor is a command, not writing. */
const SLASH_COMMAND = /(^|\s)\/\S*$/;

export const suggestionsKey = new PluginKey<Ghost | null>("suggestions");

/**
 * The document text before and after the cursor, when the cursor sits at the end of a plain textblock. Suggestions
 * only go there. `context` is the text before; `after` is what follows (the next blocks), which tinynext reads too.
 */
function contextAtCursor(state: EditorState): { context: string; after: string; pos: number } | null {
  const { $head, empty } = state.selection;
  if (!empty || !$head.parent.isTextblock || $head.parent.type.spec.code) return null;
  if ($head.parentOffset !== $head.parent.content.size) return null;
  const block = $head.parent.textBetween(0, $head.parentOffset, undefined, "\n");
  if (!block.trim() || SLASH_COMMAND.test(block)) return null;
  const { doc } = state;
  const context = doc.textBetween(Math.max(0, $head.pos - BEFORE_POSITIONS), $head.pos, "\n", "\n");
  const after = doc.textBetween($head.pos, Math.min(doc.content.size, $head.pos + AFTER_POSITIONS), "\n", "\n").trim();
  return { context, after, pos: $head.pos };
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

/** Gray suggested text from tinynext at the end of the current block. Tab accepts it. */
export const Suggestions = Extension.create<SuggestionsOptions>({
  name: "suggestions",
  priority: 1000,

  addOptions() {
    return { getTinyNext: () => null };
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
    // At most one suggestion runs at a time. Keys pressed meanwhile only mark that a newer one is wanted, so a fast
    // burst of typing asks once for where the cursor ends up instead of queueing a request per key.
    let running = false;
    let wanted = false;

    const ask = (view: EditorView): void => {
      if (running) {
        wanted = true;
        return;
      }
      const tinynext = options.getTinyNext();
      const at = contextAtCursor(view.state);
      if (!tinynext || !at) return;
      const current = suggestionsKey.getState(view.state);
      if (current && current.context === at.context && current.pos === at.pos) return;
      running = true;
      tinynext
        .suggest(at.context, at.after)
        .then((text) => {
          if (view.isDestroyed) return;
          const now = contextAtCursor(view.state);
          if (!now || now.context !== at.context || now.pos !== at.pos) return;
          const meta: Meta = text.length >= MIN_SUGGESTION_CHARS ? { type: "show", ghost: { context: at.context, pos: at.pos, text } } : { type: "clear" };
          view.dispatch(view.state.tr.setMeta(suggestionsKey, meta));
        })
        .catch((error: unknown) => console.error("Suggestion failed", error))
        .finally(() => {
          running = false;
          if (!wanted || view.isDestroyed) return;
          wanted = false;
          ask(view);
        });
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
