/**
 * Which wllama build this browser can run, decided by compiling, not by asking (ported from Andai's
 * `llm/wasm.ts`). wllama picks its default build (Memory64 + JSPI) when `WebAssembly.Suspending` exists and
 * `new WebAssembly.Memory({ address: 'i64', initial: 1n })` doesn't throw. Safari 27 (macOS 27, iOS 27) has
 * JSPI and accepts that descriptor but can't compile a Memory64 module ("Memory64 is not enabled", measured
 * with JavaScriptCore on macOS 27.0.1, 2026-11-01). wllama then loads the default build, logs the abort with
 * console.log, and its load promise never settles: the assistant's warm-up timed out on iPhones. Up to
 * wllama 3.8.1 the check is the same. Pure: no wllama import, so the engine stays lazily loaded.
 */

/** `(module (memory i64 1))`: a Memory64 memory section and nothing else. */
const MEMORY64_MODULE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x03, 0x01, 0x04, 0x01,
]);

type Wasm = Pick<typeof WebAssembly, 'validate'> & { Suspending?: unknown };

/** Whether wllama's default (Memory64 + JSPI) build can run here: both features, measured. */
export function defaultBuildRuns(
  wasm: Wasm | null = typeof WebAssembly === 'undefined' ? null : WebAssembly,
): boolean {
  if (!wasm) return false;
  try {
    return !!wasm.Suspending && wasm.validate(MEMORY64_MODULE);
  } catch {
    return false;
  }
}

export interface WorkerResources {
  wasmPath: string;
  jsPath?: string | { code: string };
  compat: boolean;
  noWebGPU?: boolean;
}

/** The worker resources to use, given wllama's choice and what was measured. */
export function forceCompat(
  r: WorkerResources,
  compat: { worker: string; wasm: string } | null,
  defaultRuns: boolean,
): WorkerResources {
  if (r.compat || defaultRuns || !compat) return r;
  return { ...r, wasmPath: compat.wasm, jsPath: compat.worker, compat: true };
}

/**
 * A native log line that means the worker died: wllama only logs these (an abort, even one it logs with
 * console.log; an error inside a worker), and its promise then never settles, so the warm-up stops on them.
 */
const FATAL = /Aborted\(|worker sent an error|Cannot enlarge memory|out of memory|RuntimeError/i;
export const isFatalLog = (line: string): boolean => FATAL.test(line);
