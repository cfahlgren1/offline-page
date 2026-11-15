import { MODELS, hubUrl, type ModelId } from "./brand";
import { element } from "./dom";
import { settings } from "./settings";

/** Where loading the models has got to, as the sidebar shows it. */
export type ModelStatus =
  | { state: "loading" }
  | { state: "ready"; worksOffline: boolean }
  | { state: "error"; message: string };

export interface ModelPanel {
  setStatus: (status: ModelStatus) => void;
  /** Closes the info card, if one is open. */
  closeInfo: () => void;
}

const MODEL_IDS = Object.keys(MODELS) as ModelId[];
const INFO_CARD_MARGIN = 12;
const HOVER_OPEN_MILLISECONDS = 350;
const HOVER_CLOSE_MILLISECONDS = 200;

function footer(status: ModelStatus): string {
  if (status.state === "error") return "The models couldn’t load. Writing and saving still work.";
  if (status.state === "loading") return "Loading…";
  return status.worksOffline ? "Runs in this tab and is saved for offline use." : "Runs in this tab.";
}

const infoButton = (id: ModelId) => element<HTMLButtonElement>(`info-${id}`);

/** Sets each switch, and its dot on the closed sidebar's spine, from the saved settings. */
function renderToggles(): void {
  for (const id of MODEL_IDS) {
    const on = settings.isModelOn(id);
    element(`model-${id}`).toggleAttribute("data-on", on);
    const toggle = element<HTMLButtonElement>(`toggle-${id}`);
    toggle.setAttribute("aria-checked", String(on));
    toggle.title = `Turn ${MODELS[id].name} ${on ? "off" : "on"}`;
    element(`spine-${id}`).toggleAttribute("data-on", on);
  }
}

/**
 * The sidebar's two model rows: a switch each, and an info button that opens a card about the model. `onToggle` runs
 * after a switch changes.
 */
export function setupModelPanel(onToggle: (id: ModelId, on: boolean) => void): ModelPanel {
  const statusLabel = element("models-status");
  const card = element("models-info");
  let status: ModelStatus = { state: "loading" };
  /** The model whose info card is open, if any. */
  let openInfo: ModelId | null = null;

  /** What a model does, in a sentence, with a link to it. All of the text comes from brand.ts. */
  function renderInfo(id: ModelId): void {
    card.innerHTML = `<div class="flex items-baseline justify-between gap-3">
      <span><span class="info-name">${MODELS[id].name}</span> <span class="info-kind">${MODELS[id].role} · ${MODELS[id].size}</span></span>
      <a class="info-link" href="${hubUrl(id)}" target="_blank" rel="noopener">Model ↗</a>
    </div>
    <p class="info-text">${MODELS[id].caveat}</p>
    <p class="info-text text-faint">${footer(status)}</p>`;
  }

  /** A card opened by a click stays until it's dismissed; one opened by hovering closes when the pointer leaves. */
  let pinned = false;
  let hoverTimer: number | undefined;

  const closeOnOutsidePress = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (!card.contains(target) && !MODEL_IDS.some((id) => infoButton(id).contains(target))) closeInfo();
  };

  function closeInfo(): void {
    window.clearTimeout(hoverTimer);
    pinned = false;
    if (!openInfo) return;
    infoButton(openInfo).setAttribute("aria-expanded", "false");
    openInfo = null;
    card.hidden = true;
    document.removeEventListener("pointerdown", closeOnOutsidePress);
  }

  /** The short wait lets the pointer cross the gap between a row and its card without the card closing. */
  function closeSoonUnlessPinned(): void {
    window.clearTimeout(hoverTimer);
    if (!pinned) hoverTimer = window.setTimeout(closeInfo, HOVER_CLOSE_MILLISECONDS);
  }

  /** Opens the card above both rows, so it never covers either switch, and keeps it on screen. */
  function showInfo(id: ModelId): void {
    closeInfo();
    openInfo = id;
    renderInfo(id);
    card.hidden = false;
    const box = element(`model-${MODEL_IDS[0]}`).getBoundingClientRect();
    const furthestLeft = window.innerWidth - card.offsetWidth - INFO_CARD_MARGIN;
    card.style.bottom = `${window.innerHeight - box.top + 6}px`;
    card.style.left = `${Math.max(INFO_CARD_MARGIN, Math.min(box.left - 16, furthestLeft))}px`;
    infoButton(id).setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", closeOnOutsidePress);
  }

  /** The sidebar only says something while the models load or when they fail. Once they're ready it stays quiet. */
  function renderStatus(): void {
    statusLabel.textContent = { loading: "Loading…", ready: "", error: "Couldn’t load" }[status.state];
    statusLabel.title = status.state === "error" ? `Writing and saving still work. ${status.message}` : "";
    statusLabel.toggleAttribute("data-ready", status.state === "ready");
    statusLabel.toggleAttribute("data-error", status.state === "error");
    if (openInfo) renderInfo(openInfo);
  }

  for (const id of MODEL_IDS) {
    element<HTMLButtonElement>(`toggle-${id}`).addEventListener("click", () => {
      const on = !settings.isModelOn(id);
      settings.setModelOn(id, on);
      renderToggles();
      onToggle(id, on);
    });
    infoButton(id).addEventListener("click", () => {
      // A click on a card that hovering opened keeps it; a second click closes it.
      if (openInfo === id && pinned) return closeInfo();
      showInfo(id);
      pinned = true;
    });
    // With a mouse, resting on a row shows its card, and moving off the row and the card puts it away.
    const row = element(`model-${id}`);
    row.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse" || pinned) return;
      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => showInfo(id), HOVER_OPEN_MILLISECONDS);
    });
    row.addEventListener("pointerleave", closeSoonUnlessPinned);
  }
  card.addEventListener("pointerenter", () => window.clearTimeout(hoverTimer));
  card.addEventListener("pointerleave", closeSoonUnlessPinned);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeInfo();
  });
  // The card is placed against the window, so it's closed rather than left behind when the window changes.
  window.addEventListener("resize", closeInfo);

  renderToggles();
  renderStatus();
  return {
    setStatus(next) {
      status = next;
      renderStatus();
    },
    closeInfo,
  };
}
