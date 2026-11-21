import { describe, expect, it } from 'vitest';
import { buildings } from '@/content';
import { MAX_CUE_VOICES, selectionCue, type Cue, type Selected } from '@/modules/audio/cues';

const ok = (cue: Cue) => {
  expect(cue.length).toBeGreaterThan(0);
  expect(cue.length).toBeLessThanOrEqual(MAX_CUE_VOICES);
  for (const v of cue) {
    expect(v.f).toBeGreaterThan(20);
    expect(v.f).toBeLessThan(12000);
    expect(v.len).toBeGreaterThan(0);
    expect(v.vol).toBeGreaterThan(0);
    // Selection cues stay quiet next to alerts (the loudest voice of any effect is ≈ 0.5).
    expect(v.vol).toBeLessThanOrEqual(0.16);
    expect(v.at).toBeGreaterThanOrEqual(0);
    expect(v.at).toBeLessThan(2);
  }
};
const sel = (def: string, extra: Partial<Extract<Selected, { kind: 'building' }>> = {}): Selected => {
  const d = buildings.get(def);
  return { kind: 'building', def, category: d.category, tier: 0, hero: false, state: 'ok', ...extra };
};

describe('selection sound signatures (D-189)', () => {
  it('every building type has a playable cue', () => {
    for (const d of buildings.all()) ok(selectionCue(sel(d.id))!.cue);
  });

  it('building types of one category sound different', () => {
    const homes = buildings.all().filter((d) => d.category === 'residential');
    const keys = new Set(homes.map((d) => JSON.stringify(selectionCue(sel(d.id))!.cue)));
    expect(keys.size).toBeGreaterThan(homes.length / 2);
  });

  it('state is heard: levels sparkle, trouble muffles and adds a tail', () => {
    const base = selectionCue(sel('garden-residence'))!;
    expect(selectionCue(sel('garden-residence', { tier: 2 }))!.cue.length).toBeGreaterThan(base.cue.length);
    for (const state of ['problem', 'off', 'fire', 'ruin'] as const) {
      const p = selectionCue(sel('garden-residence', { state }))!;
      expect(p.muffle).toBeGreaterThan(0);
      ok(p.cue);
    }
  });

  it('objects, wonders, roads, bridges and groups have cues', () => {
    for (const key of [
      'ferry',
      'aeroline',
      'skyguard',
      'wonder:lighthouse',
      'wonder:whales-1',
      'wonder:geode',
      'unknown',
    ])
      ok(selectionCue({ kind: 'object', key })!.cue);
    ok(selectionCue({ kind: 'road' })!.cue);
    ok(selectionCue({ kind: 'bridge' })!.cue);
    ok(selectionCue({ kind: 'group', count: 40 })!.cue);
  });
});
