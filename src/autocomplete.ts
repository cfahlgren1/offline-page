import * as ort from "onnxruntime-web";

const HIDDEN = 512;
const END_OF_EMAIL = 1;
const NEWLINE = 2;
const FIRST_PRINTABLE = 3;
const CODEPOINT_OFFSET = 29;
const MAX_CHARS = 48;
const MAX_WORDS = 6;
const PUNCTUATION = ".,!?";

/**
 * A suggestion is shown only as far as the model stays at least this sure of all of it.
 * At 50% the model card measures it suggesting about 11% of the time and being right about 80% of the time.
 */
export const CONFIDENCE_CUTOFF = 0.5;

interface Reading {
  logits: Float32Array;
  state: ort.Tensor;
}

/** The model's id for a character, or null for one it never saw. */
function encode(character: string): number | null {
  if (character === "\n") return NEWLINE;
  const code = character.charCodeAt(0);
  return code >= 32 && code <= 126 ? code - CODEPOINT_OFFSET : null;
}

/** The model's top pick for the next character, and how much of its belief sits on it. */
function topPick(logits: Float32Array): { id: number; probability: number } {
  let id = 0;
  for (let other = 1; other < logits.length; other++) if (logits[other]! > logits[id]!) id = other;
  let total = 0;
  for (const logit of logits) total += Math.exp(logit - logits[id]!);
  return { id, probability: 1 / total };
}

/** Character-level next-words model from cfahlgren1/tinynext (a copy of cfahlgren1/enron-autocomplete). */
export class Autocomplete {
  private readText = "";
  private reading: Reading | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly session: ort.InferenceSession) {}

  /** The model's guess at what comes next, or "" when it isn't sure enough. Calls are answered in order. */
  suggest(text: string): Promise<string> {
    const result = this.queue.then(() => this.continueFrom(text));
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async step(id: number, state: ort.Tensor): Promise<Reading> {
    const input_id = new ort.Tensor("int64", BigInt64Array.of(BigInt(id)), [1]);
    const output = await this.session.run({ input_id, state });
    return { logits: output.logits!.data as Float32Array, state: output.next_state! };
  }

  /** Feeds the model only the characters typed since the last call, when the text just grew. */
  private async read(text: string): Promise<Reading> {
    if (!this.reading || !text.startsWith(this.readText)) {
      this.reading = await this.step(END_OF_EMAIL, new ort.Tensor("float32", new Float32Array(HIDDEN), [1, HIDDEN]));
      this.readText = "";
    }
    for (const character of text.slice(this.readText.length)) {
      const id = encode(character);
      if (id !== null) this.reading = await this.step(id, this.reading.state);
    }
    this.readText = text;
    return this.reading;
  }

  /** Follows the model's top picks while it stays sure of the whole run, and keeps what it had at the last finished word. */
  private async continueFrom(text: string): Promise<string> {
    let { logits, state } = await this.read(text);
    let run = "";
    let sure = "";
    let confidence = 1;
    let words = 0;
    while (run.length < MAX_CHARS) {
      const { id, probability } = topPick(logits);
      if (id < FIRST_PRINTABLE) break;
      const character = String.fromCharCode(id + CODEPOINT_OFFSET);
      if (character === " ") {
        if (confidence >= CONFIDENCE_CUTOFF) sure = run;
        if (++words >= MAX_WORDS) break;
      }
      confidence *= probability;
      if (confidence < CONFIDENCE_CUTOFF) break;
      run += character;
      if (PUNCTUATION.includes(character)) sure = run;
      ({ logits, state } = await this.step(id, state));
    }
    return sure;
  }
}
