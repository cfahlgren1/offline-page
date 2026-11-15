import { Extension } from "@tiptap/core";
import { closeHistory, undo } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Models } from "../models";
import type { Correction } from "../tinyfix/fixer";

// A word is finished by a space, by punctuation, or by a closing bracket or quote, as in "(teh)".
const BOUNDARY = /^[\s.,!?;:)\]"”…]$/;
const SENTENCE_END = /[.!?]/;
const WORD_THEN_BOUNDARY = /([A-Za-z']+)[\s.,!?;:)\]"”…]?$/;
const FINISHED_WORD = /[A-Za-z']+/g;

/** How many more words the context check waits for, so it can read both sides of a word. */
const WORDS_TO_WAIT_FOR = 2;
const CONTEXT_CHECK_CHARACTERS = 400;

export type FixKind = "context" | "spelling";

export interface AppliedFix {
  id: number;
  kind: FixKind;
  original: string;
  replacement: string;
  /** What the user typed after the word before it was fixed, shown so the delay makes sense. */
  typedAfter: string;
  milliseconds: number;
}

interface FixPosition {
  fix: AppliedFix;
  from: number;
  to: number;
}

type Meta = { type: "add"; fix: AppliedFix; from: number; to: number } | { type: "remove"; id: number };

interface PluginState {
  decorations: DecorationSet;
  /** The fix that Backspace undoes, while the cursor hasn't moved since it was applied. */
  last: { id: number; cursor: number } | null;
}

export interface AutocorrectOptions {
  getModels: () => Models | null;
  onFixClick: (fix: AppliedFix, element: HTMLElement) => void;
}

export const autocorrectKey = new PluginKey<PluginState>("autocorrect");

const fixSpec = (decoration: Decoration) => (decoration.spec as { fix: AppliedFix }).fix;

/** Word positions worth checking now, nearest the cursor last. */
function wordsDueForContextCheck(wordCount: number, isSentenceEnd: boolean): number[] {
  const firstDue = isSentenceEnd ? wordCount - 1 : wordCount - 1 - WORDS_TO_WAIT_FOR;
  const lastDue = wordCount - 1 - WORDS_TO_WAIT_FOR;
  if (lastDue < 0 && !isSentenceEnd) return [];
  const due = [];
  for (let index = Math.max(lastDue, 0); index <= firstDue; index++) due.push(index);
  return due;
}

/** Text of a textblock up to an offset. Each hard break counts as one character, so string indexes match document positions. */
const blockText = (block: ProseMirrorNode, end: number) => block.textBetween(0, end, undefined, "\n");

const PREVIOUS_PARAGRAPH_CHARACTERS = 200;

/** The end of the paragraph before the one at `blockStart`, so the wrong-word check reads a paragraph's first words in context. */
function previousParagraph(doc: ProseMirrorNode, blockStart: number): string {
  if (blockStart > doc.content.size) return "";
  const $start = doc.resolve(blockStart);
  const index = $start.depth > 0 ? $start.index($start.depth - 1) : 0;
  if (index === 0) return "";
  const previous = $start.node($start.depth - 1).child(index - 1);
  if (!previous.isTextblock || previous.type.spec.code) return "";
  return blockText(previous, previous.content.size).slice(-PREVIOUS_PARAGRAPH_CHARACTERS) + "\n";
}

export function findFix(state: EditorState, id: number): FixPosition | null {
  const decorations = autocorrectKey.getState(state)?.decorations;
  const found = decorations?.find(undefined, undefined, (spec) => (spec as { fix: AppliedFix }).fix.id === id)[0];
  return found ? { fix: fixSpec(found), from: found.from, to: found.to } : null;
}

/** Puts the original word back as its own undo step, and stops the same fix from coming back. */
export function revertFix(view: EditorView, models: Models | null, id: number): void {
  const found = findFix(view.state, id);
  if (!found) return;
  const meta: Meta = { type: "remove", id };
  view.dispatch(
    closeHistory(view.state.tr.insertText(found.fix.original, found.from, found.to).setMeta(autocorrectKey, meta)),
  );
  models?.fixer.rememberUndo(found.fix.original);
}

/** Fixes each word as you finish it, and real words in the wrong place about two words later. Each fix is its own undo step. */
export const Autocorrect = Extension.create<AutocorrectOptions>({
  name: "autocorrect",
  priority: 1000,

  addOptions() {
    return { getModels: () => null, onFixClick: () => undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    let nextId = 1;
    let queue: Promise<unknown> = Promise.resolve();

    const applyFix = (
      view: EditorView,
      from: number,
      correction: Correction,
      typedAfter: string,
      milliseconds: number,
    ): void => {
      // The check ran in the background, and the page may have been closed since.
      if (view.isDestroyed) return;
      const to = from + correction.original.length;
      if (view.state.doc.textBetween(from, to) !== correction.original) return;
      // Inline code is left exactly as typed, like a code block.
      const code = view.state.schema.marks.code;
      if (code && view.state.doc.rangeHasMark(from, to, code)) return;
      const fix: AppliedFix = {
        id: nextId++,
        kind: correction.usedContext ? "context" : "spelling",
        original: correction.original,
        replacement: correction.replacement,
        typedAfter: typedAfter.trim(),
        milliseconds,
      };
      const meta: Meta = { type: "add", fix, from, to: from + fix.replacement.length };
      view.dispatch(closeHistory(view.state.tr.insertText(fix.replacement, from, to).setMeta(autocorrectKey, meta)));
    };

    /** Checks the words before `text`'s end. `blockStart` is the document position of the text's first character. */
    const check = async (view: EditorView, blockStart: number, text: string, boundary: string): Promise<void> => {
      const models = options.getModels();
      if (!models) return;
      // An odd number of backticks means the cursor is inside inline code that hasn't been closed yet.
      if ((text.match(/`/g)?.length ?? 0) % 2 === 1) return;

      const typed = WORD_THEN_BOUNDARY.exec(text);
      if (typed) {
        const word = typed[1]!;
        const start = typed.index;
        const began = performance.now();
        const correction = await models.fixer.correct(text.slice(0, start), word);
        if (correction) {
          applyFix(view, blockStart + start, correction, "", performance.now() - began);
          return;
        }
      }

      const offset = Math.max(0, text.length - CONTEXT_CHECK_CHARACTERS);
      const words = [...text.slice(offset).matchAll(FINISHED_WORD)];
      for (const index of wordsDueForContextCheck(words.length, SENTENCE_END.test(boundary) || boundary === "\n")) {
        const word = words[index]![0];
        const start = offset + words[index]!.index;
        if (models.fixer.wasUndone(word)) continue;
        const began = performance.now();
        const correction = await models.wrongWord.check(
          previousParagraph(view.state.doc, blockStart) + text.slice(0, start),
          word,
          text.slice(start + word.length),
        );
        if (!correction) continue;
        applyFix(view, blockStart + start, correction, text.slice(start + word.length), performance.now() - began);
        return;
      }
    };

    /** Runs checks one at a time, because a model session answers one request at a time. */
    const enqueue = (run: () => Promise<void>) => {
      queue = queue.then(run).catch((error: unknown) => console.error("Autocorrect check failed", error));
    };

    const checkAtCursor = (view: EditorView, boundary: string): void => {
      const { $head, empty } = view.state.selection;
      if (!empty || !$head.parent.isTextblock || $head.parent.type.spec.code) return;
      enqueue(() => check(view, $head.start(), blockText($head.parent, $head.parentOffset), boundary));
    };

    return [
      new Plugin<PluginState>({
        key: autocorrectKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty, last: null }),
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(autocorrectKey) as Meta | undefined;
            let decorations = value.decorations.map(tr.mapping, tr.doc);
            if (tr.docChanged) {
              const stale = decorations
                .find()
                .filter(
                  (decoration) =>
                    tr.doc.textBetween(decoration.from, decoration.to) !== fixSpec(decoration).replacement,
                );
              decorations = decorations.remove(stale);
            }
            if (meta?.type === "add") {
              const attributes = { class: `fix fix-${meta.fix.kind}`, "data-fix-id": String(meta.fix.id) };
              const decoration = Decoration.inline(meta.from, meta.to, attributes, {
                fix: meta.fix,
                inclusiveStart: false,
                inclusiveEnd: false,
              });
              return {
                decorations: decorations.add(tr.doc, [decoration]),
                last: { id: meta.fix.id, cursor: newState.selection.head },
              };
            }
            if (meta?.type === "remove") {
              const removed = decorations.find(
                undefined,
                undefined,
                (spec) => (spec as { fix: AppliedFix }).fix.id === meta.id,
              );
              return { decorations: decorations.remove(removed), last: null };
            }
            const last = tr.docChanged || tr.selectionSet ? null : value.last;
            return { decorations, last };
          },
        },
        props: {
          decorations: (state) => autocorrectKey.getState(state)?.decorations,

          handleTextInput(view, _from, _to, text) {
            if (BOUNDARY.test(text)) setTimeout(() => checkAtCursor(view, text));
            return false;
          },

          handleKeyDown(view, event) {
            if (event.key === "Enter" && !event.shiftKey) {
              const { $head, empty } = view.state.selection;
              if (empty && $head.parent.isTextblock && !$head.parent.type.spec.code) {
                const blockStart = $head.start();
                const text = blockText($head.parent, $head.parentOffset);
                enqueue(() => check(view, blockStart, text, "\n"));
              }
              return false;
            }
            if (event.key !== "Backspace") return false;
            const last = autocorrectKey.getState(view.state)?.last;
            if (!last || !view.state.selection.empty || view.state.selection.head !== last.cursor) return false;
            const found = findFix(view.state, last.id);
            if (!found || !undo(view.state, view.dispatch)) return false;
            options.getModels()?.fixer.rememberUndo(found.fix.original);
            return true;
          },

          handleClick(view, _pos, event) {
            const element = (event.target as HTMLElement | null)?.closest<HTMLElement>(".fix");
            const found = element ? findFix(view.state, Number(element.dataset.fixId)) : null;
            if (!element || !found) return false;
            options.onFixClick(found.fix, element);
            return false;
          },
        },
      }),
    ];
  },
});
