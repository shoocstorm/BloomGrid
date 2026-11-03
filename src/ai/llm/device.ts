/**
 * How a wllama model is loaded on this device, and what a failed load tells the steward (ported from
 * Andai's `llm/device.ts`, which loads on real iPhones). iOS kills a Safari tab that grows past its memory
 * limit and the page reloads with no error to catch; BloomGrid's tab also holds the whole 3D city. Qwen3
 * 0.6B at 4,096 tokens needs about 1.1 GB of WebAssembly memory (604 MB weights + 448 MB KV + 30 MB
 * compute, measured by Andai in iOS Safari); on the CPU at 2,048 tokens about 860 MB. So phones start on
 * the CPU at ≤ 2,048 tokens, a caught memory or GPU error steps down a level, and a page that died
 * mid-load is recognised on the next launch from a localStorage marker. Pure apart from the marker helpers.
 */

export interface Device {
  /** A phone or tablet browser: tighter memory, no window to resize. */
  mobile: boolean;
  ios: boolean;
}

type Nav = Pick<Navigator, 'userAgent'> & { maxTouchPoints?: number };

export function detectDevice(nav: Nav | undefined): Device {
  if (!nav) return { mobile: false, ios: false };
  const ua = nav.userAgent;
  // iPadOS reports itself as a Mac; only its touch screen tells it apart (Tauri's macOS webview has none).
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1);
  return { mobile: ios || /Android|Mobile/.test(ua), ios };
}

/** This page's device. */
export const device = detectDevice(typeof navigator === 'undefined' ? undefined : navigator);

/**
 * How much a load asks for, from most to least. Level 0 is the catalog's context with layers on WebGPU
 * when there is one; 1 is CPU only (wllama then doesn't start WebGPU at all) at 2,048 tokens; 2 is CPU at
 * 1,024.
 */
export interface LoadPlan {
  level: number;
  n_ctx: number;
  gpu: boolean;
}
export const MAX_LEVEL = 2;

export function loadPlan(nCtx: number, level: number): LoadPlan {
  if (level <= 0) return { level: 0, n_ctx: nCtx, gpu: true };
  if (level === 1) return { level: 1, n_ctx: Math.min(nCtx, 2048), gpu: false };
  return { level: MAX_LEVEL, n_ctx: Math.min(nCtx, 1024), gpu: false };
}

/** Where a load starts: phones at level 1, or lower than any level that failed here before. */
export function startLevel(device: Device, failedBefore: number | undefined): number {
  return Math.min(MAX_LEVEL, Math.max(device.mobile ? 1 : 0, failedBefore ?? 0));
}

/**
 * wllama's load options for a plan. CPU plans (every phone load) also ask for less memory, because on an
 * iPhone the city already holds most of what iOS gives the tab (Andai fits Qwen3 0.6B but not 1.7B beside a
 * light UI; BloomGrid's city takes 0.7–1.3 GB more, measured in Chrome): a q8_0 KV cache (half of f16; a
 * quantised V cache needs flash attention, which llama.cpp's CPU backend has), one sequence instead of
 * wllama's 4, and 256-token batches (smaller compute buffers). The GPU plan stays wllama's default.
 */
export function loadParams(plan: LoadPlan): Record<string, unknown> {
  const base = { n_ctx: plan.n_ctx, reasoning_format: 'none' };
  if (plan.gpu) return base;
  return {
    ...base,
    // CPU only: wllama then doesn't initialise WebGPU at all
    n_gpu_layers: 0,
    cache_type_k: 'q8_0',
    cache_type_v: 'q8_0',
    flash_attn: true,
    n_parallel: 1,
    n_batch: 256,
    n_ubatch: 256,
  };
}

/** A one-line summary of a plan, for the progress line and the error. */
export const planText = (p: LoadPlan): string =>
  `${p.gpu ? 'GPU' : 'CPU only'}, ${p.n_ctx.toLocaleString('en-US')}-token context`;

const COMPILE = /CompileError|doesn't parse|is not enabled/i;
const MEMORY =
  /out of memory|\bOOM\b|bad_alloc|failed to allocate|could not allocate|unable to allocate|Cannot allocate|Cannot enlarge memory|memory access out of bounds|RangeError.*(memory|buffer|allocation)|Maximum call stack|Aborted\(/i;
const STORAGE = /QuotaExceeded|quota|NoModificationAllowed|not enough space|storage/i;
const NETWORK = /Failed to fetch|NetworkError|network|Load failed|ERR_|HTTP (4|5)\d\d|status (4|5)\d\d/i;
const GPU = /webgpu|GPUDevice|adapter|device lost/i;

export interface LoadFailure {
  /** What the steward reads. */
  message: string;
  /** Whether a lighter plan could help (memory, GPU or a stalled warm-up). */
  retryLighter: boolean;
}

const where = (d: Device) => (d.ios ? 'this iPhone' : d.mobile ? 'this phone' : 'this computer');

/** A failed load, said plainly. `raw` is the thrown error's text. */
export function describeLoadError(
  raw: string,
  name: string,
  plan: LoadPlan | null,
  device: Device,
): LoadFailure {
  if (/integrity check/.test(raw)) return { message: raw, retryLighter: false };
  if (/did not finish warming up/.test(raw)) return { message: raw, retryLighter: true };
  // before MEMORY: an abort while compiling isn't about memory, and less of it won't help
  if (COMPILE.test(raw))
    return {
      message: `This browser can't run the engine build picked for ${name} (${raw.slice(0, 160)}). Update the browser.`,
      retryLighter: false,
    };
  if (MEMORY.test(raw))
    return {
      message: `${name} needs more memory than the browser gives this page on ${where(device)}${plan ? ` (tried ${planText(plan)})` : ''}. Close other tabs and apps and try again, or pick a smaller core.`,
      retryLighter: true,
    };
  if (GPU.test(raw) && plan?.gpu)
    return { message: `${name} couldn't start on the GPU (${raw.slice(0, 160)}).`, retryLighter: true };
  if (STORAGE.test(raw))
    return {
      message: `There isn't enough storage space in this browser to keep ${name}. Free up space on ${where(device)}, or delete another downloaded core, then try again.`,
      retryLighter: false,
    };
  if (NETWORK.test(raw))
    return {
      message: `${name} couldn't be downloaded: the connection failed (${raw.slice(0, 120)}). Check the network and try again.`,
      retryLighter: false,
    };
  return { message: `${name} couldn't be loaded: ${raw.slice(0, 300)}`, retryLighter: true };
}

/** The message after the page itself was closed mid-load (a crash leaves no error to catch). */
export function crashMessage(name: string, plan: LoadPlan, next: LoadPlan | null, device: Device): string {
  const what = device.ios ? 'iOS closed the page' : 'The page was closed';
  const cause = `${what} while ${name} was warming up (${planText(plan)}), most likely because it ran out of memory.`;
  return next
    ? `${cause} The next try uses less memory (${planText(next)}). Close other tabs and apps first.`
    : `${cause} It already used the smallest setting, so this device can't run ${name} beside the city. Try a smaller core.`;
}

// A load in progress, so that a page iOS killed mid-load is recognised on the next launch. The level a
// model last failed at is kept per model, so the next try asks for less.
const ATTEMPT_KEY = 'bloomgrid.ai.loadAttempt';
const LEVEL_KEY = 'bloomgrid.ai.loadLevel';
/** Only a recent marker counts: an old one is from a session the steward ended themselves. */
const ATTEMPT_FRESH_MS = 15 * 60_000;

export interface Attempt {
  id: string;
  level: number;
  at: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: no crash memory */
  }
}

export const failedLevel = (id: string): number | undefined =>
  readJson<Record<string, number>>(LEVEL_KEY, {})[id];
export const setFailedLevel = (id: string, level: number): void =>
  write(LEVEL_KEY, { ...readJson<Record<string, number>>(LEVEL_KEY, {}), [id]: level });
export const markAttempt = (a: Attempt | null): void => write(ATTEMPT_KEY, a);

/** Takes the marker a load left behind if the page died under it (recent ones only), clearing it. */
export function takeCrashedAttempt(now: number): Attempt | null {
  const a = readJson<Attempt | null>(ATTEMPT_KEY, null);
  write(ATTEMPT_KEY, null);
  return a && now - a.at <= ATTEMPT_FRESH_MS ? a : null;
}
