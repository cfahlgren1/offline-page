/** The two on-device models, as the app presents them. */
export interface ModelBrand {
  /** Product name shown in the app. */
  name: string;
  role: string;
  /** Download size, as shown to people. */
  size: string;
  /** Hugging Face Hub repo the weights come from. */
  repo: string;
  /** What to expect, stated plainly. */
  caveat: string;
}

export type ModelId = "tinyfix" | "tinynext";

export const MODELS = {
  tinyfix: {
    name: "tinyfix",
    role: "Autocorrect",
    size: "2.1 MB",
    repo: "cfahlgren1/tinyfix",
    caveat: "Catches about a third of wrong-word typos, and is right about 94% of the time when it fixes one.",
  },
  tinynext: {
    name: "tinynext",
    role: "Suggestions",
    size: "1 MB",
    repo: "cfahlgren1/tinynext",
    caveat: "Trained on office email, so it sounds like a memo.",
  },
} as const satisfies Record<ModelId, ModelBrand>;

export const hubUrl = (id: ModelId): string => `https://huggingface.co/${MODELS[id].repo}`;
