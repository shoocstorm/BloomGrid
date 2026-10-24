import { buildings } from '@/content';
import { NO_ENTITY } from '@/sim/Grid';
import { ROAD_COST } from '@/sim/commands';
import type { GameContext } from '@/game/context';
import type { Tool } from '@/game/Tools';
import type { GroundHit } from '@/world/Picking';
import { assembleBuilding } from './BuildingRenderer';
import type { Ghost } from './Ghost';

declare module '@/core/EventBus' {
  interface GameEvents {
    'selection:changed': { eid: number | null };
    toast: { text: string; tone?: 'ok' | 'bad' | 'info' };
  }
}

const fmt = (n: number) => Math.round(n).toLocaleString();

export interface BuildState {
  def: string;
  rot: number;
}

export function createTools(ghost: Ghost, build: BuildState) {
  let selected: number | null = null;

  const footprintCursor = (ctx: GameContext, eid: number) => {
    const { city } = ctx;
    const r = city.buildingRecord(eid);
    const [w, d] = city.footprint(city.buildingDef(eid), r.rot);
    ghost.showCursor(r.x, city.grid.rangeOver(r.x, r.z, w, d).max, r.z, w, d);
  };

  const select: Tool = {
    id: 'select',
    label: 'Inspect',
    icon: '◎',
    hotkey: 'Escape',
    dragPan: true,
    activate: () => ghost.setValid(true),
    deactivate: () => ghost.hideAll(),
    hover(ctx, hit) {
      ghost.setValid(true);
      const eid = hit?.inBounds ? ctx.city.buildingAt(hit.tx, hit.tz) : NO_ENTITY;
      if (eid !== NO_ENTITY) footprintCursor(ctx, eid);
      else if (selected !== null && ctx.city.buildingEntities().includes(selected)) footprintCursor(ctx, selected);
      else ghost.hideCursor();
    },
    up(ctx, hit) {
      if (ctx.input.dragDistance > 6) return;
      const eid = hit?.inBounds ? ctx.city.buildingAt(hit.tx, hit.tz) : NO_ENTITY;
      selected = eid === NO_ENTITY ? null : eid;
      ctx.bus.emit('selection:changed', { eid: selected });
    },
  };

  let lastKey = '';
  const anchor = (ctx: GameContext, hit: GroundHit) => {
    const def = buildings.get(build.def);
    const [w, d] = ctx.city.footprint(def, build.rot);
    return { def, w, d, x: Math.floor(hit.point.x - w / 2 + 0.5), z: Math.floor(hit.point.z - d / 2 + 0.5) };
  };

  const place: Tool = {
    id: 'build',
    label: 'Build',
    icon: '✿',
    grid: true,
    activate() {
      lastKey = '';
    },
    deactivate: () => ghost.hideAll(),
    hover(ctx, hit) {
      if (!hit) {
        ghost.hideAll();
        lastKey = '';
        return;
      }
      const { def, w, d, x, z } = anchor(ctx, hit);
      const key = `${def.id}|${x}|${z}|${build.rot}|${ctx.city.credits >= def.stats.cost}`;
      if (key === lastKey) return;
      lastKey = key;
      const res = ctx.city.checkPlacement(def, x, z, build.rot);
      ghost.setValid(res.ok);
      const inside = x >= 0 && z >= 0 && x + w <= ctx.city.grid.w && z + d <= ctx.city.grid.h;
      if (inside) {
        ghost.showPieces(assembleBuilding(ctx.city.grid, def, x, z, build.rot));
        ghost.showCursor(x, ctx.city.grid.rangeOver(x, z, w, d).max, z, w, d);
      } else ghost.hideAll();
      ctx.bus.emit('tool:tooltip', {
        text: res.ok ? `${def.name} · ${fmt(def.stats.cost)} ◈ · R to rotate` : `${def.name} — ${res.reason}`,
        tone: res.ok ? 'ok' : 'bad',
      });
    },
    up(ctx, hit) {
      if (!hit || ctx.input.dragDistance > 6) return;
      const { def, x, z } = anchor(ctx, hit);
      if (ctx.commands.execute('build', { def: def.id, x, z, rot: build.rot })) {
        ctx.bus.emit('toast', { text: `${def.name} is taking root`, tone: 'ok' });
        lastKey = '';
      }
    },
    key(_ctx, e) {
      if (e.code === 'KeyR') {
        build.rot = (build.rot + (e.shiftKey ? 3 : 1)) % 4;
        lastKey = '';
        return true;
      }
      return false;
    },
  };

  let dragStart: { x: number; z: number } | null = null;
  const pathTiles = (ctx: GameContext, a: { x: number; z: number }, b: { x: number; z: number }) => {
    const g = ctx.city.grid;
    const out: number[] = [];
    const sx = Math.sign(b.x - a.x);
    const sz = Math.sign(b.z - a.z);
    const xFirst = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z);
    const push = (x: number, z: number) => g.inBounds(x, z) && out.push(g.index(x, z));
    let x = a.x;
    let z = a.z;
    push(x, z);
    const walkX = () => {
      while (x !== b.x) push((x += sx), z);
    };
    const walkZ = () => {
      while (z !== b.z) push(x, (z += sz));
    };
    if (xFirst) {
      walkX();
      walkZ();
    } else {
      walkZ();
      walkX();
    }
    return out;
  };
  const tileList = (ctx: GameContext, tiles: number[]) =>
    tiles.map((t) => {
      const g = ctx.city.grid;
      const x = t % g.w;
      const z = (t / g.w) | 0;
      return [x, g.rangeOver(x, z, 1, 1).max, z] as [number, number, number];
    });

  const road: Tool = {
    id: 'road',
    label: 'Living Highway',
    icon: '≋',
    hotkey: 'KeyG',
    grid: true,
    activate: () => (dragStart = null),
    deactivate: () => ghost.hideAll(),
    hover(ctx, hit) {
      if (!hit?.inBounds) return ghost.hideAll();
      const cur = { x: hit.tx, z: hit.tz };
      const tiles = pathTiles(ctx, dragStart ?? cur, cur);
      const valid = tiles.filter((t) => ctx.city.canRoad(t));
      ghost.setValid(valid.length > 0);
      ghost.showTiles(tileList(ctx, tiles));
      ctx.bus.emit('tool:tooltip', {
        text: dragStart ? `${valid.length} tiles · ${fmt(valid.length * ROAD_COST)} ◈` : 'Drag to grow a moss highway',
        tone: valid.length ? 'ok' : 'bad',
      });
    },
    down(_ctx, hit) {
      if (hit?.inBounds) dragStart = { x: hit.tx, z: hit.tz };
    },
    up(ctx, hit) {
      if (dragStart && hit?.inBounds) ctx.commands.execute('road', { tiles: pathTiles(ctx, dragStart, { x: hit.tx, z: hit.tz }) });
      dragStart = null;
    },
  };

  let bzStart: { x: number; z: number } | null = null;
  const rectTiles = (ctx: GameContext, a: { x: number; z: number }, b: { x: number; z: number }) => {
    const g = ctx.city.grid;
    const out: number[] = [];
    for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++)
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) if (g.inBounds(x, z)) out.push(g.index(x, z));
    return out;
  };

  const bulldoze: Tool = {
    id: 'bulldoze',
    label: 'Return to Nature',
    icon: '⌫',
    hotkey: 'KeyX',
    activate: () => ghost.setValid(false),
    deactivate: () => ghost.hideAll(),
    hover(ctx, hit) {
      ghost.setValid(false);
      if (!hit?.inBounds) return ghost.hideAll();
      const cur = { x: hit.tx, z: hit.tz };
      if (bzStart) {
        ghost.hideCursor();
        ghost.showTiles(tileList(ctx, rectTiles(ctx, bzStart, cur)));
        return;
      }
      ghost.showTiles([]);
      const eid = ctx.city.buildingAt(hit.tx, hit.tz);
      if (eid !== NO_ENTITY) {
        footprintCursor(ctx, eid);
        const def = ctx.city.buildingDef(eid);
        ctx.bus.emit('tool:tooltip', { text: `Return ${def.name} to nature (+${fmt(def.stats.cost * 0.5)} ◈)`, tone: 'bad' });
      } else {
        ghost.showCursor(hit.tx, ctx.city.grid.rangeOver(hit.tx, hit.tz, 1, 1).max, hit.tz, 1, 1);
        ctx.bus.emit('tool:tooltip', { text: 'Click a building, or drag across highways', tone: 'bad' });
      }
    },
    down(_ctx, hit) {
      if (hit?.inBounds) bzStart = { x: hit.tx, z: hit.tz };
    },
    up(ctx, hit) {
      const start = bzStart;
      bzStart = null;
      ghost.showTiles([]);
      if (!start || !hit?.inBounds) return;
      if (start.x === hit.tx && start.z === hit.tz && ctx.city.buildingAt(hit.tx, hit.tz) !== NO_ENTITY) {
        ctx.commands.execute('demolish', { x: hit.tx, z: hit.tz });
        return;
      }
      ctx.commands.execute('unroad', { tiles: rectTiles(ctx, start, { x: hit.tx, z: hit.tz }) });
    },
  };

  return [select, place, road, bulldoze];
}
