/**
 * Promise-based client for the JXL worker.
 * encodeTree(code) -> .jxl bytes; decodeJxl(bytes) -> ImageData.
 */
import type { WorkerResponse } from "./worker.ts";

const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
});

let nextId = 1;
const pending = new Map<
  number,
  { resolve: (v: never) => void; reject: (e: Error) => void }
>();

worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
  const { id } = ev.data;
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  if (ev.data.ok) {
    entry.resolve(ev.data.result as never);
  } else {
    entry.reject(new Error(ev.data.error));
  }
};

function call<T>(type: "encode" | "decode", payload: string | Uint8Array): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}

export function encodeTree(code: string): Promise<Uint8Array> {
  return call<Uint8Array>("encode", code);
}

export function decodeJxl(bytes: Uint8Array): Promise<ImageData> {
  return call<ImageData>("decode", bytes);
}
