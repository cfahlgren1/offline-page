import type { DocSummary } from "./store";

export interface PageListSetup {
  summaries: readonly DocSummary[];
  /** The page that's open, which the list marks. */
  currentId: string | undefined;
  onOpen: (summary: DocSummary) => void;
  onDelete: (summary: DocSummary) => void;
}

/** Today's pages show the time; older ones the date. */
function when(timestamp: number): string {
  const date = new Date(timestamp);
  if (date.toDateString() === new Date().toDateString()) {
    // The time without AM/PM, which the sidebar has no room for: "9:41".
    const parts = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).formatToParts(date);
    return parts
      .filter(
        (part) => part.type === "hour" || part.type === "minute" || (part.type === "literal" && part.value.trim()),
      )
      .map((part) => part.value)
      .join("");
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function span(className: string, text = ""): HTMLSpanElement {
  const created = document.createElement("span");
  created.className = className;
  created.textContent = text;
  return created;
}

function pageItem(summary: DocSummary, index: number, setup: PageListSetup): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "relative";
  const row = document.createElement("button");
  row.type = "button";
  row.className = "page-row";
  if (summary.id === setup.currentId) row.setAttribute("aria-current", "page");
  const body = span("min-w-0 flex-1");
  const line = span("page-line");
  line.append(span("page-title", summary.title), span("leader"), span("page-when", when(summary.updatedAt)));
  body.append(line);
  if (summary.preview) body.append(span("page-preview", summary.preview));
  row.append(span("page-n", String(index + 1).padStart(2, "0")), body);
  row.addEventListener("click", () => setup.onOpen(summary));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "page-delete";
  remove.textContent = "Delete";
  remove.setAttribute("aria-label", `Delete ${summary.title}`);
  remove.addEventListener("click", () => setup.onDelete(summary));
  item.append(row, remove);
  return item;
}

/** Draws the sidebar's numbered list of pages. Titles and previews are set as text, never as HTML. */
export function renderPageList(host: HTMLElement, setup: PageListSetup): void {
  host.replaceChildren(...setup.summaries.map((summary, index) => pageItem(summary, index, setup)));
}
