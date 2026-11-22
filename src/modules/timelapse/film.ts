import type { GameContext } from '@/game/context';
import { h } from '@/ui/dom';
import { U } from '@/render/uniforms';
import { BRIDGE } from '@/sim/City';
import { openReel } from '@/modules/moments/reel';
import { FilmStage } from '@/modules/moments/FilmStage';
import { INTROS } from '@/modules/moments/loading';
import { orbit } from '@/modules/moments/shots';
import { buildTimeline, timelineInputOf, type TimelineMark } from './timeline';
import './timelapse.css';

/**
 * "The Island Remembers" (plan v6, D-219): the time-lapse of the player's own island, shot on location. Everything
 * that stands is veiled (render only: `BuildingRenderer.veil`, `RoadRenderer.veil`), then rises again in the order the
 * history ledger says it was built: the founding content ring by ring from the heart, then the years, with captions
 * for eras, wonders, unlocks and the big crises. One day passes over the whole film (dawn to lit evening), never a
 * flicker of days. The camera orbits what has risen and pulls back to fit it.
 *
 * A replay never changes the city: the reel holds the clock and every exit lifts the veil.
 */

/** Buildings re-added per frame at most (each spawns its kit pieces). */
const BUILDS_PER_FRAME = 40;
/** Seconds between highway reveals (each rebuilds the chunks it touches). */
const ROAD_GAP = 0.12;
/** Shadows are re-rendered at most this often while things rise. */
const SHADOW_GAP = 0.25;
/** The hour over the film: just after dawn to the evening lights. */
const HOUR_FROM = 0.27;
const HOUR_TO = 0.79;
/** Half the shot's vertical field of view (40°), as a tangent. */
const TAN_HALF_FOV = Math.tan((20 * Math.PI) / 180);

const SOUND: Record<TimelineMark['kind'], 'swell' | 'shimmer' | 'heartbeat'> = { era: 'swell', wonder: 'swell', project: 'shimmer', crisis: 'heartbeat' };

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** Plays the film; `done` runs once it has faded out (played through or skipped). */
export function playTimelapse(ctx: GameContext, done: () => void): void {
  const { city } = ctx;
  const name = city.growth.name || 'Your city';
  const input = timelineInputOf(city);
  const tl = buildTimeline(input);
  const con = ctx.services.get('construction');
  const world = ctx.services.tryGet('world');
  const stage = FilmStage.get(ctx);
  stage.clear();

  const where = new Map(input.buildings.map((b) => [b.id, b]));
  const total = input.buildings.length;
  let veiled = false;
  const lift = () => {
    if (!veiled) return;
    veiled = false;
    con.renderer.unveilAll();
    con.roads.revealAll();
    con.bridges.rebuild();
    world?.atmosphere.invalidateShadows();
  };
  let offReset = () => {};
  const reel = openReel(
    ctx,
    {
      scene: 'tl',
      label: `the story of ${name}`,
      key: 2,
      leak: 'rgba(170, 215, 255, 0.16)',
      leaving: () => {
        offReset();
        lift();
        stage.close();
      },
    },
    done,
  );
  // A city change mid-film (a load) ends it: the new city owns the renderers now.
  offReset = ctx.bus.on('city:reset', () => {
    veiled = false;
    reel.finish();
  });

  // ── DOM over the frame: the day, the counters, the timeline bar with its pips ──
  const dayNum = h('b', { class: 'tl-dnum' }, '1');
  const pop = h('b', {}, '0');
  const bld = h('b', {}, '0');
  const fill = h('i', { class: 'tl-fill' });
  const head = h('i', { class: 'tl-head' });
  const pips = tl.marks.map((m) =>
    h('i', { class: `tl-pip k-${m.kind}`, style: `left:${((100 * m.at) / tl.duration).toFixed(2)}%`, title: m.label }),
  );
  const hud = h(
    'div',
    { class: 'tl-hud' },
    h('p', { class: 'tl-kick' }, 'The Island Remembers'),
    h('p', { class: 'tl-name' }, name),
    h('p', { class: 'tl-day' }, h('span', {}, 'Day'), dayNum),
    h('p', { class: 'tl-stats' }, h('span', {}, pop, ' residents'), h('span', {}, bld, ' buildings')),
  );
  const bar = h('div', { class: 'tl-bar' }, fill, ...pips, h('i', { class: 'tl-headrail' }, head));
  // On the reel's root, not its set: the finish's slow drift scales the set and would push them off the edges.
  reel.root.append(hud, bar);

  // ── What has risen, for the camera: its bounds, eased ──
  const box = { x0: input.heart.x - 16, x1: input.heart.x + 16, z0: input.heart.z - 16, z1: input.heart.z + 16 };
  let grown = false;
  const grow = (x: number, z: number) => {
    if (!grown) {
      box.x0 = box.x1 = x;
      box.z0 = box.z1 = z;
      grown = true;
    }
    box.x0 = Math.min(box.x0, x);
    box.x1 = Math.max(box.x1, x);
    box.z0 = Math.min(box.z0, z);
    box.z1 = Math.max(box.z1, z);
  };
  const cam = { x: input.heart.x, z: input.heart.z, d: 90 };
  const yaw0 = ctx.cameraCtl.yaw;
  const sea = () => U.waterLevel.value as number;
  const frame = (t: number) => {
    const r = Math.max(22, (box.x1 - box.x0) / 2, (box.z1 - box.z0) / 2);
    const look: [number, number, number] = [cam.x, Math.max(sea(), city.grid.heightAt(cam.x, cam.z)) + 2, cam.z];
    stage.shots = [{ at: 0, dur: 0, from: orbit(look, cam.d, yaw0 + t * 0.045, 0.72 + Math.min(0.22, r / 1400), 40) }];
    return r;
  };

  // ── Playback ──
  let next = 0;
  let pendingRoads: number[] = [];
  let pendingBridge = false;
  let roadAt = 0;
  let shadowAt = 0;
  let changed = false;
  let built = 0;
  let mark = 0;
  let hudAt = 0;
  let start = -1;
  const reveal = (upTo: number, now: number, all = false) => {
    let builds = 0;
    const evs = tl.events;
    while (next < evs.length && evs[next]!.at <= upTo && (all || builds < BUILDS_PER_FRAME)) {
      const e = evs[next++]!;
      if (e.kind === 'road') {
        pendingRoads.push(e.id);
        if (city.grid.road[e.id] === BRIDGE) pendingBridge = true;
        continue;
      }
      con.renderer.unveil(e.id, !all);
      const b = where.get(e.id);
      if (b) grow(b.x, b.z);
      built++;
      builds++;
      changed = true;
    }
    if (pendingRoads.length && (all || now - roadAt >= ROAD_GAP)) {
      con.roads.reveal(pendingRoads, !all);
      if (pendingBridge) con.bridges.rebuild();
      pendingRoads = [];
      pendingBridge = false;
      roadAt = now;
      changed = true;
    }
    if (changed && (all || now - shadowAt >= SHADOW_GAP)) {
      world?.atmosphere.invalidateShadows();
      shadowAt = now;
      changed = false;
    }
  };
  const showHud = (ft: number) => {
    const s = tl.statsAt(ft);
    dayNum.textContent = fmt(Math.max(1, s.day));
    pop.textContent = fmt(s.residents);
    bld.textContent = fmt(built);
    const k = Math.min(1, ft / tl.duration);
    fill.style.transform = `scaleX(${k.toFixed(4)})`;
    head.style.transform = `translateX(${(k * 100).toFixed(2)}%)`;
    pips.forEach((p, i) => p.classList.toggle('on', tl.marks[i]!.at <= ft));
  };

  const film = async () => {
    reel.bed('wind', 0.25, 3);
    reel.bed('choir', 0.22, 5);
    reel.bed('hum', 0.12, 4);
    if (!(await reel.wait(0))) return;
    // The iris has closed: veil the island, then open on its founding morning.
    stage.openLocation(HOUR_FROM);
    for (const e of tl.events) if (e.kind === 'building') con.renderer.veil(e.id);
    con.roads.veil(tl.events.filter((e) => e.kind === 'road').map((e) => e.id));
    con.bridges.rebuild();
    veiled = true;
    world?.atmosphere.invalidateShadows();
    frame(0);
    stage.onFrame = (t, dt) => {
      if (start < 0) return;
      const ft = t - start;
      reveal(ft, t);
      const r = frame(ft);
      const k = 1 - Math.exp(-dt * 0.9);
      cam.x += ((box.x0 + box.x1) / 2 - cam.x) * k;
      cam.z += ((box.z0 + box.z1) / 2 - cam.z) * k;
      // Fit what has risen across the narrower side too: a phone held upright sees far less of it side to side.
      const el = ctx.renderer.domElement;
      const aspect = Math.max(0.3, (el.clientWidth || 1) / (el.clientHeight || 1));
      const fit = Math.max(r * 2.3 + 34, aspect < 1.2 ? (r * 1.15) / (TAN_HALF_FOV * aspect) : 0);
      cam.d += (Math.min(aspect < 1 ? 900 : 640, Math.max(70, fit)) - cam.d) * k;
      const p = Math.min(1, ft / tl.duration);
      stage.setTime(HOUR_FROM + (HOUR_TO - HOUR_FROM) * p * p * (3 - 2 * p));
      while (mark < tl.marks.length && tl.marks[mark]!.at <= ft) {
        const m = tl.marks[mark++]!;
        reel.say(m.label);
        reel.hit(SOUND[m.kind], 0, m.kind === 'era' || m.kind === 'wonder' ? 3 : 1);
      }
      if (t - hudAt > 0.12) {
        hudAt = t;
        showHud(ft);
      }
    };
    if (!(await stage.ready(reel, INTROS.timelapse))) return;
    start = stage.t;
    reel.on('play');
    reel.say(tl.founding ? `Day 1 · the founding of ${name}` : `Day 1 · ${name}`);
    if (!(await reel.wait(tl.duration * 1000))) return;
    // Whatever the clocks drifted, the island is whole before the card.
    reveal(Infinity, stage.t, true);
    showHud(tl.duration);
    reel.say('');
    reel.hit('swell', 0, 5);
    if (!(await reel.wait(1600))) return;
    reel.on('done');
    const residents = fmt(city.stats.population);
    await reel.end({
      kicker: 'The Island Remembers',
      title: name,
      drop: true,
      sub: `Day 1 to day ${fmt(city.day)}`,
      lines: [`${residents} residents`, `${fmt(total)} buildings`, tl.marks.length ? `${tl.marks.length} moments remembered` : 'Its story is only beginning'],
      button: 'Back to the city',
      hold: 12,
    });
  };
  void film();
}
