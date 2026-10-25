import {
  DoubleSide,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  OctahedronGeometry,
} from 'three/webgpu';
import { abs, attribute, clamp, color, cos, float, fract, max, mix, positionGeometry, select, sin, smoothstep, step, time, uniform, vec3 } from 'three/tsl';
import type { GameModule } from '@/game/context';
import { U } from '@/render/uniforms';
import { hash2 } from '@/sim/random';

const DRONES = 1040;
const BURSTS = 8;
const PER_BURST = 130;
const MIST_SECONDS = 4.5;

/**
 * Flora-Net visuals (Phase 9). Hummingbird drones fly sorties from their hive to the work the sim
 * assigned (pollinate, harvest, trim, mist): out on an arc, a darting hover with wing flutter,
 * then home. Mist bursts bloom over zones that pods or the steward watered. Both are static
 * per-instance data animated in the shader (D-022 pattern): two draw calls, uploads only when the
 * Flora-Net pass runs or a mist starts.
 */
export const floranetModule: GameModule = {
  id: 'floranet',
  deps: ['world'],
  init(ctx) {
    const { city, scene } = ctx;

    // ── Drones ────────────────────────────────────────────────────────────────
    const aJob = new InstancedBufferAttribute(new Float32Array(DRONES * 4), 4);
    const aJobInfo = new InstancedBufferAttribute(new Float32Array(DRONES * 4), 4);
    const geo = new OctahedronGeometry(0.5, 0).scale(0.3, 0.11, 0.13);
    geo.setAttribute('aJob', aJob);
    geo.setAttribute('aJobInfo', aJobInfo);
    const dm = new MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.4, flatShading: true });
    {
      const job = attribute('aJob', 'vec4');
      const info = attribute('aJobInfo', 'vec4');
      const seed = info.w;
      const hive = vec3(job.x, info.x, job.y);
      const target = vec3(job.z, info.y, job.w);
      const dist = target.sub(hive).length();
      const period = float(6).add(dist.mul(0.35));
      const ph = fract(time.div(period).add(seed));
      // Out (0–0.35), hover (0.35–0.65), home (0.65–1).
      const outT = smoothstep(0, 0.35, ph);
      const backT = smoothstep(0.65, 1, ph);
      const t = outT.sub(backT);
      const lift = t.mul(float(1).sub(t)).mul(4).mul(dist.mul(0.12).add(1.2));
      const hover = step(0.35, ph).mul(step(ph, 0.65));
      const w = time.mul(2.3).add(seed.mul(40));
      const dart = vec3(sin(w).mul(0.5), sin(w.mul(2)).mul(0.15).add(0.4), sin(w.mul(1.5).add(1)).mul(0.5)).mul(hover);
      const p = mix(hive, target, t).add(vec3(0, lift, 0)).add(dart);
      // Face the direction of travel (sign flips on the way home); wings flutter as a fast roll.
      const d = target.sub(hive);
      const heading = select(ph.greaterThan(0.65), d.negate(), d);
      const hl = max(vec3(heading.x, 0, heading.z).length(), float(1e-3));
      const c = heading.x.div(hl);
      const s = heading.z.div(hl);
      const g = positionGeometry;
      const flutter = sin(time.mul(55).add(seed.mul(9))).mul(abs(g.z).mul(6)).mul(0.04);
      const body = vec3(g.x.mul(c).sub(g.z.mul(s)), g.y.add(flutter), g.x.mul(s).add(g.z.mul(c)));
      dm.positionNode = p.add(body);
      const kind = info.z;
      // Pollinate pink, harvest amber, trim leaf-green, mist cyan.
      const tint = mix(mix(color(0xff8fc0), color(0xffb347), clamp(kind, 0, 1)), mix(color(0x8fe36a), color(0x7fe9ff), clamp(kind.sub(2), 0, 1)), step(1.5, kind));
      dm.colorNode = mix(color(0x2f4f58), tint, 0.5);
      dm.emissiveNode = tint.mul(U.night.mul(1.4).add(0.45));
    }
    const drones = new InstancedMesh(geo, dm, DRONES);
    drones.count = 0;
    drones.frustumCulled = false;
    drones.castShadow = drones.receiveShadow = false;
    drones.name = 'floranet.drones';

    // ── Mist bursts (ring buffer of BURSTS × PER_BURST droplets) ──────────────
    const now = uniform(0);
    const aBurst = new InstancedBufferAttribute(new Float32Array(BURSTS * PER_BURST * 4), 4);
    const aBurstR = new InstancedBufferAttribute(new Float32Array(BURSTS * PER_BURST), 1);
    const mgeo = new IcosahedronGeometry(0.5, 1).scale(0.45, 0.3, 0.45);
    mgeo.setAttribute('aBurst', aBurst);
    mgeo.setAttribute('aBurstR', aBurstR);
    const mm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    {
      const b = attribute('aBurst', 'vec4');
      const r = attribute('aBurstR', 'float');
      const age = now.sub(b.w);
      const k = clamp(age.div(MIST_SECONDS), 0, 1);
      const live = step(0, age).mul(step(age, MIST_SECONDS));
      // Each droplet's place in the cloud comes from its index within the burst (golden-angle spiral).
      const id = attribute('aBurstId', 'float');
      const a = id.mul(2.39996);
      const rad = r.mul(id.add(0.5).div(PER_BURST).sqrt()).mul(k.mul(0.4).add(0.7));
      const y = b.y.add(0.4).add(fract(id.mul(0.371)).mul(1.6)).add(k.mul(0.8));
      const centre = vec3(b.x.add(cos(a).mul(rad)), y, b.z.add(sin(a).mul(rad)));
      mm.positionNode = centre.add(positionGeometry.mul(live).mul(k.mul(1.5).add(0.6)));
      mm.colorNode = mix(color(0xe9fbff), color(0x9fe9ff), k);
      mm.opacityNode = live.mul(smoothstep(0, 0.12, k)).mul(float(1).sub(k)).mul(0.22);
    }
    const ids = new Float32Array(BURSTS * PER_BURST);
    for (let i = 0; i < ids.length; i++) ids[i] = i % PER_BURST;
    mgeo.setAttribute('aBurstId', new InstancedBufferAttribute(ids, 1));
    (aBurst.array as Float32Array).fill(-1e4);
    const mist = new InstancedMesh(mgeo, mm, BURSTS * PER_BURST);
    mist.frustumCulled = false;
    mist.castShadow = mist.receiveShadow = false;
    mist.renderOrder = 7;
    mist.visible = false;
    mist.name = 'floranet.mist';
    scene.add(drones, mist);

    const g = city.grid;
    const ground = (x: number, z: number) => Math.max(0, g.heightAt(x, z));
    let slot = 0;
    let lastBurst = -1e4;
    const burst = (x: number, z: number, r: number) => {
      const arr = aBurst.array as Float32Array;
      const rr = aBurstR.array as Float32Array;
      const y = ground(x, z);
      for (let i = 0; i < PER_BURST; i++) {
        const o = slot * PER_BURST + i;
        arr.set([x, y, z, now.value], o * 4);
        rr[o] = r;
      }
      slot = (slot + 1) % BURSTS;
      lastBurst = now.value;
      aBurst.needsUpdate = aBurstR.needsUpdate = true;
    };
    ctx.bus.on('floranet:mist', ({ x, z, radius }) => burst(x, z, radius * 0.8));

    const rebuild = () => {
      const jobs = city.pulse.drones;
      const a = aJob.array as Float32Array;
      const b = aJobInfo.array as Float32Array;
      const n = Math.min(DRONES, jobs.length);
      for (let i = 0; i < n; i++) {
        const j = jobs[i]!;
        a.set([j.hx, j.hz, j.tx, j.tz], i * 4);
        b.set([ground(j.hx, j.hz) + 1.6, ground(j.tx, j.tz) + 0.6, j.kind, hash2(Math.floor(j.tx), Math.floor(j.tz), i)], i * 4);
      }
      drones.count = n;
      aJob.needsUpdate = aJobInfo.needsUpdate = true;
    };
    ctx.bus.on('floranet:updated', () => {
      rebuild();
      // Pods mist dry zones on their sky-lanes: show a few of those clouds.
      if (ctx.loading) return;
      for (const m of city.pulse.mists.slice(0, 3)) burst(m.x, m.z, 5);
    });
    ctx.bus.on('city:reset', () => {
      drones.count = 0;
      (aBurst.array as Float32Array).fill(-1e4);
      aBurst.needsUpdate = true;
    });
    rebuild();

    ctx.systems.add({
      id: 'floranet.visuals',
      phase: 'sync',
      order: 8,
      update(c, f) {
        now.value += f.dt;
        drones.visible = drones.count > 0 && c.cameraCtl.distance < 200;
        mist.visible = now.value - lastBurst < MIST_SECONDS + 0.2;
      },
    });
  },
};
