// onnxruntime-web's package exports don't list its .wasm, so it's imported by path. Vite emits it once for both bundles.
import runtimeUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url";
import type { ModelFiles, WorkerReply, WorkerRequest } from "./worker";

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't load ${url} (${response.status}).`);
  return response;
}

/**
 * The page downloads the model and hands it to the worker. In a private Space embedded on huggingface.co, the iframe's
 * own requests carry the Space's login but a worker's requests don't, so the worker would get 401s.
 */
async function downloadFiles(base: string): Promise<ModelFiles> {
  const at = (name: string) => `${base}${name}`;
  const [graph, weights, manifest, config, tokenizer, runtime] = await Promise.all([
    fetchOk(at("graph.onnx")).then((r) => r.arrayBuffer()),
    fetchOk(at("weights.q8")).then((r) => r.arrayBuffer()),
    fetchOk(at("weights.json")).then((r) => r.json()),
    fetchOk(at("config.json")).then((r) => r.json()),
    fetchOk(at("tokenizer.json")).then((r) => r.json()),
    fetchOk(new URL(runtimeUrl, location.href).href).then((r) => r.arrayBuffer()),
  ]);
  return { graph, weights, manifest, config, tokenizer, runtime };
}

/** tinynext in a Web Worker. The main thread only posts text and gets suggestions back. */
export class TinyNextClient {
  private readonly worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  private readonly pending = new Map<number, (text: string) => void>();
  private nextId = 1;
  /** Milliseconds per suggestion, measured inside the worker. */
  readonly timings: number[] = [];

  /** Resolves once the model is loaded and ready, with how long that took. */
  async load(base: string): Promise<number> {
    const files = await downloadFiles(base);
    return new Promise((resolve, reject) => {
      this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        const reply = event.data;
        if (reply.type === "loaded") resolve(reply.milliseconds);
        else if (reply.type === "failed") reject(new Error(reply.error));
        else {
          this.timings.push(reply.milliseconds);
          this.pending.get(reply.id)?.(reply.text);
          this.pending.delete(reply.id);
        }
      };
      this.worker.postMessage({ type: "load", files } satisfies WorkerRequest, [
        files.graph,
        files.weights,
        files.runtime,
      ]);
    });
  }

  suggest(before: string, after: string): Promise<string> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.send({ type: "suggest", id, before, after });
    });
  }

  private send(request: WorkerRequest): void {
    this.worker.postMessage(request);
  }
}
