import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import { CHAPTERS, PAGES, chronicleReport, endingBlock, foundPages, pageFound } from '@/sim/chronicle';
import { PULSE_TICKS } from '@/sim/pulseConst';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { shippedDocs } from '@/content/knowledge';
import { makeSim } from './helpers';

function fresh(seed = 20261024) {
  const s = makeSim(seed);
  applyScenario(s.city, 'fresh-island');
  s.step(20);
  return s;
}
const pulses = (s: ReturnType<typeof makeSim>, n: number) => s.step(n * PULSE_TICKS);

describe('the Chronicle (D-192)', () => {
  it('is data: unique ids, every page in a known chapter with text and a hint', () => {
    const ids = new Set(PAGES.map((p) => p.id));
    expect(ids.size).toBe(PAGES.length);
    const chapters = new Set(CHAPTERS.map((c) => c.id));
    for (const p of PAGES) {
      expect(chapters.has(p.chapter), p.id).toBe(true);
      expect(p.text.length, p.id).toBeGreaterThan(0);
      expect(p.hint.length, p.id).toBeGreaterThan(3);
    }
    // Every chapter has a page the city can find by playing.
    for (const c of CHAPTERS)
      expect(
        PAGES.some((p) => p.chapter === c.id && p.when),
        c.id,
      ).toBe(true);
  });

  it('every Seedvault lore guide opens with a page that exists', () => {
    const lore = shippedDocs().filter((d) => d.category === 'lore');
    expect(lore.length).toBeGreaterThanOrEqual(8);
    for (const d of lore)
      for (const id of d.unlock ?? [])
        expect(
          PAGES.some((p) => p.id === id),
          `${d.id}: ${id}`,
        ).toBe(true);
  });

  it('finds the first page on arrival and the rest only once earned, each once', () => {
    const s = fresh();
    const seen: string[] = [];
    s.city.bus.on('chronicle:found', ({ id }) => seen.push(id));
    pulses(s, 10);
    expect(pageFound(s.city, 'keeper')).toBe(true);
    expect(pageFound(s.city, 'flame')).toBe(false);
    expect(pageFound(s.city, 'long-tide')).toBe(false);
    s.city.growth.wonders.push('colonnade');
    pulses(s, 10);
    expect(pageFound(s.city, 'long-tide')).toBe(true);
    pulses(s, 10);
    expect(seen.filter((id) => id === 'long-tide').length).toBe(1);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('asks its one question at the flame; the answer is a page, given once', () => {
    const s = fresh();
    expect(s.commands.execute('chronicleEnding', { ending: 'relit' }, false)).toBeFalsy();
    s.city.growth.wonders.push('colonnade');
    s.city.charters.era = 3;
    pulses(s, 10);
    expect(pageFound(s.city, 'flame')).toBe(true);
    expect(endingBlock(s.city)).toBeNull();
    s.commands.execute('chronicleEnding', { ending: 'rest' }, false);
    expect(s.city.chronicle.ending).toBe('rest');
    expect(foundPages(s.city).some((p) => p.id === 'rest')).toBe(true);
    expect(foundPages(s.city).some((p) => p.id === 'relit')).toBe(false);
    s.commands.execute('chronicleEnding', { ending: 'relit' }, false);
    expect(s.city.chronicle.ending).toBe('rest');
  });

  it('opens every page in a city without progression, and records nothing', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    pulses(s, 10);
    expect(PAGES.filter((p) => p.when).every((p) => pageFound(s.city, p.id))).toBe(true);
    expect(s.city.chronicle.found).toEqual([]);
    const r = chronicleReport(s.city);
    expect(r.found).toBe(r.total);
  });

  it('round-trips through a save and migrates a v25 save to an empty Chronicle', () => {
    const s = fresh();
    pulses(s, 10);
    const data = serializeCity(s.city);
    expect(data.version).toBe(SAVE_VERSION);
    const copy = new City(new EventBus(), 1);
    deserializeCity(copy, structuredClone(data));
    expect(copy.hash()).toBe(s.city.hash());
    expect(copy.chronicle.found.length).toBe(s.city.chronicle.found.length);

    const v25 = structuredClone(data) as unknown as Record<string, unknown>;
    v25.version = 25;
    delete v25.chronicle;
    const m = migrateSave(v25 as unknown as SaveData);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.chronicle).toEqual({ found: [], ending: null });
  });

  it('is deterministic, and part of the hash', () => {
    const run = () => {
      const s = fresh();
      pulses(s, 30);
      return s.city.hash();
    };
    expect(run()).toBe(run());
    const s = fresh();
    pulses(s, 10);
    const before = s.city.hash();
    s.city.chronicle.found.push({ id: 'x', tick: 1 });
    expect(s.city.hash()).not.toBe(before);
  });
});
