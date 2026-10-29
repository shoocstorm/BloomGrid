import { CapsuleGeometry, BoxGeometry, Group, MathUtils, Mesh, MeshStandardNodeMaterial, Vector3 } from 'three/webgpu';
import { color } from 'three/tsl';
import type { GameModule } from '@/game/context';
import { U } from '@/render/uniforms';
import { h, setText } from '@/ui/dom';
import { STEP, createCollider } from './collider';
import './explore.css';

export type ExploreMode = 'city' | 'walk' | 'board' | 'drone' | 'follow' | 'train';
const CYCLE: ExploreMode[] = ['city', 'walk', 'board', 'drone', 'follow', 'train'];
const LABELS: Record<ExploreMode, string> = { city: 'City view', walk: 'Walk', board: 'Hoverboard', drone: 'Drone', follow: 'Ride a pod', train: 'Aeroline' };
const MENU: Record<ExploreMode, [glyph: string, note: string]> = {
  city: ['◇', 'Steward’s overview: build and manage'],
  walk: ['⚲', 'First person on the streets'],
  board: ['≈', 'Glide along the living highways'],
  drone: ['✦', 'Free flight over the island'],
  follow: ['⇶', 'Ride a pod along the sky-lanes'],
  train: ['═', 'Ride the Aeroline maglev loop'],
};
const HINTS: Record<ExploreMode, string> = {
  city: '',
  walk: 'WASD walk · Shift run · Space jump · drag or click-to-lock to look · N next mode · Esc city view',
  board: 'WASD ride · Shift boost · Space hop · glides over water · N next mode · Esc city view',
  drone: 'WASD fly · E up · Q down · Shift fast · N next mode · Esc city view',
  follow: 'Riding a commuter pod along its sky-lane · Tab next pod · drag to look · Esc city view',
  train: 'Riding the Aeroline maglev round the island · Tab next train · drag to look · Esc city view',
};

/** Player scale in world units (1 tile ≈ 11 m; a storey is 0.32). */
const EYE = 0.17;
const GRAVITY = 6;


/**
 * Explore modes (Phase 11): first-person walking, a third-person hoverboard, free drone flight
 * and a follow-cam that rides commuter pods along their sky-lanes; plus photo mode (J). A small
 * kinematic controller collides with the terrain, water, bridge decks and building volumes
 * (solid bounds from the cached recipe templates, so parks and plazas stay walkable). While
 * exploring, `cameraCtl.target` / `distance` track the player, so shadows, fog, pollen and agents
 * focus around them: the high-detail zone follows the player for free (D-025).
 */
export const exploreModule: GameModule = {
  id: 'explore',
  deps: ['world', 'construction', 'hud'],
  init(ctx) {
    const { camera, cameraCtl, city, input } = ctx;
    let mode: ExploreMode = 'city';
    const pos = new Vector3();
    const vel = new Vector3();
    let yaw = 0;
    let pitch = 0;
    let grounded = true;
    let followIdx = 0;
    const eye = new Vector3();
    const ahead = new Vector3();
    let savedView = cameraCtl.getView();
    let photo = false;
    let photoSpeed = 1;
    let capture = false;

    // ── Collision ──────────────────────────────────────────────────────────────
    const collider = createCollider(city);
    for (const ev of ['building:added', 'building:removed', 'city:reset', 'terrain:changed'] as const) ctx.bus.on(ev, () => collider.clear());
    const g = () => city.grid;
    const groundAt = (x: number, z: number, feet: number) => collider.groundAt(x, z, feet);
    /** Moves with per-axis sliding against walls. */
    const slide = (dx: number, dz: number, feet: number, swim: boolean) => {
      const w = U.waterLevel.value;
      if (!collider.blocked(pos.x + dx, pos.z, feet, swim, w)) pos.x += dx;
      else vel.x *= -0.2;
      if (!collider.blocked(pos.x, pos.z + dz, feet, swim, w)) pos.z += dz;
      else vel.z *= -0.2;
    };

    // ── Hoverboard avatar (third person) ───────────────────────────────────────
    const avatar = new Group();
    const body = new Mesh(new CapsuleGeometry(0.03, 0.08, 3, 8), new MeshStandardNodeMaterial({ roughness: 0.6 }));
    (body.material as MeshStandardNodeMaterial).colorNode = color(0xf3efe4);
    body.position.y = 0.09;
    const board = new Mesh(new BoxGeometry(0.2, 0.012, 0.07), new MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.3 }));
    (board.material as MeshStandardNodeMaterial).colorNode = color(0x2f6f78);
    (board.material as MeshStandardNodeMaterial).emissiveNode = color(0x7ff7e6).mul(U.night.mul(1.2).add(0.4));
    board.position.y = 0.01;
    avatar.add(body, board);
    avatar.visible = false;
    avatar.traverse((o) => ((o as Mesh).castShadow = true));
    ctx.scene.add(avatar);

    // ── HUD ───────────────────────────────────────────────────────────────────
    // A view-mode dropdown in the top bar's actions (the top bar is the one HUD part kept while exploring).
    // The menu hangs off the top bar itself: the actions panel's chamfer clip-path would cut it off.
    const buttons = new Map<ExploreMode, HTMLElement>();
    const dropGlyph = h('span', { class: 'g' }, MENU.city[0]);
    const dropLabel = h('span', { class: 'l' }, LABELS.city);
    const drop = h('button', { class: 'icon-btn xp-drop', title: 'View mode (N cycles · J photo)', 'aria-haspopup': 'menu', onClick: () => openMenu(menu.classList.contains('hidden')) }, dropGlyph, dropLabel, h('span', { class: 'caret' }, '▾'));
    const item = (glyph: string, label: string, note: string, key: string, onClick: () => void) =>
      h('button', { class: 'xp-item', role: 'menuitem', onClick: () => (openMenu(false), onClick()) }, h('span', { class: 'g' }, glyph), h('span', { class: 'xp-t' }, h('b', {}, label), h('i', {}, note)), h('kbd', {}, key));
    const menu = h('div', { class: 'xp-menu panel hidden', role: 'menu' }, h('div', { class: 'xp-h' }, 'View mode'));
    for (const m of CYCLE) {
      const b = item(MENU[m][0], LABELS[m], MENU[m][1], m === 'city' ? 'Esc' : 'N', () => setMode(m));
      buttons.set(m, b);
      menu.append(b);
    }
    menu.append(h('div', { class: 'xp-sep' }), item('◉', 'Photo mode', 'Frame a shot, P saves a PNG', 'J', () => setPhoto(!photo)));
    buttons.get('city')!.classList.add('on');
    const actions = ctx.services.get('hud').actions;
    actions.append(drop);
    actions.parentElement!.append(menu);
    function openMenu(open: boolean): void {
      menu.classList.toggle('hidden', !open);
      drop.classList.toggle('on', open);
      if (!open) return;
      const r = drop.getBoundingClientRect();
      const top = actions.parentElement!.getBoundingClientRect();
      menu.style.top = `${r.bottom - top.top + 6}px`;
      menu.style.right = `${top.right - r.right}px`;
    }
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Node;
      if (!menu.classList.contains('hidden') && !menu.contains(t) && !drop.contains(t)) openMenu(false);
    });
    const hint = h('div', { class: 'explore-hint hidden' });
    const cross = h('div', { class: 'explore-cross hidden' });
    const photoUi = h('div', { class: 'photo-ui hidden' }, h('div', { class: 'photo-bar top' }), h('div', { class: 'photo-bar bottom' }), h('div', { class: 'photo-hint' }, 'Photo mode · drag to look · P save PNG · J exit'));
    document.body.append(hint, cross, photoUi);
    const hud = document.getElementById('hud');

    const spawnNear = (x: number, z: number) => {
      // Nearest highway tile: a safe, open place to stand.
      const grid = g();
      for (let r = 0; r < 40; r++)
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const tx = Math.floor(x) + dx;
            const tz = Math.floor(z) + dz;
            if (grid.inBounds(tx, tz) && grid.road[grid.index(tx, tz)]) return pos.set(tx + 0.5, 0, tz + 0.5);
          }
      return pos.set(x, 0, z);
    };

    function setMode(next: ExploreMode): void {
      if (next === 'follow' && !city.pulse.podRoutes.length) {
        ctx.bus.emit('toast', { text: 'No sky-lanes yet: build a Green Pod Dock first', tone: 'bad' });
        next = 'city';
      }
      if (next === 'train' && !ctx.services.tryGet('aeroline')?.trains) {
        ctx.bus.emit('toast', { text: 'No Aeroline here: it runs above the founding city', tone: 'bad' });
        next = 'city';
      }
      if (next === mode) return;
      const from = mode;
      mode = next;
      if (from === 'city') {
        savedView = cameraCtl.getView();
        spawnNear(cameraCtl.target.x, cameraCtl.target.z);
        pos.y = groundAt(pos.x, pos.z, 99);
        yaw = cameraCtl.yaw + Math.PI;
        pitch = -0.05;
      }
      if (next === 'drone') pos.y = Math.max(pos.y + 2, groundAt(pos.x, pos.z, 99) + 2);
      vel.set(0, 0, 0);
      const exploring = next !== 'city';
      cameraCtl.enabled = !exploring;
      cameraCtl.externalMotion = exploring;
      ctx.tools.suspended = exploring || photo;
      // A street-level near plane needs a shorter far plane for depth precision; the sky dome
      // (which follows the camera) shrinks to stay inside it.
      camera.near = exploring ? 0.02 : 0.5;
      camera.far = exploring ? 900 : 4000;
      camera.updateProjectionMatrix();
      ctx.services.get('world').atmosphere.sky.scale.setScalar(exploring ? 800 : 1800);
      avatar.visible = next === 'board';
      hud?.classList.toggle('exploring', exploring);
      hint.classList.toggle('hidden', !exploring);
      cross.classList.toggle('hidden', next !== 'walk' && next !== 'drone');
      setText(hint, HINTS[next]);
      for (const [m, b] of buttons) b.classList.toggle('on', m === next);
      setText(dropGlyph, MENU[next][0]);
      setText(dropLabel, LABELS[next]);
      drop.classList.toggle('active', exploring);
      if (!exploring) {
        if (document.pointerLockElement) document.exitPointerLock();
        // Land the city camera over where the player was; it glides back out to the saved zoom.
        cameraCtl.lookAt(pos.x, pos.z, savedView.distance, false);
      }
      ctx.bus.emit('explore:mode', { mode: next });
    }

    function setPhoto(on: boolean): void {
      photo = on;
      ctx.tools.suspended = on || mode !== 'city';
      hud?.classList.toggle('photo', on);
      hint.classList.toggle('hidden', on || mode === 'city');
      photoUi.classList.toggle('hidden', !on);
      cross.classList.toggle('hidden', on || (mode !== 'walk' && mode !== 'drone'));
      if (on) {
        photoSpeed = ctx.engine.speed;
        ctx.engine.speed = 0;
      } else ctx.engine.speed = photoSpeed;
    }

    // Mouse look: pointer lock when the canvas is clicked in walk / drone, or drag anywhere.
    const canvas = ctx.renderer.domElement;
    canvas.addEventListener('click', () => {
      if ((mode === 'walk' || mode === 'drone') && !document.pointerLockElement) void canvas.requestPointerLock?.();
    });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      yaw -= e.movementX * 0.0025;
      pitch = MathUtils.clamp(pitch - e.movementY * 0.0025, -1.4, 1.4);
    });

    input.onKey((e) => {
      if (e.metaKey || e.ctrlKey) return false;
      if (e.code === 'KeyJ') return setPhoto(!photo), true;
      if (photo && e.code === 'KeyP') return (capture = true), true;
      if (photo && e.code === 'Escape') return setPhoto(false), true;
      if (e.code === 'KeyN') return setMode(CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length]!), true;
      if (mode === 'city') return false;
      if (e.code === 'Escape') return setMode('city'), true;
      if ((mode === 'follow' || mode === 'train') && e.code === 'Tab') return (followIdx++, true);
      // Swallow keys the city view would otherwise act on (tool hotkeys, Space pause…).
      return ['Space', 'KeyQ', 'KeyE', 'Tab'].includes(e.code) || e.code.startsWith('Key');
    });

    // ── Per-frame control ─────────────────────────────────────────────────────
    const fwd = new Vector3();
    const look = new Vector3();
    const tmp = new Vector3();
    ctx.systems.add({
      id: 'explore.control',
      phase: 'input',
      order: 2,
      update(_c, f) {
        if (mode === 'city') return;
        const dt = Math.min(0.05, f.dt);
        const k = input.keys;
        // Drag-to-look (any button) works without pointer lock.
        if (input.buttons.size && !document.pointerLockElement) {
          yaw -= input.dragDX * 0.004;
          pitch = MathUtils.clamp(pitch - input.dragDY * 0.004, -1.4, 1.4);
        }
        const ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
        const iz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
        const sx = Math.sin(yaw);
        const cz = Math.cos(yaw);
        // Forward is -Z in camera space rotated by yaw.
        const wishX = -sx * iz + cz * ix;
        const wishZ = -cz * iz - sx * ix;
        const fast = k.has('ShiftLeft') || k.has('ShiftRight');

        if (mode === 'walk') {
          const speed = (fast ? 2.8 : 1.1) * (ix || iz ? 1 : 0);
          const len = Math.hypot(wishX, wishZ) || 1;
          vel.x = (wishX / len) * speed;
          vel.z = (wishZ / len) * speed;
          if (grounded && k.has('Space')) {
            vel.y = 1.5;
            grounded = false;
          }
          vel.y -= GRAVITY * dt;
          slide(vel.x * dt, vel.z * dt, pos.y, false);
          pos.y += vel.y * dt;
          const gy = groundAt(pos.x, pos.z, pos.y);
          if (pos.y <= gy) {
            // Step up gently onto kerbs and plazas; snap down slopes.
            pos.y = gy - pos.y > STEP ? gy : MathUtils.lerp(pos.y, gy, 1 - Math.exp(-dt * 30));
            if (gy - pos.y < 0.01) pos.y = gy;
            vel.y = 0;
            grounded = true;
          } else if (pos.y - gy < 0.02) grounded = true;
          camera.position.set(pos.x, pos.y + EYE + (ix || iz ? Math.sin(U.clock.value * 9) * 0.004 : 0), pos.z);
          look.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
          camera.lookAt(tmp.copy(camera.position).add(look));
        } else if (mode === 'board') {
          // Momentum, boost, hover over land and water.
          const accel = fast ? 9 : 5;
          vel.x += wishX * accel * dt;
          vel.z += wishZ * accel * dt;
          const max = fast ? 7 : 4;
          const sp = Math.hypot(vel.x, vel.z);
          if (sp > max) {
            vel.x *= max / sp;
            vel.z *= max / sp;
          }
          const drag = Math.exp(-dt * (ix || iz ? 0.8 : 2.2));
          vel.x *= drag;
          vel.z *= drag;
          slide(vel.x * dt, vel.z * dt, pos.y, true);
          const hover = Math.max(groundAt(pos.x, pos.z, pos.y), U.waterLevel.value) + 0.08;
          if (grounded && k.has('Space')) {
            vel.y = 2.2;
            grounded = false;
          }
          vel.y -= GRAVITY * dt;
          pos.y += vel.y * dt;
          if (pos.y <= hover) {
            pos.y = MathUtils.lerp(pos.y, hover, 1 - Math.exp(-dt * 20));
            vel.y = Math.max(0, vel.y);
            grounded = true;
          }
          // Steer the avatar toward its motion; camera trails behind.
          if (sp > 0.05) {
            const heading = Math.atan2(vel.x, vel.z);
            avatar.rotation.y = heading + Math.PI / 2;
            avatar.rotation.z = MathUtils.clamp(-(wishX * Math.cos(heading) - wishZ * Math.sin(heading)) * 0.25, -0.3, 0.3);
          }
          avatar.position.set(pos.x, pos.y + Math.sin(U.clock.value * 3) * 0.005, pos.z);
          fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
          const camPos = tmp.copy(pos).addScaledVector(fwd, -1.1).setY(pos.y + 0.5 - pitch * 0.6);
          camPos.y = Math.max(camPos.y, groundAt(camPos.x, camPos.z, 99) + 0.08);
          camera.position.lerp(camPos, 1 - Math.exp(-dt * 8));
          camera.lookAt(look.copy(pos).setY(pos.y + 0.15).addScaledVector(fwd, 1.4));
        } else if (mode === 'drone') {
          const speed = fast ? 9 : 3.5;
          const up = (k.has('KeyE') || k.has('Space') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
          vel.lerp(tmp.set(wishX * speed, up * speed * 0.6, wishZ * speed), 1 - Math.exp(-dt * 4));
          slide(vel.x * dt, vel.z * dt, pos.y, true);
          pos.y = Math.min(140, Math.max(Math.max(groundAt(pos.x, pos.z, pos.y), U.waterLevel.value) + 0.2, pos.y + vel.y * dt));
          camera.position.copy(pos).setY(pos.y + Math.sin(U.clock.value * 2.1) * 0.01);
          look.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
          camera.lookAt(tmp.copy(camera.position).add(look));
        } else if (mode === 'follow') {
          const lanes = ctx.services.tryGet('skylanes');
          if (!lanes?.pods) return setMode('city');
          // Same flight as the pod shader (skypath.ts): pods spread over the network, Tab for the next.
          lanes.podAt((followIdx * 37) % lanes.pods, U.clock.value, pos, fwd);
          fwd.sub(pos);
          if (fwd.lengthSq() > 1e-6) {
            fwd.normalize();
            yaw = MathUtils.lerp(yaw, Math.atan2(-fwd.x, -fwd.z), 1 - Math.exp(-dt * 2));
          }
          // Trail a little behind and above the pod so it sits low in the frame, the lane ahead.
          const behind = tmp.set(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(1.9);
          camera.position.copy(pos).add(behind).setY(pos.y + 0.75);
          const p0 = pitch - 0.28;
          look.set(-Math.sin(yaw) * Math.cos(p0), Math.sin(p0), -Math.cos(yaw) * Math.cos(p0));
          camera.lookAt(fwd.copy(camera.position).add(look));
        } else if (mode === 'train') {
          const line = ctx.services.tryGet('aeroline');
          if (!line?.trains) return setMode('city');
          line.ride(followIdx, eye, ahead);
          pos.copy(eye);
          ahead.sub(eye).normalize();
          yaw = Math.atan2(-ahead.x, -ahead.z);
          camera.position.copy(eye);
          const p0 = pitch + Math.asin(Math.max(-1, Math.min(1, ahead.y)));
          look.set(-Math.sin(yaw) * Math.cos(p0), Math.sin(p0), -Math.cos(yaw) * Math.cos(p0));
          camera.lookAt(tmp.copy(camera.position).add(look));
        }
        // Everything that focuses on the camera target (shadows, fog, pollen, agents) follows the player.
        cameraCtl.target.set(pos.x, Math.max(0, g().heightAt(pos.x, pos.z)), pos.z);
        cameraCtl.distance = mode === 'drone' || mode === 'follow' || mode === 'train' ? Math.max(8, pos.y - cameraCtl.target.y + 6) : 6;
        cameraCtl.yaw = yaw + Math.PI;
      },
    });

    // Photo capture right after the frame is drawn (same task, so the canvas still holds it).
    ctx.systems.add({
      id: 'explore.capture',
      phase: 'render',
      order: 10,
      update() {
        if (!capture) return;
        capture = false;
        canvas.toBlob((blob) => {
          if (!blob) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `bloomgrid-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }, 'image/png');
      },
    });

    ctx.bus.on('city:reset', () => {
      setPhoto(false);
      setMode('city');
    });
    ctx.services.provide('explore', { setMode, get mode() { return mode; }, setPhoto });
  },
};

declare module '@/core/Services' {
  interface GameServices {
    explore: { setMode(m: ExploreMode): void; readonly mode: ExploreMode; setPhoto(on: boolean): void };
  }
}
declare module '@/core/EventBus' {
  interface GameEvents {
    'explore:mode': { mode: ExploreMode };
  }
}
