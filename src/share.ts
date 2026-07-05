/**
 * Share links. The tree code is stored as `zcode` = URL-safe base64 of
 * raw-deflate — the same scheme the community editors use. Builder state
 * (recipe + params + strokes) travels alongside in `r` and `p`; mix state
 * (layer list) in `m` and `p`.
 */
import type { ParamValues, Stroke } from "./recipes/types.ts";
import type { MixLayer } from "./presets.ts";

async function pipeThrough(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const blob = new Blob([bytes as BlobPart]);
  const out = blob.stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const deflateRaw = (text: string) =>
  pipeThrough(new TextEncoder().encode(text), new CompressionStream("deflate-raw"));

const inflateRaw = async (bytes: Uint8Array) =>
  new TextDecoder().decode(
    await pipeThrough(bytes, new DecompressionStream("deflate-raw")),
  );

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export interface ShareState {
  mode: "builder" | "code" | "mix";
  code: string;
  recipeId?: string;
  values?: ParamValues;
  strokes?: Stroke[];
  layers?: MixLayer[];
  rotate?: number;
  /** Live doodle backing a mix's "My Doodle" base layer. */
  doodle?: { v: ParamValues; s: Stroke[] };
}

export async function buildHash(state: ShareState): Promise<string> {
  const parts = [`zcode=${b64urlEncode(await deflateRaw(state.code))}`];
  if (state.mode === "builder" && state.recipeId) {
    parts.push(`r=${encodeURIComponent(state.recipeId)}`);
    const payload = JSON.stringify({ v: state.values ?? {}, s: state.strokes ?? [] });
    parts.push(`p=${b64urlEncode(await deflateRaw(payload))}`);
  } else if (state.mode === "mix" && state.layers?.length) {
    parts.push("m=1");
    const payload = JSON.stringify({
      l: state.layers,
      r: state.rotate ?? 0,
      d: state.doodle,
    });
    parts.push(`p=${b64urlEncode(await deflateRaw(payload))}`);
  }
  return "#" + parts.join("&");
}

export async function parseHash(hash: string): Promise<ShareState | null> {
  if (!hash || hash.length < 2) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const zcode = params.get("zcode");
  if (!zcode) return null;
  try {
    const code = await inflateRaw(b64urlDecode(zcode));
    const p = params.get("p");
    if (params.get("m") && p) {
      const payload = JSON.parse(await inflateRaw(b64urlDecode(p))) as {
        l: MixLayer[];
        r?: number;
        d?: { v: ParamValues; s: Stroke[] };
      };
      return { mode: "mix", code, layers: payload.l, rotate: payload.r, doodle: payload.d };
    }
    const recipeId = params.get("r") ?? undefined;
    if (recipeId && p) {
      const payload = JSON.parse(await inflateRaw(b64urlDecode(p))) as {
        v: ParamValues;
        s: Stroke[];
      };
      return { mode: "builder", code, recipeId, values: payload.v, strokes: payload.s };
    }
    return { mode: "code", code };
  } catch {
    return null;
  }
}
