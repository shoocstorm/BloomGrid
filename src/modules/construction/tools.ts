import type { BridgeRecord } from '@/sim/bridges';
import { BRIDGE_DECK } from '@/sim/City';
import { pickObject } from './pick';
import type { BuildingRenderer } from './BuildingRenderer';
import { buildings } from '@/content';
import { NO_ENTITY } from '@/sim/Grid';
import { placementPreview, type PlacementPreview } from '@/sim/placementPreview';
import { MIST_COST, MIST_RADIUS, ZONE, mistZones } from '@/sim/floranet';
import { reclaimPlan, seaMask } from '@/sim/coast';
import { banyanPlan, bridgePlan } from '@/sim/weaver';
import { CHANNEL_COST, RETROFIT_RADIUS, ROAD_PLAN_COSTS, retrofitPlan } from '@/sim/commands';
import { bestRoute, type RoadPlan } from '@/sim/roadPlan';
import type { GameContext } from '@/game/context';
import type { Tool } from '@/game/Tools';
import type { GroundHit } from '@/world/Picking';
import { selectInRect } from '@/sim/select';
import { faceWater } from '@/sim/orient';
import { moveFee, relocatePlan } from '@/sim/relocate';
import { placeBuilding, placementMatrices } from './BuildingRenderer';
import type { Ghost } from './Ghost';
import { buildBlock } from '@/sim/buildGate';

declare module '@/core/EventBus' {
  interface GameEvents {
    /**
     * A building (eid) or, with `road`, the highway network containing that tile; with `eids`, a group of buildings
     * of one type (Ctrl/⌘-drag in Inspect, D-070).
     */
    /** `bridge`: a named bridge's key (D-128), sent with `road` (its deck tile) so road listeners still react. */
    'selection:changed': { eid: number | null; road?: number; eids?: number[]; bridge?: string };
    /** With `at` (tile coordinates), the toast is a button that flies the camera there. */
    toast: { text: string; tone?: 'ok' | 'bad' | 'info'; at?: { x: number; z: number } };
  }
}

const fmt = (n: number) => Math.round(n).toLocaleString();

/** Why some tiles of a highway drag won't be laid (D-125), for the tooltip. */
const SKIP_WORDS: Record<string, string> = { building: 'a building', channel: 'a channel', steep: 'too steep', credits: 'not enough credits' };
const skipText = (plan: RoadPlan): string => {
  if (!plan.skipped.length) return '';
  const n = new Map<string, number>();
  for (const s of plan.skipped) n.set(s.reason, (n.get(s.reason) ?? 0) + 1);
  return ` · ⚠ ${[...n].map(([r, k]) => `${k} skipped: ${SKIP_WORDS[r]}`).join(', ')}`;
};

/** Tooltip extras from the placement preview: land value, area, pairing (D-121). */
const previewText = (pv: PlacementPreview): string => {
  let t = ` · land value ${Math.round(pv.landValue * 100)}%`;
  if (pv.area) t += ` · ${pv.area.label} ${pv.area.radius} tiles`;
  if (pv.pairsWith.length) t += ` · ✿ pairs with ${pv.pairsWith[0]}`;
  else if (pv.completes.length) t += ` · ✿ pairs ${pv.completes[0]}`;
  return t;
};

export interface BuildState {
  def: string;
  rot: number;
}

/**
 * A placement refusal in the player's words (D-130): a lock, a limit or a short purse says what opens it (from
 * `sim/buildGate.ts`); `next` adds the first step to take. Lot problems (steep, occupied…) pass through.
 */
function blockedText(ctx: GameContext, defId: string, reason: string, next = false): string {
  if (!/^(Locked|Not enough credits|\d+ of \d+ built)/.test(reason)) return reason;
  const block = buildBlock(ctx.city, defId);
  if (!block) return reason;
  const step = block.steps.find((s) => s.act) ?? block.steps[0];
  return next && step ? `${block.reason}. ${step.text}` : block.reason;
}

export function createTools(ghost: Ghost, build: BuildState, renderer: BuildingRenderer) {
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

  /** What the pointer is over (D-129): buildings by their whole volume, bridges by deck and structure. */
  const pick = (ctx: GameContext, hit: GroundHit | null) => pickObject(ctx, renderer, hit);
  /** The building the pointer is over (its whole volume), or NO_ENTITY. */
  const pickBuilding = (ctx: GameContext, hit: GroundHit | null) => {
    const over = pick(ctx, hit);
    return over?.kind === 'building' ? over.eid : NO_ENTITY;
  };
  /** The deck of a bridge as a footprint highlight. */
  const bridgeCursor = (b: BridgeRecord) => {
    const [w, d] = b.alongX ? [b.len, 1] : [1, b.len];
    ghost.showCursor(b.x, BRIDGE_DECK, b.z, w, d);
  };

  let followsSelection = false;
  /** Ctrl/⌘-drag group selection: the drag's first tile, the current group and its highlighted footprints. */
  let rect: { x: number; z: number } | null = null;
  let group: number[] = [];
  let groupTiles: [number, number, number][] = [];
  const footprints = (ctx: GameContext, eids: number[]) => {
    const out: [number, number, number][] = [];
    const g = ctx.city.grid;
    for (const e of eids) {
      if (!ctx.city.buildingEntities().includes(e)) continue;
      const r = ctx.city.buildingRecord(e);
      const [w, d] = ctx.city.footprint(ctx.city.buildingDef(e), r.rot);
      for (let z = r.z; z < r.z + d; z++) for (let x = r.x; x < r.x + w; x++) out.push([x, g.rangeOver(x, z, 1, 1).max, z]);
    }
    return out;
  };
  const endRect = (ctx: GameContext) => {
    rect = null;
    ctx.cameraCtl.dragPan = true;
    ghost.hideCursor();
  };
  /**
   * Shift-drag in Inspect carries a building to a new lot: `carry` is the building, its facing (R turns it) and
   * where it would land; the ghost shows it there, green or red.
   */
  let carry: { eid: number; rot: number; at: { x: number; z: number; ok: boolean } | null; key: string } | null = null;
  const carryAt = (ctx: GameContext, hit: GroundHit | null) => {
    if (!carry) return;
    const { city } = ctx;
    const def = city.buildingDef(carry.eid);
    const [w, d] = city.footprint(def, carry.rot);
    if (!hit?.inBounds) {
      carry.at = null;
      carry.key = '';
      ghost.hideAll();
      return;
    }
    const x = Math.floor(hit.point.x - w / 2 + 0.5);
    const z = Math.floor(hit.point.z - d / 2 + 0.5);
    const key = `${x}|${z}|${carry.rot}|${city.credits >= moveFee(city, carry.eid)}`;
    if (key === carry.key) return;
    carry.key = key;
    const plan = relocatePlan(city, carry.eid, x, z, carry.rot);
    carry.at = { x, z, ok: plan.ok };
    ghost.setValid(plan.ok);
    if (x >= 0 && z >= 0 && x + w <= city.grid.w && z + d <= city.grid.h) {
      ghost.showPieces(placementMatrices(placeBuilding(city.grid, def, x, z, carry.rot)));
      ghost.showCursor(x, city.grid.rangeOver(x, z, w, d).max, z, w, d);
    } else ghost.hideAll();
    const loses = plan.bridges ? ` · ${plan.bridges} sky-bridge${plan.bridges > 1 ? 's' : ''} come${plan.bridges > 1 ? '' : 's'} down` : '';
    ctx.bus.emit('tool:tooltip', {
      text: plan.ok
        ? `Move ${def.name} here · ${fmt(plan.fee)} ◈ · R to rotate · Esc to cancel${loses}${plan.warning ? ` · ⚠ ${plan.warning}` : ''}`
        : `${def.name} — ${plan.reason}`,
      tone: plan.ok && !plan.warning && !plan.bridges ? 'ok' : 'bad',
    });
  };
  const endCarry = (ctx: GameContext) => {
    carry = null;
    ctx.cameraCtl.dragPan = true;
    ghost.hideAll();
    ghost.showTiles(groupTiles);
    ctx.bus.emit('tool:tooltip', { text: null });
  };

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
        ctx.bus.on('selection:changed', ({ eid, eids }) => {
          selected = eid ?? null;
          group = eids ?? [];
          groupTiles = footprints(ctx, group);
          ghost.showTiles(groupTiles);
        });
        ctx.bus.on('building:removed', ({ eid }) => {
          if (!group.includes(eid)) return;
          group = group.filter((e) => e !== eid);
          groupTiles = footprints(ctx, group);
        });
      }
      ghost.showTiles(groupTiles);
    },
    deactivate(ctx) {
      if (rect) endRect(ctx);
      if (carry) endCarry(ctx);
      ghost.hideAll();
    },
    hover(ctx, hit) {
      if (carry) return carryAt(ctx, hit);
      ghost.setValid(true);
      if (rect && hit?.inBounds) {
        // The rectangle, and the buildings it would select.
        const [x0, z0] = [Math.min(rect.x, hit.tx), Math.min(rect.z, hit.tz)];
        const [w, d] = [Math.abs(hit.tx - rect.x) + 1, Math.abs(hit.tz - rect.z) + 1];
        ghost.showCursor(x0, ctx.city.grid.rangeOver(rect.x, rect.z, 1, 1).max, z0, w, d);
        const r = selectInRect(ctx.city, rect.x, rect.z, hit.tx, hit.tz);
        ghost.showTiles(footprints(ctx, r.eids));
        const name = r.def ? buildings.get(r.def).name : '';
        ctx.bus.emit('tool:tooltip', {
          text: r.eids.length ? `Select ${r.eids.length} × ${name}` : 'No buildings in the box',
          tone: r.eids.length ? 'ok' : 'bad',
        });
        return;
      }
      const over = pick(ctx, hit);
      if (over?.kind === 'building') footprintCursor(ctx, over.eid);
      else if (over?.kind === 'bridge') bridgeCursor(over.bridge);
      else if (selected !== null && ctx.city.buildingEntities().includes(selected)) footprintCursor(ctx, selected);
      else ghost.hideCursor();
      if (group.length) ghost.showTiles(groupTiles);
    },
    down(ctx, hit, e) {
      if (e.touch || !hit?.inBounds) return;
      // Shift + drag picks a building up and carries it to a new lot.
      if (e.shift && !e.ctrl) {
        const over = pick(ctx, hit);
        if (over?.kind !== 'building') return;
        const eid = over.eid;
        carry = { eid, rot: ctx.city.buildingRecord(eid).rot, at: null, key: '' };
        ctx.cameraCtl.dragPan = false;
        ghost.showTiles([]);
        carryAt(ctx, hit);
        return;
      }
      // Ctrl (⌘ on a Mac) + drag boxes a group of buildings of one type instead of panning.
      if (!e.ctrl) return;
      rect = { x: hit.tx, z: hit.tz };
      ctx.cameraCtl.dragPan = false;
    },
    cancel(ctx) {
      if (rect) endRect(ctx);
      if (carry) endCarry(ctx);
      ghost.showTiles(groupTiles);
    },
    key(ctx, e) {
      if (!carry) return false;
      if (e.code === 'KeyR') {
        carry.rot = (carry.rot + (e.shiftKey ? 3 : 1)) % 4;
        carryAt(ctx, ctx.tools.hit);
        return true;
      }
      if (e.code === 'Escape') {
        endCarry(ctx);
        return true;
      }
      return false;
    },
    up(ctx, hit) {
      if (carry) {
        const { eid, rot, at } = carry;
        endCarry(ctx);
        if (!at?.ok) return;
        const r = ctx.city.buildingRecord(eid);
        const name = ctx.city.buildingDef(eid).name;
        if (ctx.commands.execute('move', { from: [r.x, r.z], x: at.x, z: at.z, rot })) {
          ctx.bus.emit('toast', { text: `${name} takes root on its new lot`, tone: 'ok' });
          const moved = ctx.city.buildingAt(at.x, at.z);
          selected = moved;
          ctx.bus.emit('selection:changed', { eid: moved });
        }
        return;
      }
      if (rect) {
        const start = rect;
        endRect(ctx);
        ctx.bus.emit('tool:tooltip', { text: null });
        const r = hit?.inBounds ? selectInRect(ctx.city, start.x, start.z, hit.tx, hit.tz) : { eids: [] };
        if (r.eids.length > 1) ctx.bus.emit('selection:changed', { eid: null, eids: r.eids });
        else ctx.bus.emit('selection:changed', { eid: r.eids[0] ?? null });
        return;
      }
      if (!ctx.input.isTap) return;
      // Forgiving picks (D-129): a building anywhere on its volume, a bridge on its deck or structure (D-128 panel),
      // else the highway network under the cursor.
      const over = pick(ctx, hit);
      selected = over?.kind === 'building' ? over.eid : null;
      if (over?.kind === 'bridge') ctx.bus.emit('selection:changed', { eid: null, road: over.tile, bridge: over.bridge.key });
      else if (over?.kind === 'road') ctx.bus.emit('selection:changed', { eid: null, road: over.tile });
      else ctx.bus.emit('selection:changed', { eid: selected });
    },
  };

  let lastKey = '';
  /** R was pressed since this building was picked up: stop auto-facing the water. */
  let manualRot = false;
  const anchor = (ctx: GameContext, hit: GroundHit) => {
    const def = buildings.get(build.def);
    // Waterside buildings (docks, intakes) turn to face the water under the cursor until the steward rotates
    // them by hand (D-095).
    if (def.placement?.nearWater && !manualRot) build.rot = faceWater(ctx.city, def, hit.point.x, hit.point.z).rot;
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
      manualRot = false;
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
      ghost.setValid(res.ok, res.ok && !!res.warning);
      const inside = x >= 0 && z >= 0 && x + w <= ctx.city.grid.w && z + d <= ctx.city.grid.h;
      const pv = inside ? placementPreview(ctx.city, def, x, z, build.rot) : null;
      if (inside) {
        ghost.showPieces(placementMatrices(placeBuilding(ctx.city.grid, def, x, z, build.rot)));
        const top = ctx.city.grid.rangeOver(x, z, w, d).max;
        ghost.showCursor(x, top, z, w, d);
        // The area it will serve, so coverage is judged before building (D-121).
        if (pv?.area) ghost.showRing(x + w / 2, top - 0.4, z + d / 2, pv.area.radius);
        else ghost.hideRing();
      } else ghost.hideAll();
      ctx.bus.emit('tool:tooltip', {
        text: res.ok
          ? `${def.name} · ${fmt(def.stats.cost)} ◈${pv ? previewText(pv) : ''} · ${ctx.input.touch ? 'tap it again to build' : 'R to rotate'}${res.warning ? ` · ⚠ ${res.warning}` : ''}`
          : `${def.name} — ${blockedText(ctx, def.id, res.reason!)}`,
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
      } else {
        // Say why, and for a lock, limit or empty purse what to do next (the Build panel's card lists the steps).
        const res = ctx.city.checkPlacement(def, x, z, build.rot);
        const why = res.ok ? null : res.reason;
        if (why) ctx.bus.emit('toast', { text: `${def.name}: ${blockedText(ctx, def.id, why, true)}`, tone: 'bad' });
      }
    },
    key(_ctx, e) {
      if (e.code === 'KeyR') {
        manualRot = true;
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
    grid: true,
    activate: () => (dragStart = null),
    deactivate: () => ghost.hideAll(),
    hover(ctx, hit) {
      if (!hit?.inBounds) return ghost.hideAll();
      const cur = { x: hit.tx, z: hit.tz };
      // One plan for preview and command (D-125): the better L route, bridges landed on the far bank, steep
      // banks graded as abutments; what can't be laid says why.
      const plan = bestRoute(ctx.city, dragStart ?? cur, cur, ROAD_PLAN_COSTS);
      ghost.setValid(plan.place.length > 0 || plan.clear.length > 0, plan.skipped.length > 0);
      ghost.showTiles(tileList(ctx, plan.place.length ? [...plan.place, ...plan.clear] : plan.path));
      const why = skipText(plan);
      ctx.bus.emit('tool:tooltip', {
        text: dragStart
          ? `${plan.place.length} tiles${plan.bridges ? ` (${plan.bridges} bridge)` : ''}${plan.grade.length ? ' · banks graded' : ''} · ${fmt(plan.cost)} ◈${why}`
          : `Drag to grow a moss highway · crosses water as a bridge${why}`,
        tone: plan.place.length && !plan.skipped.length ? 'ok' : 'bad',
      });
    },
    down(_ctx, hit) {
      if (hit?.inBounds) dragStart = { x: hit.tx, z: hit.tz };
    },
    cancel: () => (dragStart = null),
    up(ctx, hit) {
      if (dragStart && hit?.inBounds) {
        const plan = bestRoute(ctx.city, dragStart, { x: hit.tx, z: hit.tz }, ROAD_PLAN_COSTS);
        ctx.commands.execute('road', { tiles: plan.path, bridges: true });
      }
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
      const eid = pickBuilding(ctx, hit);
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
      const eid = pickBuilding(ctx, hit);
      if (start.x === hit.tx && start.z === hit.tz && eid !== NO_ENTITY) {
        if (e.touch && !confirmTap(`demolish:${eid}`, hit.tx, hit.tz, () => true)) {
          ctx.bus.emit('tool:tooltip', { text: `Tap ${ctx.city.buildingDef(eid).name} again to return it to nature`, tone: 'bad' });
          return;
        }
        armed = null;
        const r = ctx.city.buildingRecord(eid);
        ctx.commands.execute('demolish', { x: r.x, z: r.z });
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
      const eid = pickBuilding(ctx, hit);
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
      const eid = pickBuilding(ctx, hit);
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
