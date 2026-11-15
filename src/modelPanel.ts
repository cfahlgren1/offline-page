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

  const closeOnOutsidePress = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (!card.contains(target) && !MODEL_IDS.some((id) => infoButton(id).contains(target))) closeInfo();
  };

  function closeInfo(): void {
    if (!openInfo) return;
    infoButton(openInfo).setAttribute("aria-expanded", "false");
    openInfo = null;
    card.hidden = true;
    document.removeEventListener("pointerdown", closeOnOutsidePress);
  }

  /** Opens the card above the model's row, since the rows sit at the bottom of the sidebar, and keeps it on screen. */
  function showInfo(id: ModelId): void {
    closeInfo();
    openInfo = id;
    renderInfo(id);
    card.hidden = false;
    const box = infoButton(id).getBoundingClientRect();
    const furthestLeft = window.innerWidth - card.offsetWidth - INFO_CARD_MARGIN;
    card.style.bottom = `${window.innerHeight - box.top + 6}px`;
    card.style.left = `${Math.max(INFO_CARD_MARGIN, Math.min(box.right - card.offsetWidth, furthestLeft))}px`;
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
    infoButton(id).addEventListener("click", () => (openInfo === id ? closeInfo() : showInfo(id)));
  }
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
