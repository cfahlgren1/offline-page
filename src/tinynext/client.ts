import type { WorkerReply, WorkerRequest } from "./worker";

/** tinynext v2 in a Web Worker. The main thread only posts text and gets suggestions back. */
export class TinyNextClient {
  private readonly worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  private readonly pending = new Map<number, (text: string) => void>();
  private nextId = 1;
  /** Milliseconds per suggestion, measured inside the worker. */
  readonly timings: number[] = [];

  /** Resolves once the model is loaded and ready, with how long that took. */
  load(base: string): Promise<number> {
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
      this.send({ type: "load", base });
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
