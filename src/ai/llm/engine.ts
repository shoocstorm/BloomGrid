import type { ModelManager, Wllama } from '@wllama/wllama';
import { verifyBlobs } from './integrity';
import { MODELS, isMlx, modelById, type MlxDef, type ModelDef, type WllamaDef } from './models';
import {
  downloadCheckpoint,
  genTokPerSec,
  nativeGenerate,
  nativeLoad,
  nativeRemove,
  nativeStatus,
  nativeUnload,
  type ChatMessage,
  type NativeStatus,
  type Progress,
} from './native';

/**
 * The city assistant's local LLM on one of two engines (ported from Andai's `llm/engine.ts`):
 * - wllama (llama.cpp → WASM, WebGPU when available) in the page, everywhere. On WKWebView (the macOS
 *   desktop shell) wllama switches itself to the compat build served from `public/wllama/compat/`.
 * - MLX natively in Rust on Apple Silicon desktop builds (`native.ts`), 5–10× faster.
 * Callers don't care which: `generate` streams the same way on both.
 *
 * GGUF models are cached in OPFS by wllama's ModelManager and checked against the catalog's pinned
 * size and sha256 before loading; MLX checkpoints live in Rust's verified store. wllama itself is
 * loaded lazily (a dynamic import) so the game never pays for it until the assistant loads a model.
 */

export type { ChatMessage, Progress } from './native';

export interface GenOptions {
  maxTokens: number;
  temperature: number;
  /** GBNF grammar the reply must follow (a letter choice, or a JSON shape). */
  grammar?: string;
  /** Qwen3's reasoning block; off for the assistant's tool steps (speed). */
  thinking?: boolean;
  signal?: AbortSignal;
}

export interface EngineInfo {
  backend: string;
  context: number;
}

export interface EngineState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  loadingId: string | null;
  loadedId: string | null;
  progress: Progress | null;
  error: string | null;
  info: EngineInfo | null;
  /** Downloaded models by id (OPFS copies, or Rust's verified store). */
  cached: Set<string>;
  native: NativeStatus;
  generating: boolean;
  tokPerSec: number | null;
  /** Whether multithreaded wllama is possible here (cross-origin isolated page). */
  isolated: boolean;
}

const asset = (path: string) => new URL(path, window.location.href).href;
const VERIFIED_KEY = 'bloomgrid.ai.verifiedModels';
const LAST_KEY = 'bloomgrid.ai.lastModel';

function readVerified(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(VERIFIED_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function setVerified(url: string, sha256: string | null): void {
  const v = readVerified();
  if (sha256) v[url] = sha256;
  else delete v[url];
  try {
    localStorage.setItem(VERIFIED_KEY, JSON.stringify(v));
  } catch {
    /* private mode: re-verify next time */
  }
}

export const isAbort = (e: unknown) =>
  e instanceof Error && (e.name === 'AbortError' || e.name === 'WllamaAbortError');

export class LlmEngine {
  state: EngineState = {
    status: 'idle',
    loadingId: null,
    loadedId: null,
    progress: null,
    error: null,
    info: null,
    cached: new Set(),
    native: { supported: false, chat: null, decider: null, checkpoints: [], memory: null },
    generating: false,
    tokPerSec: null,
    isolated: typeof window !== 'undefined' && window.crossOriginIsolated === true,
  };
  private listeners = new Set<(s: EngineState) => void>();
  private wllama: Wllama | null = null;
  private manager: ModelManager | null = null;
  private lib: typeof import('@wllama/wllama') | null = null;

  onChange(fn: (s: EngineState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  get loaded(): ModelDef | undefined {
    return modelById(this.state.loadedId);
  }

  private async wl(): Promise<typeof import('@wllama/wllama')> {
    this.lib ??= await import('@wllama/wllama');
    return this.lib;
  }

  private async modelManager(): Promise<ModelManager | null> {
    if (this.manager) return this.manager;
    try {
      this.manager = new (await this.wl()).ModelManager();
    } catch (e) {
      console.warn('[ai] model cache unavailable', e);
    }
    return this.manager;
  }

  /** Re-reads which models are downloaded (OPFS and Rust's store). */
  async refresh(): Promise<void> {
    const cached = new Set<string>();
    const native = await nativeStatus().catch(() => this.state.native);
    for (const def of MODELS)
      if (isMlx(def) && native.checkpoints.some((c) => c.id === def.native && c.downloaded))
        cached.add(def.id);
    try {
      const mm = await this.modelManager();
      const urls = new Set(((await mm?.getModels()) ?? []).filter((m) => m.size > 0).map((m) => m.url));
      for (const def of MODELS) if (!isMlx(def) && urls.has(def.url)) cached.add(def.id);
    } catch (e) {
      console.warn('[ai] cache listing failed', e);
    }
    this.set({ cached, native });
  }

  /** Downloads (if needed), verifies and loads a model; the previous one is unloaded first. */
  async load(id: string): Promise<void> {
    const def = modelById(id);
    if (!def) throw new Error(`Unknown model ${id}`);
    if (this.state.status === 'loading' || this.state.loadedId === id) return;
    if (this.state.loadedId) await this.unload();
    this.set({
      status: 'loading',
      loadingId: id,
      error: null,
      progress: { loaded: 0, total: def.bytes, speed: 0, phase: 'Connecting…' },
    });
    try {
      if (isMlx(def)) {
        await this.ensureNative(def);
        const loaded = await nativeLoad(def.native, def.n_ctx);
        this.set({ info: { backend: `MLX · Metal (native, ${loaded.bits}-bit)`, context: loaded.nCtx } });
      } else {
        const model = await this.openVerified(def);
        let gpu: { layers: number; total: number } | null = null;
        const w = await this.newWllama((g) => (gpu = g));
        await w.loadModel(model, { n_ctx: def.n_ctx, reasoning_format: 'none' } as Parameters<
          Wllama['loadModel']
        >[1]);
        this.wllama = w;
        const g = gpu as { layers: number; total: number } | null;
        const backend = g
          ? g.layers > 0
            ? `WebGPU · ${g.layers}/${g.total} layers`
            : 'WASM · CPU (no GPU adapter)'
          : w.isSupportWebGPU()
            ? 'WebGPU'
            : 'WASM · CPU';
        this.set({
          info: {
            backend: `${backend} · ${w.isMultithread() ? `${w.getNumThreads()} threads` : '1 thread'}`,
            context: def.n_ctx,
          },
        });
      }
      this.set({ status: 'ready', loadingId: null, loadedId: id, progress: null });
      try {
        localStorage.setItem(LAST_KEY, id);
      } catch {
        /* ignore */
      }
    } catch (e) {
      console.error('[ai] load failed', e);
      this.set({
        status: 'error',
        loadingId: null,
        progress: null,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      await this.refresh();
    }
  }

  async unload(): Promise<void> {
    const native = isMlx(this.loaded);
    const w = this.wllama;
    this.wllama = null;
    this.set({ status: 'idle', loadedId: null, info: null, tokPerSec: null });
    await w?.exit().catch(() => {});
    if (native) await nativeUnload().catch(() => {});
  }

  /** Deletes a downloaded model (the UI confirms first). */
  async remove(id: string): Promise<void> {
    const def = modelById(id);
    if (!def) return;
    if (this.state.loadedId === id) await this.unload();
    if (isMlx(def)) await nativeRemove(def.native);
    else {
      const mm = await this.modelManager();
      for (const m of (await mm?.getModels()) ?? []) if (m.url === def.url) await m.remove();
      setVerified(def.url, null);
    }
    await this.refresh();
  }

  /** The model loaded last, if it's still downloaded. */
  lastUsed(): ModelDef | undefined {
    try {
      const def = modelById(localStorage.getItem(LAST_KEY));
      return def && this.state.cached.has(def.id) ? def : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * One completion. Text streams through `onText` (each piece as written); resolves with the whole reply.
   * Throws an AbortError when `opts.signal` aborts.
   */
  async generate(
    messages: ChatMessage[],
    opts: GenOptions,
    onText: (piece: string) => void = () => {},
  ): Promise<string> {
    const def = this.loaded;
    if (!def || this.state.status !== 'ready')
      throw new Error('No model loaded: pick one in the assistant panel.');
    this.set({ generating: true });
    try {
      if (isMlx(def)) {
        const out = await nativeGenerate(
          messages,
          {
            maxTokens: opts.maxTokens,
            temperature: opts.temperature,
            topK: 40,
            topP: 0.95,
            thinking: def.thinking && !!opts.thinking,
            grammar: opts.grammar,
          },
          onText,
          opts.signal,
        );
        this.set({ tokPerSec: genTokPerSec(out) });
        return out.text;
      }
      const w = this.wllama!;
      const started = performance.now();
      let text = '';
      let tokens = 0;
      const stream = (await w.createChatCompletion({
        messages,
        stream: true,
        abortSignal: opts.signal,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        top_p: 0.95,
        top_k: 40,
        ...(opts.grammar ? { grammar: opts.grammar } : {}),
        ...(def.thinking ? { chat_template_kwargs: { enable_thinking: !!opts.thinking } } : {}),
      } as Parameters<Wllama['createChatCompletion']>[0] & { stream: true })) as AsyncIterable<{
        choices?: { delta?: { content?: string | null } }[];
      }>;
      for await (const chunk of stream) {
        const piece = chunk.choices?.[0]?.delta?.content;
        if (!piece) continue;
        text += piece;
        tokens++;
        onText(piece);
      }
      const secs = (performance.now() - started) / 1000;
      if (tokens > 1 && secs > 0) this.set({ tokPerSec: tokens / secs });
      return text;
    } finally {
      this.set({ generating: false });
    }
  }

  private async newWllama(onGpu: (gpu: { layers: number; total: number }) => void): Promise<Wllama> {
    const { Wllama: W } = await this.wl();
    // llama.cpp's load log says whether WebGPU took the layers; `navigator.gpu` existing says neither (Andai).
    const watch =
      (fn: (...a: unknown[]) => void) =>
      (...a: unknown[]) => {
        const line = a.map(String).join(' ');
        const m = /offloaded (\d+)\/(\d+) layers to GPU/.exec(line);
        if (m) onGpu({ layers: Number(m[1]), total: Number(m[2]) });
        else if (/ggml_webgpu: Failed to get an adapter/.test(line)) onGpu({ layers: 0, total: 0 });
        fn(...a);
      };
    const logger = {
      debug: watch(() => {}),
      log: watch(() => {}),
      warn: watch(console.warn),
      error: watch(console.error),
    };
    const w = new W({ default: asset('/wllama/default/wllama.wasm') }, {
      parallelDownloads: 3,
      logger,
    } as ConstructorParameters<typeof W>[1]);
    (w as unknown as { setCompat(c: { worker: string; wasm: string }): void }).setCompat({
      worker: asset('/wllama/compat/wllama.js'),
      wasm: asset('/wllama/compat/wllama.wasm'),
    });
    return w;
  }

  /** Downloads (or reuses the OPFS copy of) a GGUF model and verifies it against its pin before anything may load it. */
  private async openVerified(def: WllamaDef) {
    const started = performance.now();
    const mm = await this.modelManager();
    if (!mm) throw new Error('The model cache (OPFS) is unavailable in this browser.');
    const wasCached = (await mm.getModels()).some((m) => m.url === def.url && m.size > 0);
    const model = await mm.getModelOrDownload(
      { url: def.url } as Parameters<ModelManager['getModelOrDownload']>[0],
      {
        progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
          const secs = (performance.now() - started) / 1000;
          this.set({
            progress: {
              loaded,
              total: total || def.bytes,
              speed: secs > 0 ? loaded / secs : 0,
              phase: 'Downloading',
            },
          });
        },
      } as Parameters<ModelManager['getModelOrDownload']>[1],
    );
    if (!wasCached || readVerified()[def.url] !== def.sha256) {
      const done = (loaded: number) =>
        this.set({ progress: { loaded, total: def.bytes, speed: 0, phase: 'Verifying…' } });
      done(0);
      const verdict = await verifyBlobs(await model.open(), def, done);
      if (!verdict.ok) {
        await model.remove();
        setVerified(def.url, null);
        throw new Error(
          `The downloaded ${def.name} failed its integrity check (${verdict.reason}), so it was removed and not loaded. Try again.`,
        );
      }
      setVerified(def.url, def.sha256);
    }
    this.set({ progress: { loaded: def.bytes, total: def.bytes, speed: 0, phase: 'Warming up…' } });
    return model;
  }

  /** Downloads an MLX model into Rust's store when it isn't there yet (Rust verifies every file). */
  private async ensureNative(def: MlxDef): Promise<void> {
    const native = await nativeStatus();
    this.set({ native });
    const c = native.checkpoints.find((x) => x.id === def.native);
    if (!c)
      throw new Error(
        `${def.name} runs on MLX, which needs the BloomGrid desktop app on an Apple Silicon Mac.`,
      );
    if (!c.downloaded) await downloadCheckpoint(c, (progress) => this.set({ progress }));
    this.set({ progress: { loaded: def.bytes, total: def.bytes, speed: 0, phase: 'Loading…' } });
  }
}
