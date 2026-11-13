import type * as Ort from "onnxruntime-web";
import type { Tokenizer } from "./tokenizer";

/** Settings shared with tinynext/v2/eval.py, so the app decodes exactly the way the model was measured. */
export const CUTOFF = 0.5;
const MAX_WORDS = 6;
const MAX_CHARS = 48;
const MAX_STEPS = 16;
const CONTEXT_CHARS = 1500;
const SUFFIX_CHARS = 300;
const PUNCTUATION = ".,!?;:";
const EOT = 0;
const PRE = 1;
const SUF = 2;
const MID = 3;

export interface ModelConfig {
  vocab: number;
  dim: number;
  layers: number;
  heads: number;
}

/** Same as training: keyboard characters only, curly quotes and dashes made plain. */
const SMART = new Map(Object.entries({ "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "\t": " " }));
const toAscii = (text: string) => [...text].map((char) => SMART.get(char) ?? char).join("").replace(/[^\x0a\x20-\x7e]/g, "");

interface Reading {
  ids: number[];
  logits: Float32Array;
  pastK: Ort.Tensor;
  pastV: Ort.Tensor;
}

/** Runs the model and keeps the prompt it last read, so the next keystroke only feeds what changed. */
export class Suggester {
  private reading: Reading | null = null;
  private readonly empty: () => Ort.Tensor;
  /** The text of every piece, decoded once. */
  private readonly texts: string[];

  constructor(
    private readonly ort: typeof Ort,
    private readonly session: Ort.InferenceSession,
    private readonly tokenizer: Tokenizer,
    config: ModelConfig,
  ) {
    const headDim = config.dim / config.heads;
    this.empty = () => new ort.Tensor("float32", new Float32Array(0), [config.layers, 1, config.heads, 0, headDim]);
    this.texts = Array.from({ length: config.vocab }, (_, id) => tokenizer.piece(id));
  }

  private async run(ids: number[], pastK: Ort.Tensor, pastV: Ort.Tensor) {
    const input = new this.ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, ids.length]);
    const out = await this.session.run({ input_ids: input, past_k: pastK, past_v: pastV });
    return { logits: out.logits!.data as Float32Array, pastK: out.present_k!, pastV: out.present_v! };
  }

  /** Reads a prompt, reusing the cached reading when the new prompt only extends the old one. */
  private async read(ids: number[]): Promise<Reading> {
    const old = this.reading;
    const extends_ = old && old.ids.length <= ids.length && old.ids.every((id, index) => id === ids[index]);
    if (old && extends_ && old.ids.length === ids.length) return old;
    const start = old && extends_ ? old : null;
    const next = await this.run(ids.slice(start ? start.ids.length : 0), start?.pastK ?? this.empty(), start?.pastV ?? this.empty());
    this.reading = { ids, ...next };
    return this.reading;
  }

  /**
   * The suggestion for the cursor between `before` and `after`, or "". The half-typed word is "healed": the prompt
   * stops before it and the first pieces must spell it out, so "resig" can become "resignation" in one piece.
   */
  async suggest(beforeRaw: string, afterRaw: string): Promise<string> {
    const before = toAscii(beforeRaw).slice(-CONTEXT_CHARS);
    const after = toAscii(afterRaw).slice(0, SUFFIX_CHARS);
    const space = before.lastIndexOf(" ");
    const newline = before.lastIndexOf("\n");
    const [stem, healing] = space > newline ? [before.slice(0, space), before.slice(space)] : [before.slice(0, newline + 1), before.slice(newline + 1)];
    let need = healing;
    const prefix = stem ? this.tokenizer.encode(stem) : [EOT];
    const prompt = after ? [SUF, ...this.tokenizer.encode(after), PRE, ...prefix, MID] : prefix;

    let { logits, pastK, pastV } = await this.read(prompt);
    let generated = "";
    let confidence = 1;
    let best = "";
    const offer = (text: string, sure: number) => {
      if (sure >= CUTOFF) best = text;
    };
    for (let step = 0; step < MAX_STEPS; step++) {
      const token = this.pick(logits, need);
      if (token === null) break;
      const { id, probability } = token;
      let text = this.texts[id]!;
      if (id < this.tokenizer.specialCount || text.includes("\n")) {
        if (generated) offer(generated, confidence);
        break;
      }
      if (need) {
        const consumed = Math.min(need.length, text.length);
        text = text.slice(consumed);
        need = need.slice(consumed);
      }
      if (/^\s/.test(text) && generated) offer(generated, confidence);
      confidence *= probability;
      generated += text;
      if (PUNCTUATION.includes(generated.trimEnd().slice(-1)) && generated.trim()) offer(generated, confidence);
      if (confidence < CUTOFF || generated.length > MAX_CHARS || generated.trim().split(/\s+/).length > MAX_WORDS) break;
      ({ logits, pastK, pastV } = await this.run([id], pastK, pastV));
    }
    return best.trimEnd();
  }

  /** The most likely next piece and its probability, among pieces consistent with the rest of the half-typed word. */
  private pick(logits: Float32Array, need: string): { id: number; probability: number } | null {
    let max = -Infinity;
    let id = -1;
    const allowed = (index: number) => {
      if (!need) return true;
      const text = this.texts[index]!;
      return text !== "" && (need.startsWith(text) || text.startsWith(need));
    };
    for (let index = 0; index < logits.length; index++) {
      if (logits[index]! > max && allowed(index)) {
        max = logits[index]!;
        id = index;
      }
    }
    if (id < 0) return null;
    let total = 0;
    for (let index = 0; index < logits.length; index++) if (allowed(index)) total += Math.exp(logits[index]! - max);
    return { id, probability: 1 / total };
  }
}
