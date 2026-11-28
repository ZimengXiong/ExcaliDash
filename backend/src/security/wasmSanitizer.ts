/**
 * HTML/SVG sanitizer compiled from backend/sanitizer (Rust, ammonia) to WebAssembly.
 * It replaces DOMPurify on jsdom, which alone held about 40 MB of the backend heap.
 *
 * Every call gets a fresh instance: WebAssembly memory only grows, so one shared
 * instance would keep the memory of the largest preview (an embedded 15 MB image
 * grows it past 100 MB) until the process restarts.
 */
import fs from "fs";
import path from "path";

type SanitizerExports = {
  memory: WebAssembly.Memory;
  alloc: (len: number) => number;
  sanitize: (kind: number, ptr: number, len: number) => void;
  out_ptr: () => number;
  out_len: () => number;
};

const WASM_PATH = path.resolve(
  __dirname,
  "../../wasm/excalidash_sanitizer.wasm",
);

const sanitizerModule = new WebAssembly.Module(fs.readFileSync(WASM_PATH));
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const run = (kind: 0 | 1, input: string): string => {
  const wasm = new WebAssembly.Instance(sanitizerModule, {})
    .exports as unknown as SanitizerExports;
  const bytes = encoder.encode(input);
  const ptr = wasm.alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  wasm.sanitize(kind, ptr, bytes.length);
  return decoder.decode(
    new Uint8Array(wasm.memory.buffer, wasm.out_ptr(), wasm.out_len()),
  );
};

/** Keeps only the SVG shapes, paint and text attributes previews use. */
export const sanitizeSvgMarkup = (input: string): string => run(0, input);

/** Keeps only b, i, u, em, strong, br and span without attributes. */
export const sanitizeTextMarkup = (input: string): string => run(1, input);
