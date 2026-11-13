import type * as Ort from "onnxruntime-web";
import type { ContextScorer, Correction } from "./fixer.js";
import { isCheckable, matchCase } from "./rules.js";
import { WordTrie } from "./trie.js";
import { typoCost } from "./typoCost.js";

const LEFT_WINDOW = 16;
const RIGHT_WINDOW = 4;
const MAX_NEIGHBORS = 8;
const CANDIDATES = MAX_NEIGHBORS + 1;

const PAD = 0;
const UNKNOWN = 1;
const NUMBER = 2;
const START = 3;
const NAME = 4;
const SPECIAL_TOKENS = 5;

/** Known mix-ups like "their" and "there" are likely even when they're far apart on the keyboard. */
const MAX_KNOWN_MIXUP_COST = 1.5;

const TOKEN = /[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:[.,]\d+)*|[^\s\w]/g;
const SENTENCE_OPENERS = new Set([".", "!", "?", ":", '"']);
const WORD = /^[a-z]+(?:'[a-z]+)?$/;

export interface WrongWordOptions {
  ort: typeof Ort;
  session: Ort.InferenceSession;
  /** Lines of the model's vocab.txt, most common word first. */
  vocabulary: readonly string[];
  /** Lines of the model's confusions.txt: a typed word, then words people meant by it. */
  confusions?: readonly string[];
  settings?: WrongWordSettings;
}

export interface WrongWordSettings {
  /** A nearby word must beat the typed word by at least this much. */
  threshold: number;
  /** How strongly an unlikely slip of the fingers counts against a nearby word. */
  costWeight: number;
}

/** Tuned on a dev split to wrongly change at most about 1 correct word in 2,000. */
export const CAREFUL_WRONG_WORD: WrongWordSettings = { threshold: 5, costWeight: 0.5 };

/** Tuned the same way to at most about 1 in 500: fixes more wrong words, and changes more correct ones. */
export const EAGER_WRONG_WORD: WrongWordSettings = { threshold: 2, costWeight: 1 };

export interface WrongWordFinder {
  check(textBefore: string, word: string, textAfter: string): Promise<Correction | null>;
}

export interface NearbyWord {
  word: string;
  /** How much better this word fits than the typed word, as a log-odds difference. */
  margin: number;
  /** How unlikely it is to type the given word when meaning this one. */
  cost: number;
}

const pad = (ids: readonly number[], length: number): number[] => [...new Array<number>(length - ids.length).fill(PAD), ...ids];

/** Lowercases words, except capitalized words mid-sentence, which become a single name token. */
function tokenize(text: string, startsSentence: boolean): string[] {
  const tokens: string[] = [];
  for (const raw of text.replaceAll("’", "'").match(TOKEN) ?? []) {
    const previous = tokens.at(-1);
    const atSentenceStart = previous === undefined ? startsSentence : SENTENCE_OPENERS.has(previous);
    const isPronoun = raw === "I" || raw.startsWith("I'");
    tokens.push(/^[A-Z]/.test(raw) && !atSentenceStart && !isPronoun ? "<name>" : raw.toLowerCase());
  }
  return tokens;
}

/** Compares a correctly spelled word with nearby real words, using the words on both sides of it. */
export class WrongWordChecker implements WrongWordFinder, ContextScorer {
  settings: WrongWordSettings;
  private readonly ids = new Map<string, number>();
  private readonly targets: number[] = [];
  private readonly trie: WordTrie;
  private readonly neighbors = new Map<number, number[]>();
  private readonly knownMixups = new Map<number, number[]>();

  constructor(private readonly options: WrongWordOptions) {
    this.settings = options.settings ?? CAREFUL_WRONG_WORD;
    options.vocabulary.forEach((token, index) => {
      this.ids.set(token, index);
      if (index >= SPECIAL_TOKENS && token.length >= 2 && WORD.test(token)) this.targets.push(index);
    });
    this.trie = new WordTrie(this.targets.map((index) => options.vocabulary[index]!));
    for (const line of options.confusions ?? []) {
      const [typed, ...meant] = line.split(" ").map((token) => this.ids.get(token));
      if (typed !== undefined) this.knownMixups.set(typed, meant.filter((id) => id !== undefined));
    }
  }

  private tokenId(token: string): number {
    if (token === "<name>") return NAME;
    if (/^\d/.test(token)) return NUMBER;
    return this.ids.get(token) ?? UNKNOWN;
  }

  private nearbyIds(id: number): number[] {
    const cached = this.neighbors.get(id);
    if (cached) return cached;
    const oneEdit = this.trie
      .search(this.options.vocabulary[id]!, 1)
      .map((match) => this.targets[match.index]!)
      .filter((other) => other !== id)
      .sort((first, second) => first - second);
    const found = [...new Set([...(this.knownMixups.get(id) ?? []), ...oneEdit])].slice(0, MAX_NEIGHBORS);
    this.neighbors.set(id, found);
    return found;
  }

  /** Returns nearby words with how well each fits, or null when the word isn't one the model can judge. */
  async compare(textBefore: string, word: string, textAfter: string): Promise<NearbyWord[] | null> {
    const typed = this.ids.get(word.toLowerCase());
    if (typed === undefined || typed < SPECIAL_TOKENS) return null;
    const nearby = this.nearbyIds(typed);
    if (nearby.length === 0) return null;

    const scores = await this.runModel(textBefore, textAfter, [[typed, ...nearby]]);
    const mixups = this.knownMixups.get(typed) ?? [];
    return nearby.map((id, index) => {
      const nearbyWord = this.options.vocabulary[id]!;
      const cost = typoCost(word.toLowerCase(), nearbyWord);
      return { word: nearbyWord, margin: scores[index + 1]! - scores[0]!, cost: mixups.includes(id) ? Math.min(cost, MAX_KNOWN_MIXUP_COST) : cost };
    });
  }

  /** Scores spelling candidates by how well they fit the text before them. The first word is the misspelling itself. */
  async score(textBefore: string, words: readonly string[]): Promise<number[]> {
    const ids = [UNKNOWN, ...words.slice(1).map((word) => this.ids.get(word.toLowerCase()) ?? UNKNOWN)];
    const rows: number[][] = [];
    for (let start = 0; start < ids.length; start += MAX_NEIGHBORS) rows.push([PAD, ...ids.slice(start, start + MAX_NEIGHBORS)]);
    const scores = await this.runModel(textBefore, "", rows);
    return ids.map((_, index) => scores[Math.floor(index / MAX_NEIGHBORS) * CANDIDATES + (index % MAX_NEIGHBORS) + 1]!);
  }

  /** Runs the model once per row of candidates, returning scores as one flat array of CANDIDATES per row. */
  private async runModel(textBefore: string, textAfter: string, rows: readonly (readonly number[])[]): Promise<Float32Array> {
    const before = tokenize(textBefore, true).map((token) => this.tokenId(token));
    const left = before.length >= LEFT_WINDOW ? before.slice(-LEFT_WINDOW) : pad([START, ...before], LEFT_WINDOW);
    const right = pad(tokenize(textAfter, false).slice(0, RIGHT_WINDOW).map((token) => this.tokenId(token)).reverse(), RIGHT_WINDOW);
    const tiled = (values: readonly number[]) => rows.flatMap(() => values);
    const tensor = (values: readonly number[], width: number) => new this.options.ort.Tensor("int64", BigInt64Array.from(values, BigInt), [rows.length, width]);
    const output = await this.options.session.run({
      left: tensor(tiled(left), LEFT_WINDOW),
      right: tensor(tiled(right), RIGHT_WINDOW),
      candidates: tensor(rows.flatMap((row) => [...row, ...pad([], CANDIDATES - row.length)]), CANDIDATES),
    });
    return output.scores!.data as Float32Array;
  }

  /** Returns a fix when a nearby word fits the sentence clearly better than the one typed. */
  async check(textBefore: string, word: string, textAfter: string): Promise<Correction | null> {
    if (!isCheckable(word, textBefore)) return null;
    const nearby = await this.compare(textBefore, word, textAfter);
    if (!nearby) return null;
    const ranked = nearby
      .map((item) => ({ ...item, value: item.margin - this.settings.costWeight * item.cost }))
      .sort((first, second) => second.value - first.value);
    const best = ranked[0]!;
    if (best.value < this.settings.threshold) return null;
    return { original: word, replacement: matchCase(word, best.word), confidence: 1 / (1 + Math.exp(-best.margin)), usedContext: true };
  }
}
