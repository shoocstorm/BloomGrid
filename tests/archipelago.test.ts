import { describe, expect, it } from 'vitest';
import { Service } from '@/ecs/components';
import { applyScenario } from '@/sim/scenario';
import { PULSE_TICKS } from '@/sim/pulseConst';
import { netIncome } from '@/sim/finance';
import { deserializeCity, migrateSave, serializeCity, SAVE_VERSION } from '@/sim/save';
import {
  EXPORT_MARGIN,
  neighbour,
  startDispatch,
  surplusOf,
  tierOf,
  tradeBlock,
  vacancy,
} from '@/sim/archipelago';
import { makeSim } from './helpers';

/** The showcase (every neighbour known), settled for a while. */
function showcase(seed = 20261024) {
  const s = makeSim(seed);
  applyScenario(s.city, 'founding-city');
  s.step(40 * PULSE_TICKS);
  return s;
}

describe('the Archipelago (plan v8, Phase 37)', () => {
  it('meets every neighbour on the showcase, and only by era on a growing island', () => {
    const s = showcase();
    expect(s.city.archipelago.neighbours.every((n) => n.met)).toBe(true);
    const f = makeSim(3);
    applyScenario(f.city, 'fresh-island');
    f.step(5 * PULSE_TICKS);
    expect(f.city.archipelago.neighbours.some((n) => n.met)).toBe(false);
    f.city.charters.era = 1;
    f.step(PULSE_TICKS);
    expect(f.city.archipelago.neighbours.filter((n) => n.met).map((n) => n.id).sort()).toEqual(['drift', 'kestrel']);
  }, 60_000);

  it('stays quiet with auto off (no crises, envoys or rng draws), and is deterministic with it on', () => {
    const s = showcase();
    s.step(400 * PULSE_TICKS);
    expect(s.city.archipelago.dispatch).toBeNull();
    expect(s.city.archipelago.neighbours.every((n) => n.crisis === null && n.prosperity === 0.6)).toBe(true);
    const run = () => {
      const t = showcase(11);
      t.city.archipelago.auto = true;
      t.city.archipelago.nextDispatchTick = t.city.tick + 5 * PULSE_TICKS;
      for (const n of t.city.archipelago.neighbours) n.nextTick = t.city.tick + 20 * PULSE_TICKS;
      t.step(300 * PULSE_TICKS);
      return [t.city.hash(), JSON.stringify(t.city.archipelago.log)];
    };
    const a = run();
    expect(a).toEqual(run());
  }, 120_000);

  it('exports ship only surplus and earn credits that show in netIncome; signing is undoable', () => {
    const s = showcase();
    const c = s.city;
    // The showcase has energy to spare and is short of water.
    expect(surplusOf(c, 'energy')).toBeGreaterThan(0);
    expect(tradeBlock(c, 'drift', 'water', 'import')).toMatch(/no water to sell/);
    expect(s.commands.execute('signTrade', { partner: 'drift', good: 'energy', dir: 'export', size: 2 })).toBe(true);
    s.step(PULSE_TICKS);
    const t = c.archipelago.trades[0]!;
    expect(t.moved).toBeGreaterThan(0);
    expect(t.moved).toBeLessThanOrEqual(t.amount);
    expect(c.stats.trade).toBeGreaterThan(0);
    // Home use (all but the export) keeps its headroom.
    expect(c.stats.energyProduced).toBeGreaterThanOrEqual((c.stats.energyUsed - t.moved) * EXPORT_MARGIN - 1e-3);
    expect(c.pulse.tiers.energy).toBeLessThanOrEqual(2);
    // netIncome counts trade.
    const without = netIncome(c) - c.stats.trade;
    expect(netIncome(c)).toBeCloseTo(without + c.stats.trade);
    // A water export with nothing to spare moves nothing.
    expect(s.commands.execute('signTrade', { partner: 'drift', good: 'water', dir: 'export', size: 0 })).toBe(true);
    s.step(PULSE_TICKS);
    expect(c.archipelago.trades.find((x) => x.good === 'water')!.moved).toBe(0);
    // Undo and redo.
    s.commands.undo();
    expect(c.archipelago.trades).toHaveLength(1);
    s.commands.redo();
    expect(c.archipelago.trades).toHaveLength(2);
    // No duplicates.
    expect(s.commands.execute('signTrade', { partner: 'drift', good: 'energy', dir: 'export', size: 0 })).toBe(false);
  }, 60_000);

  it('an import eases a shortage and costs credits', () => {
    const s = showcase();
    const c = s.city;
    const before = c.pulse.waterRatio;
    expect(before).toBeLessThan(1);
    expect(s.commands.execute('signTrade', { partner: 'kestrel', good: 'water', dir: 'import', size: 2 })).toBe(true);
    s.step(PULSE_TICKS);
    expect(c.archipelago.trades[0]!.moved).toBeGreaterThan(0);
    expect(c.stats.trade).toBeLessThan(0);
    expect(c.pulse.waterRatio).toBeGreaterThan(before + 0.1);
    // Ending it is undoable, and stings the relation a little less than an export would.
    const rel = neighbour(c, 'kestrel').relation;
    expect(s.commands.execute('endTrade', { id: c.archipelago.trades[0]!.id })).toBe(true);
    expect(neighbour(c, 'kestrel').relation).toBeCloseTo(rel - 1);
    s.commands.undo();
    expect(c.archipelago.trades).toHaveLength(1);
    expect(neighbour(c, 'kestrel').relation).toBeCloseTo(rel);
  }, 60_000);

  it('a hostile neighbour embargoes: agreements end and none can be signed', () => {
    const s = showcase();
    const c = s.city;
    s.commands.execute('signTrade', { partner: 'concord', good: 'energy', dir: 'import', size: 0 });
    expect(c.archipelago.trades).toHaveLength(1);
    // Turn them away twice over.
    neighbour(c, 'concord').relation = -35;
    c.archipelago.dispatch = { id: 99, kind: 'loan', from: 'concord', status: 'open', startTick: c.tick, endTick: c.tick + 10_000, credits: 1000 };
    c.archipelago.dispatch.kind = 'aid';
    c.archipelago.dispatch.cause = 'storm';
    expect(s.commands.execute('answerDispatch', { id: 99, choice: 1 }, false)).toBe(true);
    expect(tierOf(neighbour(c, 'concord').relation).id).toBe('hostile');
    expect(c.archipelago.trades).toHaveLength(0);
    expect(tradeBlock(c, 'concord', 'energy', 'import')).toMatch(/embargo/);
  }, 60_000);

  it('families settle in vacant homes; aid costs credits and warms the relation', () => {
    const s = showcase();
    const c = s.city;
    const drift = neighbour(c, 'drift');
    drift.crisis = 'storm';
    drift.crisisUntil = c.tick + 100 * PULSE_TICKS;
    // Make room: empty a few homes.
    let emptied = 0;
    for (const e of c.buildingEntities())
      if (c.buildingDef(e).stats.population > 0 && emptied < 20) {
        Service.occupancy[e] = 0.2;
        emptied++;
      }
    const room = vacancy(c);
    const d = startDispatch(c, 'families', 'drift')!;
    expect(d).not.toBeNull();
    const occ = () => c.buildingEntities().reduce((a, e) => a + Service.occupancy[e]! * c.buildingDef(e).stats.population, 0);
    const o0 = occ();
    const rel = drift.relation;
    expect(s.commands.execute('answerDispatch', { id: d.id, choice: 0 }, false)).toBe(true);
    expect(vacancy(c)).toBeLessThan(room);
    expect(occ()).toBeGreaterThan(o0);
    expect(drift.relation).toBeGreaterThan(rel + 10);
    expect(c.archipelago.dispatch).toBeNull();
    // Aid.
    const a = startDispatch(c, 'aid', 'drift')!;
    const credits = c.credits;
    s.commands.execute('answerDispatch', { id: a.id, choice: 0 }, false);
    expect(c.credits).toBeCloseTo(credits - a.credits!);
  }, 60_000);

  it('an envoy left waiting counts as a refusal', () => {
    const s = showcase();
    const c = s.city;
    neighbour(c, 'drift').crisis = 'drought';
    neighbour(c, 'drift').crisisUntil = c.tick + 1000 * PULSE_TICKS;
    const rel = neighbour(c, 'drift').relation;
    startDispatch(c, 'aid', 'drift');
    s.step(160 * PULSE_TICKS);
    expect(c.archipelago.dispatch).toBeNull();
    expect(c.archipelago.log.at(-1)!.text).toMatch(/unanswered/);
    expect(neighbour(c, 'drift').relation).toBeLessThan(rel);
  }, 60_000);

  it('survives a save round-trip, and an older save migrates', () => {
    const s = showcase();
    s.commands.execute('signTrade', { partner: 'drift', good: 'energy', dir: 'export', size: 1 });
    s.step(PULSE_TICKS);
    const data = serializeCity(s.city);
    expect(data.version).toBe(SAVE_VERSION);
    const t = makeSim(1);
    deserializeCity(t.city, JSON.parse(JSON.stringify(data)));
    expect(t.city.hash()).toBe(s.city.hash());
    const old = JSON.parse(JSON.stringify(data));
    delete old.archipelago;
    old.version = 29;
    expect(migrateSave(old).archipelago.trades).toEqual([]);
  }, 60_000);
});
