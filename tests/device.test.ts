import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_LEVEL,
  crashMessage,
  describeLoadError,
  detectDevice,
  failedLevel,
  loadPlan,
  markAttempt,
  planText,
  setFailedLevel,
  startLevel,
  takeCrashedAttempt,
} from '@/ai/llm/device';
import { recommendedModel } from '@/ai/llm/models';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
const phone = { mobile: true, ios: true };
const desktop = { mobile: false, ios: false };

describe('how a model loads on this device', () => {
  it('tells phones and tablets from computers', () => {
    expect(detectDevice({ userAgent: IPHONE })).toEqual(phone);
    expect(detectDevice({ userAgent: ANDROID })).toEqual({ mobile: true, ios: false });
    expect(detectDevice({ userAgent: MAC, maxTouchPoints: 0 })).toEqual(desktop);
    // iPadOS reports a Mac user agent; its touch screen gives it away
    expect(detectDevice({ userAgent: MAC, maxTouchPoints: 5 })).toEqual(phone);
    expect(detectDevice(undefined)).toEqual(desktop);
  });

  it('asks for less at each level, never more than the catalog', () => {
    expect(loadPlan(4096, 0)).toEqual({ level: 0, n_ctx: 4096, gpu: true });
    expect(loadPlan(4096, 1)).toEqual({ level: 1, n_ctx: 2048, gpu: false });
    expect(loadPlan(4096, 2)).toEqual({ level: MAX_LEVEL, n_ctx: 1024, gpu: false });
    expect(loadPlan(4096, 9)).toEqual(loadPlan(4096, MAX_LEVEL));
    expect(loadPlan(1024, 1).n_ctx).toBe(1024);
    expect(planText(loadPlan(4096, 1))).toBe('CPU only, 2,048-token context');
  });

  it('starts phones lighter, and below any level that failed here', () => {
    expect(startLevel(desktop, undefined)).toBe(0);
    expect(startLevel(phone, undefined)).toBe(1);
    expect(startLevel(desktop, 2)).toBe(2);
    expect(startLevel(phone, 0)).toBe(1);
    expect(startLevel(phone, 7)).toBe(MAX_LEVEL);
  });

  it('recommends the small core on phones', () => {
    expect(recommendedModel(false, true).id).toBe('qwen3-0.6b');
    expect(recommendedModel(false).id).toBe('qwen3-1.7b');
    expect(recommendedModel(true, true).id).toBe('qwen3-1.7b-mlx');
  });
});

describe('a failed load, said plainly', () => {
  const plan = loadPlan(4096, 1);
  it('retries memory, GPU and stalled warm-ups lighter', () => {
    for (const raw of [
      'RangeError: Out of memory',
      'std::bad_alloc',
      'Aborted(OOM)',
      'Cannot enlarge memory arrays',
    ]) {
      const f = describeLoadError(raw, 'Qwen3 0.6B', plan, phone);
      expect(f.retryLighter).toBe(true);
      expect(f.message).toMatch(
        /needs more memory .* on this iPhone \(tried CPU only, 2,048-token context\)/,
      );
    }
    expect(describeLoadError('GPUDevice lost', 'M', loadPlan(4096, 0), desktop).retryLighter).toBe(true);
    expect(describeLoadError('M did not finish warming up in 120 s.', 'M', plan, desktop).retryLighter).toBe(
      true,
    );
  });

  it('does not retry compile, storage, network or integrity failures', () => {
    expect(describeLoadError('CompileError: Memory64 is not enabled', 'M', plan, phone).retryLighter).toBe(
      false,
    );
    expect(describeLoadError('QuotaExceededError', 'M', plan, phone)).toMatchObject({
      retryLighter: false,
      message: expect.stringMatching(/storage space.*this iPhone/),
    });
    expect(describeLoadError('TypeError: Load failed', 'M', plan, phone).message).toMatch(
      /couldn't be downloaded/,
    );
    const integrity =
      'The downloaded M failed its integrity check (bad sha), so it was removed and not loaded.';
    expect(describeLoadError(integrity, 'M', null, desktop)).toEqual({
      message: integrity,
      retryLighter: false,
    });
  });

  it('explains a page iOS closed, and when there is nothing lighter left', () => {
    expect(crashMessage('M', plan, loadPlan(4096, 2), phone)).toMatch(
      /^iOS closed the page while M was warming up .* next try uses less memory \(CPU only, 1,024-token context\)/,
    );
    expect(crashMessage('M', loadPlan(4096, 2), null, phone)).toMatch(/smallest setting/);
  });
});

describe('a load the page died under', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is found once on the next launch, only while recent', () => {
    markAttempt({ id: 'qwen3-0.6b', level: 1, at: 1_000 });
    expect(takeCrashedAttempt(2_000)).toEqual({ id: 'qwen3-0.6b', level: 1, at: 1_000 });
    expect(takeCrashedAttempt(2_000)).toBeNull();
    markAttempt({ id: 'qwen3-0.6b', level: 1, at: 1_000 });
    expect(takeCrashedAttempt(1_000 + 16 * 60_000)).toBeNull();
    // a load that settled clears its marker
    markAttempt({ id: 'qwen3-0.6b', level: 1, at: 1_000 });
    markAttempt(null);
    expect(takeCrashedAttempt(2_000)).toBeNull();
  });

  it('remembers the level each model failed at', () => {
    expect(failedLevel('a')).toBeUndefined();
    setFailedLevel('a', 2);
    setFailedLevel('b', 1);
    expect([failedLevel('a'), failedLevel('b')]).toEqual([2, 1]);
  });
});
