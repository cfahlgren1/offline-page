import { MODELS } from "./brand";
import type { AppliedFix, FixKind } from "./extensions/autocorrect";

const KIND_LABEL = {
  context: "Fixed from context",
  spelling: "Fixed spelling",
  "sentence-start": "Capitalized",
  calendar: "Capitalized",
} as const satisfies Record<FixKind, string>;
const SOURCE_LABEL = {
  context: MODELS.tinyfix.name,
  spelling: `${MODELS.tinyfix.name} dictionary`,
  "sentence-start": "capitals",
  calendar: "capitals",
} as const satisfies Record<FixKind, string>;

function explain(fix: AppliedFix): string {
  if (fix.kind === "sentence-start") return `“${fix.replacement}” starts a sentence. Undo twice on a page and sentence starts are left as you type them.`;
  if (fix.kind === "calendar") return "Days of the week and months take a capital.";
  if (fix.kind === "spelling") return `“${fix.original}” isn’t in the dictionary. “${fix.replacement}” is the closest common word.`;
  if (fix.typedAfter) return `Fixed when you typed “${fix.typedAfter}”. The words around it fit “${fix.replacement}” better.`;
  return `The words around it fit “${fix.replacement}” better.`;
}

const formatMilliseconds = (milliseconds: number) => (milliseconds < 1 ? "<1 ms" : `${Math.round(milliseconds)} ms`);

/** The card that opens when you tap a fixed word: what it replaced, why, and Undo. */
export class FixPopover {
  private readonly element = document.createElement("div");
  private readonly close = () => this.hide();
  private readonly closeOnOutsideClick = (event: MouseEvent) => {
    if (!this.element.contains(event.target as Node)) this.hide();
  };

  constructor(private readonly onUndo: (fix: AppliedFix) => void) {
    this.element.className =
      "group absolute z-30 w-[min(300px,calc(100vw-32px))] rounded-[14px] bg-surface px-4 py-3.5 font-sans text-ink shadow-float " +
      "before:absolute before:-top-1.5 before:left-(--arrow-left) before:size-3 before:rotate-45 before:bg-surface before:content-['']";
    this.element.setAttribute("role", "dialog");
    this.element.hidden = true;
    document.body.append(this.element);
  }

  show(fix: AppliedFix, anchor: HTMLElement): void {
    // Capitals share the spelling fix's blue.
    this.element.dataset.kind = fix.kind === "context" ? "context" : "spelling";
    this.element.innerHTML = `
      <div class="flex items-center gap-[7px] text-[11.5px] font-semibold tracking-[0.04em] text-context uppercase group-data-[kind=spelling]:text-spelling">
        <i class="size-[7px] rounded-full bg-context group-data-[kind=spelling]:bg-spelling"></i>
        <span class="fix-kind-label"></span>
        <span class="fix-source ml-auto font-medium tracking-normal text-faint normal-case"></span>
      </div>
      <div class="mt-2 mb-1 text-[22px] font-semibold tracking-[-0.01em] wrap-anywhere">
        <s class="font-medium text-faint decoration-[1.5px]"></s> → <b class="text-context group-data-[kind=spelling]:text-spelling"></b>
      </div>
      <p class="fix-why m-0 text-[13px] leading-[1.45] text-sub"></p>
      <div class="mt-3 flex gap-2">
        <button type="button" class="fix-undo inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[13px] font-medium text-paper">
          Undo<kbd class="rounded-[5px] border border-current px-[5px] font-sans text-[10px] opacity-70">⌫</kbd>
        </button>
      </div>`;
    this.element.querySelector(".fix-kind-label")!.textContent = KIND_LABEL[fix.kind];
    this.element.querySelector(".fix-source")!.textContent = `${SOURCE_LABEL[fix.kind]} · ${formatMilliseconds(fix.milliseconds)}`;
    this.element.querySelector("s")!.textContent = fix.original;
    this.element.querySelector("b")!.textContent = fix.replacement;
    this.element.querySelector(".fix-why")!.textContent = explain(fix);
    this.element.querySelector<HTMLButtonElement>(".fix-undo")!.addEventListener("click", () => {
      this.hide();
      this.onUndo(fix);
    });
    this.element.hidden = false;
    this.place(anchor);
    // Opening happens inside a click, so outside clicks are watched from the next one on.
    setTimeout(() => {
      document.addEventListener("mousedown", this.closeOnOutsideClick);
      document.addEventListener("keydown", this.close);
      window.addEventListener("resize", this.close);
    });
  }

  hide(): void {
    this.element.hidden = true;
    document.removeEventListener("mousedown", this.closeOnOutsideClick);
    document.removeEventListener("keydown", this.close);
    window.removeEventListener("resize", this.close);
  }

  /** Puts the arrow under the middle of the word, and keeps the card on screen. */
  private place(anchor: HTMLElement): void {
    const word = anchor.getBoundingClientRect();
    const width = this.element.offsetWidth;
    const center = word.left + word.width / 2;
    const left = Math.min(Math.max(16, center - 34), window.innerWidth - width - 16);
    this.element.style.left = `${left + window.scrollX}px`;
    this.element.style.top = `${word.bottom + 14 + window.scrollY}px`;
    this.element.style.setProperty("--arrow-left", `${center - left - 6}px`);
  }
}
