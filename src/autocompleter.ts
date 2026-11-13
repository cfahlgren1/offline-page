import type { Autocomplete } from "./autocomplete";
import { MODELS, type ModelId } from "./brand";
import { TinyNextClient } from "./tinynext/client";

/** Anything that suggests the next words for the cursor between `before` and `after`. */
export interface Autocompleter {
  readonly label: string;
  suggest(before: string, after: string): Promise<string>;
}

export type AutocompleteVersion = "v1" | "v2";

const CHOICE_KEY = "offline.page/autocomplete";

/** v1 is the default. `?autocomplete=v2` (remembered) or `?autocomplete=v1` switches. */
export function chosenVersion(): AutocompleteVersion {
  const fromUrl = new URLSearchParams(location.search).get("autocomplete");
  try {
    if (fromUrl === "v1" || fromUrl === "v2") localStorage.setItem(CHOICE_KEY, fromUrl);
    return localStorage.getItem(CHOICE_KEY) === "v2" ? "v2" : "v1";
  } catch {
    return fromUrl === "v2" ? "v2" : "v1";
  }
}

/** tinynext v1 reads one paragraph at a time and runs on the main thread, as it always has. */
export function v1Autocompleter(model: Autocomplete): Autocompleter {
  return {
    label: `${MODELS.tinynext.name} v1`,
    suggest: (before) => model.suggest(before.slice(before.lastIndexOf("\n") + 1)),
  };
}

/** tinynext v2 runs in a worker and reads the document around the cursor. */
export async function loadV2Autocompleter(): Promise<{ autocompleter: Autocompleter; client: TinyNextClient; milliseconds: number }> {
  const client = new TinyNextClient();
  // Absolute, because the worker resolves relative URLs against its own script in assets/, not the page.
  const milliseconds = await client.load(new URL(`${import.meta.env.BASE_URL}models/tinynext-v2/`, location.href).href);
  const id: ModelId = "tinynext";
  return { autocompleter: { label: `${MODELS[id].name} v2`, suggest: (before, after) => client.suggest(before, after) }, client, milliseconds };
}
