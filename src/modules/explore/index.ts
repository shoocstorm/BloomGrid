import { Group, MathUtils, Vector3 } from 'three/webgpu';
import type { GameModule } from '@/game/context';
import { U } from '@/render/uniforms';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { BODY, STEP, createCollider } from './collider';
import { createBalloon, createBoard, createDrone, createPerson, showOnly } from './avatars';
import { findRoof, isLandmark, rooftopCandidates } from './roof';
import { Building } from '@/ecs/components';
import { placeBuilding } from '@/modules/construction/BuildingRenderer';
import './explore.css';

/** On a rooftop: a top this far above the street counts as a roof; a move never drops further than `LEDGE`. */
const ROOF_RISE = 1.2;
const LEDGE = 0.45;
/** Eight directions for the room-to-stand test round a spawn. */
const RING = Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)] as const);

export type ExploreMode = 'city' | 'walk' | 'board' | 'drone' | 'balloon' | 'roof' | 'follow' | 'train' | 'ferry' | 'jet';
const CYCLE: ExploreMode[] = ['city', 'walk', 'board', 'drone', 'balloon', 'roof', 'follow', 'train', 'ferry', 'jet'];
const LABELS: Record<ExploreMode, string> = {
  city: 'City view',
  walk: 'Walk',
  board: 'Hoverboard',
  drone: 'Drone',
  balloon: 'Balloon',
  roof: 'Rooftop',
  follow: 'Ride a pod',
  train: 'Aeroline',
  ferry: 'Cruise ferry',
  jet: 'Sky Guard jet',
};
/** Icon (`ui/icons.ts`) and menu note per mode. */
const MENU: Record<ExploreMode, [icon: string, note: string]> = {
  city: ['city', 'Steward’s overview: build and manage'],
  walk: ['walk', 'Stroll the streets as the steward'],
  board: ['board', 'Jet along the living highways'],
  drone: ['drone', 'Fly a quadcopter over the island'],
  balloon: ['balloon', 'Drift over the island in a hot-air balloon'],
  roof: ['roof', 'Stand on top of a landmark'],
  follow: ['pod', 'Ride a pod along the sky-lanes'],
  train: ['train', 'Ride the Aeroline maglev loop'],
  ferry: ['ferry', 'Sail the Tidesong to the sea wonders'],
  jet: ['jet', 'Chase the Sky Guard jet over the island'],
};
const HINTS: Record<ExploreMode, string> = {
  city: '',
  walk: 'WASD walk · Shift run · Space jump · drag to look · V first person · E door · L lights · N next mode · Esc city view',
  board: 'WASD ride · Shift boost · Space hop · glides over water · N next mode · Esc city view',
  drone: 'WASD fly · E up · Q down · Shift fast · drag to look · N next mode · Esc city view',
  balloon: 'WASD drift · E or Space burn (rise) · Q vent (sink) · drag to look · V basket view · Esc city view',
  roof: 'WASD stroll the roof · drag to look · V first person · Tab next landmark · Esc city view',
  follow: 'Riding a commuter pod along its sky-lane · Tab next pod · drag to look · Esc city view',
  train: 'Riding the Aeroline maglev round the island · Tab next train · drag to look · Esc city view',
  ferry: 'On the Tidesong’s bridge, sailing the timetable to the sea wonders · drag to look · Esc city view',
  jet: 'Chasing the Sky Guard jet on its patrol · drag to look · Esc city view',
};

/** Player scale in world units (1 tile ≈ 11 m; a storey is 0.32). */
const EYE = 0.17;
/**
 * Chase cameras keep this far above the ground (world units), measured over a ring as wide as the near plane
 * reaches at street level: closer, a slope slices the near plane and the ground looks like glass.
 */
const CAM_CLEAR = 0.1;
const CAM_RING = 0.12;
const GRAVITY = 6;


/**
 * Explore modes (Phase 11, D-054): walking as the chibi steward (third person, V for first person), a jet
 * hoverboard, a quadcopter drone, a hot-air balloon, a free stroll on top of a landmark (walls, rails and trees stop
 * the steward and the roof's edge holds like a parapet, D-135),
 * and follow-cams on commuter pods and the Aeroline; plus photo mode (J). A small
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
    const buildingsR = ctx.services.get('construction').renderer;
    const collider = createCollider(city, (t) => ctx.services.tryGet('world')?.flora.treesAt(t), (eid) => buildingsR.doorOpen(eid));
    for (const ev of ['building:added', 'building:removed', 'city:reset', 'terrain:changed'] as const) ctx.bus.on(ev, () => collider.clear());
    const g = () => city.grid;
    const groundAt = (x: number, z: number, feet: number) => collider.groundAt(x, z, feet);
    /** Moves a ball (drone, balloon parts) by (dx, dy, dz), axis by axis, refusing any axis that would touch. */
    const DRONE_R = 0.15;
    /** The balloon as two balls: the envelope (centre 2.1 above the basket) and the basket. */
    const BALLOON: [dy: number, r: number][] = [
      [2.1, 1.15],
      [0.12, 0.22],
    ];
    const clear = (x: number, y: number, z: number, balls: [number, number][]) => balls.every(([dy, r]) => !collider.hits(x, y + dy, z, r));
    const fly = (dx: number, dy: number, dz: number, balls: [number, number][]) => {
      // Spawned or rebuilt into something: rise out of it rather than freeze.
      if (!clear(pos.x, pos.y, pos.z, balls)) {
        pos.y += 0.05;
        return;
      }
      if (clear(pos.x + dx, pos.y, pos.z, balls)) pos.x += dx;
      else vel.x *= -0.2;
      if (clear(pos.x, pos.y, pos.z + dz, balls)) pos.z += dz;
      else vel.z *= -0.2;
      if (clear(pos.x, pos.y + dy, pos.z, balls)) pos.y += dy;
      else vel.y = 0;
    };
    /** Moves with per-axis sliding against walls. */
    const slide = (dx: number, dz: number, feet: number, swim: boolean) => {
      const w = U.waterLevel.value;
      if (!collider.blocked(pos.x + dx, pos.z, feet, swim, w)) pos.x += dx;
      else vel.x *= -0.2;
      if (!collider.blocked(pos.x, pos.z + dz, feet, swim, w)) pos.z += dz;
      else vel.z *= -0.2;
    };

    // ── Avatars (avatars.ts): the steward rides the board, so it moves between the scene and the board rig ──
    const person = createPerson();
    const board = createBoard();
    const boardRig = new Group();
    boardRig.add(board.root);
    const drone = createDrone();
    const balloon = createBalloon();
    const rigs = [person.root, boardRig, drone.root, balloon.root];
    for (const r of rigs) {
      r.visible = false;
      ctx.scene.add(r);
    }
    drone.root.rotation.order = 'YXZ';
    boardRig.rotation.order = 'YXZ';
    let stride = 0;
    let facing = 0;
    /** First person (V) in walk and on rooftops; the basket view in the balloon. */
    let firstPerson = false;
    /** The landmark the steward stands on: its name and footprint (the stroll stays inside it). */
    let roof: { eid: number; name: string; x0: number; z0: number; x1: number; z1: number } | null = null;
    let roofList: number[] = [];

    // ── HUD ───────────────────────────────────────────────────────────────────
    // A view-mode dropdown in the top bar's actions (the top bar is the one HUD part kept while exploring).
    // The menu hangs off the top bar itself: the actions panel's chamfer clip-path would cut it off.
    const buttons = new Map<ExploreMode, HTMLElement>();
    const dropGlyph = h('span', { class: 'g' }, icon(MENU.city[0]));
    const dropLabel = h('span', { class: 'l' }, LABELS.city);
    const drop = h('button', { class: 'icon-btn xp-drop', title: 'View mode (N cycles · J photo)', 'aria-haspopup': 'menu', onClick: () => openMenu(menu.classList.contains('hidden')) }, dropGlyph, dropLabel, h('span', { class: 'caret' }, icon('caret')));
    const item = (name: string, label: string, note: string, key: string, onClick: () => void) =>
      h('button', { class: 'xp-item', role: 'menuitem', onClick: () => (openMenu(false), onClick()) }, h('span', { class: 'g' }, icon(name)), h('span', { class: 'xp-t' }, h('b', {}, label), h('i', {}, note)), h('kbd', {}, key));
    const menu = h('div', { class: 'xp-menu panel hidden', role: 'menu' }, h('div', { class: 'xp-h' }, 'View mode'));
    for (const m of CYCLE) {
      const b = item(MENU[m][0], LABELS[m], MENU[m][1], m === 'city' ? 'Esc' : 'N', () => setMode(m));
      buttons.set(m, b);
      menu.append(b);
    }
    menu.append(h('div', { class: 'xp-sep' }), item('photo', 'Photo mode', 'Frame a shot, P saves a PNG', 'J', () => setPhoto(!photo)));
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
    // Esc closes the open menu before anything else.
    input.onKey((e) => (e.code === 'Escape' && !menu.classList.contains('hidden') ? (openMenu(false), true) : false), 10);
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Node;
      if (!menu.classList.contains('hidden') && !menu.contains(t) && !drop.contains(t)) openMenu(false);
    });
    const hint = h('div', { class: 'explore-hint hidden' });
    const cross = h('div', { class: 'explore-cross hidden' });
    const photoUi = h('div', { class: 'photo-ui hidden' }, h('div', { class: 'photo-bar top' }), h('div', { class: 'photo-bar bottom' }), h('div', { class: 'photo-hint' }, 'Photo mode · drag to look · P save PNG · J exit'));
    document.body.append(hint, cross, photoUi);

    // ── Touch pad (phones and tablets): a joystick for WASD, held buttons for up / down / boost, taps for Tab
    // and V, and a way back to the city view. It feeds `input.keys`, so every mode's controls work unchanged.
    const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
    /** Keep a finger's moves on its control even off its edge (fails harmlessly if the pointer is already gone). */
    const hold = (el: HTMLElement, id: number) => {
      try {
        el.setPointerCapture(id);
      } catch {
        /* the pointer ended before capture: nothing to follow */
      }
    };
    const knob = h('i', { class: 'xp-knob' });
    const stick = h('div', { class: 'xp-stick' }, knob);
    let stickId = -1;
    const steer = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect();
      const R = r.width / 2;
      let dx = e.clientX - (r.left + R);
      let dy = e.clientY - (r.top + R);
      const len = Math.hypot(dx, dy);
      if (len > R) [dx, dy] = [(dx / len) * R, (dy / len) * R];
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      // Eight directions: an axis is on past a third of the radius.
      const t = R / 3;
      const on = { KeyW: dy < -t, KeyS: dy > t, KeyA: dx < -t, KeyD: dx > t };
      const press = (k: string, v: boolean) => (v ? input.keys.add(k) : input.keys.delete(k));
      for (const k of KEYS) press(k, (on as Record<string, boolean>)[k]!);
      // Pushed to the rim: run / boost.
      press('ShiftLeft', len > R * 0.92);
    };
    const release = () => {
      stickId = -1;
      knob.style.transform = '';
      for (const k of [...KEYS, 'ShiftLeft']) input.keys.delete(k);
    };
    stick.addEventListener('pointerdown', (e) => {
      stickId = e.pointerId;
      hold(stick, e.pointerId);
      steer(e);
      e.preventDefault();
    });
    stick.addEventListener('pointermove', (e) => e.pointerId === stickId && steer(e));
    for (const ev of ['pointerup', 'pointercancel'] as const) stick.addEventListener(ev, (e) => e.pointerId === stickId && release());
    /** A button that holds `code` while pressed, or taps it (sends a keydown) when `tap`. */
    const padBtn = (name: string, title: string, code: string, tap = false) => {
      const b = h('button', { class: 'xp-pbtn', title, 'aria-label': title }, icon(name));
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (tap) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
        else {
          input.keys.add(code);
          hold(b, e.pointerId);
        }
      });
      if (!tap) for (const ev of ['pointerup', 'pointercancel'] as const) b.addEventListener(ev, () => input.keys.delete(code));
      return b;
    };
    const pad = {
      up: padBtn('up', 'Up · jump · burn', 'Space'),
      down: padBtn('down', 'Down · vent', 'KeyQ'),
      next: padBtn('next', 'Next', 'Tab', true),
      view: padBtn('eye', 'First person', 'KeyV', true),
    };
    const exit = h('button', { class: 'xp-exit panel', title: 'Back to the city view', 'aria-label': 'Back to the city view', onClick: () => setMode('city') }, h('span', { class: 'g' }, icon('city')), h('span', { class: 'l' }, 'City view'));
    const padEl = h('div', { class: 'xp-pad hidden' }, stick, h('div', { class: 'xp-pbtns' }, pad.up, pad.down, pad.next, pad.view), exit);
    document.body.append(padEl);
    /** Which pad parts each mode uses (rides have no stick: they follow their pod or train). */
    const padFor = (m: ExploreMode) => {
      const moves = ['walk', 'board', 'drone', 'balloon', 'roof'].includes(m);
      stick.classList.toggle('hidden', !moves);
      pad.up.classList.toggle('hidden', !['walk', 'board', 'drone', 'balloon'].includes(m));
      pad.down.classList.toggle('hidden', m !== 'drone' && m !== 'balloon');
      pad.next.classList.toggle('hidden', !['roof', 'follow', 'train'].includes(m));
      pad.view.classList.toggle('hidden', !['walk', 'roof', 'balloon'].includes(m));
      padEl.classList.toggle('hidden', m === 'city' || photo);
      if (m === 'city') release();
    };
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

    /**
     * Where to set the steward down on a landmark (D-135): the flat roof `findRoof` picks when it has one and that
     * spot is clear, else the highest open spot the collider finds on top (a sky-garden, a crown deck, a dome's
     * shoulder). From there the stroll is free, held only by walls and the roof's edge.
     */
    const _spawn = new Vector3();
    const deckSpawn = (eid: number): Vector3 | null => {
      const r = findRoof(city, eid);
      const W = U.waterLevel.value;
      if (r && !collider.blocked(r.spawn.x, r.spawn.z, r.spawn.y, false, W)) return _spawn.copy(r.spawn);
      const rec = city.buildingRecord(eid);
      const [w, d] = [Building.w[eid]!, Building.d[eid]!];
      const base = g().rangeOver(rec.x, rec.z, w, d).max;
      let best = -Infinity;
      for (let z = rec.z + 0.3; z < rec.z + d - 0.3; z += 0.25)
        for (let x = rec.x + 0.3; x < rec.x + w - 0.3; x += 0.25) {
          const top = groundAt(x, z, 999);
          if (top - base < ROOF_RISE || top <= best || collider.blocked(x, z, top, false, W)) continue;
          // Room to stand: most of a ring of neighbours is open at about the same height.
          let open = 0;
          for (const [ox, oz] of RING) {
            const nx = x + ox * 0.35;
            const nz = z + oz * 0.35;
            if (!collider.blocked(nx, nz, top, false, W) && Math.abs(groundAt(nx, nz, top) - top) < 0.25) open++;
          }
          if (open < 6) continue;
          best = top;
          _spawn.set(x, top, z);
        }
      return best > -Infinity ? _spawn : null;
    };

    /** Puts the steward on the first landmark from `from` (in `roofList` order) with somewhere to stand on top. */
    const pickRoof = (from: number): boolean => {
      for (let k = 0; k < roofList.length; k++) {
        const i = (((from + k) % roofList.length) + roofList.length) % roofList.length;
        const eid = roofList[i]!;
        const at = deckSpawn(eid);
        if (!at) continue;
        const rec = city.buildingRecord(eid);
        const name = city.buildingDef(eid).name;
        roof = { eid, name, x0: rec.x, z0: rec.z, x1: rec.x + Building.w[eid]!, z1: rec.z + Building.d[eid]! };
        followIdx = i;
        pos.copy(at);
        ctx.bus.emit('toast', { text: `On top of ${name}`, tone: 'info' });
        return true;
      }
      return false;
    };
    /** Landmark to try first when entering rooftop mode (the inspector's Sky deck), else the nearest. */
    let preferred = -1;

    function setMode(next: ExploreMode): void {
      if (next === 'follow' && !city.pulse.podRoutes.length) {
        ctx.bus.emit('toast', { text: 'No sky-lanes yet: build a Green Pod Dock first', tone: 'bad' });
        next = 'city';
      }
      if (next === 'train' && !ctx.services.tryGet('aeroline')?.trains) {
        ctx.bus.emit('toast', { text: 'No Aeroline here: it runs above the founding city', tone: 'bad' });
        next = 'city';
      }
      if (next === 'ferry' && !ctx.services.tryGet('ferry')?.active) {
        ctx.bus.emit('toast', { text: 'No cruise ferry yet: it sails once a sea wonder has risen', tone: 'bad' });
        next = 'city';
      }
      if (next === 'jet' && !ctx.services.tryGet('skyguard')) next = 'city';
      if (next === mode) return;
      if (next === 'roof') {
        // Landmarks nearest the view first; Tab walks on through the list.
        const at = mode === 'city' ? cameraCtl.target : pos;
        roofList = rooftopCandidates(city).sort((a, b) => {
          if (a === preferred || b === preferred) return a === preferred ? -1 : 1;
          const [ra, rb] = [city.buildingRecord(a), city.buildingRecord(b)];
          return (ra.x - at.x) ** 2 + (ra.z - at.z) ** 2 - ((rb.x - at.x) ** 2 + (rb.z - at.z) ** 2);
        });
        preferred = -1;
        if (mode === 'city') savedView = cameraCtl.getView();
        if (!pickRoof(0)) {
          ctx.bus.emit('toast', { text: 'No landmark roof to stand on: build a hero building first', tone: 'bad' });
          next = 'city';
          if (mode === 'city') return;
        }
      }
      const from = mode;
      mode = next;
      if (from === 'city' && next !== 'roof') {
        savedView = cameraCtl.getView();
        spawnNear(cameraCtl.target.x, cameraCtl.target.z);
        pos.y = groundAt(pos.x, pos.z, 99);
      }
      if (from === 'city') {
        yaw = cameraCtl.yaw + Math.PI;
        pitch = -0.05;
        firstPerson = false;
      }
      if (from === 'roof' && next !== 'roof') {
        // Leaving a roof: come down to the street beside it.
        spawnNear(pos.x, pos.z);
        pos.y = groundAt(pos.x, pos.z, 99);
      }
      if (next === 'drone') pos.y = Math.max(pos.y + 2, groundAt(pos.x, pos.z, 99) + 2);
      if (next === 'balloon') pos.y = Math.max(pos.y + 10, groundAt(pos.x, pos.z, 999) + 10);
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
      // The steward stands alone when walking or on a roof, and rides the board.
      if (next === 'board') boardRig.add(person.root);
      else ctx.scene.add(person.root);
      person.root.position.set(0, next === 'board' ? 0.026 : 0, 0);
      person.root.rotation.set(0, 0, 0);
      const rig = { walk: person.root, roof: person.root, board: boardRig, drone: drone.root, balloon: balloon.root } as Partial<Record<ExploreMode, Group>>;
      showOnly(rigs, rig[next]);
      if (next === 'board') person.root.visible = true;
      hud?.classList.toggle('exploring', exploring);
      hint.classList.toggle('hidden', !exploring);
      padFor(next);
      cross.classList.toggle('hidden', !crossOn());
      setText(hint, HINTS[next]);
      for (const [m, b] of buttons) b.classList.toggle('on', m === next);
      dropGlyph.replaceChildren(icon(MENU[next][0]));
      setText(dropLabel, LABELS[next]);
      drop.classList.toggle('active', exploring);
      if (!exploring) {
        if (document.pointerLockElement) document.exitPointerLock();
        // Land the city camera over where the player was; it glides back out to the saved zoom.
        cameraCtl.lookAt(pos.x, pos.z, savedView.distance, false);
      }
      ctx.bus.emit('explore:mode', { mode: next });
    }

    /** The crosshair only makes sense looking through the steward's eyes. */
    function crossOn(): boolean {
      return firstPerson && (mode === 'walk' || mode === 'roof');
    }

    function setPhoto(on: boolean): void {
      const was = photo;
      photo = on;
      ctx.tools.suspended = on || mode !== 'city';
      hud?.classList.toggle('photo', on);
      hint.classList.toggle('hidden', on || mode === 'city');
      padFor(mode);
      photoUi.classList.toggle('hidden', !on);
      cross.classList.toggle('hidden', on || !crossOn());
      // Only a real enter / leave touches the speed (a city reset calls this with photo mode already off).
      if (on && !was) {
        photoSpeed = ctx.engine.speed;
        ctx.engine.speed = 0;
      } else if (!on && was) ctx.engine.speed = photoSpeed;
    }

    // Mouse look: pointer lock when the canvas is clicked in walk / drone, or drag anywhere.
    const canvas = ctx.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (['walk', 'drone', 'roof', 'balloon'].includes(mode) && !document.pointerLockElement) void canvas.requestPointerLock?.();
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
      if (mode === 'roof' && e.code === 'Tab') return (pickRoof(followIdx + 1), true);
      if (e.code === 'KeyV' && (mode === 'walk' || mode === 'roof' || mode === 'balloon')) {
        firstPerson = !firstPerson;
        cross.classList.toggle('hidden', photo || !crossOn());
        return true;
      }
      // Swallow keys the city view would otherwise act on (tool hotkeys, Space pause…).
      return ['Space', 'KeyQ', 'KeyE', 'Tab'].includes(e.code) || e.code.startsWith('Key');
    });

    // ── Per-frame control ─────────────────────────────────────────────────────
    const fwd = new Vector3();
    const look = new Vector3();
    const tmp = new Vector3();
    /** A ride camera (Aeroline, cruise ferry, Sky Guard jet): at `from`, facing `at`; dragging pitches it. */
    const ride = (from: Vector3, at: Vector3) => {
      pos.copy(from);
      at.sub(from).normalize();
      yaw = Math.atan2(-at.x, -at.z);
      camera.position.copy(from);
      const p0 = pitch + Math.asin(Math.max(-1, Math.min(1, at.y)));
      look.set(-Math.sin(yaw) * Math.cos(p0), Math.sin(p0), -Math.cos(yaw) * Math.cos(p0));
      camera.lookAt(tmp.copy(camera.position).add(look));
    };
    const lerpAngle = (a: number, b: number, t: number) => a + (Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t);
    /** Poses the steward at `pos`, turning toward where they walk and swinging their limbs with the stride. */
    const stroll = (dt: number, speed: number, fast: boolean) => {
      if (speed > 0.01) facing = lerpAngle(facing, Math.atan2(vel.x || 1e-6, vel.z), 1 - Math.exp(-dt * 12));
      else if (mode === 'roof') facing = lerpAngle(facing, yaw + Math.PI, 1 - Math.exp(-dt * 2));
      stride += dt * (speed > 0.01 ? (fast ? 26 : 16) : 0);
      person.root.position.copy(pos);
      person.root.rotation.y = facing;
      person.root.visible = !firstPerson;
      person.pose(speed > 0.01 ? stride : U.clock.value * 2, speed > 0.01 ? 1 : 0);
    };
    /** Camera for the steward: eyes in first person, else a chase view behind and above, never under `minY`. */
    const view = (dt: number, dist: number, minY = -Infinity) => {
      if (firstPerson) {
        camera.position.set(pos.x, pos.y + EYE, pos.z);
        look.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
        camera.lookAt(tmp.copy(camera.position).add(look));
        return;
      }
      chase(dt, tmp.copy(pos).setY(pos.y + 0.13), dist, 0.25, CAM_CLEAR, 0.12, minY);
    };
    /**
     * The ground the chase camera must stay above at (x, z): the walkable surface under it (terrain, road, deck or a
     * piece top near `feet`), the terrain round it as wide as the near plane (or a slope cuts through the near
     * plane and the ground turns see-through, showing building undersides), and the sea.
     */
    const floorAt = (x: number, z: number, feet: number) => {
      let y = Math.max(U.waterLevel.value, groundAt(x, z, feet));
      for (const [ox, oz] of RING) y = Math.max(y, g().heightAt(x + ox * CAM_RING, z + oz * CAM_RING));
      return y;
    };
    /** How far along from → to (0..1) the line stays clear of the terrain by `clear`: a hill between camera and target. */
    const terrainReach = (from: Vector3, to: Vector3, clear: number) => {
      const steps = Math.min(32, Math.max(2, Math.ceil(from.distanceTo(to) / 0.08)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + (to.x - from.x) * t;
        const z = from.z + (to.z - from.z) * t;
        if (from.y + (to.y - from.y) * t < g().heightAt(x, z) + clear) return (i - 1) / steps;
      }
      return 1;
    };
    const _chase = new Vector3();
    const _from = new Vector3();
    /**
     * Orbits the camera `dist` behind `target` (drag pitches it), smoothing toward the spot, `clear` above the ground
     * there (and never under `minY`). The camera never enters a building, tree or hillside: it pulls in along the line
     * to the target, starting `skip` out (past the avatar itself), and snaps in at once when something cuts in (it
     * only eases back out). The ground is checked where the camera is going and again where it lands, so on a slope
     * the trailing camera never sinks into the hill behind the steward.
     */
    const chase = (dt: number, target: Vector3, dist: number, tilt: number, clear: number, skip = 0.12, minY = -Infinity) => {
      const p = MathUtils.clamp(tilt - pitch, -0.35, 1.3);
      const feet = target.y;
      _chase.set(Math.sin(yaw) * Math.cos(p), Math.sin(p), Math.cos(yaw) * Math.cos(p)).multiplyScalar(dist).add(target);
      _chase.y = Math.max(_chase.y, floorAt(_chase.x, _chase.z, feet) + clear, minY);
      _from.copy(_chase).sub(target).setLength(Math.min(skip, dist * 0.5)).add(target);
      const k = Math.min(collider.reach(_from, _chase, 0.035), terrainReach(_from, _chase, CAM_CLEAR * 0.5));
      if (k < 1) _chase.lerpVectors(_from, _chase, Math.max(0, k - 0.02));
      const nearer = _chase.distanceToSquared(target) < camera.position.distanceToSquared(target);
      camera.position.lerp(_chase, k < 1 && nearer ? 1 : 1 - Math.exp(-dt * 10));
      // The smoothing lags behind: lift it out of any ground it trails into (walking uphill, turning on a slope).
      camera.position.y = Math.max(camera.position.y, floorAt(camera.position.x, camera.position.z, feet) + Math.min(clear, CAM_CLEAR), minY);
      camera.lookAt(target);
    };

    ctx.systems.add({
      id: 'explore.control',
      phase: 'input',
      order: 2,
      update(_c, f) {
        // Grass and flowers part round the walker's feet (off in every other mode).
        U.walker.value.set(pos.x, pos.y, pos.z, mode === 'walk' ? 0.16 : 0);
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
          const moving = ix || iz ? 1 : 0;
          const speed = (fast ? 1.7 : 0.65) * moving;
          const len = Math.hypot(wishX, wishZ) || 1;
          vel.x = (wishX / len) * speed;
          vel.z = (wishZ / len) * speed;
          if (grounded && k.has('Space')) {
            vel.y = 1.5;
            grounded = false;
          }
          vel.y -= GRAVITY * dt;
          slide(vel.x * dt, vel.z * dt, pos.y, false);
          // Heads bump ceilings (balconies, arches) instead of passing through them.
          if (vel.y > 0 && collider.hits(pos.x, pos.y + BODY + vel.y * dt, pos.z, 0.04)) vel.y = 0;
          pos.y += vel.y * dt;
          const gy = groundAt(pos.x, pos.z, pos.y);
          if (pos.y <= gy) {
            // Step up gently onto kerbs and plazas; snap down slopes.
            pos.y = gy - pos.y > 0.45 ? gy : MathUtils.lerp(pos.y, gy, 1 - Math.exp(-dt * (gy - pos.y > STEP ? 14 : 30)));
            if (gy - pos.y < 0.01) pos.y = gy;
            vel.y = 0;
            grounded = true;
          } else if (pos.y - gy < 0.02) grounded = true;
          stroll(dt, speed, fast);
          view(dt, 0.95);
        } else if (mode === 'roof') {
          // A free stroll on top (D-135): walls, rails, trees and crowns stop the steward like on the street (the
          // collider), up a step like a kerb, and the roof's edge holds like a parapet: no move that would drop more
          // than a short step or leave the building's lot.
          const moving = ix || iz ? 1 : 0;
          const speed = (fast ? 1.2 : 0.5) * moving;
          const len = Math.hypot(wishX, wishZ) || 1;
          const dx = (wishX / len) * speed * dt;
          const dz = (wishZ / len) * speed * dt;
          if (roof) {
            const r = roof;
            const W = U.waterLevel.value;
            const can = (x: number, z: number) =>
              x > r.x0 + 0.1 && x < r.x1 - 0.1 && z > r.z0 + 0.1 && z < r.z1 - 0.1 && !collider.blocked(x, z, pos.y, false, W) && groundAt(x, z, pos.y) > pos.y - LEDGE;
            if (dx && can(pos.x + dx, pos.z)) pos.x += dx;
            if (dz && can(pos.x, pos.z + dz)) pos.z += dz;
            const y = groundAt(pos.x, pos.z, pos.y);
            if (y > pos.y - LEDGE) pos.y = MathUtils.lerp(pos.y, y, 1 - Math.exp(-dt * 20));
          }
          stroll(dt, speed, fast);
          view(dt, 1.1, pos.y - 0.02);
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
          const hover = Math.max(groundAt(pos.x, pos.z, pos.y), U.waterLevel.value) + 0.06;
          if (grounded && k.has('Space')) {
            vel.y = 2.2;
            grounded = false;
          }
          vel.y -= GRAVITY * dt;
          if (vel.y > 0 && collider.hits(pos.x, pos.y + BODY + vel.y * dt, pos.z, 0.04)) vel.y = 0;
          pos.y += vel.y * dt;
          if (pos.y <= hover) {
            pos.y = MathUtils.lerp(pos.y, hover, 1 - Math.exp(-dt * 20));
            vel.y = Math.max(0, vel.y);
            grounded = true;
          }
          // Nose along the motion (the deck runs along +X), banking into turns; the rider crouches.
          if (sp > 0.05) {
            const heading = Math.atan2(vel.x, vel.z) - Math.PI / 2;
            boardRig.rotation.y = lerpAngle(boardRig.rotation.y, heading, 1 - Math.exp(-dt * 10));
            boardRig.rotation.x = MathUtils.lerp(boardRig.rotation.x, MathUtils.clamp((wishX * Math.cos(yaw) - wishZ * Math.sin(yaw)) * 0.25, -0.3, 0.3), 1 - Math.exp(-dt * 6));
          }
          boardRig.position.set(pos.x, pos.y + Math.sin(U.clock.value * 3) * 0.004, pos.z);
          board.thrust(Math.min(1, (ix || iz ? 0.35 : 0) + sp / 7 + (fast && (ix || iz) ? 0.4 : 0)));
          person.pose(U.clock.value * 1.5, 0.05, 1);
          chase(dt, tmp.copy(pos).setY(pos.y + 0.15), 1.15, 0.38, CAM_CLEAR, 0.2);
        } else if (mode === 'drone') {
          const speed = fast ? 9 : 3.5;
          const up = (k.has('KeyE') || k.has('Space') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
          vel.lerp(tmp.set(wishX * speed, up * speed * 0.6, wishZ * speed), 1 - Math.exp(-dt * 4));
          // A ball the drone's size: it slides along walls and rooftops, and never dips into them.
          const edge = pos.x + vel.x * dt < 0.5 || pos.z + vel.z * dt < 0.5 || pos.x + vel.x * dt > g().w - 0.5 || pos.z + vel.z * dt > g().h - 0.5;
          if (!edge) fly(vel.x * dt, vel.y * dt, vel.z * dt, [[0, DRONE_R]]);
          pos.y = Math.min(140, Math.max(Math.max(g().heightAt(pos.x, pos.z), U.waterLevel.value) + DRONE_R + 0.05, pos.y));
          // The quadcopter faces where the camera looks, pitching into its speed and rolling into strafes.
          const fwdSpeed = -vel.x * Math.sin(yaw) - vel.z * Math.cos(yaw);
          const sideSpeed = vel.x * Math.cos(yaw) - vel.z * Math.sin(yaw);
          drone.root.rotation.y = yaw + Math.PI / 2;
          drone.root.rotation.z = MathUtils.lerp(drone.root.rotation.z, -fwdSpeed * 0.05, 1 - Math.exp(-dt * 6));
          drone.root.rotation.x = MathUtils.lerp(drone.root.rotation.x, sideSpeed * 0.05, 1 - Math.exp(-dt * 6));
          drone.root.position.set(pos.x, pos.y + Math.sin(U.clock.value * 2.1) * 0.01, pos.z);
          drone.spin(dt, Math.min(1, Math.hypot(vel.x, vel.z) / 6 + Math.abs(vel.y) / 4));
          chase(dt, drone.root.position, 1.4, 0.05, CAM_CLEAR, DRONE_R + 0.05);
        } else if (mode === 'balloon') {
          // Slow drift where you steer plus a light prevailing wind; the burner lifts, venting sinks.
          const burn = k.has('KeyE') || k.has('Space');
          const vent = k.has('KeyQ');
          const drift = fast ? 3 : 1.4;
          vel.x = MathUtils.lerp(vel.x, wishX * drift + 0.25, 1 - Math.exp(-dt * 0.8));
          vel.z = MathUtils.lerp(vel.z, wishZ * drift + 0.12, 1 - Math.exp(-dt * 0.8));
          // Neutral buoyancy when idle: it holds its height until you burn or vent.
          vel.y = MathUtils.lerp(vel.y, burn ? 2.2 : vent ? -2.2 : 0, 1 - Math.exp(-dt * 0.9));
          // Envelope and basket are solid: the balloon bumps along towers and settles on roofs, not through them.
          const dx = MathUtils.clamp(pos.x + vel.x * dt, 2, g().w - 2) - pos.x;
          const dz = MathUtils.clamp(pos.z + vel.z * dt, 2, g().h - 2) - pos.z;
          fly(dx, Math.min(vel.y * dt, 95 - pos.y), dz, BALLOON);
          const floor = Math.max(U.waterLevel.value, g().heightAt(pos.x, pos.z));
          pos.y = Math.max(pos.y, floor + 0.15);
          balloon.root.position.copy(pos);
          balloon.root.rotation.z = Math.sin(U.clock.value * 0.7) * 0.03;
          balloon.root.rotation.x = Math.sin(U.clock.value * 0.53) * 0.025;
          balloon.burn(burn ? 1 : 0.12);
          if (firstPerson) {
            // From the basket: eyes just above the rim.
            camera.position.set(pos.x, pos.y + 0.3, pos.z);
            look.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
            camera.lookAt(tmp.copy(camera.position).add(look));
          } else chase(dt, tmp.copy(pos).setY(pos.y + 1.6), 7.5, 0.15, 0.5, 1.3);
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
          _chase.copy(pos).add(behind).setY(pos.y + 0.75);
          // Pull in rather than look through a tower the lane passes close to.
          _from.copy(_chase).sub(pos).setLength(0.35).add(pos);
          const k = collider.reach(_from, _chase, 0.035);
          camera.position.copy(k < 1 ? _from.lerp(_chase, Math.max(0, k - 0.02)) : _chase);
          const p0 = pitch - 0.28;
          look.set(-Math.sin(yaw) * Math.cos(p0), Math.sin(p0), -Math.cos(yaw) * Math.cos(p0));
          camera.lookAt(fwd.copy(camera.position).add(look));
        } else if (mode === 'train') {
          const line = ctx.services.tryGet('aeroline');
          if (!line?.trains) return setMode('city');
          line.ride(followIdx, eye, ahead);
          ride(eye, ahead);
        } else if (mode === 'ferry' || mode === 'jet') {
          // The cruise ferry's sun deck, or behind the Sky Guard jet (D-141).
          const by = mode === 'ferry' ? ctx.services.tryGet('ferry') : ctx.services.tryGet('skyguard');
          if (!by?.ride(eye, ahead)) return setMode('city');
          ride(eye, ahead);
        }
        // Everything that focuses on the camera target (shadows, fog, pollen, agents) follows the player.
        cameraCtl.target.set(pos.x, Math.max(0, g().heightAt(pos.x, pos.z)), pos.z);
        cameraCtl.distance = ['drone', 'balloon', 'roof', 'follow', 'train', 'ferry', 'jet'].includes(mode) ? Math.max(8, pos.y - cameraCtl.target.y + 6) : 6;
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
    /** Stands the steward on top of landmark `eid` (the inspector's Sky deck). */
    const standOn = (eid: number): boolean => {
      if (!isLandmark(city, eid)) return false;
      if (mode === 'roof') {
        roofList = [eid, ...roofList.filter((e) => e !== eid)];
        return pickRoof(0);
      }
      preferred = eid;
      setMode('roof');
      // setMode changes `mode` (TS can't see that through the call).
      return (mode as ExploreMode) === 'roof';
    };
    ctx.services.provide('explore', { setMode, standOn, get mode() { return mode; }, setPhoto, position: pos, get firstPerson() { return firstPerson; }, collider, get pitch() { return pitch; }, set pitch(v: number) { pitch = v; }, get yaw() { return yaw; }, set yaw(v: number) { yaw = v; } });

    // ── Landmark actions in the inspector (D-135): every hero and landmark gets Sky deck and Postcard ──────
    ctx.services.get('hud').buildingActions((eid) => {
      if (!isLandmark(city, eid)) return [];
      const button = (glyph: string, label: string, title: string, run: () => void) => h('button', { class: 'tool', title, onClick: run }, h('span', { class: 'g' }, icon(glyph)), label);
      return [
        button('roof', 'Sky deck', 'Stand on top and stroll round it (WASD, drag to look, V first person, Tab next landmark, Esc back)', () => standOn(eid)),
        button('photo', 'Postcard', 'A low, sweeping view of it in photo mode (P saves a PNG, Esc back)', () => postcard(eid)),
      ];
    });
    /** Frames a landmark whole from low down (the orbit point lifted to its middle) and opens photo mode. */
    const postcard = (eid: number) => {
      const rec = city.buildingRecord(eid);
      const def = city.buildingDef(eid);
      const height = placeBuilding(g(), def, rec.x, rec.z, rec.rot).template.height;
      const [w, d] = [Building.w[eid]!, Building.d[eid]!];
      // The selection's marker and the inspector's live model would sit in the shot.
      ctx.bus.emit('selection:changed', { eid: null });
      const distance = Math.max(28, height * 2.1, Math.max(w, d) * 2.6);
      cameraCtl.setView({ x: rec.x + w / 2, z: rec.z + d / 2, yaw: cameraCtl.yaw, pitch: 0.16, distance, aim: height * 0.5 });
      setPhoto(true);
    };
  },
};

declare module '@/core/Services' {
  interface GameServices {
    explore: {
      setMode(m: ExploreMode): void;
      /** Rooftop mode on landmark `eid` (D-135); false if it isn't a landmark or has nowhere to stand. */
      standOn(eid: number): boolean;
      readonly mode: ExploreMode;
      setPhoto(on: boolean): void;
      /** Where the steward (or the ride) is now: read-only for other modules. */
      readonly position: Readonly<Vector3>;
      readonly firstPerson: boolean;
      /** Explore-mode collision (collider.ts), for scripts and probes. */
      readonly collider: ReturnType<typeof createCollider>;
      /** Look angles (radians), for scripts: positive pitch looks up and lowers the chase camera. */
      pitch: number;
      yaw: number;
    };
  }
}
declare module '@/core/EventBus' {
  interface GameEvents {
    'explore:mode': { mode: ExploreMode };
  }
}
