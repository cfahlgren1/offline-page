import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { ColoredRange } from "../highlighter";

type ColorCode = (code: string, language: string) => ColoredRange[];

const codeHighlightKey = new PluginKey<DecorationSet>("codeHighlight");
const HIGHLIGHTER_LOADED = "highlighter-loaded";

/** The languages the picker offers. A block can hold any other name, typed after the opening ```. */
const LANGUAGES: ReadonlyArray<readonly [value: string, label: string]> = [
  ["", "Plain"],
  ["bash", "Bash"],
  ["css", "CSS"],
  ["go", "Go"],
  ["html", "HTML"],
  ["javascript", "JavaScript"],
  ["json", "JSON"],
  ["markdown", "Markdown"],
  ["python", "Python"],
  ["rust", "Rust"],
  ["sql", "SQL"],
  ["typescript", "TypeScript"],
  ["yaml", "YAML"],
];

/** Short names people type after ```, and the picker entry each one means. */
const ALIASES: Readonly<Record<string, string>> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  md: "markdown",
  yml: "yaml",
};

const MAX_CACHED_BLOCKS = 200;

const languageOf = (block: ProseMirrorNode): string => {
  const typed = String(block.attrs.language ?? "").toLowerCase();
  return ALIASES[typed] ?? typed;
};

function hasCodeBlock(doc: ProseMirrorNode): boolean {
  let found = false;
  doc.descendants((block) => {
    if (block.type.name === "codeBlock") found = true;
    return !found;
  });
  return found;
}

/** The small language menu in a code block's corner. Choosing from it sets the block's language. */
function languagePicker(view: EditorView, getPosition: () => number | undefined, current: string): HTMLElement {
  const picker = document.createElement("select");
  picker.className = "code-language";
  picker.setAttribute("aria-label", "Code language");
  picker.contentEditable = "false";
  const known = LANGUAGES.some(([value]) => value === current);
  for (const [value, label] of known ? LANGUAGES : [...LANGUAGES, [current, current] as const]) {
    picker.append(new Option(label, value, false, value === current));
  }
  picker.addEventListener("change", () => {
    const inside = getPosition();
    if (inside === undefined) return;
    // The picker sits at the start of the block's text, one position inside the block.
    view.dispatch(view.state.tr.setNodeMarkup(inside - 1, undefined, { language: picker.value || null }));
    view.focus();
  });
  return picker;
}

/**
 * Colors code blocks and gives each one a language menu. The highlighter is only downloaded once a page has a code
 * block, and colored blocks are remembered by their text, so typing elsewhere on the page does no work here.
 */
export const CodeHighlight = Extension.create({
  name: "codeHighlight",

  addProseMirrorPlugins() {
    let colorCode: ColorCode | null = null;
    let loading = false;
    const cache = new Map<string, ColoredRange[]>();

    const rangesFor = (code: string, language: string): ColoredRange[] => {
      if (!colorCode || !language) return [];
      const key = `${language}\n${code}`;
      const cached = cache.get(key);
      if (cached) return cached;
      if (cache.size >= MAX_CACHED_BLOCKS) cache.clear();
      const ranges = colorCode(code, language);
      cache.set(key, ranges);
      return ranges;
    };

    const decorate = (doc: ProseMirrorNode): DecorationSet => {
      const decorations: Decoration[] = [];
      doc.descendants((block, position) => {
        if (block.type.name !== "codeBlock") return true;
        const language = languageOf(block);
        const start = position + 1;
        decorations.push(
          Decoration.widget(start, (view, getPosition) => languagePicker(view, getPosition, language), {
            side: -1,
            key: `language-${language}`,
            ignoreSelection: true,
            stopEvent: () => true,
          }),
        );
        for (const range of rangesFor(block.textContent, language)) {
          decorations.push(
            Decoration.inline(start + range.from, start + range.to, { class: "tok", style: range.style }),
          );
        }
        return false;
      });
      return DecorationSet.create(doc, decorations);
    };

    const loadWhenNeeded = (view: EditorView): void => {
      if (colorCode || loading || !hasCodeBlock(view.state.doc)) return;
      loading = true;
      import("../highlighter")
        .then((highlighter) => {
          colorCode = highlighter.colorCode;
          if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(HIGHLIGHTER_LOADED, true));
        })
        .catch((error: unknown) => {
          // Code stays readable in one color, and the next code block tries again.
          loading = false;
          console.error("Loading the code highlighter failed", error);
        });
    };

    return [
      new Plugin<DecorationSet>({
        key: codeHighlightKey,
        state: {
          init: (_config, state) => decorate(state.doc),
          apply: (transaction, decorations) =>
            transaction.docChanged || transaction.getMeta(HIGHLIGHTER_LOADED) ? decorate(transaction.doc) : decorations,
        },
        props: { decorations: (state) => codeHighlightKey.getState(state) },
        view: (view) => {
          loadWhenNeeded(view);
          return { update: loadWhenNeeded };
        },
      }),
    ];
  },
});
