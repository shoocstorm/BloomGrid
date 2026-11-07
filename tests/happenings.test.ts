import { describe, expect, it } from 'vitest';
import { buildings } from '@/content';
import { applyScenario } from '@/sim/scenario';
import { countNear, startHappening, updateHappenings } from '@/sim/happenings';
import { PULSE_TICKS } from '@/sim/pulseConst';
import { deserializeCity, migrateSave, serializeCity, SAVE_VERSION } from '@/sim/save';
import { makeSim } from './helpers';

/** A small founded city with homes, parks, shops and docks to ask about. */
function founded(seed = 20261024) {
  const s = makeSim(seed);
  applyScenario(s.city, 'founding-city');
  s.step(30 * PULSE_TICKS);
  return s;
}

describe('happenings (D-123)', () => {
  it('stay off in tests unless switched on, and then start on their own', () => {
    const s = founded();
    s.step(400 * PULSE_TICKS);
    expect(s.city.happenings.current).toBeNull();
    expect(s.city.happenings.history).toHaveLength(0);
    s.city.happenings.auto = true;
    s.step(200 * PULSE_TICKS);
    expect(s.city.happenings.history.length + (s.city.happenings.current ? 1 : 0)).toBeGreaterThan(0);
  });

  it('are deterministic: the same seed and steps give the same hash', () => {
    const run = () => {
      const s = founded(7);
      s.city.happenings.auto = true;
      // Bring the first one forward so a whole happening (start, run, end, next draw) fits a short run.
      s.city.happenings.nextTick = s.city.tick + 5 * PULSE_TICKS;
      s.step(330 * PULSE_TICKS);
      return [s.city.hash(), JSON.stringify(s.city.happenings.history)];
    };
    expect(run()).toEqual(run());
  });

  it('a request is met by building what was asked nearby, then claimed for credits', () => {
    const s = founded();
    const h = startHappening(s.city, 'request')!;
    expect(h).not.toBeNull();
    expect(h.baseline).toBe(countNear(s.city, h.category!, h.x, h.z, h.radius!));
    // Build the asked-for category as near the residents as the ground allows.
    const def = buildings.all().find((d) => d.category === h.category && !d.requires)!;
    let built = false;
    for (let r = 2; r <= h.radius! - 3 && !built; r++)
      for (let a = 0; a < 16 && !built; a++) {
        const x = Math.round(h.x + Math.cos((a / 16) * Math.PI * 2) * r - def.footprint[0] / 2);
        const z = Math.round(h.z + Math.sin((a / 16) * Math.PI * 2) * r - def.footprint[1] / 2);
        if (s.city.checkPlacement(def, x, z, 0).ok)
          built = s.commands.execute('build', { def: def.id, x, z, rot: 0 });
      }
    expect(built).toBe(true);
    updateHappenings(s.city);
    expect(s.city.happenings.current?.status).toBe('met');
    const before = s.city.credits;
    expect(s.commands.execute('claimHappening', { id: h.id })).toBe(true);
    expect(s.city.credits).toBeCloseTo(before + h.reward);
    expect(s.city.happenings.current).toBeNull();
    expect(s.city.happenings.history.at(-1)?.outcome).toBe('claimed');
    // Undo puts it back, claimable again.
    s.commands.undo();
    expect(s.city.happenings.current?.status).toBe('met');
    expect(s.city.credits).toBeCloseTo(before);
  });

  it('a request left unmet expires and the mood dips for a while', () => {
    const s = founded();
    const h = startHappening(s.city, 'request')!;
    s.step(h.endTick - s.city.tick + PULSE_TICKS);
    expect(s.city.happenings.current).toBeNull();
    expect(s.city.happenings.history.at(-1)?.outcome).toBe('missed');
    expect(s.city.happenings.mood).toBeLessThan(0);
  });

  it('a cruise or festival pays visitors into the credit flow', () => {
    const s = founded();
    const h = startHappening(s.city, 'cruise') ?? startHappening(s.city, 'festival');
    expect(h).not.toBeNull();
    s.step(10 * PULSE_TICKS);
    expect(s.city.happenings.current!.earned).toBeGreaterThan(0);
    expect(s.city.stats.tourism).toBeGreaterThan(0);
  });

  it('survive a save round-trip, and a v17 save migrates', () => {
    const s = founded();
    startHappening(s.city, 'request');
    const data = serializeCity(s.city);
    expect(data.version).toBe(SAVE_VERSION);
    const t = makeSim(1);
    deserializeCity(t.city, structuredClone(data));
    expect(t.city.happenings).toEqual(s.city.happenings);
    const old = structuredClone(data) as unknown as Record<string, unknown>;
    old.version = 17;
    delete old.happenings;
    const up = migrateSave(old as never);
    expect(up.happenings.current).toBeNull();
    expect(up.happenings.auto).toBe(true);
  });
});
