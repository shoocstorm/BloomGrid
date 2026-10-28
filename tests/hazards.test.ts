import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { AgentToolRegistry } from '@/core/AgentTools';
import { Building, Service } from '@/ecs/components';
import { City } from '@/sim/City';
import { forecastCrisis } from '@/sim/crises';
import { RESPONSE_COST, eidOfUid, fireAt, ignite, isRuined } from '@/sim/hazards';
import { hazardTools } from '@/sim/hazardTools';
import type { ActionCtx } from '@/sim/actionTools';
import { applyScenario } from '@/sim/scenario';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { plainIntent } from '@/ai/agent';
import { makeSim } from './helpers';

/** The founding city on the default seed, settled; crises only when a test drills one. */
function settled() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(200);
  return s;
}
const seconds = (s: ReturnType<typeof makeSim>, n: number) => s.step(n * 10);
const byId = (s: ReturnType<typeof makeSim>, id: string) =>
  s.city.buildingEntities().find((e) => s.city.buildingDef(e).id === id)!;

describe('hazards (D-050)', () => {
  it('an earthquake damages buildings round its epicentre and is logged with its losses', () => {
    const s = settled();
    const shocks: boolean[] = [];
    s.bus.on('quake:shock', ({ aftershock }) => shocks.push(aftershock));
    const credits = s.city.credits;
    forecastCrisis(s.city, 'earthquake', 1, 0);
    seconds(s, 45);
    expect(shocks[0]).toBe(false);
    const rec = s.city.steward.history.find((h) => h.kind === 'earthquake')!;
    expect(rec).toBeDefined();
    expect(rec.hits).toBeGreaterThan(10);
    expect(rec.cost).toBeGreaterThan(0);
    expect(rec.district).not.toBeNull();
    expect(rec.objects.length).toBeGreaterThan(0);
    expect(s.city.credits).toBeLessThan(credits + 2000);
  });

  it('is deterministic: the same drill on the same seed gives the same city', () => {
    const run = () => {
      const s = settled();
      forecastCrisis(s.city, 'thunderstorm', 1, 0);
      seconds(s, 70);
      return s.city.hash();
    };
    expect(run()).toBe(run());
  });

  it('a thunderstorm throws lightning at the city', () => {
    const s = settled();
    let strikes = 0;
    s.bus.on('lightning:strike', () => strikes++);
    forecastCrisis(s.city, 'thunderstorm', 1.2, 0);
    seconds(s, 60);
    expect(strikes).toBeGreaterThan(2);
  });

  it('an unattended fire beyond any station burns its building to a ruin, which can be rebuilt (and undone)', () => {
    const s = settled();
    const eid = byId(s, 'wind-turbine'); // Windward Isle: no Ember Watch reaches it
    ignite(s.city, eid, 'lightning', 0.6);
    let t = 0;
    while (!isRuined(s.city, eid) && t++ < 240) seconds(s, 1);
    expect(isRuined(s.city, eid)).toBe(true);
    expect(fireAt(s.city, eid)).toBeUndefined();
    expect(Service.problems[eid]! & 256).toBeTruthy();
    const log = s.city.steward.history.at(-1)!;
    expect(log.kind).toBe('fire');
    expect(log.lost).toBe(1);
    const credits = s.city.credits;
    expect(s.commands.execute('repair', { x: Building.x[eid]!, z: Building.z[eid]! })).toBe(true);
    expect(isRuined(s.city, eid)).toBe(false);
    expect(s.city.credits).toBeLessThan(credits);
    s.commands.undo();
    expect(isRuined(s.city, eid)).toBe(true);
    expect(s.city.credits).toBeCloseTo(credits, 5);
  });

  it('dispatched crews put a fire out quickly; undo recalls them and refunds', () => {
    const s = settled();
    const eid = byId(s, 'wind-turbine');
    const fire = ignite(s.city, eid, 'lightning', 0.5)!;
    const credits = s.city.credits;
    expect(s.commands.execute('respond', { id: fire.id })).toBe(true);
    expect(s.city.credits).toBe(credits - RESPONSE_COST);
    s.commands.undo();
    expect(fire.crew).toBe(false);
    expect(s.city.credits).toBe(credits);
    s.commands.redo();
    seconds(s, 12);
    expect(fireAt(s.city, eid)).toBeUndefined();
    expect(isRuined(s.city, eid)).toBe(false);
    expect(s.city.steward.history.at(-1)!.outcome).toMatch(/crews/);
  });

  it('an Ember Watch station puts out fires within its reach on its own', () => {
    const s = settled();
    const station = byId(s, 'ember-watch');
    const [sx, sz] = [Building.x[station]!, Building.z[station]!];
    const target = s.city
      .buildingEntities()
      .find(
        (e) =>
          e !== station &&
          Math.hypot(Building.x[e]! - sx, Building.z[e]! - sz) < 12 &&
          s.city.buildingDef(e).stats.population > 0,
      )!;
    ignite(s.city, target, 'heat', 0.4);
    seconds(s, 20);
    expect(fireAt(s.city, target)).toBeUndefined();
    expect(isRuined(s.city, target)).toBe(false);
    expect(s.city.steward.history.at(-1)!.outcome).toMatch(/Ember Watch/);
  });

  it('saves fires, ruins and the log; v8 saves load with none', () => {
    const s = settled();
    ignite(s.city, byId(s, 'wind-turbine'), 'lightning', 0.4);
    forecastCrisis(s.city, 'industrial-fire', 1, 0);
    seconds(s, 25);
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as SaveData;
    expect(data.version).toBe(SAVE_VERSION);
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.hash()).toBe(s.city.hash());
    expect(other.steward.history.length).toBe(s.city.steward.history.length);
    const v8 = structuredClone(data) as unknown as Record<string, unknown> & {
      steward: Record<string, unknown>;
    };
    v8.version = 8;
    for (const k of ['fires', 'ruins', 'history', 'nextIncidentId']) delete v8.steward[k];
    const m = migrateSave(v8 as unknown as SaveData);
    expect(m.steward.fires).toEqual([]);
    expect(m.steward.history).toEqual([]);
  });

  it('gives Flora incident status, crews and repairs as tools', async () => {
    const s = settled();
    const r = new AgentToolRegistry<ActionCtx>({ city: s.city, commands: s.commands });
    for (const t of hazardTools) r.register(t);
    const fire = ignite(s.city, byId(s, 'wind-turbine'), 'lightning', 0.5)!;
    const status = await r.call('incident_status', {});
    expect(status.ok && (status.result as { fires: { fire: number }[] }).fires[0]!.fire).toBe(fire.id);
    const sent = await r.call('respond_incident', {});
    expect(sent.ok).toBe(true);
    expect(fire.crew).toBe(true);
    const e = eidOfUid(s.city, fire.uid);
    Service.condition[e] = 0.5;
    seconds(s, 15);
    const fixed = await r.call('repair_damage', { limit: 3 });
    expect(fixed.ok).toBe(true);
  });

  it('routes plain requests about hazards to the incident tools', () => {
    expect(plainIntent('What is burning right now, and which fires need crews?')).toBe('incident_status');
    expect(
      plainIntent('An earthquake hit. Which buildings are damaged or burning, and what should we do first?'),
    ).toBe('incident_status');
    expect(plainIntent('put out the fires')).toBe('respond_incident');
    expect(plainIntent('rebuild the ruins in Bayfront')).toBe('repair_damage');
    expect(plainIntent('fix the power problem in Bayfront')).toBe('fix_issue');
  });
});
