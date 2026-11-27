import type { Grid } from '@/sim/Grid';
import type { JetPilot } from './pilot';

/**
 * The pilot's head-up display (D-233), shown while the player flies the Sky Guard (explore mode `pilot`): a pitch
 * ladder that rolls with the bank round a fixed boresight, a heading tape, speed (knots, Mach) with the throttle,
 * altitude with the climb rate (the ladder only in the cockpit view, where it truly sits on the horizon), load, afterburner and smoke flags, warnings (PULL UP, RETURN TO ISLAND), and a
 * heading-up radar of the island with the jet at its centre.
 *
 * DOM only. The ladder, tape and radar move by `transform` every frame (compositor work, one style write each);
 * the numbers change at ~10 Hz through `textContent`. Text is ours (no data from saves or players).
 */

const div = (cls: string, text?: string) => {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
};

/** Pixels per degree on the heading tape. */
const TAPE_PX = 4;
/** Radar: tiles across, canvas pixels. */
const RADAR_SPAN = 760;
const RADAR_PX = 128;

export interface PilotHud {
  el: HTMLElement;
  show(on: boolean): void;
  /** `fov` = the camera's vertical field of view (degrees), for the ladder's scale; `smoke`, `cockpit` flags. */
  update(p: JetPilot, fov: number, flags: { smoke: boolean; cockpit: boolean }): void;
}

export function createPilotHud(grid: Grid): PilotHud {
  const root = div('jh hidden');
  root.setAttribute('aria-hidden', 'true');

  // ── Pitch ladder round the boresight ──
  const ladderWin = div('jh-ladder-win');
  const ladder = div('jh-ladder');
  for (let d = -90; d <= 90; d += 10) {
    const rung = div(`jh-rung ${d === 0 ? 'horizon' : d < 0 ? 'below' : ''}`);
    rung.style.setProperty('--deg', String(d));
    if (d !== 0) rung.append(div('jh-rl', String(Math.abs(d))), div('jh-rr', String(Math.abs(d))));
    ladder.append(rung);
  }
  ladderWin.append(ladder);
  const bore = div('jh-bore');
  const bank = div('jh-bank');
  const bankPtr = div('jh-bank-ptr');
  bank.append(bankPtr);

  // ── Heading tape ──
  const tapeWin = div('jh-tape-win');
  const tape = div('jh-tape');
  const names: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  for (let d = -180; d <= 540; d += 10) {
    const h = ((d % 360) + 360) % 360;
    const tick = div(`jh-tick ${h % 30 === 0 ? 'major' : ''}`);
    tick.style.left = `${(d + 180) * TAPE_PX}px`;
    if (h % 30 === 0) tick.append(div('jh-tl', names[h] ?? String(h / 10).padStart(2, '0')));
    tape.append(tick);
  }
  tapeWin.append(tape, div('jh-caret'));
  const hdg = div('jh-hdg');

  // ── Speed and altitude ──
  const spd = div('jh-box left');
  const spdV = div('jh-big');
  const mach = div('jh-small');
  const thr = div('jh-thr');
  const thrFill = div('jh-thr-fill');
  thr.append(thrFill);
  spd.append(div('jh-cap', 'SPD KT'), spdV, mach, thr);
  const alt = div('jh-box right');
  const altV = div('jh-big');
  const vs = div('jh-small');
  alt.append(div('jh-cap', 'ALT FT'), altV, vs);

  // ── Flags, warnings, controls ──
  const flags = div('jh-flags');
  const gV = div('jh-flag');
  const ab = div('jh-flag ab', 'AB');
  const smk = div('jh-flag', 'SMK');
  flags.append(gV, ab, smk);
  const warnUp = div('jh-warn', 'PULL UP');
  const warnFar = div('jh-warn soft', 'RETURN TO ISLAND');
  const keys = div(
    'jh-keys',
    'W/S climb · dive   A/D bank   E/Q throttle   Shift afterburner   Space roll   X smoke   V view   Esc exit',
  );

  // ── Radar: the island painted once, turned under a fixed jet marker ──
  const radar = div('jh-radar');
  const map = document.createElement('canvas');
  map.width = map.height = RADAR_PX;
  map.className = 'jh-map';
  const g2 = map.getContext('2d');
  const S = grid.w;
  const x0 = S / 2 - RADAR_SPAN / 2;
  if (g2) {
    const img = g2.createImageData(RADAR_PX, RADAR_PX);
    for (let j = 0; j < RADAR_PX; j++)
      for (let i = 0; i < RADAR_PX; i++) {
        const x = x0 + ((i + 0.5) / RADAR_PX) * RADAR_SPAN;
        const z = x0 + ((j + 0.5) / RADAR_PX) * RADAR_SPAN;
        const h = x >= 0 && z >= 0 && x < S && z < S ? grid.heightAt(x, z) : -10;
        if (h > 0.05) img.data.set([125, 255, 190, 150], (j * RADAR_PX + i) * 4);
      }
    g2.putImageData(img, 0, 0);
  }
  radar.append(map, div('jh-me'), div('jh-ring'));

  root.append(ladderWin, bore, bank, tapeWin, hdg, spd, alt, flags, warnUp, warnFar, radar, keys);

  let last = 0;
  return {
    el: root,
    show(on) {
      root.classList.toggle('hidden', !on);
    },
    update(p, fov, f) {
      const pxPerDeg = window.innerHeight / Math.max(20, fov);
      const deg = (r: number) => (r * 180) / Math.PI;
      root.style.setProperty('--pxdeg', `${pxPerDeg.toFixed(2)}px`);
      ladder.style.transform = `rotate(${(-deg(p.bank)).toFixed(2)}deg) translateY(${(deg(p.pitch) * pxPerDeg).toFixed(1)}px)`;
      bankPtr.style.transform = `rotate(${(-deg(p.bank)).toFixed(1)}deg)`;
      const c = p.compass;
      tape.style.transform = `translateX(${(-(c + 180) * TAPE_PX).toFixed(1)}px)`;
      // The radar is heading-up: the map turns the other way round the jet.
      const s = RADAR_PX / RADAR_SPAN;
      const mx = (p.pos.x - x0) * s;
      const mz = (p.pos.z - x0) * s;
      map.style.transform = `translate(${(RADAR_PX / 2 - mx).toFixed(1)}px, ${(RADAR_PX / 2 - mz).toFixed(1)}px) rotate(${(-c).toFixed(1)}deg)`;
      map.style.transformOrigin = `${mx.toFixed(1)}px ${mz.toFixed(1)}px`;
      root.classList.toggle('cockpit', f.cockpit);
      warnUp.classList.toggle('on', p.pullUp);
      warnFar.classList.toggle('on', p.far && !p.pullUp);
      const now = performance.now();
      if (now - last < 100) return;
      last = now;
      const ms = p.speed * 11;
      spdV.textContent = Math.round(ms * 1.944).toLocaleString();
      mach.textContent = `M ${(ms / 343).toFixed(2)}`;
      thrFill.style.transform = `scaleX(${p.throttle.toFixed(3)})`;
      altV.textContent = Math.round(p.pos.y * 11 * 3.281).toLocaleString();
      const fpm = p.climb * 11 * 3.281 * 60;
      const r100 = Math.round(fpm / 100) * 100;
      vs.textContent = `${r100 > 0 ? '+' : r100 < 0 ? '−' : ''}${Math.abs(r100).toLocaleString()} fpm`;
      hdg.textContent = String(Math.round(c) % 360).padStart(3, '0');
      gV.textContent = `G ${p.load.toFixed(1)}`;
      ab.classList.toggle('on', p.burner > 0.5);
      smk.classList.toggle('on', f.smoke);
    },
  };
}
