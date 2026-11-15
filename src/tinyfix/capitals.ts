/**
 * Capital letters that need no model: the first word of a sentence, and days and months. Each rule looks only at the
 * text typed before the word, the way the editor sees it while someone types. Rules only ever add a capital.
 *
 * Measured in tinyfix-lab (experiments/punct): sentence starts restored about half of the missing capitals and were
 * right 99–100% of the time on careful writing; days and months were right every time. Capitalizing every new line was
 * rejected, because in chat-like notes many lines start in lowercase on purpose.
 */

export type CapitalReason = "sentence-start" | "calendar";

export interface Capital {
  replacement: string;
  reason: CapitalReason;
}

export interface CapitalRules {
  /** False once the writer has shown, on this page, that they don't want sentence starts capitalized. */
  sentenceStarts: boolean;
  /** Days and months the writer put back in lowercase, which stay that way. */
  restoredWords: ReadonlySet<string>;
}

/** Days and months that are not also common words ("may", "march", "sun" and "sat" are left alone). */
const CALENDAR_WORDS: ReadonlySet<string> = new Set(
  (
    "monday tuesday wednesday thursday friday saturday sunday mondays tuesdays wednesdays thursdays fridays saturdays sundays " +
    "january february april june july august september october november december"
  ).split(" "),
);

/** Tokens ending in a full stop that don't end a sentence. "sat." and "sun." are left out: they're common words too. */
const ABBREVIATIONS: ReadonlySet<string> = new Set(
  (
    "e.g. i.e. etc. vs. mr. mrs. ms. dr. st. jr. sr. no. approx. a.m. p.m. am. pm. inc. ltd. co. u.s. fig. cf. al. dept. " +
    "est. min. max. ft. lbs. oz. ext. tel. ref. pl. pls. attn. corp. esp. " +
    "mon. tue. tues. wed. thu. thur. thurs. fri. jan. feb. mar. apr. jun. jul. aug. sep. sept. oct. nov. dec."
  ).split(" "),
);

/** "Hi Sam," on its own line: the letter's first sentence follows. */
const GREETING_LINE = /^(hi|hey|hello|dear|hiya|morning|good (morning|afternoon|evening))( [A-Za-z][\w'-]*){0,2},$/i;
const PLAIN_LOWERCASE_WORD = /^[a-z][a-z'’]*$/;
const ENDS_SENTENCE_THEN_SPACE = /[.!?]["'”’)\]]*\s+$/;
const ENDS_SENTENCE = /[.!?]["'”’)\]]*$/;
/** "(or spoiled with sushi?) but": a question or exclamation inside brackets usually doesn't end the sentence around it. */
const BRACKETED_QUESTION = /[?!][)\]]$/;

const capitalize = (word: string) => word[0]!.toUpperCase() + word.slice(1);

export function capitalizeCalendarWord(word: string): string | null {
  return CALENDAR_WORDS.has(word) ? capitalize(word) : null;
}

/** True when the token before the space is an abbreviation, an initial, a list number, a dotted name or an ellipsis. */
function isFalseSentenceEnd(previousToken: string): boolean {
  const token = previousToken.replace(/["'”’)\]]+$/, "");
  if (BRACKETED_QUESTION.test(previousToken)) return true;
  if (/\.\.$/.test(token)) return true;
  if (ABBREVIATIONS.has(token.toLowerCase())) return true;
  if (/^\d+\.$/.test(token)) return true;
  if (/^[A-Z]\.$/.test(token)) return true;
  return /\w\.\w/.test(token);
}

/** True when the next word starts a sentence. Lines are separated by "\n"; a line starts a sentence only after a closing mark. */
export function startsSentence(textBefore: string): boolean {
  if (textBefore.trim() === "") return true;
  const lines = textBefore.split("\n");
  const currentLine = lines[lines.length - 1]!;
  if (currentLine.trim() === "") {
    const previousLine = lines.findLast((line) => line.trim() !== "")!.trim();
    if (GREETING_LINE.test(previousLine)) return true;
    return ENDS_SENTENCE.test(previousLine) && !isFalseSentenceEnd(previousLine.split(/\s+/).pop()!);
  }
  if (!ENDS_SENTENCE_THEN_SPACE.test(currentLine)) return false;
  return !isFalseSentenceEnd(currentLine.trimEnd().split(/\s+/).pop()!);
}

/** Sentence starts in the text so far: [lowercase count, capitalized count]. "I" is left out, since it's always capital. */
function sentenceStartStyle(textBefore: string): [number, number] {
  let lower = 0;
  let upper = 0;
  for (const match of textBefore.matchAll(/(?:^|[.!?]\s+|\n\s*)([A-Za-z])[a-z]*/g)) {
    const letter = match[1]!;
    if (letter === "I" || letter === "i") continue;
    if (letter === letter.toLowerCase()) lower++;
    else upper++;
  }
  return [lower, upper];
}

/** Capitalizes a finished, all-lowercase word at the start of a sentence, unless the text so far is mostly lowercase sentences. */
export function capitalizeSentenceStart(word: string, textBefore: string): string | null {
  if (!PLAIN_LOWERCASE_WORD.test(word) || !startsSentence(textBefore)) return null;
  const [lower, upper] = sentenceStartStyle(textBefore);
  if (lower >= 2 && lower > upper) return null;
  return capitalize(word);
}

/**
 * The capital for a word just finished, or null. `boundary` is the character typed after it. A word followed by "." or
 * ":" might be the start of a URL, an address or a file name ("https:", "www.", "notes.txt"), so it doesn't get a
 * sentence-start capital.
 */
export function findCapital(word: string, textBefore: string, boundary: string, rules: CapitalRules): Capital | null {
  const calendar = rules.restoredWords.has(word) ? null : capitalizeCalendarWord(word);
  if (calendar) return { replacement: calendar, reason: "calendar" };
  const mayStartSentence = rules.sentenceStarts && boundary !== "." && boundary !== ":";
  const sentenceStart = mayStartSentence ? capitalizeSentenceStart(word, textBefore) : null;
  return sentenceStart ? { replacement: sentenceStart, reason: "sentence-start" } : null;
}

/**
 * Sentence-start capitals a writer has to undo twice on a page before they stop. Some people write in lowercase on
 * purpose (in the experiment, casual lowercase chat got about 16 capitals per 1,000 words), and two undos is a clear
 * enough signal without making them find the switch. Days and months keep working: they were right every time.
 */
const UNDOS_BEFORE_LOWERCASE = 2;

/** What the writer has undone on one page this session, so the same capitals don't keep coming back. */
export class CapitalUndos {
  private sentenceStarts = 0;
  private readonly restoredWords = new Set<string>();

  record(reason: CapitalReason, original: string): void {
    if (reason === "sentence-start") this.sentenceStarts++;
    else this.restoredWords.add(original);
  }

  rules(): CapitalRules {
    return { sentenceStarts: this.sentenceStarts < UNDOS_BEFORE_LOWERCASE, restoredWords: this.restoredWords };
  }
}
