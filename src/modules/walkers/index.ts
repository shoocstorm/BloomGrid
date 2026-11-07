import { InstancedBufferAttribute, InstancedMesh, MeshStandardNodeMaterial } from 'three/webgpu';
import {
  abs,
  attribute,
  float,
  fract,
  fwidth,
  length,
  max,
  min,
  mix,
  positionGeometry,
  sin,
  smoothstep,
  step,
  time,
  uniform,
  vec3,
} from 'three/tsl';
import type { GameModule } from '@/game/context';
import { U } from '@/render/uniforms';
import { BRIDGE, BRIDGE_DECK } from '@/sim/City';
import { activityLayer } from '@/sim/nightlife';
import { hash2 } from '@/sim/random';
import { ROAD_LIFT } from '@/modules/construction/RoadRenderer';
import { Critters } from './critters';
import { Fish } from './fish';
import { Rabbits } from './rabbits';
import { Birds } from './birds';
import { figureGeometry, poseFigure } from './figure';

/** Instanced batches stay above the 1024-instance UBO path (AGENTS.md §8). */
const CAP = 4096;
/** Walkers per tile of pavement at full activity. */
const PER_TILE = 1.4;
/** Figure scale: a person stands ≈0.3 tiles, the explore avatar's height (D-124). */
const FIG = 1.4;
/** Longest straight stretch a walker strolls before fading out (tiles). */
const MAX_RUN = 6;
/** Pavement: how far from the road's centre line walkers keep (tiles). */
const KERB = 0.44;
/** Camera distance beyond which walkers are sub-pixel specks (hidden: they would only flicker, D-064). */
const SHOW_WITHIN = 110;
/** Closer than this (and in explore modes) walkers are the detailed figure: limbs, hair, a face (D-124). */
const NEAR_DETAIL = 45;
/** Walkers fill the streets within this many tiles of the camera's focus (what a close view can see). */
const REGION = 80;
/** In explore modes the street-level view sees less far: a smaller crowd of detailed figures. */
const EXPLORE_REGION = 50;
/** The focus may drift this far before the street crowd is re-placed around it. */
const RECENTRE = 25;

/**
 * Street walkers (D-122): people strolling the pavements, densest where the activity field (sim/nightlife.ts)
 * says the city is busy, thinner in the small hours. Like the hover-cars, every walker is static instance data
 * (a stretch of pavement, its heights, a seed and a pace) rebuilt only when the mobility pass runs or the view
 * moves to another part of the island (they fill a region round the camera's focus; seeds come from the tile,
 * so a re-placement leaves walkers already in view unchanged). The shader walks, bobs and fades them from
 * `time`. One draw call, no per-frame uploads.
 */
export const walkersModule: GameModule = {
  id: 'walkers',
  deps: ['world', 'mobility'],
  init(ctx) {
    const { city } = ctx;
    const shown = uniform(1);

    const aSeg = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    const aInfo = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    // Two figures over the same instance data (D-124): the detailed one close up and in explore modes, a
    // three-part one from further out. Only one draws at a time.
    const make = (detailed: boolean) => {
      const geo = figureGeometry(detailed);
      geo.setAttribute('aSeg', aSeg);
      geo.setAttribute('aInfo', aInfo);
      const m = new MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 });
      const seg = attribute('aSeg', 'vec4');
      const info = attribute('aInfo', 'vec4');
      const seed = info.z;
      const pace = info.w;
      const a = seg.xy;
      const b = seg.zw;
      const len = max(b.sub(a).length(), float(0.5));
      const u = fract(time.mul(pace).div(len).add(seed.mul(13.7)));
      const flat = mix(a, b, u);
      // Stride: a step every ≈0.12 tiles of walking, so feet don't slide.
      const phase = time.mul(pace).mul(26).add(seed.mul(40));
      // A gentle bob on each step (world units: tiny, AGENTS.md §8) and an end fade so walkers appear and leave softly.
      const bob = abs(sin(phase)).mul(0.005 * FIG);
      const fade = smoothstep(0, 0.08, u)
        .mul(smoothstep(1, 0.92, u))
        .mul(step(fract(seed.mul(7.31)), shown));
      const heading = b.sub(a).div(len);
      const fig = poseFigure(phase, heading, float(FIG).mul(fade), seed);
      const y = mix(info.x, info.y, u).add(bob);
      m.positionNode = vec3(flat.x, y, flat.y).add(fig.local);
      m.normalNode = fig.normal;
      m.colorNode = fig.color;
      // A faint glow by night so the evening crowd reads, dimmed to its share of a pixel (D-064).
      const cover = min(float(1), float(0.05).div(max(length(fwidth(positionGeometry)), float(1e-5))));
      m.emissiveNode = fig.shirt
        .mul(fig.cloth)
        .mul(U.night.mul(detailed ? 0.05 : 0.18))
        .mul(cover);
      const mesh = new InstancedMesh(geo, m, CAP);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = false;
      mesh.name = detailed ? 'walkers' : 'walkers.far';
      return mesh;
    };
    const mesh = make(true);
    const far = make(false);
    const critters = new Critters();
    // Close-up wildlife (D-126): one instanced mesh each, drawn and placed only in explore modes, round the camera.
    const wildlife = [critters, new Fish(), new Rabbits(), new Birds()];
    ctx.scene.add(mesh, far, ...wildlife.map((w) => w.mesh));

    const g = city.grid;
    let visited = new Uint8Array(0);
    const roadY = (x: number, z: number, t: number) =>
      (g.road[t] === BRIDGE ? BRIDGE_DECK : g.heightAt(x, z)) + ROAD_LIFT;

    let wasExplore = false;
    /** Where the crowd was last placed round. */
    const focus = { x: -1e9, z: -1e9 };
    const rebuild = (
      cx = focus.x > -1e8 ? focus.x : ctx.cameraCtl.target.x,
      cz = focus.z > -1e8 ? focus.z : ctx.cameraCtl.target.z,
    ) => {
      focus.x = cx;
      focus.z = cz;
      const reach = ctx.cameraCtl.enabled ? REGION : EXPLORE_REGION;
      const x0 = Math.max(0, Math.floor(cx - reach));
      const x1 = Math.min(g.w, Math.ceil(cx + reach));
      const z0 = Math.max(0, Math.floor(cz - reach));
      const z1 = Math.min(g.h, Math.ceil(cz + reach));
      const act = activityLayer(city);
      const n = g.w * g.h;
      if (visited.length < n) visited = new Uint8Array(n);
      visited.fill(0);
      const seg = aSeg.array as Float32Array;
      const inf = aInfo.array as Float32Array;
      let count = 0;
      const isRoad = (x: number, z: number) =>
        x >= 0 && z >= 0 && x < g.w && z < g.h && g.road[g.index(x, z)] !== 0;
      for (let z = z0; z < z1 && count < CAP; z++)
        for (let x = x0; x < x1 && count < CAP; x++) {
          const t = g.index(x, z);
          if (visited[t] || !g.road[t] || act[t]! < 0.05) continue;
          const alongX = isRoad(x - 1, z) || isRoad(x + 1, z);
          const alongZ = isRoad(x, z - 1) || isRoad(x, z + 1);
          // Junctions are crossed, not strolled along: start runs on plain stretches.
          if (alongX && alongZ) continue;
          const [dx, dz] = alongX ? [1, 0] : [0, 1];
          let len = 1;
          let sum = act[t]!;
          visited[t] = 1;
          while (len < MAX_RUN) {
            const nx = x + dx * len;
            const nz = z + dz * len;
            if (!isRoad(nx, nz)) break;
            const i = g.index(nx, nz);
            if (visited[i] || (isRoad(nx + dz, nz + dx) && isRoad(nx - dz, nz - dx))) break;
            visited[i] = 1;
            sum += act[i]!;
            len++;
          }
          const k = Math.min(CAP - count, Math.floor((sum / len) * len * PER_TILE + hash2(x, z, 91)));
          for (let w = 0; w < k; w++) {
            const h = hash2(t, w, 37);
            const side = h < 0.5 ? -1 : 1;
            // Perpendicular offset to the pavement, a little jitter so pairs don't walk in single file.
            const off = side * (KERB - hash2(t, w, 41) * 0.05);
            const ox = dz * off;
            const oz = dx * off;
            let ax = x + 0.5 + ox;
            let az = z + 0.5 + oz;
            let bx = x + 0.5 + dx * (len - 1) + ox;
            let bz = z + 0.5 + dz * (len - 1) + oz;
            // Stretch to the run's ends, and walk either way.
            ax -= dx * 0.45;
            az -= dz * 0.45;
            bx += dx * 0.45;
            bz += dz * 0.45;
            if (hash2(t, w, 53) < 0.5) [ax, az, bx, bz] = [bx, bz, ax, az];
            const o = count * 4;
            seg[o] = ax;
            seg[o + 1] = az;
            seg[o + 2] = bx;
            seg[o + 3] = bz;
            inf[o] = roadY(ax, az, t);
            inf[o + 1] = roadY(bx, bz, g.index(x + dx * (len - 1), z + dz * (len - 1)));
            inf[o + 2] = hash2(t, w, 77);
            inf[o + 3] = 0.2 + hash2(t, w, 83) * 0.1;
            count++;
          }
        }
      mesh.count = far.count = count;
      aSeg.needsUpdate = aInfo.needsUpdate = true;
    };

    ctx.bus.on('mobility:updated', () => rebuild());
    ctx.bus.on('city:reset', () => {
      mesh.count = far.count = 0;
      for (const w of wildlife) {
        w.mesh.count = 0;
        w.cx = w.cz = -1e9;
      }
      focus.x = focus.z = -1e9;
    });
    rebuild();

    ctx.systems.add({
      id: 'walkers.visuals',
      phase: 'sync',
      order: 8,
      update(c) {
        const explore = !c.cameraCtl.enabled;
        // In explore modes the camera itself is the focus (the city camera's target stays where it was left).
        const tg = explore ? c.camera.position : c.cameraCtl.target;
        // Re-place on a drift, and on entering or leaving an explore mode (the crowd's reach changes).
        if ((Math.hypot(tg.x - focus.x, tg.z - focus.z) > RECENTRE || explore !== wasExplore) && !ctx.loading)
          rebuild(tg.x, tg.z);
        wasExplore = explore;
        // Wildlife is close-up detail: only drawn (and placed) in explore modes (D-124, D-126).
        if (explore && !ctx.loading)
          for (const w of wildlife) if (Math.hypot(tg.x - w.cx, tg.z - w.cz) > 12) w.place(city, tg.x, tg.z);
        // Fewer people out in the small hours; explore modes always see them (the camera is in the street).
        shown.value = 1 - 0.7 * U.lateNight.value;
        const d = c.cameraCtl.distance;
        mesh.visible = mesh.count > 0 && (explore || d < NEAR_DETAIL);
        far.visible = far.count > 0 && !explore && d >= NEAR_DETAIL && d < SHOW_WITHIN;
        for (const w of wildlife) w.mesh.visible = explore && w.mesh.count > 0;
      },
    });
  },
};
