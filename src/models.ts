import * as ort from "onnxruntime-web";
import { Fixer, WITH_MODEL_WEIGHTS, parseWordList } from "./tinyfix/fixer";
import { WordTrie } from "./tinyfix/trie";
import { EAGER_WRONG_WORD, WrongWordChecker } from "./tinyfix/wrongWord";

export interface Models {
  fixer: Fixer;
  wrongWord: WrongWordChecker;
}

async function fetchFile(path: string): Promise<Response> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!response.ok) throw new Error(`Couldn't load ${path} (${response.status}).`);
  return response;
}

const SPELLING_MIN_CONFIDENCE = 0.55;

const lines = (text: string) => text.split("\n").filter(Boolean);
const bytes = (response: Response) => response.arrayBuffer().then((buffer) => new Uint8Array(buffer));
/** Lets the browser draw and handle input before the next piece of setup, so loading never freezes typing. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve));
const createSession = (model: Uint8Array) => ort.InferenceSession.create(model, { executionProviders: ["wasm"] });

/** Loads tinyfix and its dictionary. After the first visit the service worker serves all of it from the cache. */
export async function loadModels(): Promise<Models> {
  const [wrongWordModel, words, vocabulary, confusions] = await Promise.all([
    fetchFile("models/wrong-word.onnx").then(bytes),
    fetchFile("models/words.txt").then((response) => response.text()),
    fetchFile("models/wrong-word-vocab.txt").then((response) => response.text()),
    fetchFile("models/wrong-word-confusions.txt").then((response) => response.text()),
  ]);
  // One thread, so the page needs no cross-origin isolation headers. ONNX Runtime loads its own WASM file, which the build bundles.
  ort.env.wasm.numThreads = 1;
  // ONNX Runtime runs the model in its own worker, so starting it doesn't block the page.
  ort.env.wasm.proxy = true;
  const wrongWordSession = await createSession(wrongWordModel);

  await nextTask();
  const wrongWord = new WrongWordChecker({
    ort,
    session: wrongWordSession,
    vocabulary: lines(vocabulary),
    confusions: lines(confusions),
    settings: EAGER_WRONG_WORD,
  });
  // 55% instead of the library's 70%. On tinyfix's spelling eval it fixes 71% of misspellings instead of 62%, and
  // 93.5% of fixes are right instead of 96.6%. Wrong changes to correct email text go from 0.21 to 0.25 per 1,000
  // words (the library was tuned to stay under 0.5). Code-heavy GitHub text gets worse, which a prose app can accept.
  // This bar is what lets a doubled-key slip like "sporrt" become "sport" (55% sure).
  await nextTask();
  const wordList = parseWordList(words);
  await nextTask();
  const trie = await WordTrie.inSteps(
    wordList.map((entry) => entry.word),
    nextTask,
  );
  const fixer = new Fixer({
    words: wordList,
    trie,
    scorer: wrongWord,
    weights: { ...WITH_MODEL_WEIGHTS, minConfidence: SPELLING_MIN_CONFIDENCE },
  });
  return { fixer, wrongWord };
}
