import { Vector3, type Material, type Mesh } from 'three/webgpu';
import type { GameModule } from '@/game/context';
import { aerolineRoute } from '@/content/scenarios/founding-city';
import { U } from '@/render/uniforms';
import { projectProgress } from '@/sim/projects';
import { ConstructionLook } from './construction';
import { Guideway, type StationSite } from './Guideway';
import { Movers } from './Movers';
import { LoopPath } from './path';
import { Trains } from './Trains';

/** Rail-top clearance over the highest ground along the loop: clears every town building beneath. */
const CLEARANCE = 4.6;
const MIN_DECK = 6;
const STATION = 'aeroline-station';
const _mid = new Vector3();

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
      guide = new Guideway(path, deck, stations, ground);
      ctx.scene.add(guide.group);
      shadows();
    };

    /** The finished line: stock materials back on, trains and lift cabins running. */
    const open = () => {
      raise();
      finishSite();
      if (trains) return;
      trains = new Trains(
        path,
        deckY,
        stations.map((s) => s.s),
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
      for (const m of [trains?.noses, trains?.mids, movers?.cabins, movers?.walkers]) {
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
    ctx.bus.on('city:reset', teardown);
    ctx.bus.on('load:done', () => (teardown(), sync()));

    ctx.systems.add({
      id: 'aeroline.update',
      phase: 'sync',
      update(_c, f) {
        trains?.update(U.clock.value);
        movers?.update(U.clock.value);
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

    ctx.services.provide('aeroline', {
      get trains() {
        return trains?.count ?? 0;
      },
      get deck() {
        return trains ? deckY : 0;
      },
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
          const d = trains.point(dir, u - 6, 0.5, _mid).distanceTo(p);
          if (d < best.d) best = { d, v };
        }
        return best;
      },
      ride(i: number, eye: Vector3, look: Vector3): void {
        if (!trains) return;
        const { u, dir } = trains.head(i % trains.count, U.clock.value);
        // Chase view: behind and above the train, so the whole set sweeps along the viaduct ahead.
        trains.point(dir, u - 18, 3.2, eye);
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
