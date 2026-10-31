import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import {
  GRAND_SHELLS,
  MIN_SHELLS,
  SHOW_FEE,
  SHOW_SHELLS,
  SHOW_TIME,
  launchBlocker,
  launchSites,
  stockTotal,
  storage,
} from '@/sim/fireworks';
import { FIREWORK_KINDS } from '@/sim/fireworksState';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import { AgentToolRegistry } from '@/core/AgentTools';
import type { ActionCtx } from '@/sim/actionTools';
import { fireworksTools } from '@/sim/fireworksTools';
import { plainIntent } from '@/ai/agent';
import { SKY_FONT, SKY_TEXT_MAX, skyText } from '@/content/skyFont';
import { makeSim } from './helpers';

const seconds = (s: ReturnType<typeof makeSim>, n: number) => s.step(n * 10);

/** The founding city, settled, with its two waterfront Fireworks Factories. */
function withFactory() {
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(200);
  s.city.credits += 5000;
  return s;
}

/** Fills the racks directly (production is tested on its own). */
function stockUp(s: ReturnType<typeof makeSim>, each: number) {
  for (const k of FIREWORK_KINDS) s.city.fireworks.stock[k] = each;
}

/** Runs the clock to just before the nightly show. */
function toEvening(s: ReturnType<typeof makeSim>) {
  const left = (SHOW_TIME - 0.01 - s.city.timeOfDay + 1) % 1;
  seconds(s, Math.ceil(left * 360));
}

describe('fireworks (D-068)', () => {
  it('the founding city has two factories on the waterfront, in industry zones', () => {
    const s = makeSim(20261024);
    applyScenario(s.city, 'founding-city');
    const factories = launchSites(s.city);
    expect(factories.length).toBe(2);
    for (const [e] of factories) {
      const r = s.city.buildingRecord(e);
      const [w, d] = s.city.footprint(s.city.buildingDef(e), r.rot);
      let near = false;
      for (let z = r.z - 3; z < r.z + d + 3 && !near; z++)
        for (let x = r.x - 3; x < r.x + w + 3 && !near; x++) near = s.city.isWaterTile(x, z);
      expect(near, `factory at ${r.x},${r.z}`).toBe(true);
      expect(s.city.areaAt(r.x + (w >> 1), r.z + (d >> 1))?.zone).toBe('industry');
    }
  });

  it('a staffed factory makes shells of every kind, paying for materials, up to its storage', () => {
    const s = withFactory();
    seconds(s, 240);
    const fw = s.city.fireworks;
    expect(fw.produced).toBeGreaterThan(8);
    expect(fw.spent).toBeGreaterThan(0);
    for (const k of FIREWORK_KINDS) expect(fw.stock[k]).toBeGreaterThan(0);
    const cap = storage(s.city);
    stockUp(s, cap / FIREWORK_KINDS.length);
    seconds(s, 60);
    expect(stockTotal(fw.stock)).toBe(cap);
  });

  it('fires the nightly show at 21:00: harmony up, smoke in the air, one show a night', () => {
    const s = withFactory();
    s.city.fireworks.auto = true;
    stockUp(s, 10);
    toEvening(s);
    const volleys: number[] = [];
    s.bus.on('fireworks:volley', ({ kinds }) => volleys.push(kinds.length));
    const pollution = s.city.stats.pollution;
    seconds(s, 20);
    const fw = s.city.fireworks;
    expect(fw.show?.cause).toBe('night');
    expect(volleys.length).toBeGreaterThan(5);
    expect(s.city.pulse.harmony.fireworks).toBeGreaterThan(1);
    expect(s.city.stats.pollution).toBeGreaterThan(pollution);
    seconds(s, 40);
    expect(fw.show).toBeNull();
    expect(fw.shows).toBe(1);
    expect(fw.history.at(-1)!.shells).toBe(SHOW_SHELLS);
    expect(fw.revenue).toBeGreaterThan(0);
    // The afterglow fades; no second show tonight even with shells to spare.
    stockUp(s, 10);
    seconds(s, 30);
    expect(fw.shows).toBe(1);
    expect(s.city.pulse.harmony.fireworks).toBeGreaterThan(0);
  });

  it('the steward can launch a show any time; undo puts the shells back and refunds the crew', () => {
    const s = withFactory();
    expect(launchBlocker(s.city)).toMatch(/shells/);
    expect(s.commands.execute('launchFireworks', {})).toBe(false);
    stockUp(s, 20);
    const credits = s.city.credits;
    expect(s.commands.execute('launchFireworks', { grand: true })).toBe(true);
    expect(s.city.fireworks.show!.shells).toBe(GRAND_SHELLS);
    expect(s.city.credits).toBe(credits - SHOW_FEE);
    expect(launchBlocker(s.city)).toMatch(/already/);
    seconds(s, 5);
    s.commands.undo();
    expect(s.city.fireworks.show).toBeNull();
    // Every shell back (the factories kept working meanwhile).
    expect(stockTotal(s.city.fireworks.stock)).toBeGreaterThanOrEqual(100);
    expect(stockTotal(s.city.fireworks.stock)).toBeLessThan(110);
    expect(s.city.fireworks.shows).toBe(0);
  });

  it('back-to-back shows wear thin: novelty fatigue shrinks the delight, then the noise grates', () => {
    const s = withFactory();
    s.city.fireworks.auto = false;
    const peaks: number[] = [];
    for (let i = 0; i < 6; i++) {
      stockUp(s, 6);
      expect(s.commands.execute('launchFireworks', {})).toBe(true);
      let peak = -Infinity;
      for (let t = 0; t < 40 && s.city.fireworks.show; t++) {
        seconds(s, 1);
        peak = Math.max(peak, s.city.pulse.harmony.fireworks);
      }
      peaks.push(peak);
    }
    // The afterglow stacks at first, but by the sixth show in a row residents are complaining.
    expect(peaks[0]!).toBeGreaterThan(1);
    expect(peaks.at(-1)!).toBeLessThan(0);
    expect(s.city.fireworks.fatigue).toBeGreaterThan(2);
    expect(s.city.fireworks.shows).toBe(6);
    expect(MIN_SHELLS).toBeLessThan(SHOW_SHELLS);
  });

  it('is deterministic and survives a save mid-show; v9 saves load with an empty magazine', () => {
    const run = () => {
      const s = withFactory();
      stockUp(s, 12);
      s.commands.execute('launchFireworks', {});
      seconds(s, 12);
      return s;
    };
    const a = run();
    expect(a.city.hash()).toBe(run().city.hash());
    const data = JSON.parse(JSON.stringify(serializeCity(a.city))) as SaveData;
    expect(data.version).toBe(SAVE_VERSION);
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.hash()).toBe(a.city.hash());
    expect(other.fireworks.show?.fired).toBe(a.city.fireworks.show?.fired);
    const v9 = structuredClone(data) as unknown as Record<string, unknown>;
    v9.version = 9;
    delete v9.fireworks;
    const m = migrateSave(v9 as unknown as SaveData);
    expect(stockTotal(m.fireworks.stock)).toBe(0);
    expect(m.fireworks.auto).toBe(true);
  });

  it('Flora reads the magazine, launches a show and switches the nightly show', async () => {
    const s = withFactory();
    const r = new AgentToolRegistry<ActionCtx>({ city: s.city, commands: s.commands });
    for (const t of fireworksTools) r.register(t);
    const before = await r.call('fireworks_status', {});
    expect(before.ok && (before.result as { canLaunch: string }).canLaunch).toMatch(/shells/);
    stockUp(s, 8);
    const res = await r.call('launch_fireworks', {});
    expect(res.ok).toBe(true);
    expect(s.city.fireworks.show).not.toBeNull();
    const again = await r.call('launch_fireworks', {});
    expect(again.ok).toBe(false);
    await r.call('fireworks_nightly', { on: false });
    expect(s.city.fireworks.auto).toBe(false);
    const st = await r.call('fireworks_status', {});
    expect(st.ok && (st.result as { shows: number }).shows).toBe(1);
  });

  it('routes plain requests to the fireworks tools, not the fire crews', () => {
    expect(plainIntent('fire the fireworks')).toBe('launch_fireworks');
    expect(plainIntent('launch a grand fireworks show')).toBe('launch_fireworks');
    expect(plainIntent('turn off the nightly fireworks')).toBe('fireworks_nightly');
    expect(plainIntent('how many fireworks shows have we had?')).toBe('fireworks_status');
    expect(plainIntent('build a fireworks factory')).toBe('build');
    expect(plainIntent('put out the fire')).toBe('respond_incident');
  });

  it('writes a cleaned message in the sky and features a shape; both survive a save (D-071)', async () => {
    expect(skyText('Happy birthday <3 ❤ ~ é')).toBe('HAPPY BIRTHDAY ♥ ♥');
    expect(skyText('a'.repeat(40)).length).toBe(SKY_TEXT_MAX);
    expect(skyText('~~~')).toBe('');
    for (const ch of skyText('THE QUICK BROWN FOX JUMPS 0123456789'))
      if (ch !== ' ') expect(SKY_FONT[ch]!.length).toBeGreaterThan(0);
    const s = withFactory();
    stockUp(s, 8);
    expect(s.commands.execute('launchFireworks', { shape: 'square' as never })).toBe(false);
    expect(s.commands.execute('launchFireworks', { text: 'i <3 bloomgrid!', shape: 'heart' })).toBe(true);
    const show = s.city.fireworks.show!;
    expect(show.text).toBe('I ♥ BLOOMGRID!');
    expect(show.shape).toBe('heart');
    const data = JSON.parse(JSON.stringify(serializeCity(s.city))) as SaveData;
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.fireworks.show?.text).toBe('I ♥ BLOOMGRID!');
    expect(other.hash()).toBe(s.city.hash());
    seconds(s, 40);
    expect(s.city.fireworks.history.at(-1)).toMatchObject({ text: 'I ♥ BLOOMGRID!', shape: 'heart' });
  });

  it('Flora launches a show with a message and a featured shape', async () => {
    const s = withFactory();
    const r = new AgentToolRegistry<ActionCtx>({ city: s.city, commands: s.commands });
    for (const t of fireworksTools) r.register(t);
    stockUp(s, 8);
    expect((await r.call('launch_fireworks', { text: '~~' })).ok).toBe(false);
    const res = await r.call('launch_fireworks', { text: 'Happy birthday', shape: 'butterfly' });
    expect(res.ok && res.result).toMatchObject({ message: 'HAPPY BIRTHDAY', featuring: 'butterfly' });
    expect(plainIntent('fireworks that say happy birthday')).toBe('launch_fireworks');
    expect(plainIntent('heart fireworks please')).toBe('launch_fireworks');
  });
});
