/// <reference lib="webworker" />
// Runs tinynext v2 off the main thread, so typing never waits on the model.
import * as ort from "onnxruntime-web";
import { Suggester, type ModelConfig } from "./suggest";
import { Tokenizer } from "./tokenizer";

export type WorkerRequest = { type: "load"; base: string } | { type: "suggest"; id: number; before: string; after: string };
export type WorkerReply =
  | { type: "loaded"; milliseconds: number }
  | { type: "failed"; error: string }
  | { type: "suggestion"; id: number; text: string; milliseconds: number };

interface WeightsManifest {
  block: number;
  f32_bytes: number;
  tensors: Array<{ count: number; f32_offset: number; q_offset: number; scale_offset: number }>;
}

/** Expands int8 weights (one scale per block) back to the float32 external data the graph expects. */
function expand(manifest: WeightsManifest, q8: ArrayBuffer): Uint8Array {
  const out = new Float32Array(manifest.f32_bytes / 4);
  for (const tensor of manifest.tensors) {
    const values = new Int8Array(q8, tensor.q_offset, tensor.count);
    const scales = new Float32Array(q8, tensor.scale_offset, Math.ceil(tensor.count / manifest.block));
    const start = tensor.f32_offset / 4;
    for (let index = 0; index < tensor.count; index++) out[start + index] = values[index]! * scales[Math.floor(index / manifest.block)]!;
  }
  return new Uint8Array(out.buffer);
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't load ${url} (${response.status}).`);
  return response;
}

let suggester: Suggester | null = null;
const post = (reply: WorkerReply) => self.postMessage(reply);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "load") {
    const began = performance.now();
    try {
      const at = (name: string) => `${request.base}${name}`;
      const [graph, q8, manifest, config, tokenizer] = await Promise.all([
        fetchOk(at("graph.onnx")).then((r) => r.arrayBuffer()),
        fetchOk(at("weights.q8")).then((r) => r.arrayBuffer()),
        fetchOk(at("weights.json")).then((r) => r.json() as Promise<WeightsManifest>),
        fetchOk(at("config.json")).then((r) => r.json() as Promise<ModelConfig>),
        fetchOk(at("tokenizer.json")).then((r) => r.json()),
      ]);
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create(new Uint8Array(graph), {
        executionProviders: ["wasm"],
        externalData: [{ path: "weights.f32", data: expand(manifest, q8) }],
      });
      suggester = new Suggester(ort, session, new Tokenizer(tokenizer), config);
      post({ type: "loaded", milliseconds: performance.now() - began });
    } catch (error) {
      post({ type: "failed", error: String(error) });
    }
    return;
  }
  if (!suggester) return;
  const began = performance.now();
  const text = await suggester.suggest(request.before, request.after);
  post({ type: "suggestion", id: request.id, text, milliseconds: performance.now() - began });
};
