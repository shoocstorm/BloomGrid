import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three/webgpu';
import type { GameModule } from '@/game/context';
import { Building } from '@/ecs/components';
import { getMaterial } from '@/render/materials/library';
import { GeoBuilder, tf } from '@/render/bake';
import { U } from '@/render/uniforms';
import { RESPONSE_COST, eidOfUid } from '@/sim/hazards';
import { placeBuilding } from '@/modules/construction/BuildingRenderer';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import './hazards.css';

/** Flame and smoke instances per fire (scaled by intensity), and smoke for each ruin. */
const FLAMES = 8;
const PUFFS = 7;
const RUIN_PUFFS = 3;
/** Instanced capacity ≤ 1024 (UBO): these re-pose every frame anyway. */
const CAP = 1000;
/** Locator beacons: one beam and two pulsing ground rings per fire. */
const BEACONS = 200;
/** Screen pins (DOM) at most; the rest are in the fire panel. */
const PINS = 12;

/** A tapering beam of light, base at y = 0, unit height (scaled per frame with the camera distance). */
function beamGeometry(): BufferGeometry {
  return new GeoBuilder()
    .add(new CylinderGeometry(0.18, 0.5, 1, 8, 1, true), tf(0, 0.5, 0), 0xff7a3a, 5)
    .add(new CylinderGeometry(0.06, 0.16, 1, 6, 1, true), tf(0, 0.5, 0), 0xffe0a0, 8)
    .build();
}

function ringGeometry(): BufferGeometry {
  return new GeoBuilder()
    .add(new TorusGeometry(1, 0.05, 3, 40), tf(0, 0, 0, Math.PI / 2), 0xff6a3a, 5)
    .build();
}

function flameGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  b.add(new ConeGeometry(0.5, 1.6, 7), tf(0, 0.8, 0), 0xff7a1a, 3.2);
  b.add(new ConeGeometry(0.32, 1.1, 6), tf(0.18, 0.55, 0.1), 0xffc94a, 4);
  b.add(new ConeGeometry(0.26, 0.9, 6), tf(-0.2, 0.45, -0.08), 0xff4a2a, 3);
  return b.build();
}

function puffGeometry(): BufferGeometry {
  return new GeoBuilder()
    .add(new IcosahedronGeometry(0.5, 1), tf(0, 0, 0, 0, 0, 0, 1, 0.8, 1), 0x9ea4a3, 0)
    .build();
}

/** A jagged bolt from the sky to (x, top, z): thin glowing segments with a fork. */
function boltGeometry(x: number, y: number, z: number, seed: number): BufferGeometry {
  const b = new GeoBuilder();
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const seg = (a: Vector3, c: Vector3, w: number) => {
    const d = new Vector3().subVectors(c, a);
    const len = d.length();
    const m = new Matrix4().compose(
      new Vector3().addVectors(a, c).multiplyScalar(0.5),
      new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()),
      new Vector3(w, len, w),
    );
    b.add(new BoxGeometry(1, 1, 1), m, 0xe8f4ff, 9);
  };
  let p = new Vector3(x + rnd() * 6, y + 70, z + rnd() * 6);
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const q = new Vector3(x + rnd() * 3.5 * (1 - t), y + 70 * (1 - t), z + rnd() * 3.5 * (1 - t));
    seg(p, q, 0.22);
    if (i === 5) seg(q, new Vector3(q.x + rnd() * 9, q.y - 14, q.z + rnd() * 9), 0.12);
    p = q;
  }
  return b.build();
}

/**
 * Hazard visuals and the emergency panel (D-050). Fires: flame clusters and rising smoke on burning buildings,
 * a thin plume over ruins (two instanced meshes, re-posed per frame only while anything burns or smoulders).
 * Lightning: a jagged glowing bolt and a screen flash for a quarter second. Earthquakes: camera shake from the
 * crisis modifiers, and a toast with the magnitude. The fire panel lists every fire with a fly-to and a crew
 * dispatch button (4 Hz, only while fires burn). Nothing casts shadows (the shadow map is cached).
 *
 * Locating a fire fast: a beam of light over each blaze that widens with the camera distance (so it reads from
 * the whole-island view) and pulsing rings on the ground; a screen pin per fire that clamps to the screen edge
 * with an arrow when the fire is off screen (click to fly there); coalesced, clickable alert toasts when fires
 * start; and `.` (or the panel's ⌖ Next) to step the camera through the burning buildings.
 */
export const hazardsModule: GameModule = {
  id: 'hazards',
  deps: ['world', 'construction', 'hud', 'crises', 'dashboard'],
  init(ctx) {
    const mat = getMaterial('scenery');
    const flames = new InstancedMesh(flameGeometry(), mat, CAP);
    const smoke = new InstancedMesh(puffGeometry(), mat, CAP);
    const beams = new InstancedMesh(beamGeometry(), mat, BEACONS);
    const rings = new InstancedMesh(ringGeometry(), mat, BEACONS * 2);
    for (const m of [flames, smoke, beams, rings]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      m.name = 'hazards';
    }
    ctx.scene.add(flames, smoke, beams, rings);
    let bolt: Mesh | null = null;
    let boltUntil = 0;
    const flash = h('div', { class: 'hz-flash' });
    document.body.append(flash);

    // Where flames sit: the top of each building's cached template (by serial), refreshed when needed.
    const tops = new Map<number, { x: number; y: number; z: number; w: number; d: number; h: number }>();
    const spot = (uid: number) => {
      let s = tops.get(uid);
      if (s) return s;
      const eid = eidOfUid(ctx.city, uid);
      if (eid < 0) return null;
      const rec = ctx.city.buildingRecord(eid);
      const p = placeBuilding(ctx.city.grid, ctx.city.buildingDef(eid), rec.x, rec.z, rec.rot);
      const e = p.base.elements;
      s = {
        x: e[12]!,
        y: e[13]!,
        z: e[14]!,
        w: Building.w[eid]!,
        d: Building.d[eid]!,
        h: Math.min(18, p.template.height),
      };
      tops.set(uid, s);
      return s;
    };
    for (const ev of ['building:removed', 'terrain:changed', 'city:reset'] as const)
      ctx.bus.on(ev, () => tops.clear());

    // Lightning: bolt + flash; the strike also shakes the toast line when it starts a fire.
    ctx.bus.on('lightning:strike', ({ x, y, z, eid, fire }) => {
      if (bolt) {
        ctx.scene.remove(bolt);
        bolt.geometry.dispose();
      }
      const top = spot(Building.uid[eid]!);
      bolt = new Mesh(
        boltGeometry(x, (top ? top.y + top.h : y) + 0.5, z, (eid * 7919 + ctx.city.tick) % 2147483646 || 1),
        mat,
      );
      bolt.frustumCulled = false;
      ctx.scene.add(bolt);
      boltUntil = performance.now() + 260;
      flash.classList.remove('on');
      void flash.offsetWidth;
      flash.classList.add('on');
      if (fire)
        ctx.bus.emit('toast', {
          text: `⚡ Lightning set ${ctx.city.buildingDef(eid).name} alight`,
          tone: 'bad',
          at: { x, z },
        });
    });
    ctx.bus.on('quake:shock', ({ x, z, magnitude, aftershock }) => {
      const where = ctx.city.districtAt(Math.floor(x), Math.floor(z)) ?? 'the outskirts';
      ctx.bus.emit('toast', {
        text: `${aftershock ? 'Aftershock' : '🌋 Earthquake'} · magnitude ${magnitude.toFixed(1)} near ${where}`,
        tone: 'bad',
        at: { x, z },
      });
    });
    ctx.bus.on('building:ruined', ({ eid, cause }) =>
      ctx.bus.emit('toast', {
        text: `${ctx.city.buildingDef(eid).name} was ${cause === 'fire' ? 'burned out' : 'shaken down'}: a ruin now`,
        tone: 'bad',
        at: { x: Building.x[eid]! + Building.w[eid]! / 2, z: Building.z[eid]! + Building.d[eid]! / 2 },
      }),
    );
    // New fires (not lightning, which has its own toast): one alert per frame, so a quake's fires come as one.
    const started: { name: string; x: number; z: number }[] = [];
    ctx.bus.on('fire:start', ({ fire, eid }) => {
      if (fire.cause !== 'lightning')
        started.push({ name: ctx.city.buildingDef(eid).name, x: fire.x, z: fire.z });
    });
    const where = (x: number, z: number) =>
      ctx.city.districtAt(Math.floor(x), Math.floor(z)) ?? 'the outskirts';
    const flushStarted = () => {
      const f = started[0]!;
      const text =
        started.length === 1
          ? `🔥 Fire: ${f.name} in ${where(f.x, f.z)}`
          : `🔥 ${started.length} fires broke out · first in ${where(f.x, f.z)}`;
      ctx.bus.emit('toast', { text, tone: 'bad', at: { x: f.x, z: f.z } });
      started.length = 0;
    };

    // Step the camera through the fires, hottest first (`.` or the panel's ⌖ Next).
    let nextIdx = 0;
    const locateNext = () => {
      const fires = [...ctx.city.steward.fires].sort((a, b) => b.intensity - a.intensity || a.id - b.id);
      if (!fires.length) return false;
      const f = fires[nextIdx++ % fires.length]!;
      ctx.cameraCtl.flyTo(f.x, f.z, 32);
      return true;
    };
    ctx.input.onKey((e) => {
      if (e.code !== 'Period' || e.metaKey || e.ctrlKey || !ctx.cameraCtl.enabled) return false;
      return locateNext();
    });

    // ── Fire panel ───────────────────────────────────────────────────────────
    const list = h('div', { class: 'hz-list' });
    const title = h('b');
    const allBtn = h('button', { class: 'hz-btn', onClick: () => ctx.commands.execute('respond', {}) }, '');
    const nextBtn = h(
      'button',
      { class: 'hz-log', title: 'Fly to the next fire (.)', onClick: () => locateNext() },
      '⌖ Next',
    );
    const logBtn = h(
      'button',
      {
        class: 'hz-log',
        title: 'Incident log',
        onClick: () => ctx.services.get('dashboard').openIncidents(),
      },
      'Log',
    );
    const panel = h(
      'section',
      { class: 'hz-panel panel hidden' },
      h('header', {}, h('span', { class: 'hz-dot' }), title, allBtn, nextBtn, logBtn),
      list,
    );
    (document.querySelector('.crisis-wrap') ?? ctx.hud).append(panel);
    const rows = new Map<
      number,
      { el: HTMLElement; bar: HTMLElement; state: HTMLElement; btn: HTMLButtonElement }
    >();
    let timer = 0;

    // ── Screen pins: over each fire, or clamped to the screen edge pointing at it ──
    const pinLayer = h('div', { class: 'hz-pins' });
    // In the HUD, above its panels (an edge pin may sit over one) but under the dashboard, map and sheets.
    ctx.hud.append(pinLayer);
    const pins: { el: HTMLElement; arrow: HTMLElement; id: number; x: number; z: number }[] = [];
    for (let i = 0; i < PINS; i++) {
      const arrow = h('i', { class: 'hz-pin-arrow' });
      const p = {
        el: h('button', { class: 'hz-pin hidden', title: 'Fly to this fire' }),
        arrow,
        id: -1,
        x: 0,
        z: 0,
      };
      p.el.append(arrow, h('span', {}, '🔥'));
      p.el.addEventListener('click', () => ctx.cameraCtl.flyTo(p.x, p.z, 32));
      pinLayer.append(p.el);
      pins.push(p);
    }
    const ndc = new Vector3();
    const placePins = (n: number) => {
      const fires = ctx.city.steward.fires;
      const show = ctx.cameraCtl.enabled ? Math.min(n, fires.length) : 0;
      const W = innerWidth;
      const H = innerHeight;
      // Edge inset in pixels (clear of the top bar and the dock).
      const mx = 30;
      const mTop = 64;
      const mBot = 90;
      for (let i = 0; i < PINS; i++) {
        const p = pins[i]!;
        if (i >= show) {
          if (p.id !== -1) {
            p.el.classList.add('hidden');
            p.id = -1;
          }
          continue;
        }
        const f = fires[i]!;
        const s = spot(f.uid);
        if (p.id !== f.id) {
          p.id = f.id;
          p.el.classList.remove('hidden');
        }
        p.x = f.x;
        p.z = f.z;
        ndc.set(f.x, s ? s.y + s.h + 1.5 : 2, f.z).project(ctx.camera);
        const behind = ndc.z > 1;
        let sx = ndc.x;
        let sy = -ndc.y;
        if (behind) {
          sx = -sx;
          sy = -sy;
        }
        const inside = !behind && Math.abs(sx) <= 1 && Math.abs(sy) <= 1;
        // Half-extents of the pin area in NDC, top and bottom insets differ.
        const ex = 1 - (2 * mx) / W;
        const eTop = 1 - (2 * mTop) / H;
        const eBot = 1 - (2 * mBot) / H;
        let px: number, py: number;
        if (inside) {
          px = sx;
          py = sy;
        } else {
          const ey = sy < 0 ? eTop : eBot;
          const k = 1 / Math.max(Math.abs(sx) / ex, Math.abs(sy) / ey, 1e-6);
          px = sx * k;
          py = sy * k;
        }
        p.el.classList.toggle('off', !inside);
        p.el.style.transform = `translate3d(${((px + 1) * W) / 2}px, ${((py + 1) * H) / 2}px, 0)`;
        if (!inside) p.arrow.style.transform = `rotate(${Math.atan2(sy, sx)}rad)`;
      }
    };

    const refreshPanel = () => {
      const { fires, ruins } = ctx.city.steward;
      panel.classList.toggle('hidden', !fires.length);
      if (!fires.length) return rows.clear();
      const idle = fires.filter((f) => !f.crew).length;
      setText(
        title,
        `${fires.length} fire${fires.length === 1 ? '' : 's'} burning${ruins.length ? ` · ${ruins.length} ruin${ruins.length === 1 ? '' : 's'}` : ''}`,
      );
      setText(allBtn, idle > 1 ? `Dispatch all · ◈${idle * RESPONSE_COST}` : '');
      allBtn.classList.toggle('hidden', idle < 2);
      for (const f of fires) {
        let r = rows.get(f.id);
        if (!r) {
          const eid = eidOfUid(ctx.city, f.uid);
          const name = eid >= 0 ? ctx.city.buildingDef(eid).name : 'Building';
          const bar = h('i');
          const state = h('span', { class: 'hz-state' });
          const btn = h(
            'button',
            { class: 'hz-btn', onClick: () => ctx.commands.execute('respond', { id: f.id }) },
            `Dispatch · ◈${RESPONSE_COST}`,
          ) as HTMLButtonElement;
          const el = h(
            'div',
            { class: 'hz-row' },
            h(
              'button',
              { class: 'hz-go', title: 'Show it', onClick: () => ctx.cameraCtl.flyTo(f.x, f.z, 32) },
              icon('locate'),
            ),
            h(
              'div',
              { class: 'hz-what' },
              h('b', {}, `🔥 ${name}`),
              h('span', {}, ctx.city.districtAt(Math.floor(f.x), Math.floor(f.z)) ?? 'Outskirts'),
              h('div', { class: 'hz-bar' }, bar),
            ),
            state,
            btn,
          );
          r = { el, bar, state, btn };
          rows.set(f.id, r);
        }
        r.bar.style.width = `${Math.round(f.intensity * 100)}%`;
        setText(r.state, f.crew ? 'Crews on it' : f.cause === 'spread' ? 'Spreading' : f.cause);
        r.btn.classList.toggle('hidden', f.crew);
      }
      for (const [id] of rows) if (!fires.some((f) => f.id === id)) rows.delete(id);
      list.replaceChildren(...[...rows.values()].map((r) => r.el));
    };

    // ── Per frame: flames, smoke, bolt, shake ───────────────────────────────
    const m = new Matrix4();
    const q = new Quaternion();
    const v = new Vector3();
    const sc = new Vector3();
    const shakeOff = new Vector3();
    ctx.systems.add({
      id: 'hazards.fx',
      // Sync, not render: after the camera update (input) so the quake shake lands in this frame's picture.
      phase: 'sync',
      order: 50,
      update(_c, f) {
        const st = ctx.city.steward;
        const t = U.clock.value;
        let nf = 0;
        let ns = 0;
        for (const fire of st.fires) {
          const s = spot(fire.uid);
          if (!s) continue;
          const k = Math.max(0.15, fire.intensity);
          for (let i = 0; i < FLAMES && nf < CAP; i++) {
            // Tongues spread over the roof (golden-angle spiral), flickering in height more than width.
            const a = i * 2.4 + fire.id;
            const rr = Math.sqrt((i + 0.5) / FLAMES) * 0.4;
            const flick = 0.6 + 0.4 * Math.sin(t * 11 + i * 1.7 + fire.id) * Math.sin(t * 7.3 + i);
            v.set(
              s.x + Math.cos(a) * s.w * rr,
              s.y + s.h * (0.55 + 0.1 * (i % 3)),
              s.z + Math.sin(a) * s.d * rr,
            );
            q.setFromAxisAngle(sc.set(0, 1, 0), a + t * 0.5);
            const size = (0.25 + 0.45 * k) * Math.min(1.3, 0.45 + 0.07 * (s.w + s.d));
            flames.setMatrixAt(nf++, m.compose(v, q, sc.set(size, size * (0.8 + 1.2 * flick), size)));
          }
          for (let i = 0; i < PUFFS && ns < CAP; i++) {
            const p = (t * 0.22 + i / PUFFS + fire.id * 0.13) % 1;
            v.set(s.x + p * 3 + Math.sin(i * 3.1) * 0.4, s.y + s.h * 0.6 + p * (5 + 9 * k), s.z + p * 1.2);
            const size = (0.4 + 1.8 * p) * (0.45 + 0.55 * k) * (1 - 0.35 * p);
            smoke.setMatrixAt(ns++, m.compose(v, q.identity(), sc.setScalar(size)));
          }
        }
        for (const uid of st.ruins) {
          const s = spot(uid);
          if (!s) continue;
          for (let i = 0; i < RUIN_PUFFS && ns < CAP; i++) {
            const p = (t * 0.12 + i / RUIN_PUFFS + uid * 0.07) % 1;
            v.set(s.x + p * 1.5, s.y + 0.3 + p * 6, s.z);
            smoke.setMatrixAt(ns++, m.compose(v, q.identity(), sc.setScalar(0.3 + 0.9 * p)));
          }
        }
        // Beacons: thin up close (the flames speak for themselves), a wide beam from the island view.
        const dist = ctx.cameraCtl.distance;
        let nb = 0;
        let nr = 0;
        for (const fire of st.fires) {
          const s = spot(fire.uid);
          if (!s || nb >= BEACONS) continue;
          const pulse = 0.85 + 0.15 * Math.sin(t * 6 + fire.id);
          const bw = Math.max(0.35, dist * 0.007) * pulse;
          const bh = s.h + 18 + dist * 0.35;
          v.set(s.x, s.y + s.h * 0.4, s.z);
          beams.setMatrixAt(nb++, m.compose(v, q.identity(), sc.set(bw, bh, bw)));
          const base = Math.max(s.w, s.d) * 0.7 + 0.6;
          const minR = dist * 0.02;
          for (let k = 0; k < 2; k++) {
            const p = (t * 0.6 + k * 0.5 + fire.id * 0.17) % 1;
            const r = Math.max(base, minR) * (1 + 1.6 * p);
            // No alpha on the scenery material: the ring sinks into the ground at the end of each sweep.
            v.set(s.x, s.y + 0.25 - Math.max(0, p - 0.7) * r * 0.4, s.z);
            rings.setMatrixAt(nr++, m.compose(v, q.identity(), sc.setScalar(r)));
          }
        }
        flames.count = nf;
        smoke.count = ns;
        beams.count = nb;
        rings.count = nr;
        flames.visible = nf > 0;
        smoke.visible = ns > 0;
        beams.visible = nb > 0;
        rings.visible = nr > 0;
        if (nf) flames.instanceMatrix.needsUpdate = true;
        if (ns) smoke.instanceMatrix.needsUpdate = true;
        if (nb) beams.instanceMatrix.needsUpdate = true;
        if (nr) rings.instanceMatrix.needsUpdate = true;
        if (st.fires.length || pins[0]!.id !== -1) placePins(st.fires.length);
        if (started.length) flushStarted();
        if (bolt && performance.now() > boltUntil) {
          ctx.scene.remove(bolt);
          bolt.geometry.dispose();
          bolt = null;
        } else if (bolt) bolt.visible = Math.sin(performance.now() * 0.08) > -0.3;

        // Earthquake: jitter the camera after the city camera has placed it (scaled by zoom).
        const shake = st.modifiers.shake;
        if (shake > 0.01 && ctx.cameraCtl.enabled) {
          const amp = shake * 0.006 * ctx.cameraCtl.distance;
          shakeOff
            .set(
              Math.sin(t * 37) + Math.sin(t * 61) * 0.5,
              Math.sin(t * 43) * 0.6,
              Math.cos(t * 53) + Math.sin(t * 29) * 0.4,
            )
            .multiplyScalar(amp);
          ctx.camera.position.add(shakeOff);
          ctx.cameraCtl.externalMotion = true;
        } else if (ctx.cameraCtl.externalMotion && ctx.cameraCtl.enabled)
          ctx.cameraCtl.externalMotion = false;

        timer += f.dt;
        if (timer > 0.25) {
          timer = 0;
          refreshPanel();
        }
      },
    });
  },
};
