import type { GameContext } from '@/game/context';
import { h } from '@/ui/dom';
import { U } from '@/render/uniforms';
import { Building } from '@/ecs/components';
import type { Projection } from '@/sim/foresee';
import { openReel } from '@/modules/moments/reel';
import { FilmStage } from '@/modules/moments/FilmStage';
import { INTROS } from '@/modules/moments/loading';
import { orbit } from '@/modules/moments/shots';
import { burnFlare, disposeFlare, flare, FLARE_S } from '@/modules/timelapse/flare';
import './future.css';

/**
 * "If Nothing Changes" (plan v7, Phase 35, D-223): Flora's look ahead, played forwards over the real island. The
 * city stands as it is today; on the film's clock the projection happens to it (render only): buildings slip or
 * climb a level, ruins fold down to rubble, lost buildings fold away, crises flare where they strike (the camera
 * leans toward them) and the counters run from today to the horizon. Everything is redrawn from the sim when it ends.
 *
 * The postcard (`postcard.ts`) follows: the numbers and Flora's levers.
 */

/** Film seconds over the whole horizon. */
export const FUTURE_SECONDS = 24;
const HOUR_FROM = 0.42;
const HOUR_TO = 0.83;
const PER_FRAME = 40;

type Ev = { at: number; kind: 'tier' | 'ruin' | 'gone' | 'crisis' | 'mark'; uid?: number; tier?: number; i?: number };

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}`;

/** Plays the projection; `done` runs once it has faded out. */
export function playFuture(ctx: GameContext, p: Projection, done: () => void): void {
  const { city } = ctx;
  const name = city.growth.name || 'Your city';
  const con = ctx.services.get('construction');
  const world = ctx.services.tryGet('world');
  const stage = FilmStage.get(ctx);
  stage.clear();
  const span = Math.max(1, p.end.tick - p.start.tick);
  const at = (tick: number) => Math.min(FUTURE_SECONDS, Math.max(0, ((tick - p.start.tick) / span) * FUTURE_SECONDS));

  // The script: what happens when, on the film's clock.
  const evs: Ev[] = [
    ...p.tiers.map(([uid, tick, tier]): Ev => ({ at: at(tick), kind: 'tier', uid, tier })),
    ...p.ruined.map(([uid, tick]): Ev => ({ at: at(tick), kind: 'ruin', uid })),
    ...p.removed.map(([uid, tick]): Ev => ({ at: at(tick), kind: 'gone', uid })),
    ...p.incidents.map((c, i): Ev => ({ at: at(c.tick), kind: 'crisis', i })),
    ...p.marks.map((m, i): Ev => ({ at: at(m[0]), kind: 'mark', i })),
  ].sort((a, b) => a.at - b.at);

  /** Buildings the film touched: redrawn from the sim when it ends, however it ends. */
  const touched = new Set<number>();
  const veiled = new Set<number>();
  const eidOf = (uid: number) => {
    const e = city.uids.get(uid);
    return e === undefined ? -1 : e;
  };
  const restore = () => {
    for (const e of veiled) con.renderer.unveil(e, false);
    veiled.clear();
    for (const e of touched) con.renderer.rebuild(e);
    touched.clear();
    world?.atmosphere.invalidateShadows();
  };
  const flares = Array.from({ length: 3 }, flare);
  let offReset = () => {};
  const reel = openReel(
    ctx,
    {
      scene: 'fz',
      label: `${name}, if nothing changes`,
      key: 5,
      leak: 'rgba(255, 170, 120, 0.16)',
      leaving: () => {
        offReset();
        restore();
        stage.close();
        for (const f of flares) disposeFlare(f);
      },
    },
    done,
  );
  offReset = ctx.bus.on('city:reset', () => {
    touched.clear();
    veiled.clear();
    reel.finish();
  });

  // ── DOM: the days ahead counting up, and how the numbers move against today ──
  const dayNum = h('b', { class: 'fz-dnum' }, fmt(p.start.day));
  const pop = h('b', {}, fmt(p.start.residents));
  const popD = h('i', { class: 'fz-d' });
  const harm = h('b', {}, fmt(p.start.harmony));
  const harmD = h('i', { class: 'fz-d' });
  const fill = h('i', { class: 'fz-fill' });
  const hud = h(
    'div',
    { class: 'fz-hud' },
    h('p', { class: 'fz-kick' }, 'If nothing changes'),
    h('p', { class: 'fz-name' }, name),
    h('p', { class: 'fz-day' }, h('span', {}, 'Day'), dayNum),
    h('p', { class: 'fz-stats' }, h('span', {}, pop, ' residents ', popD), h('span', {}, 'harmony ', harm, ' ', harmD)),
  );
  const bar = h('div', { class: 'fz-bar' }, fill);
  reel.root.append(hud, bar);
  const delta = (el: HTMLElement, d: number, good: boolean) => {
    el.textContent = d ? signed(d) : '';
    el.className = `fz-d ${d === 0 ? '' : (d > 0) === good ? 'up' : 'down'}`;
  };
  const statsAt = (ft: number) => {
    const tick = p.start.tick + (ft / FUTURE_SECONDS) * span;
    const s = p.samples;
    let i = 0;
    while (i < s.length - 1 && s[i + 1]![0] < tick) i++;
    const a = s[i]!;
    const b = s[Math.min(s.length - 1, i + 1)]!;
    const k = b[0] > a[0] ? Math.min(1, Math.max(0, (tick - a[0]) / (b[0] - a[0]))) : 0;
    return { day: Math.floor(a[1] + (b[1] - a[1]) * k), residents: a[2] + (b[2] - a[2]) * k, harmony: a[4] + (b[4] - a[4]) * k };
  };
  const showHud = (ft: number) => {
    const s = statsAt(ft);
    dayNum.textContent = fmt(s.day);
    pop.textContent = fmt(s.residents);
    harm.textContent = fmt(s.harmony);
    delta(popD, Math.round(s.residents - p.start.residents), true);
    delta(harmD, Math.round(s.harmony - p.start.harmony), true);
    fill.style.transform = `scaleX(${Math.min(1, ft / FUTURE_SECONDS).toFixed(4)})`;
  };

  // ── Camera: the whole city, slowly round; it leans toward a crisis while it burns ──
  let cx = 0;
  let cz = 0;
  let n = 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const e of city.buildingEntities()) {
    const x = Building.x[e]! + Building.w[e]! / 2;
    const z = Building.z[e]! + Building.d[e]! / 2;
    cx += x;
    cz += z;
    n++;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  const home = n ? { x: cx / n, z: cz / n } : { x: city.size / 2, z: city.size / 2 };
  const el = ctx.renderer.domElement;
  const aspect = Math.max(0.3, (el.clientWidth || 1) / (el.clientHeight || 1));
  const r = n ? Math.max(24, (x1 - x0) / 2, (z1 - z0) / 2) : 40;
  const wide = Math.min(aspect < 1 ? 900 : 640, Math.max(70, r * 2.3 + 34, aspect < 1.2 ? (r * 1.15) / (Math.tan((20 * Math.PI) / 180) * aspect) : 0));
  const cam = { x: home.x, z: home.z, d: wide };
  let lean: { x: number; z: number; until: number } | null = null;
  const yaw0 = ctx.cameraCtl.yaw;
  const sea = () => U.waterLevel.value as number;

  // ── Flares ──
  const burning: { f: (typeof flares)[number]; at: number }[] = [];
  let flareNext = 0;
  const flareAt = (x: number, z: number, t: number) => {
    const f = flares[flareNext++ % flares.length]!;
    f.root.position.set(x, Math.max(sea(), city.grid.heightAt(x, z)) + 0.6, z);
    f.root.visible = true;
    const j = burning.findIndex((b) => b.f === f);
    if (j >= 0) burning.splice(j, 1);
    burning.push({ f, at: t });
  };

  let next = 0;
  let start = -1;
  let hudAt = 0;
  let shadowAt = 0;
  const play = (ft: number, t: number, all = false) => {
    let changed = 0;
    while (next < evs.length && evs[next]!.at <= ft && (all || changed < PER_FRAME)) {
      const e = evs[next++]!;
      if (e.kind === 'crisis') {
        const c = p.incidents[e.i!]!;
        if (all) continue;
        reel.say(`Day ${fmt(statsAt(e.at).day)} · ${c.name}${c.district && !c.name.includes(c.district) ? ` · ${c.district}` : ''}`);
        reel.hit('heartbeat', 0, 1);
        if (c.x !== undefined && c.z !== undefined) {
          flareAt(c.x, c.z, t);
          lean = { x: c.x, z: c.z, until: ft + 3.5 };
        }
        continue;
      }
      if (e.kind === 'mark') {
        if (!all) reel.say(`Day ${fmt(statsAt(e.at).day)} · ${p.marks[e.i!]![1] === 'era' ? 'A new era' : 'Something rises from the sea'}`);
        continue;
      }
      const eid = eidOf(e.uid!);
      if (eid < 0) continue;
      touched.add(eid);
      if (e.kind === 'tier') con.renderer.replayTier(eid, e.tier!, !all);
      else if (e.kind === 'ruin') con.renderer.replayRuin(eid);
      else if (!veiled.has(eid)) {
        con.renderer.veil(eid);
        veiled.add(eid);
      }
      changed++;
    }
    if (changed && (all || t - shadowAt > 0.25)) {
      world?.atmosphere.invalidateShadows();
      shadowAt = t;
    }
  };

  const film = async () => {
    reel.bed('wind', 0.3, 3);
    reel.bed('drone', 0.18, 4);
    reel.bed('hum', 0.1, 4);
    if (!(await reel.wait(0))) return;
    stage.openLocation(HOUR_FROM);
    for (const f of flares) stage.add(f.root);
    const frame = (ft: number) => {
      const look: [number, number, number] = [cam.x, Math.max(sea(), city.grid.heightAt(cam.x, cam.z)) + 2, cam.z];
      stage.shots = [{ at: 0, dur: 0, from: orbit(look, cam.d, yaw0 + ft * 0.04, 0.78, 40) }];
    };
    frame(0);
    stage.onFrame = (t, dt) => {
      if (start < 0) return;
      const ft = t - start;
      play(ft, t);
      const k = 1 - Math.exp(-dt * 0.8);
      const leaning = lean && ft < lean.until;
      const tx = leaning ? lean!.x : home.x;
      const tz = leaning ? lean!.z : home.z;
      const td = leaning ? Math.max(70, wide * 0.45) : wide;
      cam.x += (tx - cam.x) * k;
      cam.z += (tz - cam.z) * k;
      cam.d += (td - cam.d) * k;
      frame(ft);
      const q = Math.min(1, ft / FUTURE_SECONDS);
      stage.setTime(HOUR_FROM + (HOUR_TO - HOUR_FROM) * q * q * (3 - 2 * q));
      for (let i = burning.length - 1; i >= 0; i--) {
        const { f, at: a } = burning[i]!;
        const kk = (t - a) / FLARE_S;
        if (kk >= 1) {
          f.root.visible = false;
          f.on.value = 0;
          burning.splice(i, 1);
          continue;
        }
        burnFlare(f, kk, cam.d);
      }
      if (t - hudAt > 0.12) {
        hudAt = t;
        showHud(ft);
      }
    };
    if (!(await stage.ready(reel, INTROS.future))) return;
    start = stage.t;
    reel.on('play');
    reel.say(`Day ${fmt(p.start.day)} · today`);
    if (!(await reel.wait(FUTURE_SECONDS * 1000))) return;
    play(Infinity, stage.t, true);
    showHud(FUTURE_SECONDS);
    reel.say('');
    reel.hit('swell', 0, 4);
    if (!(await reel.wait(1400))) return;
    reel.on('done');
    const e = p.end;
    await reel.end({
      kicker: 'If nothing changes',
      title: `Day ${fmt(e.day)}`,
      sub: p.replacedDay !== null ? `The council would replace you on day ${fmt(p.replacedDay)}` : `${name}, ${p.days} days from now`,
      lines: [
        `${fmt(e.residents)} residents (${signed(e.residents - p.start.residents)})`,
        `Harmony ${fmt(e.harmony)} (${signed(e.harmony - p.start.harmony)})`,
        p.ruined.length + p.removed.length ? `${fmt(p.ruined.length + p.removed.length)} buildings lost` : 'No buildings lost',
      ],
      button: 'What can I do?',
      hold: 14,
    });
  };
  void film();
}
