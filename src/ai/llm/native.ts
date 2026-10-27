import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { pinnedFileUrl } from './models';

/**
 * Native chat models run by Rust on MLX (`src-tauri/src/llm/`, Apple Silicon desktop only; ported from
 * Andai): typed wrappers over its commands, and the checkpoint download. The Rust side has no HTTP client,
 * so the webview fetches each file from its pinned Hugging Face commit and streams it to Rust in chunks;
 * Rust keeps nothing it can't verify against its catalog.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface NativeCheckpoint {
  id: string;
  repo: string;
  commit: string;
  bytes: number;
  files: { path: string; bytes: number }[];
  downloaded: boolean;
}

export interface NativeStatus {
  supported: boolean;
  /** Checkpoint id loaded per slot. */
  chat: string | null;
  decider: string | null;
  checkpoints: NativeCheckpoint[];
  /** This Mac's memory in bytes (null where unknown). */
  memory: number | null;
}

export interface NativeParams {
  maxTokens: number;
  temperature: number;
  topK?: number;
  topP?: number;
  seed?: number;
  /** Qwen3's reasoning block (`enable_thinking`). */
  thinking?: boolean;
  topLogprobs?: number;
  /** GBNF without recursion: a choice between literals, or a JSON shape (llm/grammar.rs). */
  grammar?: string;
  /** Reuse the KV cache for the prompt prefix shared with the previous request (default on). */
  cachePrompt?: boolean;
}

export interface Generated {
  text: string;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  promptMs: number;
  genMs: number;
  finish: 'stop' | 'length' | 'cancelled';
}

export interface Progress {
  loaded: number;
  total: number;
  speed: number;
  phase: string;
}

const UNSUPPORTED: NativeStatus = {
  supported: false,
  chat: null,
  decider: null,
  checkpoints: [],
  memory: null,
};

/** In a plain browser (no Tauri) there's no MLX: same answer as a Windows or Intel build. */
export const nativeStatus = (): Promise<NativeStatus> =>
  isTauri() ? invoke<NativeStatus>('llm_status') : Promise.resolve(UNSUPPORTED);
export interface NativeLoaded {
  ms: number;
  layers: number;
  bits: number;
  arch: string;
  nCtx: number;
}
export const nativeLoad = (checkpoint: string, nCtx: number) =>
  invoke<NativeLoaded>('llm_load', { slot: 'chat', checkpoint, nCtx });
export const nativeUnload = () => invoke<void>('llm_unload', { slot: 'chat' });
export const nativeRemove = (checkpoint: string) => invoke<void>('llm_remove', { checkpoint });

/** Generation speed, timed from the first token. */
export const genTokPerSec = (g: Generated) =>
  g.completionTokens > 1 && g.genMs > 0 ? (g.completionTokens - 1) / (g.genMs / 1000) : null;

/** A cancelled native generation, recognised by `isAbort` like wllama's. */
export class NativeAbortError extends Error {
  constructor() {
    super('Generation stopped.');
    this.name = 'AbortError';
  }
}

/** Generates on the chat slot. Text arrives through `onText`; aborting `signal` stops after the current token. */
export async function nativeGenerate(
  messages: ChatMessage[],
  params: NativeParams,
  onText: (piece: string) => void,
  signal?: AbortSignal,
): Promise<Generated> {
  if (signal?.aborted) throw new NativeAbortError();
  const request = crypto.getRandomValues(new Uint32Array(1))[0];
  const channel = new Channel<string>();
  channel.onmessage = onText;
  const cancel = () => void invoke('llm_cancel', { request }).catch(() => {});
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const out = await invoke<Generated>('llm_generate', {
      slot: 'chat',
      request,
      messages,
      params,
      onText: channel,
    });
    if (out.finish === 'cancelled' || signal?.aborted) throw new NativeAbortError();
    return out;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

/** Bytes per IPC call; Rust accepts up to 16 MiB. */
const CHUNK = 8 * 1024 * 1024;

/** Downloads every file of `c` and has Rust verify it (`llm_write_chunk`, `llm_finish`). */
export async function downloadCheckpoint(
  c: NativeCheckpoint,
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const started = performance.now();
  let loaded = 0;
  const report = (phase: string) =>
    onProgress({
      loaded,
      total: c.bytes,
      speed: loaded / Math.max(0.001, (performance.now() - started) / 1000),
      phase,
    });
  for (const f of c.files) {
    report(`Downloading ${f.path}…`);
    const res = await fetch(pinnedFileUrl(c.repo, c.commit, f.path), { signal });
    if (!res.ok || !res.body) throw new Error(`Couldn't download ${f.path} (HTTP ${res.status}).`);
    const reader = res.body.getReader();
    let offset = 0;
    let buf = new Uint8Array(Math.min(CHUNK, f.bytes));
    let fill = 0;
    const flush = async () => {
      if (!fill) return;
      offset = await invoke<number>('llm_write_chunk', buf.subarray(0, fill), {
        headers: { 'x-checkpoint': c.id, 'x-file': f.path, 'x-offset': String(offset) },
      });
      fill = 0;
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let at = 0;
      while (at < value.length) {
        const n = Math.min(buf.length - fill, value.length - at);
        buf.set(value.subarray(at, at + n), fill);
        fill += n;
        at += n;
        loaded += n;
        if (fill === buf.length) {
          await flush();
          buf = new Uint8Array(Math.min(CHUNK, Math.max(1, f.bytes - offset)));
        }
      }
      report(`Downloading ${f.path}…`);
    }
    await flush();
  }
  report('Verifying checksums…');
  await invoke('llm_finish', { checkpoint: c.id });
}
