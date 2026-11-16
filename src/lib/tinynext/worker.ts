/// <reference lib="webworker" />
// Runs tinynext off the main thread, so typing never waits on the model.
import * as ort from "onnxruntime-web";
import { Suggester, type ModelConfig } from "./suggest";
import { Tokenizer } from "./tokenizer";

/** Everything the worker needs, downloaded by the page (see client.ts for why the worker doesn't fetch). */
export interface ModelFiles {
  graph: ArrayBuffer;
  weights: ArrayBuffer;
  manifest: WeightsManifest;
  config: ModelConfig;
  tokenizer: unknown;
  /** onnxruntime-web's WebAssembly binary. */
  runtime: ArrayBuffer;
}

export type WorkerRequest =
  | { type: "load"; files: ModelFiles }
  | { type: "suggest"; id: number; before: string; after: string };
export type WorkerReply =
  | { type: "loaded"; milliseconds: number }
  | { type: "failed"; error: string }
  | { type: "suggestion"; id: number; text: string; milliseconds: number };

export interface WeightsManifest {
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
    for (let index = 0; index < tensor.count; index++)
      out[start + index] = values[index]! * scales[Math.floor(index / manifest.block)]!;
  }
  return new Uint8Array(out.buffer);
}

let suggester: Suggester | null = null;
const post = (reply: WorkerReply) => self.postMessage(reply);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "load") {
    const began = performance.now();
    try {
      const { graph, weights, manifest, config, tokenizer, runtime } = request.files;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmBinary = runtime;
      const session = await ort.InferenceSession.create(new Uint8Array(graph), {
        executionProviders: ["wasm"],
        externalData: [{ path: "weights.f32", data: expand(manifest, weights) }],
      });
      suggester = new Suggester(
        ort,
        session,
        new Tokenizer(tokenizer as ConstructorParameters<typeof Tokenizer>[0]),
        config,
      );
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
