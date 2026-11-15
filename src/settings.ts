import type { ModelId } from "./brand";

const MODEL_KEY = (id: ModelId) => `offline.page/model/${id}`;
const CAPITALS_KEY = "offline.page/capitals";
const SIDEBAR_KEY = "offline.page/sidebar";

/** Settings are per browser. Storage can be unavailable (private windows, blocked site data), so reads fall back. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error(`Couldn't save the setting ${key}`, error);
  }
}

export const settings = {
  /** Both models are on unless someone switched one off. */
  isModelOn(id: ModelId): boolean {
    return read(MODEL_KEY(id)) !== "off";
  },

  setModelOn(id: ModelId, on: boolean): void {
    write(MODEL_KEY(id), on ? "on" : "off");
  },

  /** Capitals are on unless someone switched them off. */
  isCapitalsOn(): boolean {
    return read(CAPITALS_KEY) !== "off";
  },

  setCapitalsOn(on: boolean): void {
    write(CAPITALS_KEY, on ? "on" : "off");
  },

  /** Whether the sidebar was left open, on screens wide enough to keep it beside the page. */
  isSidebarOpen(): boolean {
    return read(SIDEBAR_KEY) !== "closed";
  },

  setSidebarOpen(open: boolean): void {
    write(SIDEBAR_KEY, open ? "open" : "closed");
  },
};
