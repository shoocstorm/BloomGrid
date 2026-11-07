import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  OctahedronGeometry,
  type BufferAttribute,
} from 'three/webgpu';
import type { GameModule } from '@/game/context';
import { getMaterial } from '@/render/materials/library';
import { U } from '@/render/uniforms';
import { BRIDGE, BRIDGE_DECK } from '@/sim/City';
import { bridgeByKey } from '@/sim/bridges';
import { bridgeReport } from '@/sim/bridgeReport';
import { hash2 } from '@/sim/random';

declare module '@/core/Services' {
  interface GameServices {
    roadworks: RoadworksService;
  }
}

declare module '@/core/EventBus' {
  interface GameEvents {
    /** Construction cues for the audio module (D-128): a job starts, a stretch is laid, a pier rises, it is done. */
    roadworks: { cue: 'start' | 'lay' | 'pier' | 'done' | 'bridge'; x: number; z: number; step?: number };
  }
}

export interface RoadworksService {
  /**
   * When each newly laid highway tile in a `road:changed` batch builds in, in seconds from now (D-128). The
   * renderers read it so the surface, deck slabs, piers and signature structures appear on the same timeline.
   * Empty while a city loads (bulk content appears at once). Cached per batch (array identity).
   */
  schedule(tiles: readonly number[]): ReadonlyMap<number, number>;
  /** Seconds until the bridge deck at `tile` closes (its last slab lands), if it is being built. */
  deckDone(tile: number): number | undefined;
}

/** Longest a single job may take, however long the road (seconds). */
const MAX_JOB = 7;
/** Survey first: the planned path glows this long before the first tile goes down. */
const SURVEY = 0.45;
/** Piers rise this long before the deck above them. */
const PIER_LEAD = 0.4;
const CAP = 2048;
const STAKE = 0x7ff7e6;
const SPARK = [0xfff1c4, 0x7ff7e6, 0xffd27a] as const;
const DUST = 0xc9b48e;
const SPRAY = 0xd8f6ff;
const CONFETTI = [0xffb7d5, 0xffe08a, 0xc9b6ff, 0x7ff7e6, 0x8ef07a] as const;

interface Job {
  /** Clock time of the schedule's zero. */
  t0: number;
  tiles: number[];
  delay: Map<number, number>;
  /** Bridge runs: tiles in path order and the clock time each closes. */
  runs: { tiles: number[]; done: number }[];
  /** Next tile index whose lay effects have not fired (tiles sorted by delay). */
  next: number;
  order: number[];
  end: number;
  cued: boolean;
  /** Bridge tiles whose pier spray has fired. */
  sprayed: Set<number>;
}

/**
 * Roadworks (D-128): building a highway is an event, not a swap. When the steward (or Flora) lays one:
 *
 * 1. **Survey**: glowing stakes hover over every planned tile for a moment.
 * 2. **Paving wave**: tiles go down in path order behind a spark front, each with a puff of dust; the surface
 *    rises out of the ground with a flash (the `road` material reads each tile's `aBorn`, `RoadRenderer`).
 * 3. **Bridges**: piers rise from the water first (spray), then deck slabs extend from both banks to meet in the
 *    middle, then the span's towers, arches and cables grow (`BridgeRenderer` reads the same schedule).
 * 4. **Opening**: a finished bridge gets confetti over its middle and a minor ceremony with its new name.
 *
 * Everything visual is GPU-flown sparks on the `firework` material (written once, flown from `U.clock`), so the
 * CPU only writes particles when a job starts and as its tiles land.
 */
export const roadworksModule: GameModule = {
  id: 'roadworks',
  deps: ['construction', 'world'],
  init(ctx) {
    const geo = new OctahedronGeometry(1, 0);
    geo.deleteAttribute('uv');
    const burst = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    const vel = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    const look = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    for (let i = 0; i < CAP; i++) vel.array[i * 4 + 3] = -1;
    geo.setAttribute('aBurst', burst);
    geo.setAttribute('aVel', vel);
    geo.setAttribute('aLook', look);
    const mesh = new InstancedMesh(geo, getMaterial('firework'), CAP);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.name = 'roadworks';
    ctx.scene.add(mesh);
    const colors = mesh.instanceColor;
    const attrs: BufferAttribute[] = [burst, vel, look, colors];
    let head = 0;
    let dirtyFrom = -1;
    let dirtyCount = 0;
    let liveUntil = 0;
    const col = new Color();
    // Origin, start (clock), velocity, life, drag, gravity (negative rises), size, crackle, colour, brightness.
    const spark = (
      x: number,
      y: number,
      z: number,
      t: number,
      vx: number,
      vy: number,
      vz: number,
      life: number,
      drag: number,
      grav: number,
      size: number,
      crackle: number,
      hex: number,
      dim: number,
    ) => {
      const i = head;
      head = (head + 1) % CAP;
      if (dirtyFrom < 0) dirtyFrom = i;
      dirtyCount = Math.min(CAP, dirtyCount + 1);
      const j = i * 4;
      burst.array.set([x, y, z, t], j);
      vel.array.set([vx, vy, vz, life], j);
      look.array.set([drag, grav, size, crackle], j);
      col
        .setHex(hex)
        .multiplyScalar(dim)
        .toArray(colors.array as Float32Array, i * 3);
      liveUntil = Math.max(liveUntil, t + life);
    };
    const flush = () => {
      if (dirtyFrom < 0) return;
      const end = dirtyFrom + dirtyCount;
      for (const a of attrs) {
        const n = a.itemSize;
        a.clearUpdateRanges();
        if (end <= CAP) a.addUpdateRange(dirtyFrom * n, dirtyCount * n);
        else {
          a.addUpdateRange(dirtyFrom * n, (CAP - dirtyFrom) * n);
          a.addUpdateRange(0, (end - CAP) * n);
        }
        a.needsUpdate = true;
      }
      dirtyFrom = -1;
      dirtyCount = 0;
    };

    const g = () => ctx.city.grid;
    const jobs: Job[] = [];
    let lastTiles: readonly number[] | null = null;
    let last: Map<number, number> = new Map();
    /** Bridge deck tile → clock time its run closes. */
    const deckClose = new Map<number, number>();

    const plan = (tiles: readonly number[]): Map<number, number> => {
      const out = new Map<number, number>();
      const grid = g();
      const placed = tiles.filter((t) => grid.road[t]! > 0);
      if (!placed.length) return out;
      const step = Math.min(0.08, Math.max(0.03, 1.8 / placed.length));
      let t = SURVEY;
      const runs: { tiles: number[]; done: number }[] = [];
      for (let i = 0; i < placed.length;) {
        if (grid.road[placed[i]!] !== BRIDGE) {
          out.set(placed[i]!, t);
          t += step;
          i++;
          continue;
        }
        // A bridge run: piers first, then the deck from both banks to the middle.
        let j = i;
        while (j < placed.length && grid.road[placed[j]!] === BRIDGE) j++;
        const run = placed.slice(i, j);
        const k = run.length;
        const bstep = Math.min(0.16, Math.max(0.07, 2.8 / k));
        run.forEach((tile, m) => out.set(tile, t + PIER_LEAD + Math.min(m, k - 1 - m) * bstep));
        t += PIER_LEAD + Math.ceil(k / 2) * bstep + 0.2;
        runs.push({ tiles: run, done: t });
        i = j;
      }
      // Long roads go faster: the whole job fits MAX_JOB.
      const scale = t > MAX_JOB ? MAX_JOB / t : 1;
      if (scale < 1) {
        for (const [tile, d] of out) out.set(tile, d * scale);
        for (const r of runs) r.done *= scale;
      }
      const t0 = U.clock.value;
      const order = [...out.keys()].sort((a, b) => out.get(a)! - out.get(b)!);
      for (const r of runs) for (const tile of r.tiles) deckClose.set(tile, t0 + r.done);
      const end = Math.max(...out.values(), ...runs.map((r) => r.done));
      jobs.push({
        t0,
        tiles: placed,
        delay: out,
        runs,
        next: 0,
        order,
        end: t0 + end,
        cued: false,
        sprayed: new Set(),
      });
      survey(t0, out);
      return out;
    };

    // Survey stakes: a hovering diamond over each planned tile until it is laid.
    const survey = (t0: number, delay: Map<number, number>) => {
      const grid = g();
      for (const [tile, d] of delay) {
        const x = (tile % grid.w) + 0.5;
        const z = Math.floor(tile / grid.w) + 0.5;
        const y = grid.road[tile] === BRIDGE ? BRIDGE_DECK + 0.4 : Math.max(0, grid.heightAt(x, z)) + 0.45;
        spark(x, y, z, t0, 0, 0.05, 0, Math.max(0.2, d), 0, 0, 0.09, 0, STAKE, 0.8);
      }
      flush();
      const first = delay.keys().next().value!;
      ctx.bus.emit('roadworks', { cue: 'start', x: first % grid.w, z: Math.floor(first / grid.w) });
    };

    // Each tile as it is laid: a rising front spark, a few sparks out and dust round its edges.
    const lay = (tile: number, t: number, n: number) => {
      const grid = g();
      const x = (tile % grid.w) + 0.5;
      const z = Math.floor(tile / grid.w) + 0.5;
      const bridge = grid.road[tile] === BRIDGE;
      const y = bridge ? BRIDGE_DECK : Math.max(0, grid.heightAt(x, z)) + 0.05;
      const r = (k: number) => hash2(tile, k, 71) - 0.5;
      spark(x, y + 0.1, z, t, 0, 2.2, 0, 0.55, 2, 2, 0.16, 0, SPARK[n % 3]!, 1.6);
      for (let k = 0; k < 4; k++)
        spark(
          x + r(k) * 0.6,
          y + 0.05,
          z + r(k + 9) * 0.6,
          t,
          r(k + 3) * 3,
          1.5 + r(k + 5),
          r(k + 7) * 3,
          0.5,
          3,
          6,
          0.045,
          0.6,
          SPARK[k % 3]!,
          1.3,
        );
      if (!bridge)
        for (let k = 0; k < 3; k++)
          spark(
            x + r(k + 20) * 0.8,
            y,
            z + r(k + 30) * 0.8,
            t,
            r(k + 40) * 1.2,
            0.35,
            r(k + 50) * 1.2,
            1.1,
            1.6,
            -0.25,
            0.13,
            0,
            DUST,
            0.12,
          );
    };

    // Piers rise out of the water: a ring of spray where each one breaks the surface.
    const pier = (tile: number, t: number) => {
      const grid = g();
      const x = (tile % grid.w) + 0.5;
      const z = Math.floor(tile / grid.w) + 0.5;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        spark(x, 0.05, z, t, Math.cos(a) * 1.6, 2.4, Math.sin(a) * 1.6, 0.75, 1.2, 7, 0.06, 0, SPRAY, 0.5);
      }
    };

    // A finished bridge: confetti over the middle of the span, then its opening ceremony.
    const open = (run: number[], t: number) => {
      const grid = g();
      const mid = run[Math.floor(run.length / 2)]!;
      const x = (mid % grid.w) + 0.5;
      const z = Math.floor(mid / grid.w) + 0.5;
      for (let k = 0; k < 90; k++) {
        const a = hash2(mid, k, 3) * Math.PI * 2;
        const s = 1.5 + hash2(mid, k, 5) * 4;
        spark(
          x,
          BRIDGE_DECK + 3,
          z,
          t + hash2(mid, k, 7) * 0.25,
          Math.cos(a) * s,
          3 + hash2(mid, k, 9) * 5,
          Math.sin(a) * s,
          2.2,
          1.4,
          3,
          0.09,
          0.4,
          CONFETTI[k % 5]!,
          1.2,
        );
      }
      ctx.bus.emit('roadworks', { cue: 'bridge', x, z });
    };

    ctx.services.provide('roadworks', {
      schedule(tiles) {
        if (tiles === lastTiles) return last;
        lastTiles = tiles;
        last = ctx.loading ? new Map() : plan(tiles);
        return last;
      },
      deckDone(tile) {
        const t = deckClose.get(tile);
        return t === undefined ? undefined : Math.max(0, t - U.clock.value);
      },
    });

    // A new named bridge (sim, D-128): its ceremony once the deck closes.
    ctx.bus.on('bridge:opened', ({ key }) => {
      if (ctx.loading) return;
      const b = bridgeByKey(ctx.city, key);
      if (!b) return;
      const tile = ctx.city.grid.index(b.x, b.z);
      const wait = (deckClose.get(tile) ?? U.clock.value) - U.clock.value + 0.6;
      setTimeout(
        () => {
          const now = bridgeByKey(ctx.city, key);
          if (!now) return;
          const r = bridgeReport(ctx.city, now);
          const [a, z] = r.ends;
          ctx.services.tryGet('moments')?.play({
            id: `bridge:${key}`,
            scale: 'minor',
            tone: 'sea',
            emblem: 'bridge',
            eyebrow: 'New bridge · open to traffic',
            title: r.name,
            lines: [`${r.type} · ${r.length} tiles`, a === z ? `Crossing in ${a}` : `Links ${a} ↔ ${z}`],
            at: {
              x: now.alongX ? now.x + now.len / 2 : now.x + 0.5,
              z: now.alongX ? now.z + 0.5 : now.z + now.len / 2,
              y: BRIDGE_DECK,
              height: 6,
            },
            camera: false,
            sound: 'milestone',
          });
        },
        Math.max(0, wait) * 1000,
      );
    });
    ctx.bus.on('city:reset', () => {
      jobs.length = 0;
      deckClose.clear();
    });

    ctx.systems.add({
      id: 'roadworks',
      phase: 'render',
      order: 30,
      update() {
        const now = U.clock.value;
        for (let i = jobs.length - 1; i >= 0; i--) {
          const job = jobs[i]!;
          while (job.next < job.order.length) {
            const tile = job.order[job.next]!;
            const at = job.t0 + job.delay.get(tile)!;
            const isBridge = g().road[tile] === BRIDGE;
            // Piers (every third deck tile, as `RoadRenderer` places them) spray as they rise, before their slab.
            if (now < at - (isBridge ? PIER_LEAD : 0)) break;
            if (isBridge && !job.sprayed.has(tile)) {
              job.sprayed.add(tile);
              if (((tile % g().w) + Math.floor(tile / g().w)) % 3 === 0) pier(tile, now);
            }
            if (now < at) break;
            lay(tile, now, job.next);
            if (job.next % 4 === 0)
              ctx.bus.emit('roadworks', {
                cue: isBridge ? 'pier' : 'lay',
                x: tile % g().w,
                z: Math.floor(tile / g().w),
                step: job.next,
              });
            job.next++;
          }
          for (const r of job.runs)
            if (r.done > 0 && now >= job.t0 + r.done) {
              open(r.tiles, now);
              r.done = -1;
            }
          if (now >= job.end && job.next >= job.order.length) {
            if (!job.cued) {
              const tile = job.order[job.order.length - 1]!;
              ctx.bus.emit('roadworks', { cue: 'done', x: tile % g().w, z: Math.floor(tile / g().w) });
              job.cued = true;
            }
            for (const t of job.tiles) if ((deckClose.get(t) ?? 0) <= now) deckClose.delete(t);
            jobs.splice(i, 1);
          }
        }
        flush();
        // Nothing to draw between jobs.
        mesh.visible = now < liveUntil + 0.1 || ctx.loading;
      },
    });
  },
};
