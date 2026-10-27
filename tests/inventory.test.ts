import { describe, expect, it } from 'vitest';
import { AgentToolRegistry, checkArgs } from '@/core/AgentTools';
import { EventBus } from '@/core/EventBus';
import { City } from '@/sim/City';
import { applyScenario } from '@/sim/scenario';
import { deserializeCity, migrateSave, serializeCity, type SaveData } from '@/sim/save';
import {
  filterObjects,
  getObject,
  inspectObject,
  listObjects,
  parseSearch,
  queryInventory,
  summarize,
} from '@/sim/inventory';
import { inventoryTools } from '@/sim/inventoryTools';
import type { SimCtx } from '@/sim/systems';
import { findSpot, makeSim } from './helpers';

/** A fresh founding city per test: ECS stores are shared by every City in the page, so one can't outlive another. */
function founded() {
  const s = makeSim(1337);
  applyScenario(s.city, 'founding-city');
  s.step(20);
  return s;
}

describe('readable ids', () => {
  it('every object in the founding city has a unique id that looks it up', () => {
    const { city } = founded();
    const all = listObjects(city);
    const ids = all.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    const kinds = new Set(all.map((o) => o.kind));
    for (const k of ['building', 'network', 'bridge', 'district']) expect(kinds.has(k)).toBe(true);
    expect(all.filter((o) => o.kind === 'building').length).toBe(city.buildingEntities().length);
    for (const o of all.filter((_, i) => i % 97 === 0))
      expect(getObject(city, o.id.toLowerCase())?.id).toBe(o.id);
    expect(ids.find((i) => /^(LIV|NRG|UTL|TEC|WRK|NAT|FOD)-\d{4}$/.test(i))).toBeDefined();
    expect(getObject(city, 'LIV-999999')).toBeNull();
    expect(getObject(city, 'nonsense')).toBeNull();
  });

  it('names districts from the scenario', () => {
    const { city } = founded();
    const names = city.districts.map((d) => d.name);
    for (const n of ['Civic Ring', 'Bayfront', 'Westbrook', 'Sunfield']) expect(names).toContain(n);
    const spire = queryInventory(city, { kind: 'building', type: 'wellspring-spire' }).items[0]!;
    expect(spire.district).toBe('Civic Ring');
    expect(getObject(city, 'DST-WESTBROOK')!.metrics.buildings).toBeGreaterThan(20);
  });

  it('keeps a building id through demolish / undo and build / undo / redo, and never reuses a live one', () => {
    const s = makeSim(11);
    const a = findSpot(s.city, 'canopy-tower');
    s.commands.execute('build', { def: 'canopy-tower', ...a, rot: 0 });
    const id = listObjects(s.city, 'building')[0]!.id;
    s.commands.execute('demolish', { x: a.x, z: a.z });
    expect(getObject(s.city, id)).toBeNull();
    s.commands.undo();
    expect(getObject(s.city, id)?.type).toBe('canopy-tower');
    s.commands.undo();
    s.commands.redo();
    expect(listObjects(s.city, 'building')[0]!.id).toBe(id);
    const b = findSpot(s.city, 'pocket-park');
    s.commands.execute('build', { def: 'pocket-park', ...b, rot: 0 });
    const ids = listObjects(s.city, 'building').map((o) => o.id);
    expect(new Set(ids.map((i) => i.split('-')[1])).size).toBe(2);
  });

  it('survives save / load, and old saves get serials', () => {
    const { city } = founded();
    const data = JSON.parse(JSON.stringify(serializeCity(city))) as SaveData;
    const other = new City(new EventBus(), 1);
    deserializeCity(other, data);
    expect(other.hash()).toBe(city.hash());
    expect(listObjects(other, ['building', 'district']).map((o) => o.id)).toEqual(
      listObjects(city, ['building', 'district']).map((o) => o.id),
    );
    const v6 = {
      ...structuredClone(data),
      version: 6,
      buildings: data.buildings.map((b) => b.slice(0, 8)),
    } as unknown as SaveData;
    const m = migrateSave(v6);
    expect(m.buildings[0]![8]).toBe(1);
    expect(m.nextUid).toBe(m.buildings.length + 1);
  });
});

describe('queries', () => {
  it('parses words and key:value filters', () => {
    expect(parseSearch('pod issue:power district:"garden quarter"')).toEqual({
      words: ['pod'],
      filters: [
        ['issue', 'power'],
        ['district', 'garden quarter'],
      ],
    });
  });

  it('filters, sorts and pages a snapshot', () => {
    const { city } = founded();
    const all = listObjects(city);
    const homes = filterObjects(all, { kind: 'building', group: 'living', sort: 'residents', limit: 5 });
    expect(homes.items.length).toBe(5);
    expect(homes.total).toBeGreaterThan(100);
    const r = homes.items.map((o) => o.metrics.residents!);
    expect([...r].sort((a, b) => b - a)).toEqual(r);
    const west = filterObjects(all, { text: 'district:westbrook pod' });
    expect(west.total).toBeGreaterThan(0);
    for (const o of west.items) expect(o.district).toBe('Westbrook');
    const near = filterObjects(all, { near: { x: 256, z: 256, radius: 20 }, sort: 'distance' });
    for (const o of near.items) expect(Math.hypot(o.x - 256, o.z - 256)).toBeLessThanOrEqual(20);
    const worst = filterObjects(all, { sort: 'status', limit: 1 }).items[0]!;
    expect(['warning', 'critical']).toContain(worst.status);
  });

  it('summarises every object', () => {
    const { city } = founded();
    const all = listObjects(city);
    const s = summarize(all);
    expect(s.total).toBe(all.length);
    expect(s.status.ok + s.status.warning + s.status.critical).toBe(all.length);
    expect(s.kinds.reduce((a, k) => a + k.count, 0)).toBe(all.length);
    expect(s.totals['building.residents']).toBeCloseTo(
      all.reduce((a, o) => a + (o.kind === 'building' ? (o.metrics.residents ?? 0) : 0), 0),
      3,
    );
  });

  it('explains issues and links buildings to their network', () => {
    const { city } = founded();
    const sick =
      queryInventory(city, { kind: 'building', status: 'critical', limit: 1 }).items[0] ??
      queryInventory(city, { kind: 'building', limit: 1 }).items[0]!;
    const o = inspectObject(city, sick.id)!;
    expect(o.issueDetails.length).toBe(o.issues.length);
    expect(typeof o.details.description).toBe('string');
    const net = queryInventory(city, { kind: 'network', sort: 'tiles', limit: 1 }).items[0]!;
    const connected = queryInventory(city, { kind: 'building', limit: 50 }).items.map(
      (b) => inspectObject(city, b.id)!.details.network,
    );
    expect(connected).toContain(net.id);
  });
});

describe('agent tools', () => {
  const registry = (city = founded().city) => {
    const r = new AgentToolRegistry<SimCtx>({ city });
    for (const t of inventoryTools) r.register(t);
    return r;
  };

  it('lists JSON-schema specs with valid names', () => {
    const specs = registry().specs();
    expect(specs.map((s) => s.name)).toEqual([
      'city_overview',
      'inventory_catalog',
      'inventory_summary',
      'inventory_search',
      'inventory_inspect',
    ]);
    for (const s of specs) expect(s.input_schema.type).toBe('object');
    expect(() =>
      registry().register({
        name: 'Bad Name',
        description: '',
        input: { type: 'object' },
        effect: 'read',
        run: () => 0,
      }),
    ).toThrow();
  });

  it('runs tools with JSON in, JSON out, and reports bad calls without throwing', async () => {
    const r = registry();
    const overview = await r.call('city_overview');
    expect(overview.ok).toBe(true);
    const found = await r.call('inventory_search', { kind: 'building', status: 'ok', limit: 3 });
    if (!found.ok) throw new Error(found.error);
    const items = (found.result as { items: { id: string; ref?: unknown }[] }).items;
    expect(items.length).toBe(3);
    expect(items[0]!.ref).toBeUndefined();
    const inspected = await r.call('inventory_inspect', { id: items[0]!.id });
    expect(inspected.ok && JSON.parse(JSON.stringify(inspected.result)).id).toBe(items[0]!.id);
    expect(await r.call('inventory_inspect', {})).toEqual({ ok: false, error: 'input.id is required' });
    expect(await r.call('inventory_search', { limit: 'ten' })).toEqual({
      ok: false,
      error: 'input.limit must be a number',
    });
    expect((await r.call('inventory_inspect', { id: 'LIV-999999' })).ok).toBe(false);
    expect((await r.call('nope')).ok).toBe(false);
  });

  it('checks schemas', () => {
    expect(checkArgs({ type: 'string', enum: ['a'] }, 'b')).toMatch(/one of/);
    expect(checkArgs({ type: 'integer', minimum: 1 }, 0)).toMatch(/≥ 1/);
    expect(checkArgs({ type: 'array', items: { type: 'number' } }, [1, 'x'])).toMatch(/\[1\]/);
  });
});
