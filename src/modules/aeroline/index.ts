import { Box3, Object3D, Vector3, type Material, type Mesh } from 'three/webgpu';
import type { GameModule } from '@/game/context';
import { aerolineRoute } from '@/content/scenarios/founding-city';
import { U } from '@/render/uniforms';
import { projectProgress } from '@/sim/projects';
import { AEROLINE_LEVELS, MAX_AEROLINE_LEVEL, aerolineBlock, aerolineLevel, aerolineLevelDef, aerolineStations, aerolineUpgradeCost } from '@/sim/aeroline';
import { registerPickable } from '@/modules/construction/pick';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { ConstructionLook } from './construction';
import { Guideway, type StationSite } from './Guideway';
import { Movers } from './Movers';
import { LoopPath } from './path';
import { CARS_AT, Trains, trainSet } from './Trains';

/** Rail-top clearance over the highest ground along the loop: clears every town building beneath. */
const CLEARANCE = 4.6;
const MIN_DECK = 6;
const STATION = 'aeroline-station';
const _mid = new Vector3();
const _fwd = new Vector3();

/**
 * The Aeroline (D-041): an elevated solar maglev loop above the founding city's streets, with trains stopping at
 * four stations, each reached from the street by two Bloom Helix towers. Render-only: the stations are ordinary transit buildings (`rail` riders in the mobility sim);
 * this module draws the line once any station exists (or a fresh island's Aeroline project completes), raises it
 * around the loop while that project runs (`construction.ts`), and offers the explore module a ride camera.
 */
export const aerolineModule: GameModule = {
  id: 'aeroline',
  deps: ['world', 'construction'],
  init(ctx) {
    const { city } = ctx;
    let guide: Guideway | null = null;
    let stations: StationSite[] = [];
    let trains: Trains | null = null;
    let movers: Movers | null = null;
    /** Set while the line is under construction (its meshes wear the construction materials). */
    let site: { look: ConstructionLook; stock: Material[]; shown: number; shadowAt: number; clock: number } | null =
      null;
    let deckY = 0;
    const route = aerolineRoute(city.size);
    const path = new LoopPath(route.corners, route.radius);
    const centre = route.corners.reduce(
      (a, c) => [a[0] + c[0] / route.corners.length, a[1] + c[1] / route.corners.length],
      [0, 0],
    );
    const shadows = () => ctx.services.tryGet('world')?.atmosphere.invalidateShadows();

    /** The viaduct, pylons and stations (no trains yet). */
    const raise = () => {
      if (guide) return;
      const g = city.grid;
      const ground = (x: number, z: number) => g.heightAt(x, z);
      let top = 0;
      for (const s of path.samples(0, path.length, 2, 2)) {
        const p = path.at(s, { x: 0, z: 0, tx: 0, tz: 0, curv: 0 });
        top = Math.max(top, ground(p.x, p.z));
      }
      const deck = Math.max(MIN_DECK, top + CLEARANCE);
      deckY = deck;
      const L = path.length;
      stations = route.stations.map((st) => {
        const s = path.project(st.x, st.z);
        const p = path.at(s, { x: 0, z: 0, tx: 0, tz: 0, curv: 0 });
        // Right of travel is (-tz, tx): is the loop's centre that way?
        const inner = Math.sign(-p.tz * (centre[0] - p.x) + p.tx * (centre[1] - p.z)) || 1;
        return { name: st.name, s: (s + L) % L, inner };
      });
      guide = new Guideway(path, deck, stations, ground, aerolineLevel(city));
      ctx.scene.add(guide.group);
      shadows();
    };

    /** The finished line: stock materials back on, trains and lift cabins running. */
    const open = () => {
      raise();
      finishSite();
      if (trains) return;
      const lv = aerolineLevelDef(city);
      trains = new Trains(
        path,
        deckY,
        stations.map((s) => s.s),
        aerolineLevel(city),
        lv.vmax,
      );
      movers = new Movers(guide!.towers);
      ctx.scene.add(trains.noses, trains.mids, movers.cabins, movers.walkers);
      shadows();
    };

    const meshes = () => (guide ? (guide.group.children as Mesh[]) : []);
    /** Under construction: the line sweeps into place from the first station (Hillcrest) round the loop. */
    const startSite = () => {
      raise();
      if (site || trains) return;
      const first = route.stations[0]!;
      const look = new ConstructionLook(
        centre[0]!,
        centre[1]!,
        // A little behind the first station, so the whole station rises with the first stretch.
        Math.atan2(first.z - centre[1]!, first.x - centre[0]!) - 0.12,
        deckY + 2,
      );
      const stock = meshes().map((m) => m.material as Material);
      meshes().forEach((m, i) => (m.material = look.wrap(stock[i]!)));
      site = { look, stock, shown: 0, shadowAt: -1, clock: 0 };
    };
    const finishSite = () => {
      if (!site) return;
      meshes().forEach((m, i) => (m.material = site!.stock[i]!));
      site.look.dispose();
      site = null;
      shadows();
    };

    const teardown = () => {
      finishSite();
      guide?.dispose();
      guide = null;
      trains?.dispose();
      for (const m of [movers?.cabins, movers?.walkers]) {
        if (!m) continue;
        m.removeFromParent();
        m.geometry.dispose();
        m.dispose();
      }
      trains = null;
      movers = null;
      deckY = 0;
      shadows();
    };

    const hasStation = () => city.buildingEntities().some((eid) => city.buildingRecord(eid).def === STATION);
    const running = () => city.growth.projects.find((r) => r.id === 'aeroline');
    /** Brings the drawing in line with the city: a station or a finished project opens the line, a running one builds it. */
    const sync = () => {
      const g = city.growth;
      if (hasStation() || (g.progression && g.unlocked.includes('aeroline'))) open();
      else if (running()) startSite();
      else if (guide) teardown();
    };
    sync();
    ctx.bus.on('building:added', ({ eid }) => {
      if (!trains && city.buildingRecord(eid).def === STATION) open();
    });
    // A fresh island raises the line while its Aeroline project runs and opens it when it completes (D-072);
    // undoing the start takes the works down again.
    ctx.bus.on('project:start', ({ id }) => id === 'aeroline' && startSite());
    ctx.bus.on('project:done', ({ id }) => id === 'aeroline' && open());
    // A new line level (or its undo) rebuilds the stations and swaps the rolling stock (D-170).
    ctx.bus.on('aeroline:level', ({ level }) => {
      if (!trains) return;
      teardown();
      sync();
      if (level > 1) {
        const d = AEROLINE_LEVELS[level - 1]!;
        const at = firstStation();
        ctx.bus.emit('toast', { text: `Aeroline upgraded: ${d.name} sets now run the loop`, tone: 'ok', ...(at ? { at } : {}) });
      }
    });
    ctx.bus.on('city:reset', teardown);
    ctx.bus.on('load:done', () => (teardown(), sync()));

    // Clicking a train opens the line's inspector: one proxy per set follows its middle car (D-170).
    const proxies = Array.from({ length: 6 }, () => {
      const o = new Object3D();
      o.name = 'aeroline.pick';
      o.visible = false;
      ctx.scene.add(o);
      registerPickable({ object: 'aeroline', node: o, box: new Box3(new Vector3(-0.6, -0.4, -9), new Vector3(0.6, 1.0, 9)), pad: 0.6 });
      return o;
    });
    const placeProxies = () => {
      proxies.forEach((o, i) => {
        o.visible = !!trains && i < trains.count;
        if (!trains || !o.visible) return;
        const { u, dir } = trains.head(i, U.clock.value);
        trains.point(dir, u - trains.length / 2, 0, o.position, _fwd);
        o.rotation.set(0, Math.atan2(_fwd.x, _fwd.z), 0);
        o.scale.set(1, 1, trains.length / 18);
        o.updateMatrixWorld();
      });
    };

    ctx.systems.add({
      id: 'aeroline.update',
      phase: 'sync',
      update(_c, f) {
        trains?.update(U.clock.value);
        placeProxies();
        movers?.update(U.clock.value);
        // The time-lapse (D-219) raises the line when its project completed on the film's clock.
        const seen = ctx.services.tryGet('timelapse')?.shows('aeroline') ?? true;
        if (guide) guide.group.visible = seen;
        if (trains) trains.noses.visible = trains.mids.visible = seen;
        if (movers) movers.cabins.visible = movers.walkers.visible = seen;
        if (!site) return;
        const run = running();
        if (!run) {
          // Undone (or otherwise gone) before it finished.
          if (!city.growth.unlocked.includes('aeroline')) teardown();
          return;
        }
        // Ease toward the project's progress so the front glides; re-cast shadows twice a second while it moves.
        const want = projectProgress(city, run);
        site.shown += (want - site.shown) * Math.min(1, f.dt * 1.5);
        if (Math.abs(want - site.shown) < 1e-4) site.shown = want;
        site.look.built.value = site.shown;
        site.clock += f.dt;
        if (Math.abs(site.shown - site.shadowAt) > 0.002 && site.clock > 0.5) {
          site.clock = 0;
          site.shadowAt = site.shown;
          shadows();
        }
      },
    });

    // ── Line level: inspector (a train, or a station's button) and the upgrade (D-170) ────────────────────
    const firstStation = () => {
      for (const eid of city.buildingEntities())
        if (city.buildingRecord(eid).def === STATION) {
          const r = city.buildingRecord(eid);
          return { x: r.x + 3, z: r.z + 2 };
        }
      return null;
    };
    const upgrade = () => ctx.commands.execute('upgradeAeroline', {});
    const hud = ctx.services.get('hud');
    const btn = (glyph: string, label: string, title: string, run: () => void, disabled = false) =>
      h(
        'button',
        { class: 'tool', title, onClick: run, ...(disabled ? { disabled: true } : {}) },
        h('span', { class: 'g' }, icon(glyph)),
        label,
      );
    const upgradeButton = () => {
      const lv = aerolineLevel(city);
      if (lv >= MAX_AEROLINE_LEVEL) return null;
      const next = AEROLINE_LEVELS[lv]!;
      const block = aerolineBlock(city);
      return btn(
        'up',
        `Upgrade line · ${aerolineUpgradeCost(city).toLocaleString()}`,
        block ? block.reason : `Level ${lv + 1}: ${next.name}. ${next.blurb}`,
        upgrade,
        !!block,
      );
    };
    hud.objectInspector('aeroline', () => {
      if (!trains) return null;
      const lv = aerolineLevel(city);
      const d = aerolineLevelDef(city);
      const next = lv < MAX_AEROLINE_LEVEL ? AEROLINE_LEVELS[lv]! : null;
      const pips = h(
        'div',
        { class: 'ix-group', title: 'Line level: trains and stations upgrade together' },
        h('span', { class: 'ix-more' }, 'Level:'),
        ...AEROLINE_LEVELS.map((l, i) => h('span', { class: `ix-chip ${i < lv ? 'on' : ''}` }, `${i + 1} · ${l.name}`)),
      );
      const up = upgradeButton();
      const at = firstStation();
      return {
        glyph: 'train',
        code: `AEROLINE · L${lv}`,
        place: `${aerolineStations(city)} stations`,
        title: `Aeroline · ${d.name}`,
        desc: d.blurb,
        vitals: [
          ['up', 'Level', `${lv} / ${MAX_AEROLINE_LEVEL}`, lv === MAX_AEROLINE_LEVEL ? 'good' : ''],
          ['fast', 'Top speed', `${d.kmh} km/h`],
          ['train', 'Sets', `${trains.count} × ${Math.round(trains.length / (4.55 * 0.55))} cars`],
          ['people', 'Riders', `×${d.riders.toFixed(2)}`],
        ],
        body: [pips],
        rows: next
          ? [
              ['Next', `${next.name}: ${next.blurb}`],
              ['Brings', `${next.kmh} km/h, ×${next.riders.toFixed(2)} riders per station`],
            ]
          : [['Line', 'Top level: the Aurora Halo runs the loop']],
        note: 'The whole line upgrades as one: every train and every station deck. Undo returns the credits.',
        actions: [
          ...(up ? [up] : []),
          btn('train', 'Ride', 'Ride a train round the loop (drag to look, Esc back)', () => ctx.services.get('explore').setMode('train')),
          ...(at ? [btn('locate', 'Locate', 'Fly the camera to a station', () => ctx.cameraCtl.locate(at.x, at.z, { size: 30, height: 8 }))] : []),
        ],
      };
    });
    // A station's inspector offers the line upgrade too, and opens the line's card.
    hud.buildingActions((eid) => {
      if (city.buildingRecord(eid).def !== STATION || !trains) return [];
      const up = upgradeButton();
      return [
        ...(up ? [up] : []),
        btn('train', 'Line', 'The Aeroline: level, trains and upgrade', () =>
          ctx.bus.emit('selection:changed', { eid: null, object: 'aeroline' }),
        ),
      ];
    });

    // The model gallery: each line level's rolling stock.
    ctx.services.tryGet('gallery')?.add({
      id: 'train',
      name: 'Aeroline maglev',
      group: 'Transit',
      blurb:
        'The island loop: maglev sets gliding on a viaduct round the towns, stopping at every station. The whole line levels up together, trains and stations alike.',
      facts: AEROLINE_LEVELS.map((l, i) => [l.name, `${CARS_AT[i]} cars · ${l.kmh} km/h`] as [string, string]),
      levels: AEROLINE_LEVELS.map((l) => l.name),
      build: (lv) => ({ object: trainSet(lv + 1) }),
    });

    ctx.services.provide('aeroline', {
      get trains() {
        return trains?.count ?? 0;
      },
      get deck() {
        return trains ? deckY : 0;
      },
      get level() {
        return aerolineLevel(city);
      },
      upgrade,
      get building() {
        return site ? site.shown : -1;
      },
      get pylons() {
        return guide?.pylons ?? [];
      },
      nearest(p: Vector3): { d: number; v: number } {
        let best = { d: Infinity, v: 0 };
        if (!trains) return best;
        for (let i = 0; i < trains.count; i++) {
          const { u, v, dir } = trains.head(i, U.clock.value);
          // The middle of the five-car set.
          const d = trains.point(dir, u - trains.length / 2, 0.5, _mid).distanceTo(p);
          if (d < best.d) best = { d, v };
        }
        return best;
      },
      ride(i: number, eye: Vector3, look: Vector3): void {
        if (!trains) return;
        const { u, dir } = trains.head(i % trains.count, U.clock.value);
        // Chase view: behind and above the train, so the whole set sweeps along the viaduct ahead.
        trains.point(dir, u - trains.length - 5.5, 3.2, eye);
        trains.point(dir, u + 8, 0.3, look);
      },
    });
  },
};

declare module '@/core/Services' {
  interface GameServices {
    aeroline: {
      /** Trains running (0 until a station exists). */
      readonly trains: number;
      /** Platform deck height (0 until the line is open): sky-lane pods land beside it (D-052). */
      readonly deck: number;
      /** Line level 1..3 (D-170). */
      readonly level: number;
      /** Raises the line a level (the `upgradeAeroline` command); false when blocked. */
      upgrade(): boolean;
      /** Construction progress 0..1 while the Aeroline project runs, else -1. */
      readonly building: number;
      /** Where the viaduct's pylons stand (x, z), once it is raised: the cruise ferry steers clear (D-141). */
      readonly pylons: readonly [number, number][];
      /** Distance from `p` to the nearest train and its speed (world units per second); Infinity with none. */
      nearest(p: Vector3): { d: number; v: number };
      /** Camera eye and look-at for riding train `i`'s cab. */
      ride(i: number, eye: Vector3, look: Vector3): void;
    };
  }
}
