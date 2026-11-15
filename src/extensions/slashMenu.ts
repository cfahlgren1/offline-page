import { Extension, type ChainedCommands, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";

interface Block {
  title: string;
  hint: string;
  icon: string;
  markdown: string;
  run: (chain: ChainedCommands) => ChainedCommands;
}

const BLOCKS: Block[] = [
  { title: "Text", hint: "Plain paragraph", icon: "T", markdown: "", run: (chain) => chain.setParagraph() },
  {
    title: "Heading",
    hint: "Big section title",
    icon: "H1",
    markdown: "#",
    run: (chain) => chain.setNode("heading", { level: 1 }),
  },
  {
    title: "Heading 2",
    hint: "Medium section title",
    icon: "H2",
    markdown: "##",
    run: (chain) => chain.setNode("heading", { level: 2 }),
  },
  {
    title: "Heading 3",
    hint: "Small section title",
    icon: "H3",
    markdown: "###",
    run: (chain) => chain.setNode("heading", { level: 3 }),
  },
  { title: "Bulleted list", hint: "Simple list", icon: "•", markdown: "-", run: (chain) => chain.toggleBulletList() },
  {
    title: "Numbered list",
    hint: "List with numbers",
    icon: "1.",
    markdown: "1.",
    run: (chain) => chain.toggleOrderedList(),
  },
  { title: "Quote", hint: "Pull a line out", icon: "“", markdown: ">", run: (chain) => chain.toggleBlockquote() },
  { title: "Code", hint: "Monospace block", icon: "{}", markdown: "```", run: (chain) => chain.toggleCodeBlock() },
  {
    title: "Divider",
    hint: "A line between sections",
    icon: "—",
    markdown: "---",
    run: (chain) => chain.setHorizontalRule(),
  },
];

function matches(block: Block, query: string): boolean {
  const lower = query.toLowerCase();
  return block.title.toLowerCase().includes(lower) || block.hint.toLowerCase().includes(lower);
}

/** The floating list of blocks. Owns only its DOM and which row is selected. */
class Menu {
  private readonly element = document.createElement("div");
  private items: Block[] = [];
  private selected = 0;
  private choose: (block: Block) => void = () => undefined;

  constructor() {
    this.element.className =
      "absolute z-30 max-h-[min(380px,60vh)] w-[min(330px,calc(100vw-32px))] overflow-auto overscroll-contain rounded-[14px] bg-surface p-2 font-sans shadow-float";
    this.element.setAttribute("role", "listbox");
    this.element.addEventListener("mousedown", (event) => event.preventDefault());
    document.body.append(this.element);
  }

  update(props: SuggestionProps<Block, Block>): void {
    this.items = props.items;
    this.choose = (block) => props.command(block);
    this.selected = Math.min(this.selected, Math.max(0, this.items.length - 1));
    this.render();
    this.place(props.clientRect?.() ?? null);
  }

  keyDown({ event }: SuggestionKeyDownProps): boolean {
    if (this.items.length === 0) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1;
      this.selected = (this.selected + step + this.items.length) % this.items.length;
      this.render();
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      this.choose(this.items[this.selected]!);
      return true;
    }
    return false;
  }

  destroy(): void {
    this.element.remove();
  }

  private render(): void {
    this.element.replaceChildren();
    this.element.hidden = this.items.length === 0;
    const heading = document.createElement("div");
    heading.className = "px-2.5 pt-2 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-faint uppercase";
    heading.textContent = "Blocks";
    this.element.append(heading);
    this.items.forEach((block, index) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "flex w-full items-center gap-3 rounded-[9px] px-2.5 py-2 text-left aria-selected:bg-hover";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(index === this.selected));
      row.innerHTML =
        `<span class="flex size-9 flex-none items-center justify-center rounded-[9px] border border-line bg-paper text-sm font-semibold text-sub"></span>` +
        `<span class="min-w-0"><b class="block text-sm font-[550] text-ink"></b><small class="text-xs text-faint"></small></span>` +
        `<kbd class="ml-auto font-mono text-[11px] font-medium text-faint"></kbd>`;
      row.querySelector("span")!.textContent = block.icon;
      row.querySelector("b")!.textContent = block.title;
      row.querySelector("small")!.textContent = block.hint;
      row.querySelector("kbd")!.textContent = block.markdown;
      row.addEventListener("click", () => this.choose(block));
      row.addEventListener("mousemove", () => {
        if (this.selected === index) return;
        this.selected = index;
        this.render();
      });
      this.element.append(row);
      if (index === this.selected) row.scrollIntoView({ block: "nearest" });
    });
  }

  private place(rect: DOMRect | null): void {
    if (!rect) return;
    const height = this.element.offsetHeight;
    const below = rect.bottom + 8;
    const fitsBelow = below + height < window.innerHeight - 8;
    const top = fitsBelow ? below : Math.max(8, rect.top - height - 8);
    const left = Math.min(rect.left, window.innerWidth - this.element.offsetWidth - 16);
    this.element.style.top = `${top + window.scrollY}px`;
    this.element.style.left = `${Math.max(16, left) + window.scrollX}px`;
  }
}

/** Typing "/" opens a menu of Markdown blocks. */
export const SlashMenu = Extension.create({
  name: "slashMenu",

  addProseMirrorPlugins() {
    return [
      Suggestion<Block, Block>({
        editor: this.editor,
        pluginKey: new PluginKey("slashMenu"),
        char: "/",
        items: ({ query }) => BLOCKS.filter((block) => matches(block, query)),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: Block }) => {
          props.run(editor.chain().focus().deleteRange(range)).run();
        },
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        render: () => {
          let menu: Menu | null = null;
          return {
            onStart: (props) => {
              menu = new Menu();
              menu.update(props);
            },
            onUpdate: (props) => menu?.update(props),
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                menu?.destroy();
                menu = null;
                return true;
              }
              return menu?.keyDown(props) ?? false;
            },
            onExit: () => {
              menu?.destroy();
              menu = null;
            },
          };
        },
      }),
    ];
  },
});
