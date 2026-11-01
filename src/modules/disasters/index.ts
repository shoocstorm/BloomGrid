import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three/webgpu';
import { color, float, mix, positionGeometry, sin, smoothstep, uv } from 'three/tsl';
import type { GameModule } from '@/game/context';
import { Building, Service } from '@/ecs/components';
import { getMaterial } from '@/render/materials/library';
import { U } from '@/render/uniforms';
import { EVACUATE_COST, GATES_COST, evacuateBlocker, gatesBlocker } from '@/sim/disasters';
import { getCrisis } from '@/sim/crises';
import { PULSE_TICKS } from '@/sim/pulseConst';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import './disasters.css';

const DEBRIS = 90;
const FUNNEL_H = 46;

/**
 * Tornado and tsunami visuals and the Prepare panel (Phase 21, D-076). The tornado is a translucent funnel whose
 * bands swirl (shader on `U.clock`) and a cloud of debris orbiting its foot, following the sim's track smoothly; the
 * tsunami is a ring of foam spreading from its offshore origin at ~10 tiles/s (the sea itself rises with the flood
 * level, see crises/Weather). While either is forecast or active, a panel counts down and offers the steward's
 * options: evacuate, close the Tide Gates, feather the wind turbines. Nothing casts shadows; meshes hide when idle.
 */
export const disastersModule: GameModule = {
  id: 'disasters',
  deps: ['world', 'hud', 'crises'],
  init(ctx) {
    const { city } = ctx;
    // ── Tornado ──
    const funnelMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    {
      const g = uv();
      const band = sin(
        g.x
          .mul(6.283 * 5)
          .add(g.y.mul(14))
          .sub(U.clock.mul(9)),
      )
        .mul(0.5)
        .add(0.5);
      const fade = smoothstep(1, 0.75, g.y).mul(smoothstep(0, 0.08, g.y));
      funnelMat.colorNode = mix(color(0x3f4849), color(0x9aa6a3), band.mul(0.6).add(g.y.mul(0.3)));
      funnelMat.opacityNode = float(0.55).add(band.mul(0.35)).mul(fade);
    }
    const funnel = new Mesh(new CylinderGeometry(1, 0.16, 1, 32, 10, true).translate(0, 0.5, 0), funnelMat);
    funnel.visible = false;
    funnel.frustumCulled = false;
    funnel.renderOrder = 8;
    funnel.name = 'tornado';
    const debris = new InstancedMesh(new BoxGeometry(0.5, 0.25, 0.4), getMaterial('scenery'), DEBRIS);
    debris.count = 0;
    debris.frustumCulled = false;
    debris.name = 'tornado-debris';
    // ── Tsunami ──
    const crestMat = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    crestMat.colorNode = color(0xe8fbff);
    crestMat.opacityNode = smoothstep(0.0, 1.0, positionGeometry.y.add(0.6)).mul(0.6);
    const crest = new Mesh(new TorusGeometry(1, 0.02, 6, 256).rotateX(Math.PI / 2), crestMat);
    crest.visible = false;
    crest.frustumCulled = false;
    crest.name = 'tsunami-crest';
    ctx.scene.add(funnel, debris, crest);

    const pos = new Vector3();
    const _m = new Matrix4();
    const _q = new Quaternion();
    const _s = new Vector3();
    const _v = new Vector3();
    const up = new Vector3(0, 1, 0);

    // ── Prepare panel ──
    const title = h('b');
    const when = h('span', { class: 'ds-when' });
    const evac = h(
      'button',
      { class: 'ds-btn', onClick: () => ctx.commands.execute('evacuate', {}) },
      icon('people'),
      ` Evacuate ◈${EVACUATE_COST}`,
    ) as HTMLButtonElement;
    const gates = h(
      'button',
      { class: 'ds-btn', onClick: () => ctx.commands.execute('closeTideGates', {}) },
      icon('wave'),
      ` Close Tide Gates ◈${GATES_COST}`,
    ) as HTMLButtonElement;
    const feather = h(
      'button',
      {
        class: 'ds-btn',
        onClick: () => {
          for (const e of city.buildingEntities())
            if (city.buildingDef(e).id === 'wind-turbine' && !Service.off[e])
              ctx.commands.execute('toggleBuilding', { x: Building.x[e]!, z: Building.z[e]!, off: true });
        },
      },
      icon('energy'),
      ' Feather turbines',
    ) as HTMLButtonElement;
    const tip = h('p', { class: 'ds-tip' });
    const panel = h(
      'section',
      { class: 'ds-panel panel holo hidden' },
      h('header', {}, h('span', { class: 'ds-dot' }), title, when),
      tip,
      h('div', { class: 'ds-acts' }, evac, gates, feather),
    );
    (document.querySelector('.crisis-wrap') ?? ctx.hud).append(panel);
    let ui = 0;

    ctx.systems.add({
      id: 'disasters',
      phase: 'sync',
      order: 30,
      update(_c, f) {
        const crises = city.steward.crises;
        const tornado = crises.find((c) => c.def === 'tornado' && c.phase === 'active' && c.x !== undefined);
        const tsunami = crises.find((c) => c.def === 'tsunami' && c.phase === 'active' && c.x !== undefined);
        const t = U.clock.value;
        // Tornado: follow the sim's track smoothly; height and width breathe with its strength.
        funnel.visible = !!tornado;
        if (tornado) {
          const k = (city.tick - tornado.startTick) / Math.max(1, tornado.endTick - tornado.startTick);
          const env = Math.sin(Math.PI * Math.min(1, Math.max(0, k)));
          const tx = tornado.x! + tornado.vx! * 0.5;
          const tz = tornado.z! + tornado.vz! * 0.5;
          if (pos.lengthSq() === 0) pos.set(tx, 0, tz);
          pos.x += (tx - pos.x) * Math.min(1, f.dt * 2);
          pos.z += (tz - pos.z) * Math.min(1, f.dt * 2);
          const ground = Math.max(0, city.grid.heightAt(pos.x, pos.z));
          const w = 5 + 4 * tornado.severity;
          funnel.position.set(pos.x, ground, pos.z);
          funnel.scale.set(w * (0.5 + 0.5 * env), FUNNEL_H * (0.4 + 0.6 * env), w * (0.5 + 0.5 * env));
          funnel.rotation.y = t * 1.5;
          for (let i = 0; i < DEBRIS; i++) {
            const a = t * (2.5 + (i % 7) * 0.3) + i * 2.399;
            const hgt = ((i * 0.618) % 1) * 18 * env;
            const r = 1.2 + (hgt / 18) * 4 + (i % 3) * 0.4;
            _q.setFromAxisAngle(up, a * 3 + i);
            debris.setMatrixAt(
              i,
              _m.compose(
                _v.set(pos.x + Math.cos(a) * r, ground + 0.5 + hgt, pos.z + Math.sin(a) * r),
                _q,
                _s.setScalar(0.6 + (i % 5) * 0.25),
              ),
            );
          }
          debris.count = DEBRIS;
          debris.instanceMatrix.needsUpdate = true;
        } else {
          pos.set(0, 0, 0);
          debris.count = 0;
        }
        // Tsunami: a foam ring spreading from the offshore origin, at the risen water's height.
        crest.visible = !!tsunami;
        if (tsunami) {
          const secs = (city.tick - tsunami.startTick) / PULSE_TICKS;
          const r = Math.max(1, secs * 10);
          crest.position.set(tsunami.x!, city.steward.modifiers.surge * 0.3 + 0.15, tsunami.z!);
          crest.scale.set(r, 6 + 4 * tsunami.severity, r);
        }

        // Prepare panel, 4 Hz.
        if ((ui += f.dt) < 0.25) return;
        ui = 0;
        const threat = crises.find((c) => c.def === 'tornado' || c.def === 'tsunami');
        panel.classList.toggle('hidden', !threat);
        if (!threat) return;
        const d = getCrisis(threat.def);
        const secs = Math.max(
          0,
          Math.round((threat.phase === 'forecast' ? threat.startTick : threat.endTick) - city.tick) /
            PULSE_TICKS,
        );
        setText(title, `${d.icon} ${d.name}${threat.phase === 'forecast' ? ' warning' : ' now'}`);
        setText(
          when,
          threat.phase === 'forecast' ? `arrives in ${Math.round(secs)} s` : `${Math.round(secs)} s left`,
        );
        setText(tip, d.prep);
        const ev = evacuateBlocker(city);
        evac.disabled = !!ev;
        evac.title = ev ?? 'Sound the siren: residents take cover or leave (70% fewer caught in ruins)';
        evac.classList.toggle('done', !!threat.evacuated);
        gates.classList.toggle('hidden', threat.def !== 'tsunami');
        const gb = gatesBlocker(city);
        gates.disabled = !!gb;
        gates.title = gb ?? 'Close the great Tide Gates: the surge is 40% lower';
        gates.classList.toggle('done', !!threat.gates);
        const spinning = city
          .buildingEntities()
          .some((e) => city.buildingDef(e).id === 'wind-turbine' && !Service.off[e]);
        feather.classList.toggle('hidden', threat.def !== 'tornado');
        feather.disabled = !spinning;
        feather.title = spinning
          ? 'Turn every wind turbine out of the wind: no power for now, far less damage'
          : 'Every turbine is feathered';
      },
    });
    ctx.bus.on('crisis:forecast', ({ crisis }) => {
      if (crisis.def !== 'tornado' && crisis.def !== 'tsunami') return;
      const secs = Math.round((crisis.startTick - city.tick) / PULSE_TICKS);
      ctx.bus.emit('toast', {
        text: `${getCrisis(crisis.def).icon} ${getCrisis(crisis.def).name} warning: ${secs} s to prepare`,
        tone: 'bad',
      });
    });
  },
};
