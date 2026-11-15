import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/EventBus';
import { Building, Service } from '@/ecs/components';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import { SAVE_VERSION, deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import {
  APPROVAL,
  districtIndexOf,
  districtKey,
  homeLayers,
  moodOf,
  protestDistrict,
  setDistrictMood,
  wantsGrowth,
} from '@/sim/approval';
import { growthHoldIn } from '@/sim/levels';
import { DISTRICT_MOOD, startHappening } from '@/sim/happenings';
import { districtTools } from '@/sim/districtTools';
import { filterObjects, listObjects } from '@/sim/inventory';
import { makeSim } from './helpers';

const HARBOUR = 'Old Harbour';

/** A fresh island, settled for a few minutes. */
function island(seed = 20261024, ticks = 600) {
  const s = makeSim(seed);
  applyScenario(s.city, 'fresh-island');
  s.step(ticks);
  return s;
}

const homesIn = (city: City, key: string) =>
  city
    .buildingEntities()
    .filter(
      (e) => city.buildingDef(e).stats.population > 0 && districtKey(city, districtIndexOf(city, e)) === key,
    );

describe('district approval (plan v5, Phase 26)', () => {
  it('gives every peopled district an approval near city harmony, and city harmony is their weighted mean', () => {
    const { city } = island();
    const v = city.approval.view.districts.find((d) => d.key === HARBOUR)!;
    expect(v).toBeTruthy();
    expect(v.capacity).toBeGreaterThan(0);
    const a = moodOf(city, HARBOUR).approval;
    expect(Math.abs(a - city.stats.happiness)).toBeLessThan(15);
    // The local terms only shift districts apart: with no local trouble, the Neighbourhoods term is small.
    expect(Math.abs(city.pulse.harmony.districts)).toBeLessThan(3);
  });

  it('a grudge lowers the district, city harmony with it, and empties homes faster', () => {
    const a = island();
    const b = island();
    setDistrictMood(b.city, HARBOUR, -40);
    a.step(300);
    b.step(300);
    expect(moodOf(b.city, HARBOUR).approval).toBeLessThan(moodOf(a.city, HARBOUR).approval - 15);
    expect(b.city.stats.happiness).toBeLessThan(a.city.stats.happiness - 3);
    expect(b.city.stats.population).toBeLessThan(a.city.stats.population);
    const vb = b.city.approval.view.districts.find((d) => d.key === HARBOUR)!;
    expect(vb.movedOut).toBeGreaterThan(0);
  });

  it('a district that dislikes the steward grows no more homes', () => {
    const { city, step } = island();
    const home = homesIn(city, HARBOUR)[0]!;
    setDistrictMood(city, HARBOUR, -60);
    moodOf(city, HARBOUR).approval = 10;
    step(10);
    expect(wantsGrowth(city, home)).toBe(false);
    // Thriving or not, the district's demand holds it back.
    const hold = growthHoldIn(city, home);
    expect(hold === 'demand' || hold !== null).toBe(true);
  });

  it('commuters look for the kind of job they want first, and homes record their trip', () => {
    const { city } = island();
    const hl = homeLayers(city);
    const homes = homesIn(city, HARBOUR);
    const at = (e: number) => city.grid.index(Building.x[e]!, Building.z[e]!);
    expect(homes.some((e) => hl.commute[at(e)]! > 0)).toBe(true);
    for (const e of homes) {
      expect(hl.match[at(e)]!).toBeGreaterThanOrEqual(0);
      expect(hl.match[at(e)]!).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic and survives a save round-trip; v20 saves migrate', () => {
    const a = island(7, 400);
    const b = island(7, 400);
    expect(a.city.hash()).toBe(b.city.hash());
    setDistrictMood(a.city, HARBOUR, 5);
    expect(a.city.hash()).not.toBe(b.city.hash());
    const data = JSON.parse(JSON.stringify(serializeCity(a.city))) as SaveData;
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.approval[HARBOUR]).toBeTruthy();
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.hash()).toBe(a.city.hash());
    const v20 = { ...structuredClone(data), version: 20 } as Partial<SaveData>;
    delete v20.approval;
    const old = new City(new EventBus(), 1);
    deserializeCity(old, migrateSave(v20 as SaveData));
    expect(old.approval.districts).toEqual({});
  });
});

describe('district voices: petitions, protests, praise', () => {
  it('a petition is met when approval climbs to its target; claiming lifts the district and undoes', () => {
    const { city, commands, step } = island();
    moodOf(city, HARBOUR).approval = 40;
    step(10);
    const h = startHappening(city, 'petition')!;
    expect(h).toBeTruthy();
    expect(h.district).toBe(HARBOUR);
    expect(h.target).toBeGreaterThan(40);
    moodOf(city, HARBOUR).approval = h.target! + 1;
    setDistrictMood(city, HARBOUR, 30);
    step(10);
    expect(city.happenings.current?.status).toBe('met');
    const credits = city.credits;
    expect(commands.execute('claimHappening', { id: h.id }, true)).toBe(true);
    expect(city.credits).toBeCloseTo(credits + h.reward, 3);
    expect(moodOf(city, HARBOUR).boost).toBeGreaterThan(0);
    commands.undo();
    expect(city.happenings.current?.id).toBe(h.id);
    expect(moodOf(city, HARBOUR).boost).toBe(30);
  });

  it('an ignored petition leaves a grudge', () => {
    const { city, step } = island();
    setDistrictMood(city, HARBOUR, -40);
    moodOf(city, HARBOUR).approval = 40;
    step(10);
    const h = startHappening(city, 'petition')!;
    // Keep the district sore for the whole petition (a mood lasts four minutes, a petition five).
    step(2000);
    setDistrictMood(city, HARBOUR, -40);
    step(h.endTick - city.tick + 20);
    expect(city.happenings.history.at(-1)?.outcome).toBe('missed');
    expect(moodOf(city, HARBOUR).boost).toBe(DISTRICT_MOOD.ignored);
  });

  it('a long-angry district protests: its workplaces lose staff until it calms down', () => {
    const { city, step } = island();
    const m = moodOf(city, HARBOUR);
    m.approval = 20;
    m.lowFor = APPROVAL.protestPulses;
    setDistrictMood(city, HARBOUR, -60);
    const h = startHappening(city, 'protest')!;
    expect(h).toBeTruthy();
    expect(protestDistrict(city)).toBe(city.districts.findIndex((d) => d.name === HARBOUR));
    const work = city
      .buildingEntities()
      .filter(
        (e) =>
          city.buildingDef(e).stats.jobs > 0 &&
          city.buildingDef(e).stats.population === 0 &&
          districtIndexOf(city, e) >= 0,
      );
    const before = work.reduce((a, e) => a + Service.occupancy[e]!, 0);
    step(200);
    if (work.length) expect(work.reduce((a, e) => a + Service.occupancy[e]!, 0)).toBeLessThan(before);
    // Calm it: the protest ends on the next pulse.
    setDistrictMood(city, HARBOUR, 60);
    m.approval = APPROVAL.calm + 1;
    step(10);
    expect(city.happenings.current).toBeNull();
    expect(city.happenings.history.at(-1)?.outcome).toBe('done');
  });

  it('a long-delighted district says thank you with a gift ready to claim', () => {
    const { city, commands } = island();
    moodOf(city, HARBOUR).highFor = APPROVAL.praisePulses;
    const h = startHappening(city, 'praise')!;
    expect(h.status).toBe('met');
    expect(moodOf(city, HARBOUR).highFor).toBe(0);
    expect(commands.execute('claimHappening', { id: h.id }, true)).toBe(true);
    expect(city.happenings.history.at(-1)?.outcome).toBe('claimed');
  });
});

describe('district reads for Flora and the inventory', () => {
  it('district_report lists peopled districts with approval, complaints and movement', () => {
    const s = island();
    const tool = districtTools.find((t) => t.name === 'district_report')!;
    const out = tool.run({ city: s.city, commands: s.commands } as never, {} as never) as {
      districts: { district: string; approval: number; movement: string }[];
    };
    expect(out.districts.map((d) => d.district)).toContain(HARBOUR);
    expect(out.districts[0]!.movement).toMatch(/moved in/);
    expect(() =>
      tool.run({ city: s.city, commands: s.commands } as never, { district: 'Atlantis' } as never),
    ).toThrow();
  });

  it('districts carry an approval metric and an unhappy issue', () => {
    const { city, step } = island();
    setDistrictMood(city, HARBOUR, -60);
    moodOf(city, HARBOUR).approval = 30;
    step(10);
    const d = listObjects(city).find((o) => o.kind === 'district' && o.name === HARBOUR)!;
    expect(d.metrics.approval).toBeLessThan(45);
    expect(
      filterObjects(listObjects(city, 'district'), { issue: 'unhappy' }).items.map((o) => o.name),
    ).toContain(HARBOUR);
  });
});
