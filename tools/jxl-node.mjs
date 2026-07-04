// Node wrapper around the browser-targeted Emscripten jxl module.
// Shims the worker globals the glue expects and feeds wasmBinary directly.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

// The embind glue constructs ImageData/Uint8ClampedArray via val::global().
if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}
if (typeof globalThis.self === "undefined") {
  globalThis.self = globalThis;
}
if (typeof globalThis.location === "undefined") {
  globalThis.location = { href: import.meta.url };
}
// Satisfies the glue's worker-environment check; never actually called
// because we pass wasmBinary directly.
if (typeof globalThis.importScripts === "undefined") {
  globalThis.importScripts = () => {
    throw new Error("importScripts is not available in Node");
  };
}

const wasmPath = fileURLToPath(new URL("../src/jxl/jxl.wasm", import.meta.url));

const { default: initJxl } = await import("../src/jxl/jxl.js");

let stderr = [];
const instance = await initJxl({
  wasmBinary: readFileSync(wasmPath),
  print: () => {},
  printErr: (line) => stderr.push(line),
});

export function encodeTree(code) {
  stderr = [];
  // Strip BOM and non-breaking spaces; the C++ parser only splits on ASCII whitespace.
  code = code.replace(/﻿/g, "").replace(/ /g, " ");
  const bytes = instance.jxl_from_tree(code);
  // jxl_from_tree only prints on failure — and on failure the C++ glue
  // returns the stale /out.jxl from the previous call, so stderr output
  // must be treated as an error even when bytes came back.
  if (stderr.length > 0 || !bytes || bytes.length === 0) {
    throw new Error(stderr.join("\n") || "compile failed");
  }
  return bytes;
}

export function decodeJxl(bytes) {
  stderr = [];
  const img = instance.decode(bytes);
  if (!img) throw new Error(stderr.join("\n") || "decode failed");
  return img; // { data: Uint8ClampedArray, width, height }
}

// Minimal PNG encoder (RGBA8, no filtering) so rendered results can be viewed.
export function toPng(imageData) {
  const { width, height, data } = imageData;
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, "ascii");
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(
      raw,
      rowStart + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
