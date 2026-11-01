import { describe, expect, it } from 'vitest';
import { defaultBuildRuns, forceCompat, isFatalLog } from '@/ai/llm/wasm';

describe('which wllama build runs here', () => {
  it('needs JSPI and a Memory64 module that validates, measured, not assumed', () => {
    // Safari 27 (JavaScriptCore on macOS 27.0.1): Suspending exists, Memory64 doesn't compile
    expect(defaultBuildRuns({ Suspending: function () {}, validate: () => false })).toBe(false);
    expect(defaultBuildRuns({ validate: () => true })).toBe(false);
    expect(defaultBuildRuns({ Suspending: function () {}, validate: () => true })).toBe(true);
    const throws = () => {
      throw new Error('no');
    };
    expect(defaultBuildRuns({ Suspending: 1, validate: throws })).toBe(false);
    expect(defaultBuildRuns(null)).toBe(false);
  });

  it('hands validate a well-formed Memory64 module', () => {
    let bytes: BufferSource | undefined;
    defaultBuildRuns({ Suspending: 1, validate: (b) => ((bytes = b), true) });
    // (module (memory i64 1)): memory section, flags 0x04 = 64-bit index
    expect([...(bytes as Uint8Array)]).toEqual([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 5, 3, 1, 4, 1]);
    // the same module with a 32-bit memory is valid wasm everywhere
    expect(WebAssembly.validate(new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 5, 3, 1, 0, 1]))).toBe(true);
  });

  it("moves to the compat build only when wllama's choice can't run", () => {
    const compat = { worker: 'http://x/wllama/compat/wllama.js', wasm: 'http://x/wllama/compat/wllama.wasm' };
    const def = { wasmPath: 'http://x/wllama/default/wllama.wasm', compat: false };
    expect(forceCompat(def, compat, false)).toEqual({
      wasmPath: compat.wasm,
      jsPath: compat.worker,
      compat: true,
    });
    expect(forceCompat(def, compat, true)).toBe(def);
    expect(forceCompat(def, null, false)).toBe(def);
    const already = { wasmPath: 'a', jsPath: 'b', compat: true };
    expect(forceCompat(already, compat, false)).toBe(already);
  });

  it('knows a dead worker from ordinary native output', () => {
    for (const line of [
      "Aborted(CompileError: WebAssembly.Module doesn't parse at byte 4617: Memory64 is not enabled)",
      'worker sent an error! blob:x:1: RuntimeError: unreachable',
      'Cannot enlarge memory arrays to size 1073741824 bytes',
    ])
      expect(isFatalLog(line)).toBe(true);
    for (const line of ['llama_model_load: loading tensors', 'ggml_webgpu: Failed to get an adapter'])
      expect(isFatalLog(line)).toBe(false);
  });
});
