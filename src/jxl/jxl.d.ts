/**
 * Type declarations for the Emscripten-compiled jxl module
 * (vendored from https://github.com/surma/jxl-art, Apache-2.0,
 * built from libjxl v0.10.0 tools/jxl_from_tree.cc).
 */
export interface JxlModule {
  /** Compiles jxl_from_tree "tree" source code into a .jxl file. */
  jxl_from_tree(code: string): Uint8Array;
  /** Decodes a .jxl file into RGBA pixels. Returns null on failure. */
  decode(data: Uint8Array): ImageData | null;
}

export interface JxlModuleArgs {
  locateFile?(path: string): string;
  print?(line: string): void;
  printErr?(line: string): void;
}

export default function init(moduleArg?: JxlModuleArgs): Promise<JxlModule>;
