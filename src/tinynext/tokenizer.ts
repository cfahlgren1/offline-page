/** Byte-level BPE (the GPT-2 scheme) read from a Hugging Face tokenizer.json. Only what tinynext v2 uses. */

interface TokenizerJson {
  model: { vocab: Record<string, number>; merges: Array<string | [string, string]> };
  added_tokens: Array<{ id: number; content: string }>;
}

/** The GPT-2 pre-tokenizer split: contractions, letters, numbers, punctuation runs, and whitespace. */
const PRETOKENIZE = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

/** GPT-2 maps every byte to a printable character so tokens can be stored as strings. */
function byteAlphabet(): string[] {
  const printable: number[] = [];
  for (let byte = 33; byte <= 126; byte++) printable.push(byte);
  for (let byte = 161; byte <= 172; byte++) printable.push(byte);
  for (let byte = 174; byte <= 255; byte++) printable.push(byte);
  const alphabet = new Array<string>(256);
  let extra = 0;
  for (let byte = 0; byte < 256; byte++) {
    alphabet[byte] = String.fromCodePoint(printable.includes(byte) ? byte : 256 + extra++);
  }
  return alphabet;
}

export class Tokenizer {
  readonly vocabSize: number;
  readonly specialCount: number;
  private readonly ids: Map<string, number>;
  private readonly pieces: string[];
  private readonly ranks = new Map<string, number>();
  private readonly toChar = byteAlphabet();
  private readonly toByte = new Map<string, number>();
  private readonly cache = new Map<string, number[]>();
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  constructor(json: TokenizerJson) {
    this.ids = new Map(Object.entries(json.model.vocab));
    this.vocabSize = this.ids.size;
    this.pieces = new Array<string>(this.vocabSize);
    for (const [piece, id] of this.ids) this.pieces[id] = piece;
    this.specialCount = json.added_tokens.length;
    json.model.merges.forEach((merge, rank) => this.ranks.set(typeof merge === "string" ? merge : merge.join(" "), rank));
    this.toChar.forEach((char, byte) => this.toByte.set(char, byte));
  }

  encode(text: string): number[] {
    const out: number[] = [];
    for (const word of text.match(PRETOKENIZE) ?? []) out.push(...this.encodeWord(word));
    return out;
  }

  /** The text of one token, as it would appear in the document. Special tokens decode to "". */
  piece(id: number): string {
    if (id < this.specialCount) return "";
    const bytes = Uint8Array.from([...this.pieces[id]!], (char) => this.toByte.get(char)!);
    return this.decoder.decode(bytes);
  }

  private encodeWord(word: string): number[] {
    const cached = this.cache.get(word);
    if (cached) return cached;
    let parts = [...this.encoder.encode(word)].map((byte) => this.toChar[byte]!);
    while (parts.length > 1) {
      let best = -1;
      let bestRank = Infinity;
      for (let index = 0; index < parts.length - 1; index++) {
        const rank = this.ranks.get(`${parts[index]} ${parts[index + 1]}`);
        if (rank !== undefined && rank < bestRank) {
          bestRank = rank;
          best = index;
        }
      }
      if (best < 0) break;
      parts = [...parts.slice(0, best), parts[best]! + parts[best + 1]!, ...parts.slice(best + 2)];
    }
    const ids = parts.map((part) => this.ids.get(part)!);
    this.cache.set(word, ids);
    return ids;
  }
}
