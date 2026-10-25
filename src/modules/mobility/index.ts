import {
  NormalBlending,
  BoxGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  SphereGeometry,
  type Node,
  type BufferGeometry,
  type Texture,
} from 'three/webgpu';
import { abs, attribute, color, cos, float, fract, max, mix, positionGeometry, smoothstep, step, texture, time, uniform, uv, vec2, vec3 } from 'three/tsl';
import type { GameModule } from '@/game/context';
import { U } from '@/render/uniforms';
import { BRIDGE, BRIDGE_DECK } from '@/sim/City';
import { mobilityLayers } from '@/sim/mobility';
import { hash2 } from '@/sim/random';

/** Instanced batches stay above the 1024-instance UBO path (AGENTS.md §8). */
const AGENTS = 8192;
const PODS = 1040;
const LANES = 1040;
const MAX_RUN = 8;
/** Agents per tile of a run at congestion 1 (density reads as traffic). */
const AGENTS_PER_TILE = 4;

/**
 * Mobility visuals (Phase 8). Everything moves on the GPU from static per-instance data that is
 * rebuilt only when the sim's mobility pass runs (every ~5 s), so there are no per-frame uploads:
 * - hover-commuters ride straight runs of the flow field (direction of most commuters), denser and
 *   slower and shading cyan → amber → coral as highways jam; morning flows toward work, evening home;
 * - commuter pods shuttle between Pod Docks and job hubs along arcing sky-lanes marked by light
 *   ribbons. Three draw calls in total.
 */
export const mobilityModule: GameModule = {
  id: 'mobility',
  deps: ['world'],
  init(ctx) {
    const { city, scene } = ctx;
    const share = uniform(0.5); // share of agents heading toward work
    const density = uniform(1); // share of agents on the move (fewer at night)

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
      am.emissiveNode = tint.mul(U.night.mul(1.6).add(0.3));
    }
    const agents = new InstancedMesh(agentGeo, am, AGENTS);
    agents.count = 0;
    agents.frustumCulled = false;
    agents.castShadow = agents.receiveShadow = false;
    agents.name = 'mobility.agents';

    // ── Sky-lanes: pods and light ribbons share the same arc ───────────────────
    const arc = (route: Node<'vec4'>, info: Node<'vec4'>, t: Node<'float'>) => {
      const a = route.xy;
      const b = route.zw;
      const flat = mix(a, b, t);
      const y = mix(info.x, info.y, t).add(t.mul(float(1).sub(t)).mul(4).mul(info.z));
      return vec3(flat.x, y, flat.y);
    };
    const podRoute = new InstancedBufferAttribute(new Float32Array(PODS * 4), 4);
    const podInfo = new InstancedBufferAttribute(new Float32Array(PODS * 4), 4);
    const podGeo: BufferGeometry = new SphereGeometry(0.5, 12, 8).scale(0.5, 0.22, 0.25);
    podGeo.setAttribute('aRoute', podRoute);
    podGeo.setAttribute('aRouteInfo', podInfo);
    const pm = new MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0.2 });
    {
      const route = attribute('aRoute', 'vec4');
      const info = attribute('aRouteInfo', 'vec4');
      const d = route.zw.sub(route.xy);
      const len = max(d.length(), float(1));
      const dir = d.div(len);
      // Shuttle out and back, easing into each dock.
      // U.clock (not `time`) so the explore follow-cam can compute the same position on the CPU.
      const t = float(0.5).sub(cos(U.clock.mul(float(4).div(len.sqrt())).add(info.w.mul(6.283))).mul(0.5));
      const g = positionGeometry;
      const body = vec3(g.x.mul(dir.x).sub(g.z.mul(dir.y)), g.y, g.x.mul(dir.y).add(g.z.mul(dir.x)));
      pm.positionNode = arc(route, info, t).add(body);
      const band = smoothstep(0.025, 0.0, abs(g.y.sub(0.02)));
      pm.colorNode = mix(color(0xf6f8f4), color(0x2f6f78), band);
      pm.emissiveNode = color(0x7ff7e6).mul(band.mul(1.4).add(0.08)).mul(U.night.mul(1.2).add(0.3));
    }
    const pods = new InstancedMesh(podGeo, pm, PODS);
    pods.count = 0;
    pods.frustumCulled = false;
    pods.castShadow = pods.receiveShadow = false;
    pods.name = 'mobility.pods';
    // Hero pod model (Phase 12): if the optional GLB is present, swap in its shape and texture.
    // The pipeline (scripts/optimize-glb.mjs) fits it with its length along +X, like the capsule.
    ctx.assets.loadGlbGeometry('/assets/commuter-pod.glb').then(
      ({ geometry, material }) => {
        geometry.setAttribute('aRoute', podRoute);
        geometry.setAttribute('aRouteInfo', podInfo);
        pods.geometry = geometry;
        const map = (material as { map?: Texture | null } | null)?.map;
        if (map) {
          const tex = texture(map, uv());
          pm.colorNode = tex;
          pm.emissiveNode = tex.rgb.mul(U.night.mul(0.35).add(0.05)).add(color(0x7ff7e6).mul(U.night).mul(0.15));
          pm.needsUpdate = true;
        }
      },
      () => {
        /* optional asset missing: keep the procedural capsule */
      },
    );

    const laneRoute = new InstancedBufferAttribute(new Float32Array(LANES * 4), 4);
    const laneInfo = new InstancedBufferAttribute(new Float32Array(LANES * 4), 4);
    const laneGeo = new PlaneGeometry(1, 1, 48, 1).rotateX(-Math.PI / 2);
    laneGeo.setAttribute('aRoute', laneRoute);
    laneGeo.setAttribute('aRouteInfo', laneInfo);
    const lm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: NormalBlending, fog: false });
    {
      const route = attribute('aRoute', 'vec4');
      const info = attribute('aRouteInfo', 'vec4');
      const d = route.zw.sub(route.xy);
      const len = max(d.length(), float(1));
      const dir = d.div(len);
      const t = positionGeometry.x.add(0.5);
      const side = positionGeometry.z.mul(0.3);
      lm.positionNode = arc(route, info, t).add(vec3(dir.y.negate().mul(side), 0, dir.x.mul(side)));
      const dash = smoothstep(0.55, 1, fract(t.mul(len).mul(0.35).sub(time.mul(0.9))));
      const edge = smoothstep(0.5, 0.15, abs(positionGeometry.z));
      const ends = smoothstep(0, 0.08, t).mul(smoothstep(1, 0.92, t));
      lm.colorNode = mix(color(0x3fd9c8), color(0xff8fc0), t).mul(U.night.mul(0.6).add(1));
      lm.opacityNode = dash.mul(0.45).add(0.3).mul(edge).mul(ends).mul(U.night.mul(0.3).add(0.7));
    }
    const lanes = new InstancedMesh(laneGeo, lm, LANES);
    lanes.count = 0;
    lanes.frustumCulled = false;
    lanes.castShadow = lanes.receiveShadow = false;
    lanes.renderOrder = 6;
    lanes.name = 'mobility.lanes';
    scene.add(agents, pods, lanes);

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

      // Sky-lanes from the pod routes.
      const routes = city.pulse.podRoutes;
      const pr = podRoute.array as Float32Array;
      const pi = podInfo.array as Float32Array;
      const lr = laneRoute.array as Float32Array;
      const li = laneInfo.array as Float32Array;
      let np = 0;
      let nl = 0;
      for (const r of routes) {
        if (nl >= LANES) break;
        const ya = Math.max(0, g.heightAt(r.ax, r.az)) + 3.2;
        const yb = Math.max(0, g.heightAt(r.bx, r.bz)) + 1.2;
        const peak = 3 + Math.hypot(r.bx - r.ax, r.bz - r.az) * 0.08;
        lr.set([r.ax, r.az, r.bx, r.bz], nl * 4);
        li.set([ya, yb, peak, 0], nl * 4);
        nl++;
        const k = Math.min(PODS - np, Math.max(1, Math.min(6, Math.round(r.riders / 60))));
        for (let i = 0; i < k; i++) {
          pr.set([r.ax, r.az, r.bx, r.bz], np * 4);
          pi.set([ya, yb, peak, i / k + hash2(Math.floor(r.ax), Math.floor(r.az), i) * 0.1], np * 4);
          np++;
        }
      }
      pods.count = np;
      lanes.count = nl;
      podRoute.needsUpdate = podInfo.needsUpdate = laneRoute.needsUpdate = laneInfo.needsUpdate = true;
    };
    ctx.bus.on('mobility:updated', rebuild);
    ctx.bus.on('city:reset', () => {
      agents.count = pods.count = lanes.count = 0;
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
        agents.visible = agents.count > 0 && c.cameraCtl.distance < 240;
        pods.visible = pods.count > 0;
        lanes.visible = lanes.count > 0;
      },
    });
  },
};
