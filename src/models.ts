import * as ort from "onnxruntime-web";
import { Autocomplete } from "./autocomplete";
import { Fixer, WITH_MODEL_WEIGHTS, parseWordList } from "./tinyfix/fixer";
import { EAGER_WRONG_WORD, WrongWordChecker } from "./tinyfix/wrongWord";

export interface Models {
  fixer: Fixer;
  wrongWord: WrongWordChecker;
  autocomplete: Autocomplete;
}

async function fetchFile(path: string): Promise<Response> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!response.ok) throw new Error(`Couldn't load ${path} (${response.status}).`);
  return response;
}

const lines = (text: string) => text.split("\n").filter(Boolean);
const bytes = (response: Response) => response.arrayBuffer().then((buffer) => new Uint8Array(buffer));
const createSession = (model: Uint8Array) => ort.InferenceSession.create(model, { executionProviders: ["wasm"] });

/** Loads both models and the dictionary. After the first visit the service worker serves all of it from the cache. */
export async function loadModels(): Promise<Models> {
  const [wrongWordModel, autocompleteModel, words, vocabulary, confusions] = await Promise.all([
    fetchFile("models/wrong-word.onnx").then(bytes),
    fetchFile("models/autocomplete.onnx").then(bytes),
    fetchFile("models/words.txt").then((response) => response.text()),
    fetchFile("models/wrong-word-vocab.txt").then((response) => response.text()),
    fetchFile("models/wrong-word-confusions.txt").then((response) => response.text()),
  ]);
  // One thread, so the page needs no cross-origin isolation headers. ONNX Runtime loads its own WASM file, which the build bundles.
  ort.env.wasm.numThreads = 1;
  const [wrongWordSession, autocompleteSession] = await Promise.all([createSession(wrongWordModel), createSession(autocompleteModel)]);

  const wrongWord = new WrongWordChecker({
    ort,
    session: wrongWordSession,
    vocabulary: lines(vocabulary),
    confusions: lines(confusions),
    settings: EAGER_WRONG_WORD,
  });
  const fixer = new Fixer({ words: parseWordList(words), scorer: wrongWord, weights: WITH_MODEL_WEIGHTS });
  return { fixer, wrongWord, autocomplete: new Autocomplete(autocompleteSession) };
}
