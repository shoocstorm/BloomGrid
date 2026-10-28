import {
  BoxGeometry,
  ConeGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
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
import './hazards.css';

/** Flame and smoke instances per fire (scaled by intensity), and smoke for each ruin. */
const FLAMES = 8;
const PUFFS = 7;
const RUIN_PUFFS = 3;
/** Instanced capacity ≤ 1024 (UBO): these re-pose every frame anyway. */
const CAP = 1000;

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
 */
export const hazardsModule: GameModule = {
  id: 'hazards',
  deps: ['world', 'construction', 'hud', 'crises', 'dashboard'],
  init(ctx) {
    const mat = getMaterial('scenery');
    const flames = new InstancedMesh(flameGeometry(), mat, CAP);
    const smoke = new InstancedMesh(puffGeometry(), mat, CAP);
    for (const m of [flames, smoke]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      m.name = 'hazards';
    }
    ctx.scene.add(flames, smoke);
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
        });
    });
    ctx.bus.on('quake:shock', ({ x, z, magnitude, aftershock }) => {
      const where = ctx.city.districtAt(Math.floor(x), Math.floor(z)) ?? 'the outskirts';
      ctx.bus.emit('toast', {
        text: `${aftershock ? 'Aftershock' : '🌋 Earthquake'} · magnitude ${magnitude.toFixed(1)} near ${where}`,
        tone: 'bad',
      });
    });
    ctx.bus.on('building:ruined', ({ eid, cause }) =>
      ctx.bus.emit('toast', {
        text: `${ctx.city.buildingDef(eid).name} was ${cause === 'fire' ? 'burned out' : 'shaken down'}: a ruin now`,
        tone: 'bad',
      }),
    );

    // ── Fire panel ───────────────────────────────────────────────────────────
    const list = h('div', { class: 'hz-list' });
    const title = h('b');
    const allBtn = h('button', { class: 'hz-btn', onClick: () => ctx.commands.execute('respond', {}) }, '');
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
      h('header', {}, h('span', { class: 'hz-dot' }), title, allBtn, logBtn),
      list,
    );
    (document.querySelector('.crisis-wrap') ?? ctx.hud).append(panel);
    const rows = new Map<
      number,
      { el: HTMLElement; bar: HTMLElement; state: HTMLElement; btn: HTMLButtonElement }
    >();
    let timer = 0;
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
              '⌖',
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
        flames.count = nf;
        smoke.count = ns;
        flames.visible = nf > 0;
        smoke.visible = ns > 0;
        if (nf) flames.instanceMatrix.needsUpdate = true;
        if (ns) smoke.instanceMatrix.needsUpdate = true;
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
