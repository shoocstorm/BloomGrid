import {
  AdditiveBlending,
  NormalBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  TorusGeometry,
  Vector3,
} from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  clamp,
  color,
  cos,
  dot,
  float,
  fract,
  fwidth,
  length,
  max,
  min,
  mix,
  mrt,
  normalGeometry,
  normalize,
  positionGeometry,
  reflect,
  sin,
  smoothstep,
  step,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { GameModule } from '@/game/context';
import { U } from '@/render/uniforms';
import { skyShade } from '@/render/bake';
import { buildings } from '@/content';
import { BRIDGE, BRIDGE_DECK } from '@/sim/City';
import { mobilityLayers } from '@/sim/mobility';
import { hash2 } from '@/sim/random';
import { Building } from '@/ecs/components';
import { placeBuilding } from '@/modules/construction/BuildingRenderer';
import { podGeometry } from './podModel';
import { arcProfile, arcProfileNode, arcY, orientNode, podInfo as packPodInfo, podPathAt, podPathNode } from './skypath';

/** Ride-a-pod camera hook (explore mode): pose of pod i at a clock, mirroring the pod shader. */
export interface SkylanesService {
  readonly pods: number;
  podAt(i: number, clock: number, out: Vector3, ahead?: Vector3): Vector3;
  /** Lanes built, lifted over buildings, and still clipping a rooftop (outside their end approaches). */
  clearance(): { lanes: number; lifted: number; clipped: number; clippedEnds: number };
}

declare module '@/core/Services' {
  interface GameServices {
    skylanes: SkylanesService;
  }
}

/** Instanced batches stay above the 1024-instance UBO path (AGENTS.md §8). */
const AGENTS = 8192;
const PODS = 1040;
const LANES = 1040;
/** Hub ring instances (rings per hub: 3, or 6 for a central hub) and light shafts. */
const RINGS = 1040;
/** Pod and lane heights over the ground: docks launch from their top deck, pods set down at street level. */
const DOCK_Y = 3.2;
const STREET_Y = 1.2;
/** Lane kinds (route info .w on lanes): a dock's own lane, spoke, trunk, hub → job centre, hub → Aeroline station. */
const LANE_DIRECT = 0;
const LANE_SPOKE = 1;
const LANE_TRUNK = 2;
const LANE_EGRESS = 3;
const LANE_RAIL = 4;
/**
 * Lanes keep this much air over every rooftop between their ends (D-053), checked every `CLEAR_STEP` tiles; the
 * last `CLEAR_ENDS` of each end is left to the approach (a lane has to come down to its dock or street).
 */
const CLEARANCE = 1.2;
const CLEAR_STEP = 0.5;
const CLEAR_ENDS = 0.07;
/** Highest a lane is lifted to clear something: enough to arc over the Wellspring Spire. */
const MAX_LIFT = 90;
/** Pods set down beside an Aeroline platform this far above its deck (riders change to the trains there). */
const RAIL_Y = 1.6;
const MAX_RUN = 8;
/** Agents per tile of a run at congestion 1 (density reads as traffic). */
const AGENTS_PER_TILE = 4;

/**
 * Mobility visuals (Phase 8). Everything moves on the GPU from static per-instance data that is
 * rebuilt only when the sim's mobility pass runs (every ~5 s), so there are no per-frame uploads:
 * - hover-commuters ride straight runs of the flow field (direction of most commuters), denser and
 *   slower and shading cyan → amber → coral as highways jam; morning flows toward work, evening home;
 * - the sky-lane network (D-051): pods fly from a dock up its spoke into a hub, circle the hub's
 *   transfer ring and leave on another lane (to a dock on the same hub, along a trunk to the next hub, or
 *   down to a job centre); express pods run the trunks. Lanes are flowing light ribbons coloured by kind,
 *   hubs wear counter-rotating holographic rings and a light shaft. Five draw calls in total.
 */
export const mobilityModule: GameModule = {
  id: 'mobility',
  deps: ['world'],
  init(ctx) {
    const { city, scene } = ctx;
    const share = uniform(0.5); // share of agents heading toward work
    const density = uniform(1); // share of agents on the move (fewer at night)
    const zoom = uniform(1); // lanes and hub rings thicken as the camera pulls back, so the network reads

    // ── Hover-commuters ────────────────────────────────────────────────────────
    const aSeg = new InstancedBufferAttribute(new Float32Array(AGENTS * 4), 4);
    const aInfo = new InstancedBufferAttribute(new Float32Array(AGENTS * 4), 4);
    const agentGeo = new BoxGeometry(0.34, 0.09, 0.16).translate(0, 0.045, 0);
    agentGeo.setAttribute('aSeg', aSeg);
    agentGeo.setAttribute('aInfo', aInfo);
    const am = new MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0.2 });
    {
      const seg = attribute('aSeg', 'vec4');
      const info = attribute('aInfo', 'vec4');
      const seed = info.z;
      const cong = info.w;
      const a = seg.xy;
      const b = seg.zw;
      const len = max(b.sub(a).length(), float(0.5));
      const dir = b.sub(a).div(len);
      const toWork = step(seed, share);
      const speed = float(1.6).div(float(1).add(max(cong.sub(0.8), 0).mul(2.5)));
      const u = fract(time.mul(speed).div(len).add(seed.mul(13.7)));
      const t = mix(float(1).sub(u), u, toWork);
      const lane = toWork.mul(2).sub(1).mul(0.2);
      const flat = mix(a, b, t).add(vec2(dir.y.negate(), dir.x).mul(lane));
      const y = mix(info.x, info.y, t).add(0.12);
      const shown = step(fract(seed.mul(7.31)), density).mul(smoothstep(0, 0.06, u)).mul(smoothstep(1, 0.94, u));
      // Runs are axis-aligned: swap x/z of the body when travelling along z.
      const g = positionGeometry;
      const alongZ = step(abs(dir.x), abs(dir.y));
      const body = mix(g, vec3(g.z, g.y, g.x), alongZ);
      am.positionNode = vec3(flat.x, y, flat.y).add(body.mul(shown));
      // Warm headlights (distinct from the cyan guidelines) turning amber, then coral, as lanes jam.
      const tint = mix(mix(color(0xfff1c9), color(0xffb347), smoothstep(0.5, 1.0, cong)), color(0xff5f6d), smoothstep(1.0, 1.5, cong));
      am.colorNode = tint;
      // Sub-pixel commuters twinkle as they move: dim their glow to their share of a pixel (~2 px across, D-064).
      const cover = min(float(1), float(0.08).div(max(length(fwidth(positionGeometry)), float(1e-5))));
      am.emissiveNode = tint.mul(U.night.mul(1.6).add(0.3)).mul(cover);
    }
    const agents = new InstancedMesh(agentGeo, am, AGENTS);
    agents.count = 0;
    agents.frustumCulled = false;
    agents.castShadow = agents.receiveShadow = false;
    agents.name = 'mobility.agents';

    // ── Sky-lanes: pods ride the same arcs as the light ribbons (skypath.ts) ────
    const podRoute = new InstancedBufferAttribute(new Float32Array(PODS * 4), 4);
    const podVia = new InstancedBufferAttribute(new Float32Array(PODS * 4), 4);
    const podInfo = new InstancedBufferAttribute(new Float32Array(PODS * 4), 4);
    const podGeo = podGeometry();
    podGeo.setAttribute('aRoute', podRoute);
    podGeo.setAttribute('aVia', podVia);
    podGeo.setAttribute('aRouteInfo', podInfo);
    const pm = new MeshBasicNodeMaterial();
    {
      // U.clock (not `time`) so the ride camera can compute the same pose on the CPU.
      const { pos, fwd } = podPathNode(
        attribute('aRoute', 'vec4'),
        attribute('aVia', 'vec4'),
        attribute('aRouteInfo', 'vec4'),
        U.clock,
      );
      const world = pos.add(orientNode(positionGeometry, fwd));
      pm.positionNode = world;
      const col = attribute('color', 'vec3');
      const lum = attribute('aGlow', 'float');
      const glass = step(lum, -0.5);
      const n = orientNode(normalGeometry, fwd);
      const lit = skyShade(col, n);
      // Glazing: dark smoked glass mirroring the sky at grazing angles, a sun glint, a warm cabin at night.
      const view = normalize(cameraPosition.sub(world));
      const facing = max(dot(n, view), 0);
      const fresnel = float(1).sub(facing).pow(3);
      const sky = mix(U.horizon, U.zenith, n.y.mul(0.5).add(0.5));
      const glint = max(dot(reflect(view.negate(), n), U.sunDir), 0).pow(60).mul(float(1).sub(U.night)).mul(2.5);
      const pane = col.mul(0.5).add(sky.mul(fresnel.mul(0.75).add(0.12)).mul(float(1).sub(U.night.mul(0.7)))).add(glint);
      const cabin = color(0xffb45e).mul(U.night.mul(0.16).add(0.02)).mul(facing.mul(facing).mul(0.7).add(0.3)).mul(glass);
      const glow = col.mul(max(lum, 0)).mul(U.night.mul(0.9).add(0.35));
      // A little city light on the hull at night, so pods don't turn into silhouettes.
      pm.colorNode = mix(lit.add(col.mul(U.night.mul(0.12))), pane, glass).add(cabin).add(glow);
      pm.mrtNode = mrt({ emissive: glow.mul(0.6).add(cabin.mul(0.4)) });
    }
    const pods = new InstancedMesh(podGeo, pm, PODS);
    pods.count = 0;
    pods.frustumCulled = false;
    pods.castShadow = pods.receiveShadow = false;
    pods.name = 'mobility.pods';

    const laneRoute = new InstancedBufferAttribute(new Float32Array(LANES * 4), 4);
    const laneInfo = new InstancedBufferAttribute(new Float32Array(LANES * 4), 4);
    const laneGeo = new PlaneGeometry(1, 1, 48, 1).rotateX(-Math.PI / 2);
    laneGeo.setAttribute('aRoute', laneRoute);
    laneGeo.setAttribute('aRouteInfo', laneInfo);
    const lm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: NormalBlending, fog: false });
    {
      const route = attribute('aRoute', 'vec4');
      const info = attribute('aRouteInfo', 'vec4');
      const kind = info.w;
      const isSpoke = step(0.5, kind).mul(step(kind, 1.5));
      const isTrunk = step(1.5, kind).mul(step(kind, 2.5));
      const isRail = step(3.5, kind);
      const d = route.zw.sub(route.xy);
      const len = max(d.length(), float(1));
      const dir = d.div(len);
      const t = positionGeometry.x.add(0.5);
      // Trunks are broad express ribbons, spokes slimmer than a dock's own lane.
      const width = mix(mix(mix(float(0.3), float(0.24), isSpoke), float(0.6), isTrunk), float(0.55), isRail).mul(zoom);
      const side = positionGeometry.z.mul(width);
      const flat = mix(route.xy, route.zw, t);
      // info.z: whole-tile lift that carries the lane over the buildings beneath (same arc as the pods, skypath.ts).
      const y = mix(info.x, info.y, t).add(arcProfileNode(t).mul(len.mul(0.06).add(1.5).add(info.z)));
      lm.positionNode = vec3(flat.x.add(dir.y.negate().mul(side)), y, flat.y.add(dir.x.mul(side)));
      const flow = mix(mix(float(0.9), float(2.2), isTrunk), float(1.6), isRail);
      // Zoomed out, the running dashes shrink below a pixel and strobe as they move: fade them to their mean (D-064).
      const phase = t.mul(len).mul(0.35);
      const dash = mix(smoothstep(0.55, 1, fract(phase.sub(time.mul(flow)))), float(0.225), smoothstep(0.15, 0.45, fwidth(phase)));
      // Trunks carry a bright centre line between two edge rails.
      const across = abs(positionGeometry.z);
      const sharpEdge = mix(smoothstep(0.5, 0.15, across), smoothstep(0.08, 0.0, across).add(smoothstep(0.3, 0.45, across).mul(smoothstep(0.5, 0.45, across))), isTrunk);
      // Seen edge-on (or far), a ribbon narrows below a few pixels and its profile lines pop in and out: fade the
      // profile to its mean once sub-pixel, and the ribbon's opacity once it is under ~3 px wide (D-064).
      const fwAcross = max(fwidth(positionGeometry.z), float(1e-5));
      const edge = mix(sharpEdge, mix(float(0.65), float(0.23), isTrunk), smoothstep(0.08, 0.3, fwAcross)).mul(
        min(float(1), float(1 / 3).div(fwAcross)),
      );
      const ends = smoothstep(0, 0.04, t).mul(smoothstep(1, 0.96, t));
      // Deep, saturated colours by day (pale neon vanishes over the sunlit city), bright neon at night.
      const n = U.night;
      const direct = mix(mix(color(0x0fa89a), color(0xe0458f), t), mix(color(0x3fd9c8), color(0xff8fc0), t), n);
      const spoke = mix(mix(color(0x0aa5bd), color(0x2f7dff), t), mix(color(0x47e6d2), color(0x8fd8ff), t), n);
      const shimmer = sin(t.mul(6.283).add(time.mul(0.6))).mul(0.5).add(0.5);
      const trunk = mix(mix(color(0xff9414), color(0x8a4dff), shimmer), mix(color(0xffd27a), color(0xc39bff), shimmer), n);
      // Transfer lanes to the trains: rose to amber, the Aeroline's colours.
      const rail = mix(mix(color(0xd93a7a), color(0xff8a3d), t), mix(color(0xff7ab8), color(0xffd59a), t), n);
      lm.colorNode = mix(mix(mix(direct, spoke, isSpoke), trunk, isTrunk), rail, isRail).mul(n.mul(0.6).add(1));
      lm.opacityNode = dash.mul(0.4).add(mix(float(0.45), float(0.55), isTrunk)).mul(edge).mul(ends);
    }
    const lanes = new InstancedMesh(laneGeo, lm, LANES);
    lanes.count = 0;
    lanes.frustumCulled = false;
    lanes.castShadow = lanes.receiveShadow = false;
    lanes.renderOrder = 6;
    lanes.name = 'mobility.lanes';

    // ── Hubs: holographic rings turning round the transfer ring, and a light shaft ──
    // aRing: centre (x, y, z) and radius; aSpin: tilt (rad), spin speed (rad/s), phase, tint (0 cyan, 1 gold, 2 rose).
    const ringA = new InstancedBufferAttribute(new Float32Array(RINGS * 4), 4);
    const spinA = new InstancedBufferAttribute(new Float32Array(RINGS * 4), 4);
    const ringGeo = new TorusGeometry(1, 0.018, 4, 96).rotateX(Math.PI / 2);
    ringGeo.setAttribute('aRing', ringA);
    ringGeo.setAttribute('aSpin', spinA);
    // Normal blending (additive vanishes against the bright day city); the bloom pass makes them glow at night.
    const rm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: NormalBlending, fog: false });
    {
      const ring = attribute('aRing', 'vec4');
      const spin = attribute('aSpin', 'vec4');
      const g = positionGeometry.mul(vec3(ring.w, ring.w.mul(1.6), ring.w)).add(normalGeometry.mul(zoom.sub(1).mul(0.05)));
      // Tilt about x, then spin about y.
      const ct = cos(spin.x);
      const st = sin(spin.x);
      const tilted = vec3(g.x, g.y.mul(ct).sub(g.z.mul(st)), g.y.mul(st).add(g.z.mul(ct)));
      const a = U.clock.mul(spin.y).add(spin.z);
      const ca = cos(a);
      const sa = sin(a);
      rm.positionNode = ring.xyz.add(vec3(tilted.x.mul(ca).add(tilted.z.mul(sa)), tilted.y, tilted.z.mul(ca).sub(tilted.x.mul(sa))));
      // Light dashes chasing round the ring.
      const around = uv().x.mul(24);
      const dash = mix(smoothstep(0.35, 0.9, fract(around.sub(U.clock.mul(0.8)))), float(0.375), smoothstep(0.15, 0.45, fwidth(around)));
      const gold = clamp(spin.w, 0, 1);
      const rose = clamp(spin.w.sub(1), 0, 1);
      const day = mix(mix(color(0x0aa89a), color(0xff9414), gold), color(0xd93a7a), rose);
      const night = mix(mix(color(0x3ff0de), color(0xffc95a), gold), color(0xff7ab8), rose);
      const tint = mix(day, night, U.night);
      rm.colorNode = tint.mul(dash.mul(0.6).add(0.9)).mul(U.night.mul(0.5).add(1));
      rm.opacityNode = dash.mul(0.45).add(0.5);
      rm.mrtNode = mrt({ emissive: tint.mul(dash.mul(0.5).add(0.3)).mul(U.night.mul(0.9).add(0.1)) });
    }
    const rings = new InstancedMesh(ringGeo, rm, RINGS);
    rings.count = 0;
    rings.frustumCulled = false;
    rings.castShadow = rings.receiveShadow = false;
    rings.renderOrder = 7;
    rings.name = 'mobility.hubRings';

    // Shafts: a soft additive cylinder rising from each hub's ring (aRing: base x, y, z, radius; aSpin.x height).
    const shaftGeo = new CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
    shaftGeo.setAttribute('aRing', ringA.clone());
    shaftGeo.setAttribute('aSpin', spinA.clone());
    const shaftRing = shaftGeo.getAttribute('aRing') as InstancedBufferAttribute;
    const shaftSpin = shaftGeo.getAttribute('aSpin') as InstancedBufferAttribute;
    const sm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
    {
      const ring = attribute('aRing', 'vec4');
      const spin = attribute('aSpin', 'vec4');
      const g = positionGeometry;
      sm.positionNode = ring.xyz.add(vec3(g.x.mul(ring.w), g.y.mul(spin.x), g.z.mul(ring.w)));
      const h = g.y;
      const pulse = smoothstep(0.75, 1, fract(h.mul(3).sub(U.clock.mul(0.35)))).mul(0.5);
      const tint = mix(color(0x6ff5e6), color(0xffcf73), spin.w);
      const k = float(1).sub(h).pow(2).mul(0.22).add(pulse.mul(float(1).sub(h)).mul(0.3)).mul(U.night.mul(1.2).add(0.4));
      sm.colorNode = tint.mul(k);
    }
    const shafts = new InstancedMesh(shaftGeo, sm, RINGS);
    shafts.count = 0;
    shafts.frustumCulled = false;
    shafts.castShadow = shafts.receiveShadow = false;
    shafts.renderOrder = 7;
    shafts.name = 'mobility.hubShafts';
    scene.add(agents, pods, lanes, rings, shafts);

    const g = city.grid;
    const roadY = (t: number) => (g.road[t] === BRIDGE ? BRIDGE_DECK : g.heightAt((t % g.w) + 0.5, ((t / g.w) | 0) + 0.5)) + 0.035;
    let visited = new Uint8Array(0);
    /** Flat [start, tip, congestion, length] per straight run, reused between rebuilds. */
    const runs: number[] = [];

    /** Rebuilds instance data from the latest mobility pass (straight runs of the flow field). */
    const rebuild = () => {
      const { traffic, next } = mobilityLayers(city);
      const n = g.w * g.h;
      if (visited.length < n) visited = new Uint8Array(n);
      visited.fill(0);
      const seg = aSeg.array as Float32Array;
      const inf = aInfo.array as Float32Array;
      runs.length = 0;
      let want = 0;
      for (let t = 0; t < n; t++) {
        if (visited[t] || !g.road[t] || next[t]! < 0 || traffic[t]! < 0.02) continue;
        const step = next[t]! - t;
        let end = t;
        let sum = traffic[t]!;
        let len = 1;
        const slope = roadY(next[t]!) - roadY(t);
        visited[t] = 1;
        while (len < MAX_RUN) {
          const nx = next[end]!;
          // Extend while the run continues straight, on an even grade, through unvisited tiles.
          if (nx < 0 || nx - end !== step || visited[nx] || next[nx]! < 0 || next[nx]! - nx !== step) break;
          if (Math.abs(roadY(next[nx]!) - roadY(nx) - slope) > 0.12) break;
          end = nx;
          visited[end] = 1;
          sum += traffic[end]!;
          len++;
        }
        const cong = sum / len;
        runs.push(t, next[end]!, cong, len);
        want += Math.max(1, cong * len * AGENTS_PER_TILE);
      }
      // Spread the agent budget evenly over the island when the city wants more than it holds.
      const scale = Math.min(1, AGENTS / Math.max(1, want));
      let count = 0;
      for (let r = 0; r < runs.length && count < AGENTS; r += 4) {
        const t = runs[r]!;
        const tip = runs[r + 1]!;
        const cong = runs[r + 2]!;
        const k = Math.min(AGENTS - count, Math.max(1, Math.round(Math.max(1, cong * runs[r + 3]! * AGENTS_PER_TILE) * scale)));
        for (let i = 0; i < k; i++) {
          const o = count * 4;
          seg[o] = (t % g.w) + 0.5;
          seg[o + 1] = ((t / g.w) | 0) + 0.5;
          seg[o + 2] = (tip % g.w) + 0.5;
          seg[o + 3] = ((tip / g.w) | 0) + 0.5;
          inf[o] = roadY(t);
          inf[o + 1] = roadY(tip);
          inf[o + 2] = hash2(t, i, 77);
          inf[o + 3] = cong;
          count++;
        }
      }
      agents.count = count;
      aSeg.needsUpdate = aInfo.needsUpdate = true;

      buildSkylanes();
    };

    // Rooftop heights per tile (world y of each building's top), rebuilt lazily when buildings or terrain change.
    let tops = new Float32Array(0);
    let owner = new Int32Array(0);
    let topsDirty = true;
    for (const ev of ['building:added', 'building:removed', 'terrain:changed', 'city:reset'] as const)
      ctx.bus.on(ev, () => (topsDirty = true));
    const refreshTops = () => {
      const n = g.w * g.h;
      if (tops.length !== n) {
        tops = new Float32Array(n);
        owner = new Int32Array(n);
      }
      tops.fill(0);
      owner.fill(-1);
      for (const eid of city.buildingEntities()) {
        const rec = city.buildingRecord(eid);
        const p = placeBuilding(g, city.buildingDef(eid), rec.x, rec.z, rec.rot);
        const top = p.base.elements[13]! + p.template.height;
        const [x0, z0] = [Building.x[eid]!, Building.z[eid]!];
        for (let z = z0; z < z0 + Building.d[eid]!; z++)
          for (let x = x0; x < x0 + Building.w[eid]!; x++) {
            if (!g.inBounds(x, z)) continue;
            tops[z * g.w + x] = top;
            owner[z * g.w + x] = eid;
          }
      }
      topsDirty = false;
    };
    /**
     * Whole tiles to raise the arc from (ax, az, ya) to (bx, bz, yb) so it keeps `CLEARANCE` over every rooftop in
     * between; the buildings under either end (the dock, the hub) don't count. Symmetric in its ends.
     */
    const liftCache = new Map<string, number>();
    const liftOf = (ax: number, az: number, ya: number, bx: number, bz: number, yb: number) => {
      const key = ax < bx || (ax === bx && az <= bz) ? `${ax},${az},${ya},${bx},${bz},${yb}` : `${bx},${bz},${yb},${ax},${az},${ya}`;
      const hit = liftCache.get(key);
      if (hit !== undefined) return hit;
      const len = Math.max(0.01, Math.hypot(bx - ax, bz - az));
      const tileOf = (x: number, z: number) => (g.inBounds(Math.floor(x), Math.floor(z)) ? Math.floor(z) * g.w + Math.floor(x) : -1);
      const ta = tileOf(ax, az);
      const tb = tileOf(bx, bz);
      const skipA = ta >= 0 ? owner[ta]! : -1;
      const skipB = tb >= 0 ? owner[tb]! : -1;
      let need = 0;
      const steps = Math.ceil(len / CLEAR_STEP);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (t < CLEAR_ENDS || t > 1 - CLEAR_ENDS) continue;
        const k = tileOf(ax + (bx - ax) * t, az + (bz - az) * t);
        if (k < 0 || owner[k]! < 0 || owner[k] === skipA || owner[k] === skipB) continue;
        const gap = tops[k]! + CLEARANCE - arcY(ya, yb, t, len);
        if (gap > 0) need = Math.max(need, gap / arcProfile(t));
      }
      const lift = Math.min(MAX_LIFT, Math.ceil(need));
      liftCache.set(key, lift);
      return lift;
    };
    /**
     * Where a pod sets down at a job centre (x, z) arriving from (fx, fz): street level, or, when the last stretch
     * of the approach crosses taller buildings, on top of the tallest of them (a rooftop pad) so the descent clears.
     */
    const landingY = (fx: number, fz: number, x: number, z: number) => {
      let top = ground(x, z) + STREET_Y;
      const len = Math.hypot(x - fx, z - fz);
      const steps = Math.ceil((len * CLEAR_ENDS * 1.5) / CLEAR_STEP);
      for (let i = 0; i <= steps; i++) {
        const t = 1 - (i / Math.max(1, steps)) * CLEAR_ENDS * 1.5;
        for (const [ox, oz] of [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]] as const) {
          const px = Math.floor(fx + (x - fx) * t + ox);
          const pz = Math.floor(fz + (z - fz) * t + oz);
          if (g.inBounds(px, pz) && owner[pz * g.w + px]! >= 0) top = Math.max(top, tops[pz * g.w + px]! + 0.4);
        }
      }
      return top;
    };
    const ground = (x: number, z: number) => Math.max(0, g.heightAt(x, z));
    /** Diagnostic: does the lifted arc still pass under a rooftop, in the middle or in its end approaches? */
    const clips = (ax: number, az: number, ya: number, bx: number, bz: number, yb: number, lift: number) => {
      const len = Math.max(0.01, Math.hypot(bx - ax, bz - az));
      const tileOf = (x: number, z: number) => (g.inBounds(Math.floor(x), Math.floor(z)) ? Math.floor(z) * g.w + Math.floor(x) : -1);
      const own = [tileOf(ax, az), tileOf(bx, bz)].map((k) => (k >= 0 ? owner[k]! : -1));
      let mid = false;
      let ends = false;
      const steps = Math.ceil(len / CLEAR_STEP);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const k = tileOf(ax + (bx - ax) * t, az + (bz - az) * t);
        if (k < 0 || owner[k]! < 0 || own.includes(owner[k]!)) continue;
        if (arcY(ya, yb, t, len, lift) >= tops[k]!) continue;
        if (t < CLEAR_ENDS || t > 1 - CLEAR_ENDS) ends = true;
        else mid = true;
      }
      return { mid, ends };
    };
    const stats = { lanes: 0, lifted: 0, clipped: 0, clippedEnds: 0 };

    /** Aeroline deck height the lanes were last built with (0 = line not built yet). */
    let railDeck = 0;
    /** Lanes, pods, rings and shafts from the latest network and pod routes. */
    const buildSkylanes = () => {
      if (topsDirty) refreshTops();
      liftCache.clear();
      Object.assign(stats, { lanes: 0, lifted: 0, clipped: 0, clippedEnds: 0 });
      const pr = podRoute.array as Float32Array;
      const pv = podVia.array as Float32Array;
      const pi = podInfo.array as Float32Array;
      const lr = laneRoute.array as Float32Array;
      const li = laneInfo.array as Float32Array;
      let np = 0;
      let nl = 0;
      const lane = (ax: number, az: number, ya: number, bx: number, bz: number, yb: number, kind: number) => {
        if (nl >= LANES) return;
        const lift = liftOf(ax, az, ya, bx, bz, yb);
        lr.set([ax, az, bx, bz], nl * 4);
        li.set([ya, yb, lift, kind], nl * 4);
        nl++;
        const c = clips(ax, az, ya, bx, bz, yb, lift);
        stats.lanes++;
        if (lift > 0) stats.lifted++;
        if (c.mid) stats.clipped++;
        if (c.ends) stats.clippedEnds++;
      };
      const NO_VIA = [0, 0, 0, 0];
      /** A pod from A (height ya) to B (yb), through the hub ring `via` if given; legs lifted like their lanes. */
      const pod = (A: readonly number[], B: readonly number[], via: number[], ya: number, yb: number, seed: number, speed: number) => {
        if (np >= PODS) return;
        let lift1: number;
        let lift2 = 0;
        if (via[3]! > 0) {
          const [vx, vz, vy, r] = via as [number, number, number, number];
          const toRing = (x: number, z: number) => {
            const l = Math.max(0.001, Math.hypot(x - vx, z - vz));
            return [vx + ((x - vx) / l) * r, vz + ((z - vz) / l) * r] as const;
          };
          const [e1x, e1z] = toRing(A[0]!, A[1]!);
          const [e2x, e2z] = toRing(B[0]!, B[1]!);
          lift1 = liftOf(A[0]!, A[1]!, ya, e1x, e1z, vy);
          lift2 = liftOf(e2x, e2z, vy, B[0]!, B[1]!, yb);
        } else lift1 = liftOf(A[0]!, A[1]!, ya, B[0]!, B[1]!, yb);
        pr.set([A[0]!, A[1]!, B[0]!, B[1]!], np * 4);
        pv.set(via, np * 4);
        pi.set(packPodInfo(ya, yb, seed, speed, lift1, lift2), np * 4);
        np++;
      };

      // Hubs: ring centre, height and radius; the point where a lane toward (x, z) meets the ring.
      const net = city.pulse.skylanes;
      const hubs = net.hubs.map((h) => {
        const spec = buildings.get(h.def).transit!.hub!;
        return { x: h.x, z: h.z, y: ground(h.x, h.z) + spec.ring, r: spec.radius, central: h.central };
      });
      const ringAt = (k: number, x: number, z: number) => {
        const h = hubs[k]!;
        const l = Math.max(0.001, Math.hypot(x - h.x, z - h.z));
        return [h.x + ((x - h.x) / l) * h.r, h.z + ((z - h.z) / l) * h.r] as const;
      };
      const stationsOf: [number, number][][] = hubs.map(() => []);
      const nbrs: number[][] = hubs.map(() => []);
      const railOf: [number, number, number][][] = hubs.map(() => []);
      const hubOfStation = new Map<string, number>();
      // Aeroline platforms: pods set down beside the deck (an estimate until the line is built, see the system).
      railDeck = ctx.services.tryGet('aeroline')?.deck ?? 0;
      const landY = (x: number, z: number) => (railDeck > 0 ? railDeck : ground(x, z) + 9) + RAIL_Y;
      for (const l of net.links) {
        if (l.kind === 'rail') {
          const py = landY(l.ax, l.az);
          railOf[l.b]!.push([l.ax, l.az, py]);
          const [ex, ez] = ringAt(l.b, l.ax, l.az);
          lane(ex, ez, hubs[l.b]!.y, l.ax, l.az, py, LANE_RAIL);
          // Transfer shuttles between the hub and the platform.
          for (let i = 0; i < 2; i++)
            pod([ex, ez], [l.ax, l.az], NO_VIA, hubs[l.b]!.y, py, i * 0.5 + hash2(l.b, 7, i) * 0.2, 1.2);
        } else if (l.kind === 'spoke') {
          stationsOf[l.b]!.push([l.ax, l.az]);
          hubOfStation.set(`${l.ax},${l.az}`, l.b);
          const [ex, ez] = ringAt(l.b, l.ax, l.az);
          lane(l.ax, l.az, ground(l.ax, l.az) + DOCK_Y, ex, ez, hubs[l.b]!.y, LANE_SPOKE);
        } else {
          nbrs[l.a]!.push(l.b);
          nbrs[l.b]!.push(l.a);
          const [ax, az] = ringAt(l.a, l.bx, l.bz);
          const [bx, bz] = ringAt(l.b, l.ax, l.az);
          lane(ax, az, hubs[l.a]!.y, bx, bz, hubs[l.b]!.y, LANE_TRUNK);
          // Express pods along each trunk.
          for (let i = 0; i < 2; i++)
            pod([ax, az], [bx, bz], NO_VIA, hubs[l.a]!.y, hubs[l.b]!.y, i * 0.5 + hash2(l.a, l.b, i) * 0.2, 1.5);
        }
      }

      // Each dock's riders: a dock off the network flies its own lane to the job centre; a networked one
      // routes through its hub, to the job centre, another dock on the hub, on to a neighbouring hub, or to the
      // hub's Aeroline station to change to the trains.
      const egress = new Set<string>();
      for (const r of city.pulse.podRoutes) {
        const ya = ground(r.ax, r.az) + DOCK_Y;
        const hk = hubOfStation.get(`${r.ax},${r.az}`);
        // The landing depends on the approach: from the dock itself, or from the hub (same for all its docks).
        const yj = hk === undefined ? landingY(r.ax, r.az, r.bx, r.bz) : landingY(hubs[hk]!.x, hubs[hk]!.z, r.bx, r.bz);
        if (hk === undefined) {
          lane(r.ax, r.az, ya, r.bx, r.bz, yj, LANE_DIRECT);
          const k = Math.max(1, Math.min(6, Math.round(r.riders / 60)));
          for (let i = 0; i < k; i++)
            pod([r.ax, r.az], [r.bx, r.bz], NO_VIA, ya, yj, i / k + hash2(Math.floor(r.ax), Math.floor(r.az), i) * 0.1, 1);
          continue;
        }
        const h = hubs[hk]!;
        const key = `${hk}:${r.bx},${r.bz}`;
        if (!egress.has(key)) {
          egress.add(key);
          const [ex, ez] = ringAt(hk, r.bx, r.bz);
          lane(ex, ez, h.y, r.bx, r.bz, yj, LANE_EGRESS);
        }
        const via = [h.x, h.z, h.y, h.r];
        const mates = stationsOf[hk]!;
        const near = nbrs[hk]!;
        const trains = railOf[hk]!;
        const k = Math.max(1, Math.min(4, Math.round(r.riders / 70)));
        for (let i = 0; i < k; i++) {
          const seed = i / k + hash2(Math.floor(r.ax), Math.floor(r.az), i) * 0.1;
          const pick = (i + Math.floor(r.ax + r.az)) % 4;
          if (pick === 3 && trains.length) {
            const [tx, tz, ty] = trains[i % trains.length]!;
            pod([r.ax, r.az], [tx, tz], via, ya, ty, seed, 1);
          } else if (pick === 1 && mates.length > 1) {
            let m = (Math.floor(r.ax * 7 + r.az * 13) + i * 5) % mates.length;
            if (mates[m]![0] === r.ax && mates[m]![1] === r.az) m = (m + 1) % mates.length;
            const [mx, mz] = mates[m]!;
            pod([r.ax, r.az], [mx, mz], via, ya, ground(mx, mz) + DOCK_Y, seed, 1);
          } else if (pick === 2 && near.length) {
            const o = near[(Math.floor(r.ax + r.az * 3) + i) % near.length]!;
            const [bx, bz] = ringAt(o, h.x, h.z);
            pod([r.ax, r.az], [bx, bz], via, ya, hubs[o]!.y, seed, 1);
          } else pod([r.ax, r.az], [r.bx, r.bz], via, ya, yj, seed, 1);
        }
      }

      // Rings and shafts: three rings round each hub's transfer ring (six, and a taller shaft, for a central one).
      const ra = ringA.array as Float32Array;
      const sa = spinA.array as Float32Array;
      const ha = shaftRing.array as Float32Array;
      const hs = shaftSpin.array as Float32Array;
      let nr = 0;
      let ns = 0;
      const ringOf = (x: number, y: number, z: number, r: number, tilt: number, speed: number, phase: number, tint: number) => {
        if (nr >= RINGS) return;
        ra.set([x, y, z, r], nr * 4);
        sa.set([tilt, speed, phase, tint], nr * 4);
        nr++;
      };
      hubs.forEach((h, k) => {
        const ph = hash2(k, 3, 9) * 6.28;
        ringOf(h.x, h.y, h.z, h.r, 0, 0.25, ph, h.central ? 1 : 0);
        ringOf(h.x, h.y + 0.4, h.z, h.r * 1.22, 0.28, 0.5, ph + 1, 0);
        ringOf(h.x, h.y - 0.3, h.z, h.r * 0.8, -0.4, -0.7, ph + 2, h.central ? 1 : 0);
        if (h.central) {
          ringOf(h.x, h.y + 1.2, h.z, h.r * 1.7, 0.12, -0.18, ph + 3, 1);
          ringOf(h.x, h.y + 2.4, h.z, h.r * 0.55, 1.2, 0.9, ph + 4, 0);
          ringOf(h.x, h.y + 2.4, h.z, h.r * 0.55, -1.2, 0.9, ph + 5, 1);
        }
        if (ns < RINGS) {
          ha.set([h.x, h.y + 0.5, h.z, h.central ? 0.9 : 0.45], ns * 4);
          hs.set([h.central ? 60 : 22, 0, 0, h.central ? 1 : 0], ns * 4);
          ns++;
        }
        // A landing ring over each Aeroline station the hub serves.
        for (const [tx, tz, ty] of railOf[k]!) {
          ringOf(tx, ty, tz, 1.8, 0, 0.6, ph, 2);
          ringOf(tx, ty + 0.35, tz, 1.2, 0.3, -0.9, ph + 1, 2);
        }
      });
      pods.count = np;
      lanes.count = nl;
      rings.count = nr;
      shafts.count = ns;
      podRoute.needsUpdate = podVia.needsUpdate = podInfo.needsUpdate = laneRoute.needsUpdate = laneInfo.needsUpdate = true;
      ringA.needsUpdate = spinA.needsUpdate = shaftRing.needsUpdate = shaftSpin.needsUpdate = true;
    };
    ctx.services.provide('skylanes', {
      get pods() {
        return pods.count;
      },
      clearance: () => ({ ...stats }),
      podAt: (i, clock, out, ahead) =>
        podPathAt(podRoute.array as Float32Array, podVia.array as Float32Array, podInfo.array as Float32Array, i, clock, out, ahead),
    });
    ctx.bus.on('mobility:updated', rebuild);
    ctx.bus.on('city:reset', () => {
      agents.count = pods.count = lanes.count = rings.count = shafts.count = 0;
    });
    // Saved / bulk-loaded cities already have a mobility pass once the first pulses run; render
    // whatever exists now (D-007).
    rebuild();

    ctx.systems.add({
      id: 'mobility.visuals',
      phase: 'sync',
      order: 7,
      update(c, f) {
        const tod = city.timeOfDay;
        // Morning rush toward work, evening rush home, otherwise both ways; quieter at night.
        const target = tod > 0.25 && tod < 0.45 ? 0.85 : tod > 0.65 && tod < 0.85 ? 0.15 : 0.5;
        share.value += (target - share.value) * Math.min(1, f.dt * 0.5);
        density.value = 1 - 0.65 * U.night.value;
        // Explore modes put the camera among the lanes: no thickening there.
        zoom.value = c.cameraCtl.enabled ? Math.max(1, Math.min(5, c.cameraCtl.distance / 55)) : 1;
        agents.visible = agents.count > 0 && c.cameraCtl.distance < 240;
        pods.visible = pods.count > 0;
        lanes.visible = lanes.count > 0;
        rings.visible = rings.count > 0;
        // The Aeroline builds after this module: re-land the transfer lanes once its deck height is known.
        if ((ctx.services.tryGet('aeroline')?.deck ?? 0) !== railDeck) buildSkylanes();
        shafts.visible = shafts.count > 0;
      },
    });
  },
};
