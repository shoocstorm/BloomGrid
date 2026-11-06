import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import {
  MILESTONES,
  claimableMilestones,
  milestoneDone,
  nextMilestone,
  openMilestones,
} from '@/sim/milestones';
import { tipValue } from '@/sim/tips';
import { deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { makeSim } from './helpers';

function fresh(seed = 20261024) {
  const s = makeSim(seed);
  applyScenario(s.city, 'fresh-island');
  s.step(20);
  return s;
}
const firstHome = (s: ReturnType<typeof makeSim>) =>
  s.city.buildingEntities().find((e) => s.city.buildingDef(e).category === 'residential')!;

describe('steward milestones (D-118)', () => {
  it('a fresh island starts with none claimed, none already done, and a sensible first goal', () => {
    for (const seed of [20261024, 1337, 7]) {
      const s = fresh(seed);
      expect(openMilestones(s.city)).toHaveLength(MILESTONES.length);
      expect(claimableMilestones(s.city).map((m) => m.id)).toEqual([]);
      expect(nextMilestone(s.city)?.id).toBe('second-catch');
    }
  });

  it('ids are unique and rewards grow along the chain', () => {
    expect(new Set(MILESTONES.map((m) => m.id)).size).toBe(MILESTONES.length);
    const r = MILESTONES.map((m) => m.reward);
    expect(r[r.length - 1]).toBeGreaterThan(r[0]! * 5);
  });

  it('some come on their own in the first ten minutes, so a patient player is rewarded too', () => {
    const s = fresh();
    s.step(6000);
    expect(claimableMilestones(s.city).length).toBeGreaterThanOrEqual(1);
  });

  it('claims pay once, only when reached, and undo cleanly', () => {
    const s = fresh();
    const { city, commands } = s;
    expect(commands.execute('claimMilestone', { id: 'nest-egg' })).toBe(false);
    city.credits = 3200;
    const m = MILESTONES.find((x) => x.id === 'nest-egg')!;
    expect(milestoneDone(city, m)).toBe(true);
    const before = city.hash();
    expect(commands.execute('claimMilestone', { id: 'nest-egg' })).toBe(true);
    expect(city.credits).toBe(3200 + m.reward);
    expect(city.growth.milestones).toEqual(['nest-egg']);
    expect(commands.execute('claimMilestone', { id: 'nest-egg' })).toBe(false);
    expect(city.hash()).not.toBe(before);
    commands.undo();
    expect(city.hash()).toBe(before);
    expect(commands.execute('claimMilestone', { id: 'no-such-thing' })).toBe(false);
  });

  it('a grown city (no progression) has no milestones to claim', () => {
    const s = makeSim();
    s.city.credits = 1e6;
    expect(openMilestones(s.city)).toEqual([]);
    expect(s.commands.execute('claimMilestone', { id: 'nest-egg' })).toBe(false);
  });
});

describe("residents' tips (D-118)", () => {
  it('pay a small, growing amount, more with Harmony and a combo', () => {
    const s = fresh();
    const v = tipValue(s.city, 1);
    expect(v).toBeGreaterThan(10);
    expect(v).toBeLessThan(60);
    expect(tipValue(s.city, 3)).toBeGreaterThan(v);
    expect(tipValue(s.city, 99)).toBe(tipValue(s.city, 5));
    s.city.stats.population = 10000;
    expect(tipValue(s.city, 1)).toBeLessThan(200);
  });

  it('collecting goes through the sim: credits, count, a reject for a gone building, undo', () => {
    const s = fresh();
    const { city, commands } = s;
    const eid = firstHome(s);
    const uid = city.buildingRecord(eid).uid!;
    const c0 = city.credits;
    const before = city.hash();
    expect(commands.execute('collectTip', { uid, combo: 2 })).toBe(true);
    expect(city.credits).toBeGreaterThan(c0);
    expect(city.growth.tips).toBe(1);
    expect(city.growth.tipIncome).toBeCloseTo(city.credits - c0);
    commands.undo();
    expect(city.hash()).toBe(before);
    expect(commands.execute('collectTip', { uid: 999999, combo: 1 })).toBe(false);
  });

  it('tip and milestone state round-trips through a save, and v16 saves migrate', () => {
    const s = fresh();
    const uid = s.city.buildingRecord(firstHome(s)).uid!;
    for (let i = 0; i < 5; i++) s.commands.execute('collectTip', { uid, combo: i + 1 }, false);
    expect(s.commands.execute('claimMilestone', { id: 'neighbourly' }, false)).toBe(true);
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as SaveData;
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.hash()).toBe(s.city.hash());
    expect(other.growth.milestones).toEqual(['neighbourly']);
    expect(other.growth.tips).toBe(5);

    const v16 = structuredClone(data) as unknown as { version: number; growth: Record<string, unknown> };
    v16.version = 16;
    delete v16.growth.milestones;
    delete v16.growth.tips;
    delete v16.growth.tipIncome;
    const m = migrateSave(v16 as unknown as SaveData);
    expect(m.growth.milestones).toEqual([]);
    expect(m.growth.tips).toBe(0);
  });
});
