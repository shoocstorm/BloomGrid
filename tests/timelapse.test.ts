import { describe, expect, it } from 'vitest';
import { buildTimeline, dayAt, foundingLength, MARK_GAP, timelineInputOf, YEARS_MAX, YEARS_MIN, YEARS_NONE, type TimelineInput } from '@/modules/timelapse/timeline';
import { findSpot, makeSim } from './helpers';

/** The time-lapse's script (plan v6, Phase 31, D-219). */
const base = (over: Partial<TimelineInput> = {}): TimelineInput => ({
  now: 10_000,
  day: 5,
  residents: 900,
  heart: { x: 0, z: 0 },
  buildings: [],
  roads: [],
  marks: [],
  samples: [],
  ...over,
});

describe('time-lapse timeline', () => {
  it('raises founding content ring by ring from the heart, before anything built later', () => {
    const t = buildTimeline(
      base({
        buildings: [
          { id: 1, tick: 0, x: 30, z: 0 },
          { id: 2, tick: 0, x: 5, z: 0 },
          { id: 3, tick: 500, x: 0, z: 0 },
        ],
      }),
    );
    expect(t.founding).toBe(foundingLength(2));
    expect(t.events.map((e) => e.id)).toEqual([2, 1, 3]);
    expect(t.events[1]!.at).toBeLessThan(t.founding);
    expect(t.events[2]!.at).toBeGreaterThanOrEqual(t.founding);
  });

  it('keeps build order and puts a building after the highway laid with it', () => {
    const t = buildTimeline(
      base({
        buildings: [
          { id: 10, tick: 3000, x: 0, z: 0 },
          { id: 11, tick: 1000, x: 0, z: 0 },
        ],
        roads: [{ id: 7, tick: 1000, x: 0, z: 0 }],
      }),
    );
    expect(t.events.map((e) => [e.kind, e.id])).toEqual([
      ['road', 7],
      ['building', 11],
      ['building', 10],
    ]);
  });

  it('compresses quiet stretches: a lone late build is not left waiting for most of the film', () => {
    // Nine builds in the first tenth of the time, one at the very end.
    const early = Array.from({ length: 9 }, (_, i) => ({ id: i, tick: 100 + i * 100, x: 0, z: 0 }));
    const t = buildTimeline(base({ buildings: [...early, { id: 99, tick: 9900, x: 0, z: 0 }] }));
    const ninth = t.events.find((e) => e.id === 8)!.at;
    // On the clock alone the ninth build would sit at ~9% of the film; event rank pulls it much later.
    expect(ninth / t.duration).toBeGreaterThan(0.4);
    // Monotone and invertible.
    for (const tick of [1, 500, 2500, 9000]) expect(t.tickAt(t.filmAt(tick))).toBeCloseTo(tick, 0);
    expect(t.filmAt(2000)).toBeLessThan(t.filmAt(2001));
  });

  it('sizes the film by its history', () => {
    expect(buildTimeline(base()).duration).toBe(YEARS_NONE);
    const few = buildTimeline(base({ buildings: [{ id: 1, tick: 5, x: 0, z: 0 }] }));
    expect(few.duration).toBe(YEARS_MIN);
    const many = Array.from({ length: 20_000 }, (_, i) => ({ id: i, tick: 1 + i, x: 0, z: 0 }));
    expect(buildTimeline(base({ now: 30_000, buildings: many })).duration).toBe(YEARS_MAX);
  });

  it('spaces captions, keeping the most telling', () => {
    const t = buildTimeline(
      base({
        buildings: Array.from({ length: 50 }, (_, i) => ({ id: i, tick: 100 + i * 190, x: 0, z: 0 })),
        marks: [
          { tick: 4000, kind: 'project', label: 'Unlocked: Docks' },
          { tick: 4010, kind: 'era', label: 'The Grove era' },
          { tick: 9000, kind: 'crisis', label: 'Monsoon' },
        ],
      }),
    );
    expect(t.marks.map((m) => m.label)).toEqual(['The Grove era', 'Monsoon']);
    for (let i = 1; i < t.marks.length; i++) expect(t.marks[i]!.at - t.marks[i - 1]!.at).toBeGreaterThanOrEqual(MARK_GAP);
  });

  it('reads day and residents between the samples, ending on the city as it stands', () => {
    const t = buildTimeline(
      base({
        buildings: [{ id: 1, tick: 4000, x: 0, z: 0 }],
        samples: [
          [0, 1, 100, 0, 0, 0],
          [4000, 3, 500, 0, 0, 0],
        ],
      }),
    );
    expect(t.statsAt(0)).toMatchObject({ day: 1, residents: 100 });
    const mid = t.statsAt(t.filmAt(2000));
    expect(mid.residents).toBeGreaterThan(250);
    expect(mid.residents).toBeLessThan(350);
    expect(t.statsAt(t.duration)).toMatchObject({ day: 5, residents: 900 });
  });

  it('reads a live city and its ledger', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    const a = findSpot(s.city, 'canopy-tower');
    s.commands.execute('build', { def: 'canopy-tower', ...a, rot: 0 });
    s.step(40);
    const b = findSpot(s.city, 'canopy-tower', a.x + 6, a.z);
    s.commands.execute('build', { def: 'canopy-tower', ...b, rot: 0 });
    s.step(10);
    const input = timelineInputOf(s.city);
    expect(input.buildings.map((x) => x.tick).sort((p, q) => p - q)).toEqual([0, 40]);
    const t = buildTimeline(input);
    expect(t.events).toHaveLength(2);
    expect(t.events[0]!.at).toBeLessThan(t.events[1]!.at);
  });

  it('changes levels after a building has risen, in order', () => {
    const t = buildTimeline(
      base({
        buildings: [{ id: 5, tick: 1000, x: 0, z: 0, tier0: 0 }],
        tiers: [
          { id: 5, tick: 6000, tier: 2 },
          { id: 5, tick: 3000, tier: 1 },
        ],
      }),
    );
    expect(t.events.map((e) => [e.kind, e.tier ?? null])).toEqual([
      ['building', null],
      ['tier', 1],
      ['tier', 2],
    ]);
  });

  it('raises a gone building for its lifetime and folds it away when it went', () => {
    const t = buildTimeline(
      base({
        buildings: [{ id: 1, tick: 8000, x: 0, z: 0 }],
        ghosts: [
          { id: 0, tick: 500, end: 4000, x: 0, z: 0 },
          { id: 1, tick: 0, end: 2000, x: 3, z: 0 },
        ],
      }),
    );
    const at = (kind: string, id: number) => t.events.find((e) => e.kind === kind && e.id === id)!.at;
    expect(at('ghost', 1)).toBeLessThan(t.founding);
    expect(at('ghost', 0)).toBeLessThan(at('fade', 0));
    expect(at('fade', 0)).toBeLessThan(at('building', 1));
    expect(at('fade', 1)).toBeGreaterThan(t.founding);
  });

  it('reads levels and gone buildings from the ledger', () => {
    const s = makeSim(42);
    s.city.credits = 1e6;
    s.step(20);
    const a = findSpot(s.city, 'canopy-tower');
    s.commands.execute('build', { def: 'canopy-tower', ...a, rot: 0 });
    const eid = s.city.buildingAt(a.x, a.z);
    s.step(100);
    s.city.bus.emit('building:tier', { eid, tier: 1, paid: true });
    s.step(100);
    s.commands.execute('demolish', a);
    s.step(10);
    const input = timelineInputOf(s.city);
    expect(input.ghosts).toEqual([expect.objectContaining({ id: 0, tick: 20, end: 220 })]);
    expect(input.buildings).toHaveLength(0);
  });

  it('reads the day at a tick for the map slider', () => {
    const samples: [number, number, number, number, number, number][] = [
      [0, 1, 0, 0, 0, 0],
      [3600, 2, 0, 0, 0, 0],
      [7200, 3, 0, 0, 0, 0],
    ];
    expect(dayAt(samples, 0, 10_800, 4)).toBe(1);
    expect(dayAt(samples, 3600, 10_800, 4)).toBe(2);
    expect(dayAt(samples, 9000, 10_800, 4)).toBe(3);
    expect(dayAt(samples, 10_800, 10_800, 4)).toBe(4);
    expect(dayAt([], 5000, 10_000, 11)).toBe(6);
  });
});
