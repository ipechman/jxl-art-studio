/// <reference lib="webworker" />
/**
 * Web Worker hosting the WASM build of libjxl's jxl_from_tree tool.
 * Protocol: { id, type: "encode" | "decode", payload } in,
 *           { id, ok, result | error } out.
 */
import initJxl from "./jxl/jxl.js";
import type { JxlModule } from "./jxl/jxl.js";
import wasmUrl from "./jxl/jxl.wasm?url";

// stderr lines from the wasm module (parse errors etc.), kept per-call.
let stderrLines: string[] = [];

function createInstance(): Promise<JxlModule> {
  return initJxl({
    locateFile: () => wasmUrl,
    print: () => {},
    printErr: (line: string) => {
      stderrLines.push(line);
    },
  });
}

let instanceP = createInstance();

export type WorkerRequest =
  | { id: number; type: "encode"; payload: string }
  | { id: number; type: "decode"; payload: Uint8Array };

export type WorkerResponse =
  | { id: number; ok: true; result: Uint8Array | ImageData }
  | { id: number; ok: false; error: string };

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = ev.data;
  stderrLines = [];
  try {
    const instance = await instanceP;
    if (type === "encode") {
      // Strip BOM and turn non-breaking spaces into regular ones;
      // the C++ parser only splits on ASCII whitespace.
      const code = payload.replace(/﻿/g, "").replace(/ /g, " ");
      const bytes = instance.jxl_from_tree(code);
      // jxl_from_tree only prints on failure — and on failure the C++ glue
      // returns the stale /out.jxl from the previous call, so stderr output
      // must be treated as an error even when bytes came back.
      if (stderrLines.length > 0 || !bytes || bytes.length === 0) {
        throw new Error(stderrLines.join("\n") || "Could not compile tree code.");
      }
      const msg: WorkerResponse = { id, ok: true, result: bytes };
      (self as unknown as Worker).postMessage(msg, [bytes.buffer]);
    } else {
      const imageData = instance.decode(payload);
      if (!imageData) {
        throw new Error(stderrLines.join("\n") || "Could not decode JXL file.");
      }
      const msg: WorkerResponse = { id, ok: true, result: imageData };
      (self as unknown as Worker).postMessage(msg);
    }
  } catch (e) {
    // The wasm runtime may be left in a broken state after an abort;
    // start a fresh instance so the next call works.
    instanceP = createInstance();
    // Hide C++ internals (file:line assertions) from the user-facing message.
    const human = stderrLines.filter(
      (l) => !/\.cc:\d+|JXL_RETURN_IF_ERROR|JXL_FAILURE|Assertion failure/.test(l),
    );
    const lines = human.length ? human : stderrLines;
    const msg: WorkerResponse = {
      id,
      ok: false,
      error:
        (lines.length ? lines.join("\n") + "\n" : "") +
        (lines.length ? "" : e instanceof Error ? e.message : String(e)),
    };
    (self as unknown as Worker).postMessage(msg);
  }
};
