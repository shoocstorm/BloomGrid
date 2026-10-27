import { Vector3 } from 'three/webgpu';
import type { GameModule } from '@/game/context';
import { aerolineRoute } from '@/content/scenarios/founding-city';
import { U } from '@/render/uniforms';
import { Guideway, type StationSite } from './Guideway';
import { Movers } from './Movers';
import { LoopPath } from './path';
import { Trains } from './Trains';

/** Rail-top clearance over the highest ground along the loop: clears every town building beneath. */
const CLEARANCE = 4.6;
const MIN_DECK = 6;
const STATION = 'aeroline-station';

/**
 * The Aeroline (D-041): an elevated solar maglev loop above the founding city's streets, with trains stopping at
 * four stations, each reached from the street by two Bloom Helix towers. Render-only: the stations are ordinary transit buildings (`rail` riders in the mobility sim);
 * this module draws the line once any station exists, and offers the explore module a ride camera.
 */
export const aerolineModule: GameModule = {
  id: 'aeroline',
  deps: ['world', 'construction'],
  init(ctx) {
    const { city } = ctx;
    let trains: Trains | null = null;
    let movers: Movers | null = null;
    const route = aerolineRoute(city.size);
    const path = new LoopPath(route.corners, route.radius);

    const build = () => {
      if (trains) return;
      const g = city.grid;
      const ground = (x: number, z: number) => g.heightAt(x, z);
      let top = 0;
      for (const s of path.samples(0, path.length, 2, 2)) {
        const p = path.at(s, { x: 0, z: 0, tx: 0, tz: 0, curv: 0 });
        top = Math.max(top, ground(p.x, p.z));
      }
      const deck = Math.max(MIN_DECK, top + CLEARANCE);
      const L = path.length;
      const centre = route.corners.reduce(
        (a, c) => [a[0] + c[0] / route.corners.length, a[1] + c[1] / route.corners.length],
        [0, 0],
      );
      const stations: StationSite[] = route.stations.map((st) => {
        const s = path.project(st.x, st.z);
        const p = path.at(s, { x: 0, z: 0, tx: 0, tz: 0, curv: 0 });
        // Right of travel is (-tz, tx): is the loop's centre that way?
        const inner = Math.sign(-p.tz * (centre[0] - p.x) + p.tx * (centre[1] - p.z)) || 1;
        return { name: st.name, s: (s + L) % L, inner };
      });
      const guide = new Guideway(path, deck, stations, ground);
      trains = new Trains(
        path,
        deck,
        stations.map((s) => s.s),
      );
      movers = new Movers(guide.towers);
      ctx.scene.add(guide.group, trains.noses, trains.mids, movers.cabins, movers.walkers);
      ctx.services.tryGet('world')?.atmosphere.invalidateShadows();
    };
    const hasStation = () => city.buildingEntities().some((eid) => city.buildingRecord(eid).def === STATION);
    if (hasStation()) build();
    ctx.bus.on('building:added', ({ eid }) => {
      if (!trains && city.buildingRecord(eid).def === STATION) build();
    });

    ctx.systems.add({
      id: 'aeroline.update',
      phase: 'sync',
      update() {
        trains?.update(U.clock.value);
        movers?.update(U.clock.value);
      },
    });

    ctx.services.provide('aeroline', {
      get trains() {
        return trains?.count ?? 0;
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
      /** Camera eye and look-at for riding train `i`'s cab. */
      ride(i: number, eye: Vector3, look: Vector3): void;
    };
  }
}
