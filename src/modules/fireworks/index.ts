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
import { MIN_SHELLS, launchBlocker, stockTotal, storage } from '@/sim/fireworks';
import type { FireworkKind } from '@/sim/fireworksState';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import './fireworks.css';

/** Particle ring buffer (≥ 1040 keeps matrices out of a UBO; static buffers, update ranges only). */
const CAP = 6144;
/** Burst height above the launch yard (world units) and launch scatter (tiles). */
const HEIGHT = [34, 56] as const;
const SCATTER = 5;

interface KindLook {
  sparks: number;
  speed: number;
  drag: number;
  gravity: number;
  life: number;
  size: number;
  /** Delayed copies along the same path: a trail behind each spark. */
  trail: number;
  crackle: number;
  colors: readonly number[];
  /** Directions: a sphere, a tilted ring, or a few heavy comets thrown upward. */
  shape: 'sphere' | 'ring' | 'comets';
}

const LOOKS: Record<FireworkKind, KindLook> = {
  peony: {
    sparks: 70,
    speed: 24,
    drag: 1.6,
    gravity: 3,
    life: 1.9,
    size: 0.3,
    trail: 1,
    crackle: 0,
    colors: [0xff5a8a, 0x5ff2da, 0xb98cff, 0xff9a3a, 0xb8ff6a],
    shape: 'sphere',
  },
  willow: {
    sparks: 56,
    speed: 17,
    drag: 1.3,
    gravity: 6,
    life: 3.4,
    size: 0.22,
    trail: 3,
    crackle: 0,
    colors: [0xffc860, 0xffb347],
    shape: 'sphere',
  },
  ring: {
    sparks: 54,
    speed: 26,
    drag: 1.8,
    gravity: 1.6,
    life: 1.7,
    size: 0.3,
    trail: 1,
    crackle: 0,
    colors: [0x7ff7e6, 0xff7ac8, 0xffe08a],
    shape: 'ring',
  },
  palm: {
    sparks: 10,
    speed: 22,
    drag: 0.9,
    gravity: 7,
    life: 2.4,
    size: 0.5,
    trail: 5,
    crackle: 0,
    colors: [0xffb347, 0xff6a4a, 0xffe08a],
    shape: 'comets',
  },
  crackle: {
    sparks: 46,
    speed: 15,
    drag: 1.4,
    gravity: 3,
    life: 1.4,
    size: 0.32,
    trail: 0,
    crackle: 1,
    colors: [0xfff4e0, 0xffe6a0],
    shape: 'sphere',
  },
};
const ROCKET_RISE = 1.3;
const TRAIL_GAP = 0.05;

interface Pending {
  kind: FireworkKind;
  at: number;
  x: number;
  z: number;
}

/**
 * Fireworks (D-068): the sim decides when shells go up (`fireworks:volley`, once per pulse); this module spreads
 * each volley over the next second and draws every rocket, burst and trail as particles in one instanced mesh.
 * A particle is written once, at launch, with its origin, start time, velocity and look; the shader flies it
 * from `U.clock` (see the `firework` material), so per frame the CPU does nothing unless shells launch, and the
 * mesh draws nothing between shows. Also: the top-bar launch button with the stock count, and show toasts.
 * Nothing casts shadows.
 */
export const fireworksModule: GameModule = {
  id: 'fireworks',
  deps: ['world', 'hud'],
  init(ctx) {
    const geo = new OctahedronGeometry(1, 0);
    geo.deleteAttribute('uv');
    const burst = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    const vel = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    const look = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    // Every slot starts dead (life < 0).
    for (let i = 0; i < CAP; i++) vel.array[i * 4 + 3] = -1;
    geo.setAttribute('aBurst', burst);
    geo.setAttribute('aVel', vel);
    geo.setAttribute('aLook', look);
    const mesh = new InstancedMesh(geo, getMaterial('firework'), CAP);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = 'fireworks';
    // Visible until the first frame, so the boot warm-up compiles the material; hidden between shows after.
    ctx.scene.add(mesh);
    const colors = mesh.instanceColor;
    const attrs: BufferAttribute[] = [burst, vel, look, colors];

    let head = 0;
    let dirtyFrom = -1;
    let dirtyCount = 0;
    /** Clock time when the last particle dies. */
    let liveUntil = 0;
    const col = new Color();
    const write = (
      ox: number,
      oy: number,
      oz: number,
      t0: number,
      vx: number,
      vy: number,
      vz: number,
      life: number,
      drag: number,
      gravity: number,
      size: number,
      crackle: number,
      hex: number,
      dim = 1,
    ) => {
      const i = head;
      head = (head + 1) % CAP;
      if (dirtyFrom < 0) dirtyFrom = i;
      dirtyCount = Math.min(CAP, dirtyCount + 1);
      const j = i * 4;
      burst.array[j] = ox;
      burst.array[j + 1] = oy;
      burst.array[j + 2] = oz;
      burst.array[j + 3] = t0;
      vel.array[j] = vx;
      vel.array[j + 1] = vy;
      vel.array[j + 2] = vz;
      vel.array[j + 3] = life;
      look.array[j] = drag;
      look.array[j + 1] = gravity;
      look.array[j + 2] = size;
      look.array[j + 3] = crackle;
      col
        .setHex(hex)
        .multiplyScalar(dim)
        .toArray(colors.array as Float32Array, i * 3);
      liveUntil = Math.max(liveUntil, t0 + life);
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

    /** A rocket from the yard, then its burst at the top: every particle written now, timed by the shader. */
    const launch = (p: Pending, now: number) => {
      const L = LOOKS[p.kind];
      const gx = p.x + (Math.random() * 2 - 1) * SCATTER;
      const gz = p.z + (Math.random() * 2 - 1) * SCATTER;
      const gy = ctx.city.grid.heightAt(gx, gz) + 0.6;
      const bx = gx + (Math.random() * 2 - 1) * 6;
      const bz = gz + (Math.random() * 2 - 1) * 6;
      const by = gy + HEIGHT[0] + Math.random() * (HEIGHT[1] - HEIGHT[0]);
      const rise = ROCKET_RISE * (0.85 + Math.random() * 0.3);
      for (let t = 0; t < 4; t++)
        write(
          gx,
          gy,
          gz,
          now + t * TRAIL_GAP,
          (bx - gx) / rise,
          (by - gy) / rise,
          (bz - gz) / rise,
          rise - t * TRAIL_GAP,
          0,
          0,
          0.35 - t * 0.06,
          0,
          0xffe0b0,
          1 - t * 0.2,
        );
      const t0 = now + rise;
      const hex = L.colors[Math.floor(Math.random() * L.colors.length)]!;
      // Ring plane: a random tilt.
      const tilt = Math.random() * 1.2;
      const spin = Math.random() * Math.PI * 2;
      for (let s = 0; s < L.sparks; s++) {
        let dx: number, dy: number, dz: number;
        if (L.shape === 'ring') {
          const a = (s / L.sparks) * Math.PI * 2;
          const cx = Math.cos(a);
          const cz = Math.sin(a);
          dx = cx * Math.cos(spin) - cz * Math.sin(spin) * Math.cos(tilt);
          dz = cx * Math.sin(spin) + cz * Math.cos(spin) * Math.cos(tilt);
          dy = cz * Math.sin(tilt);
        } else {
          // Even spread on a sphere (golden spiral), jittered; comets lean upward.
          const yy =
            L.shape === 'comets' ? 0.15 + 0.85 * ((s + 0.5) / L.sparks) : 1 - (2 * (s + 0.5)) / L.sparks;
          const r = Math.sqrt(Math.max(0, 1 - yy * yy));
          const a = s * 2.39996 + Math.random() * 0.3;
          dx = Math.cos(a) * r;
          dz = Math.sin(a) * r;
          dy = yy;
        }
        const sp = L.speed * (0.85 + Math.random() * 0.3);
        const life = L.life * (0.85 + Math.random() * 0.3);
        const c = s % 7 === 0 && L.colors.length > 1 ? L.colors[(s >> 3) % L.colors.length]! : hex;
        for (let t = 0; t <= L.trail; t++)
          write(
            bx,
            by,
            bz,
            t0 + t * TRAIL_GAP,
            dx * sp,
            dy * sp,
            dz * sp,
            life - t * TRAIL_GAP,
            L.drag,
            L.gravity,
            L.size * (1 - t * 0.14),
            L.crackle,
            c,
            1 - t * 0.16,
          );
      }
    };

    const pending: Pending[] = [];
    ctx.bus.on('fireworks:volley', ({ show, kinds, finale }) => {
      const now = U.clock.value;
      // Spread the volley over the next pulse (one sim second, shorter at speed), the finale denser.
      const span = (finale ? 0.7 : 1) / Math.max(1, ctx.engine.speed);
      kinds.forEach((kind, i) =>
        pending.push({
          kind,
          at: now + ((i + Math.random() * 0.6) / kinds.length) * span,
          x: show.x,
          z: show.z,
        }),
      );
    });
    const where = (x: number, z: number) =>
      ctx.city.districtAt(Math.floor(x), Math.floor(z)) ?? 'the outskirts';
    ctx.bus.on('fireworks:start', ({ show }) =>
      ctx.bus.emit('toast', {
        text: `🎆 ${show.grand ? 'Grand fireworks' : 'Fireworks'} over ${where(show.x, show.z)} · ${show.shells} shells`,
        tone: 'ok',
        at: { x: show.x, z: show.z },
      }),
    );
    ctx.bus.on('city:reset', () => {
      pending.length = 0;
      for (let i = 0; i < CAP; i++) vel.array[i * 4 + 3] = -1;
      dirtyFrom = 0;
      dirtyCount = CAP;
      liveUntil = 0;
    });

    // ── Top-bar button: launch a show now (shift-click for a grand one), with the shells in stock ──
    const count = h('span', { class: 'l' });
    const btn = h(
      'button',
      {
        class: 'fw-btn',
        title: 'Launch a fireworks show (shift-click: grand show)',
        'aria-label': 'Launch a fireworks show',
        onClick: (e: MouseEvent) => {
          const why = launchBlocker(ctx.city);
          if (why) return ctx.bus.emit('toast', { text: why, tone: 'info' });
          ctx.commands.execute('launchFireworks', { grand: e.shiftKey });
        },
      },
      h('span', { class: 'g' }, icon('fireworks')),
      count,
    ) as HTMLButtonElement;
    ctx.services.get('hud').stats.prepend(btn);
    let timer = 1;
    let last = '';
    // Factory storage only changes when buildings do.
    let cap = -1;
    for (const ev of ['building:added', 'building:removed', 'city:reset'] as const) ctx.bus.on(ev, () => (cap = -1));
    const refreshButton = () => {
      const fw = ctx.city.fireworks;
      const n = stockTotal(fw.stock);
      if (cap < 0) cap = storage(ctx.city);
      const state = `${n}|${cap}|${fw.show ? 1 : 0}`;
      if (state === last) return;
      last = state;
      btn.classList.toggle('live', !!fw.show);
      btn.classList.toggle('low', n < MIN_SHELLS);
      setText(count, String(n));
      btn.title = cap
        ? `Fireworks: ${n} of ${cap} shells. ${fw.show ? 'A show is in the sky.' : 'Click to launch a show, shift-click for a grand one.'}`
        : 'Fireworks: build a Fireworks Factory (Industry) to make shells and put on shows.';
    };

    let warmed = false;
    ctx.systems.add({
      id: 'fireworks',
      phase: 'sync',
      order: 120,
      update(c, f) {
        const now = U.clock.value;
        for (let i = pending.length - 1; i >= 0; i--)
          if (pending[i]!.at <= now) {
            launch(pending[i]!, now);
            pending.splice(i, 1);
          }
        flush();
        U.sparkScale.value = Math.min(6, Math.max(1, c.cameraCtl.distance / 140));
        // Draw only while a particle lives (after the warm-up frame).
        mesh.visible = !warmed || pending.length > 0 || now < liveUntil;
        warmed = true;
        timer += f.dt;
        if (timer >= 0.5) {
          timer = 0;
          refreshButton();
        }
      },
    });
  },
};
