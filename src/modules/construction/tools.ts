import { buildings } from '@/content';
import { NO_ENTITY } from '@/sim/Grid';
import { MIST_COST, MIST_RADIUS, ZONE, mistZones } from '@/sim/floranet';
import { reclaimPlan, seaMask } from '@/sim/coast';
import { banyanPlan, bridgePlan } from '@/sim/weaver';
import { CHANNEL_COST, RETROFIT_RADIUS, retrofitPlan, roadTileCost } from '@/sim/commands';
import type { GameContext } from '@/game/context';
import type { Tool } from '@/game/Tools';
import type { GroundHit } from '@/world/Picking';
import { placeBuilding, placementMatrices } from './BuildingRenderer';
import type { Ghost } from './Ghost';

declare module '@/core/EventBus' {
  interface GameEvents {
    /** A building (eid) or, with `road`, the highway network containing that tile. */
    'selection:changed': { eid: number | null; road?: number };
    /** With `at` (tile coordinates), the toast is a button that flies the camera there. */
    toast: { text: string; tone?: 'ok' | 'bad' | 'info'; at?: { x: number; z: number } };
  }
}

const fmt = (n: number) => Math.round(n).toLocaleString();

export interface BuildState {
  def: string;
  rot: number;
}

export function createTools(ghost: Ghost, build: BuildState) {
  let selected: number | null = null;
  /**
   * Touch has no hover: the first tap previews (ghost, ring, highlight) and a second tap on the
   * preview confirms. `armed` is the previewed spot; any other tap moves the preview there.
   */
  let armed: { x: number; z: number; kind: string } | null = null;
  const confirmTap = (kind: string, x: number, z: number, near: (a: { x: number; z: number }) => boolean): boolean => {
    if (armed?.kind === kind && near(armed)) return true;
    armed = { x, z, kind };
    return false;
  };

  const footprintCursor = (ctx: GameContext, eid: number) => {
    const { city } = ctx;
    const r = city.buildingRecord(eid);
    const [w, d] = city.footprint(city.buildingDef(eid), r.rot);
    ghost.showCursor(r.x, city.grid.rangeOver(r.x, r.z, w, d).max, r.z, w, d);
  };

  let followsSelection = false;
  const select: Tool = {
    id: 'select',
    label: 'Inspect',
    icon: '◎',
    hotkey: 'Escape',
    dragPan: true,
    activate(ctx) {
      ghost.setValid(true);
      // Follow selections made elsewhere (the inspector's close, the inventory, the advisor), so a closed
      // inspector drops the footprint highlight.
      if (!followsSelection) {
        followsSelection = true;
        ctx.bus.on('selection:changed', ({ eid }) => (selected = eid ?? null));
      }
    },
    deactivate: () => ghost.hideAll(),
    hover(ctx, hit) {
      ghost.setValid(true);
      const eid = hit?.inBounds ? ctx.city.buildingAt(hit.tx, hit.tz) : NO_ENTITY;
      if (eid !== NO_ENTITY) footprintCursor(ctx, eid);
      else if (selected !== null && ctx.city.buildingEntities().includes(selected)) footprintCursor(ctx, selected);
      else ghost.hideCursor();
    },
    up(ctx, hit) {
      if (!ctx.input.isTap) return;
      const eid = hit?.inBounds ? ctx.city.buildingAt(hit.tx, hit.tz) : NO_ENTITY;
      selected = eid === NO_ENTITY ? null : eid;
      const tile = hit?.inBounds ? ctx.city.grid.index(hit.tx, hit.tz) : -1;
      if (selected === null && tile >= 0 && ctx.city.grid.road[tile]) ctx.bus.emit('selection:changed', { eid: null, road: tile });
      else ctx.bus.emit('selection:changed', { eid: selected });
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
        ghost.showPieces(placementMatrices(placeBuilding(ctx.city.grid, def, x, z, build.rot)));
        ghost.showCursor(x, ctx.city.grid.rangeOver(x, z, w, d).max, z, w, d);
      } else ghost.hideAll();
      ctx.bus.emit('tool:tooltip', {
        text: res.ok
          ? `${def.name} · ${fmt(def.stats.cost)} ◈ · ${ctx.input.touch ? 'tap it again to build' : 'R to rotate'}${res.warning ? ` · ⚠ ${res.warning}` : ''}`
          : `${def.name} — ${res.reason}`,
        tone: res.ok && !res.warning ? 'ok' : 'bad',
      });
    },
    up(ctx, hit, e) {
      if (!hit || !ctx.input.isTap) return;
      const { def, w, d, ...at } = anchor(ctx, hit);
      let { x, z } = at;
      if (e.touch) {
        // A tap inside the previewed footprint builds there, so a slightly-off finger doesn't shift it.
        const inside = (a: { x: number; z: number }) => hit.tx >= a.x && hit.tx < a.x + w && hit.tz >= a.z && hit.tz < a.z + d;
        if (!confirmTap(`build:${def.id}:${build.rot}`, x, z, inside)) return;
        ({ x, z } = armed!);
        armed = null;
      }
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
      const valid = tiles.filter((t) => ctx.city.canRoad(t, true));
      const cost = valid.reduce((a, t) => a + roadTileCost(ctx.city, t), 0);
      const bridges = valid.filter((t) => ctx.city.isWaterTile(t % ctx.city.grid.w, (t / ctx.city.grid.w) | 0)).length;
      ghost.setValid(valid.length > 0);
      ghost.showTiles(tileList(ctx, tiles));
      ctx.bus.emit('tool:tooltip', {
        text: dragStart
          ? `${valid.length} tiles${bridges ? ` (${bridges} bridge)` : ''} · ${fmt(cost)} ◈`
          : 'Drag to grow a moss highway · crosses water as a bridge',
        tone: valid.length ? 'ok' : 'bad',
      });
    },
    down(_ctx, hit) {
      if (hit?.inBounds) dragStart = { x: hit.tx, z: hit.tz };
    },
    cancel: () => (dragStart = null),
    up(ctx, hit) {
      if (dragStart && hit?.inBounds) ctx.commands.execute('road', { tiles: pathTiles(ctx, dragStart, { x: hit.tx, z: hit.tz }), bridges: true });
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
    cancel() {
      bzStart = null;
      ghost.showTiles([]);
    },
    up(ctx, hit, e) {
      const start = bzStart;
      bzStart = null;
      ghost.showTiles([]);
      if (!start || !hit?.inBounds) return;
      const eid = ctx.city.buildingAt(hit.tx, hit.tz);
      if (start.x === hit.tx && start.z === hit.tz && eid !== NO_ENTITY) {
        if (e.touch && !confirmTap(`demolish:${eid}`, hit.tx, hit.tz, () => true)) {
          ctx.bus.emit('tool:tooltip', { text: `Tap ${ctx.city.buildingDef(eid).name} again to return it to nature`, tone: 'bad' });
          return;
        }
        armed = null;
        ctx.commands.execute('demolish', { x: hit.tx, z: hit.tz });
        return;
      }
      const tiles = rectTiles(ctx, start, { x: hit.tx, z: hit.tz });
      ctx.commands.execute('unroad', { tiles });
      ctx.commands.execute('unchannel', { tiles });
    },
  };

  let chStart: { x: number; z: number } | null = null;
  const channel: Tool = {
    id: 'channel',
    label: 'Filtration Channel',
    icon: '≈',
    hotkey: 'KeyC',
    grid: true,
    activate: () => (chStart = null),
    deactivate: () => ghost.hideAll(),
    hover(ctx, hit) {
      if (!hit?.inBounds) return ghost.hideAll();
      const cur = { x: hit.tx, z: hit.tz };
      const tiles = pathTiles(ctx, chStart ?? cur, cur);
      const valid = tiles.filter((t) => ctx.city.canChannel(t));
      ghost.setValid(valid.length > 0);
      ghost.showTiles(tileList(ctx, tiles));
      ctx.bus.emit('tool:tooltip', {
        text: chStart
          ? `${valid.length} tiles · ${fmt(valid.length * CHANNEL_COST)} ◈`
          : 'Drag a bioswale: cleans nearby pollution and irrigates gardens (bloom +)',
        tone: valid.length ? 'ok' : 'bad',
      });
    },
    down(_ctx, hit) {
      if (hit?.inBounds) chStart = { x: hit.tx, z: hit.tz };
    },
    cancel: () => (chStart = null),
    up(ctx, hit) {
      if (chStart && hit?.inBounds) ctx.commands.execute('channel', { tiles: pathTiles(ctx, chStart, { x: hit.tx, z: hit.tz }) });
      chStart = null;
    },
  };

  const retrofit: Tool = {
    id: 'retrofit',
    label: 'Bloom Retrofit',
    icon: '✾',
    hotkey: 'KeyB',
    deactivate: () => ghost.hideAll(),
    hover(ctx, hit) {
      if (!hit?.inBounds) {
        ghost.hideRing();
        return;
      }
      const plan = retrofitPlan(ctx.city, hit.point.x, hit.point.z, RETROFIT_RADIUS);
      const ok = plan.eids.length > 0 && ctx.city.credits >= plan.cost;
      ghost.setValid(ok);
      ghost.showRing(hit.point.x, hit.point.y, hit.point.z, RETROFIT_RADIUS);
      ctx.bus.emit('tool:tooltip', {
        text: plan.eids.length
          ? `Transform ${plan.eids.length} buildings${plan.channels.length ? ` + ${plan.channels.length} channel tiles` : ''} · ${fmt(plan.cost)} ◈${ok ? '' : ' (not enough credits)'}`
          : 'No buildings left to retrofit here',
        tone: ok ? 'ok' : 'bad',
      });
    },
    up(ctx, hit, e) {
      if (!hit?.inBounds || !ctx.input.isTap) return;
      if (e.touch && !confirmTap('retrofit', hit.point.x, hit.point.z, (a) => Math.hypot(a.x - hit.point.x, a.z - hit.point.z) < 4)) return;
      armed = null;
      if (ctx.commands.execute('retrofit', { x: hit.point.x, z: hit.point.z, radius: RETROFIT_RADIUS }))
        ctx.bus.emit('toast', { text: 'The district bursts into bloom', tone: 'ok' });
    },
  };

  const mist: Tool = {
    id: 'mist',
    label: 'Flora-Net Mist',
    icon: '☂',
    hotkey: 'KeyY',
    deactivate: () => ghost.hideAll(),
    hover(ctx, hit) {
      if (!hit?.inBounds) {
        ghost.hideRing();
        return;
      }
      const zones = mistZones(ctx.city, hit.point.x, hit.point.z);
      const H = ctx.city.soil.hydration;
      const avg = zones.length ? zones.reduce((a, z) => a + H[z]!, 0) / zones.length : 1;
      const ok = zones.length > 0 && ctx.city.credits >= MIST_COST;
      ghost.setValid(ok);
      ghost.showRing(hit.point.x, hit.point.y, hit.point.z, (MIST_RADIUS + 0.5) * ZONE);
      ctx.bus.emit('tool:tooltip', {
        text: `Mist ${zones.length} soil zones (now ${Math.round(avg * 100)}% moist) · ${MIST_COST} ◈${ok ? '' : ' (not enough credits)'}`,
        tone: ok ? 'ok' : 'bad',
      });
    },
    up(ctx, hit, e) {
      if (!hit?.inBounds || !ctx.input.isTap) return;
      if (e.touch && !confirmTap('mist', hit.point.x, hit.point.z, (a) => Math.hypot(a.x - hit.point.x, a.z - hit.point.z) < 4)) return;
      armed = null;
      if (ctx.commands.execute('mist', { x: hit.point.x, z: hit.point.z })) ctx.bus.emit('toast', { text: 'Flora-Net drones mist the gardens', tone: 'ok' });
    },
  };

  // Land reclamation: drag a rectangle over the shallow shelf next to the coast.
  let rcStart: { x: number; z: number } | null = null;
  let sea: Uint8Array | null = null;
  const reclaim: Tool = {
    id: 'reclaim',
    label: 'Reclaim Land',
    icon: '⛰',
    hotkey: 'KeyT',
    grid: true,
    activate: () => (sea = null),
    deactivate: () => ghost.hideAll(),
    hover(ctx, hit) {
      if (!hit?.inBounds) return ghost.hideAll();
      sea ??= seaMask(ctx.city);
      const a = rcStart ?? { x: hit.tx, z: hit.tz };
      const plan = reclaimPlan(ctx.city, a.x, a.z, hit.tx, hit.tz, sea);
      const ok = plan.tiles.length > 0 && ctx.city.credits >= plan.cost;
      ghost.setValid(ok);
      ghost.hideCursor();
      ghost.showTiles(plan.tiles.map((t) => [t % ctx.city.grid.w, 0.06, (t / ctx.city.grid.w) | 0] as [number, number, number]));
      ctx.bus.emit('tool:tooltip', {
        text: plan.tiles.length
          ? `Reclaim ${plan.tiles.length} tiles of shallow sea · ${fmt(plan.cost)} ◈${ok ? '' : ' (not enough credits)'}`
          : rcStart
            ? (plan.reason ?? 'Nothing to reclaim')
            : 'Drag over shallow sea next to the coast to raise new land',
        tone: ok ? 'ok' : 'bad',
      });
    },
    down(_ctx, hit) {
      if (hit?.inBounds) rcStart = { x: hit.tx, z: hit.tz };
    },
    cancel() {
      rcStart = null;
      ghost.showTiles([]);
    },
    up(ctx, hit) {
      const start = rcStart;
      rcStart = null;
      ghost.showTiles([]);
      if (!start || !hit?.inBounds) return;
      if (ctx.commands.execute('reclaim', { x0: start.x, z0: start.z, x1: hit.tx, z1: hit.tz })) {
        sea = null;
        ctx.bus.emit('toast', { text: 'New land rises from the shallows', tone: 'ok' });
      }
    },
  };

  // Green Weaver: click a tower, then another to weave a sky-bridge, or the same one again to
  // merge it with a banyan.
  let weaveFrom: number | null = null;
  const weave: Tool = {
    id: 'weave',
    label: 'Green Weaver',
    icon: '❦',
    hotkey: 'KeyV',
    activate: () => (weaveFrom = null),
    deactivate: () => {
      weaveFrom = null;
      ghost.hideAll();
    },
    key(_ctx, e) {
      if (e.code !== 'Escape' || weaveFrom === null) return false;
      weaveFrom = null;
      return true;
    },
    hover(ctx, hit) {
      const { city } = ctx;
      const eid = hit?.inBounds ? city.buildingAt(hit.tx, hit.tz) : NO_ENTITY;
      if (eid !== NO_ENTITY) footprintCursor(ctx, eid);
      else ghost.hideCursor();
      const from = weaveFrom !== null && city.buildingEntities().includes(weaveFrom) ? weaveFrom : null;
      if (from !== null) {
        const r = city.buildingRecord(from);
        const [w, d] = city.footprint(city.buildingDef(from), r.rot);
        ghost.showRing(r.x + w / 2, city.grid.rangeOver(r.x, r.z, w, d).max, r.z + d / 2, 1.6);
      } else ghost.hideRing();
      let text = 'Click a tower to start weaving';
      let ok = false;
      if (from === null && eid !== NO_ENTITY) {
        ok = !!city.buildingDef(eid).tower;
        text = ok ? `${city.buildingDef(eid).name}: click again to merge with a banyan, or pick a second tower` : 'Only towers can be woven';
      } else if (from !== null && eid === from) {
        const plan = banyanPlan(city, eid);
        ok = plan.ok;
        text = ok ? `Merge with a banyan · ${fmt(plan.cost)} ◈ (ecology ×2, harmony +)` : plan.reason!;
      } else if (from !== null && eid !== NO_ENTITY) {
        const plan = bridgePlan(city, from, eid);
        ok = plan.ok;
        text = ok ? `Weave a ${Math.round(plan.length)}-tile sky-bridge · ${fmt(plan.cost)} ◈` : plan.reason!;
      } else if (from !== null) text = 'Pick a second tower (Esc to cancel)';
      ghost.setValid(ok);
      ctx.bus.emit('tool:tooltip', { text, tone: ok ? 'ok' : 'bad' });
    },
    up(ctx, hit) {
      if (!hit?.inBounds || !ctx.input.isTap) return;
      const { city } = ctx;
      const eid = city.buildingAt(hit.tx, hit.tz);
      if (eid === NO_ENTITY || !city.buildingDef(eid).tower) {
        weaveFrom = null;
        return;
      }
      if (weaveFrom === null || !city.buildingEntities().includes(weaveFrom)) {
        weaveFrom = eid;
        return;
      }
      const a = city.buildingRecord(weaveFrom);
      const b = city.buildingRecord(eid);
      if (eid === weaveFrom) {
        if (ctx.commands.execute('banyan', { x: a.x, z: a.z })) ctx.bus.emit('toast', { text: 'A banyan embraces the tower', tone: 'ok' });
      } else if (ctx.commands.execute('weave', { a: [a.x, a.z], b: [b.x, b.z] })) ctx.bus.emit('toast', { text: 'A flowering sky-bridge grows between the towers', tone: 'ok' });
      weaveFrom = null;
    },
  };

  const tools = [select, place, road, bulldoze, channel, retrofit, mist, reclaim, weave];
  for (const t of tools) {
    const activate = t.activate;
    t.activate = (ctx) => {
      armed = null;
      activate?.(ctx);
    };
  }
  return tools;
}
