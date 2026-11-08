import { Vector3 } from 'three/webgpu';
import type { GameModule } from '@/game/context';
import { Building } from '@/ecs/components';
import { NO_ENTITY } from '@/sim/Grid';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import './interact.css';

/**
 * Hands-on buildings (D-132): walking the streets, the steward can open a building's door and step inside (the
 * Mycelium Work Dome's sliding glass doors) and switch any building's lights off and on (its lamps, screens,
 * signs and lit windows). Render-only: a door or a light switch changes how the city looks, never the sim, its
 * hash or its undo history. Switched-off lights are kept in the save (by building uid); doors close on their own
 * once the steward walks away.
 */

/** How close the steward must be to a door leaf (world units) to work it, and how far away it closes again. */
const DOOR_REACH = 0.75;
const DOOR_CLOSE = 2.4;
/** How far outside its lot the steward can still reach a building's light switch (tiles). */
const LOT_REACH = 0.6;

export const interactModule: GameModule = {
  id: 'interact',
  deps: ['construction', 'explore', 'hud'],
  init(ctx) {
    const { city, bus } = ctx;
    const renderer = ctx.services.get('construction').renderer;
    const explore = ctx.services.get('explore');

    // ── Prompt card: the building in reach and what can be done there ────────────────────────────────────────
    const name = h('b', { class: 'ia-name' });
    const doorLabel = h('span', { class: 'l' });
    const lightLabel = h('span', { class: 'l' });
    const doorBtn = h('button', { class: 'ia-btn', onClick: () => toggleDoor() }, h('span', { class: 'g' }, icon('door')), doorLabel, h('kbd', {}, 'E'));
    const lightBtn = h('button', { class: 'ia-btn', onClick: () => toggleLights() }, h('span', { class: 'g' }, icon('bulb')), lightLabel, h('kbd', {}, 'L'));
    const card = h('div', { class: 'ia-card panel hidden', role: 'group', 'aria-label': 'Building in reach' }, name, h('div', { class: 'ia-row' }, doorBtn, lightBtn));
    document.body.append(card);

    /** The building in reach, and whether the steward stands at one of its doors. */
    let target = -1;
    let atDoor = false;
    /** Buildings with a door the steward opened (closed again once they walk away). */
    const opened = new Set<number>();
    const _d = new Vector3();

    const doorDistance = (eid: number, p: Readonly<Vector3>): number => {
      const doors = renderer.doorsOf(eid);
      if (!doors) return Infinity;
      let best = Infinity;
      for (const at of doors.at) best = Math.min(best, _d.copy(at).setY(p.y).distanceTo(p));
      return best;
    };

    /** Nearest building whose door is in reach, else the building whose lot the steward is at. */
    const find = (p: Readonly<Vector3>): [eid: number, door: boolean] => {
      const g = city.grid;
      let lot = -1;
      let lotD = Infinity;
      let door = -1;
      let doorD = DOOR_REACH;
      const seen = new Set<number>();
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const tx = Math.floor(p.x) + dx;
          const tz = Math.floor(p.z) + dz;
          if (!g.inBounds(tx, tz)) continue;
          const eid = g.occupant[g.index(tx, tz)]!;
          if (eid === NO_ENTITY || seen.has(eid)) continue;
          seen.add(eid);
          const dd = doorDistance(eid, p);
          if (dd < doorD) [door, doorD] = [eid, dd];
          // Distance from the steward to the lot's rectangle (0 inside it).
          const [x0, z0] = [Building.x[eid]!, Building.z[eid]!];
          const [x1, z1] = [x0 + Building.w[eid]!, z0 + Building.d[eid]!];
          const ld = Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(z0 - p.z, 0, p.z - z1));
          if (ld <= LOT_REACH && ld < lotD && renderer.hasLights(eid)) [lot, lotD] = [eid, ld];
        }
      return door >= 0 ? [door, true] : [lot, false];
    };

    const refresh = () => {
      const show = target >= 0 && !document.getElementById('hud')?.classList.contains('photo');
      card.classList.toggle('hidden', !show);
      if (!show) return;
      setText(name, city.buildingDef(target).name);
      const doors = renderer.doorsOf(target);
      doorBtn.classList.toggle('hidden', !atDoor || !doors);
      setText(doorLabel, doors?.open ? 'Close the door' : 'Open the door');
      const lit = renderer.hasLights(target);
      lightBtn.classList.toggle('hidden', !lit);
      setText(lightLabel, renderer.lightsOn(target) ? 'Lights off' : 'Lights on');
      lightBtn.classList.toggle('on', renderer.lightsOn(target));
    };

    function toggleDoor(): void {
      if (target < 0 || !atDoor) return;
      const open = !renderer.doorsOf(target)?.open;
      renderer.setDoor(target, open);
      if (open) opened.add(target);
      else opened.delete(target);
      const at = renderer.doorsOf(target)!.at[0]!;
      bus.emit('building:interact', { eid: target, kind: 'door', on: open, x: at.x, z: at.z });
      refresh();
    }

    function toggleLights(): void {
      if (target < 0 || !renderer.hasLights(target)) return;
      const on = !renderer.lightsOn(target);
      renderer.setLights(target, on);
      const r = city.buildingRecord(target);
      bus.emit('building:interact', { eid: target, kind: 'lights', on, x: r.x, z: r.z });
      refresh();
    }

    // E and L work the building in reach; before the explore module, which swallows letter keys while walking.
    ctx.input.onKey((e) => {
      if (target < 0 || e.metaKey || e.ctrlKey || e.altKey) return false;
      if (e.code === 'KeyE' && atDoor) return toggleDoor(), true;
      if (e.code === 'KeyL') return toggleLights(), true;
      return false;
    }, 5);

    let timer = 0;
    ctx.systems.add({
      id: 'interact.reach',
      phase: 'input',
      order: 3,
      update(_c, f) {
        // ~10 Hz is plenty to follow a walker, and keeps the DOM quiet.
        timer += f.dt;
        if (timer < 0.1) return;
        timer = 0;
        const p = explore.position;
        const walking = explore.mode === 'walk';
        for (const eid of opened) {
          if (walking && doorDistance(eid, p) < DOOR_CLOSE) continue;
          renderer.setDoor(eid, false);
          opened.delete(eid);
          const at = renderer.doorsOf(eid)?.at[0];
          if (at) bus.emit('building:interact', { eid, kind: 'door', on: false, x: at.x, z: at.z });
        }
        const [next, door] = walking ? find(p) : [-1, false];
        if (next !== target || door !== atDoor) {
          target = next;
          atDoor = door;
        }
        refresh();
      },
    });

    // Lights stay as the steward left them: saved by uid, re-applied after a load; a new city starts lit.
    // Moving parts (D-139): the building's own Stop / Start button in the inspector (wheels, rides, rotors).
    const motionButton = (eid: number): HTMLElement[] => {
      const m = city.buildingDef(eid).motion;
      if (!m || !renderer.hasMotion(eid)) return [];
      const on = renderer.motionOn(eid);
      return [
        h(
          'button',
          {
            class: `tool ${on ? '' : 'on'}`,
            title: m.help,
            onClick: () => {
              const next = !renderer.motionOn(eid);
              renderer.setMotion(eid, next);
              const r = city.buildingRecord(eid);
              bus.emit('building:interact', { eid, kind: 'motion', on: next, x: r.x, z: r.z });
              bus.emit('selection:changed', { eid });
            },
          },
          h('span', { class: 'g' }, icon(on ? 'pause' : 'play')),
          on ? m.off : m.on,
        ),
      ];
    };
    ctx.services.get('hud').buildingActions(motionButton);

    bus.on('city:reset', () => {
      renderer.dark.clear();
      renderer.stopped.clear();
      opened.clear();
      target = -1;
    });
    ctx.services.get('save').addHook({
      id: 'interact',
      save: () => ({ dark: [...renderer.dark], stopped: [...renderer.stopped] }),
      load: (_c, data) => {
        const dark = new Set(Array.isArray((data as { dark?: unknown })?.dark) ? ((data as { dark: number[] }).dark) : []);
        const stopped = new Set(Array.isArray((data as { stopped?: unknown })?.stopped) ? ((data as { stopped: number[] }).stopped) : []);
        for (const eid of city.buildingEntities()) {
          renderer.setLights(eid, !dark.has(Building.uid[eid]!));
          renderer.setMotion(eid, !stopped.has(Building.uid[eid]!));
        }
      },
    });
  },
};

declare module '@/core/EventBus' {
  interface GameEvents {
    /** The steward worked a building by hand (D-132): render-only, for sounds and juice. */
    'building:interact': { eid: number; kind: 'door' | 'lights' | 'motion'; on: boolean; x: number; z: number };
  }
}
