import type { ModelId } from "./brand";

/** Where loading the models has got to, as the sidebar shows it. */
export type ModelStatus =
  | { state: "loading" }
  | { state: "ready"; worksOffline: boolean }
  | { state: "error"; message: string };

const CARD_MARGIN = 12;
const CARD_WIDTH = 300;
const HOVER_OPEN_MILLISECONDS = 350;
const HOVER_CLOSE_MILLISECONDS = 200;

/**
 * The card that explains a model. `pinned` is true when a click opened it: that one stays until it's dismissed, while
 * one opened by hovering closes when the pointer leaves.
 */
export const modelInfo = $state<{ id: ModelId | null; pinned: boolean; bottom: number; left: number }>({
  id: null,
  pinned: false,
  bottom: 0,
  left: 0,
});

let hoverTimer: number | undefined;

export function closeModelInfo(): void {
  window.clearTimeout(hoverTimer);
  modelInfo.id = null;
  modelInfo.pinned = false;
}

/** Opens the card above the model rows, so it never covers either switch, and keeps it on screen. */
function show(id: ModelId, rows: HTMLElement, pinned: boolean): void {
  window.clearTimeout(hoverTimer);
  const box = rows.getBoundingClientRect();
  const width = Math.min(CARD_WIDTH, window.innerWidth - CARD_MARGIN * 2);
  modelInfo.bottom = window.innerHeight - box.top + 6;
  modelInfo.left = Math.max(CARD_MARGIN, Math.min(box.left - 16, window.innerWidth - width - CARD_MARGIN));
  modelInfo.id = id;
  modelInfo.pinned = pinned;
}

/** A click pins the card open. A second click on the same name closes it. */
export function clickModelInfo(id: ModelId, rows: HTMLElement): void {
  if (modelInfo.id === id && modelInfo.pinned) return closeModelInfo();
  show(id, rows, true);
}

/** With a mouse, resting on a row shows its card. */
export function hoverModelInfo(event: PointerEvent, id: ModelId, rows: HTMLElement): void {
  if (event.pointerType !== "mouse" || modelInfo.pinned) return;
  window.clearTimeout(hoverTimer);
  hoverTimer = window.setTimeout(() => show(id, rows, false), HOVER_OPEN_MILLISECONDS);
}

/** The pointer reached the card itself, so it stays open. */
export function keepModelInfo(): void {
  window.clearTimeout(hoverTimer);
}

/** The short wait lets the pointer cross the gap between a row and the card without the card closing. */
export function leaveModelInfo(): void {
  window.clearTimeout(hoverTimer);
  if (!modelInfo.pinned) hoverTimer = window.setTimeout(closeModelInfo, HOVER_CLOSE_MILLISECONDS);
}
