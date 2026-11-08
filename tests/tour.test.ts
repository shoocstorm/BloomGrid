import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { initPieces } from '@/assets/kit/pieces';
import { applyScenario } from '@/sim/scenario';
import { planTour, TourDirector, type TourPose } from '@/modules/explore/tour';
import { makeSim } from './helpers';

/** The orbit camera's position for a pose (as the explore module poses it). */
const eye = (p: TourPose) => {
  const c = Math.cos(p.pitch);
  return new Vector3(Math.sin(p.yaw) * c, Math.sin(p.pitch), Math.cos(p.yaw) * c)
    .multiplyScalar(p.distance)
    .add(p.target);
};

describe('city tour (D-145)', () => {
  initPieces();
  const s = makeSim(20261024);
  applyScenario(s.city, 'founding-city');
  s.step(5);
  const city = s.city;
  const stops = planTour(city);

  it('opens and closes on the island overview, with landmarks, districts and sea wonders between', () => {
    expect(stops[0]!.kind).toBe('opening');
    expect(stops.at(-1)!.kind).toBe('finale');
    const kinds = new Set(stops.map((t) => t.kind));
    for (const k of ['landmark', 'district', 'wonder'] as const) expect(kinds.has(k)).toBe(true);
    expect(stops.length).toBeGreaterThan(10);
    expect(stops.length).toBeLessThan(24);
    expect(stops.some((t) => t.title === 'Aurora Gemini')).toBe(true);
    for (const t of stops) expect(t.title.length).toBeGreaterThan(0);
  });

  it('starts at the heart of the city and keeps landmarks apart', () => {
    const [cx, cz] = [city.grid.w / 2, city.grid.h / 2];
    const heart = stops[1]!;
    const others = stops.slice(2, -1);
    for (const t of others)
      expect((t.x - cx) ** 2 + (t.z - cz) ** 2).toBeGreaterThanOrEqual(
        (heart.x - cx) ** 2 + (heart.z - cz) ** 2,
      );
    const marks = stops.filter((t) => t.kind === 'landmark');
    for (const a of marks)
      for (const b of marks) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(26);
  });

  it('flies every stop smoothly and ends', () => {
    const start: TourPose = { target: new Vector3(200, 0, 200), yaw: 0.8, pitch: 0.85, distance: 70 };
    const seen: number[] = [];
    const d = new TourDirector(
      stops,
      start,
      (x, z) => city.grid.heightAt(x, z),
      (i) => seen.push(i),
    );
    let last = eye(d.pose);
    let frames = 0;
    const dt = 1 / 30;
    while (d.step(dt)) {
      const now = eye(d.pose);
      // No cuts: the camera never jumps further than a fast flight covers in one frame.
      expect(now.distanceTo(last)).toBeLessThan(12);
      expect(Number.isFinite(now.x + now.y + now.z)).toBe(true);
      last = now;
      if (++frames > 30 * 60 * 6) throw new Error('tour never ended');
    }
    expect(seen).toEqual(stops.map((_, i) => i));
    // About three minutes with every stop shown.
    expect(frames / 30).toBeGreaterThan(90);
    expect(frames / 30).toBeLessThan(300);
  });

  it('skips ahead and pauses', () => {
    const d = new TourDirector(
      stops,
      { target: new Vector3(256, 0, 256), yaw: 0, pitch: 0.9, distance: 300 },
      () => 0,
    );
    expect(d.next()).toBe(true);
    expect(d.index).toBe(1);
    d.paused = true;
    const before = d.pose.target.clone();
    d.step(1);
    expect(d.pose.target.distanceTo(before)).toBeLessThan(1e-6);
    while (d.next());
    expect(d.index).toBe(stops.length - 1);
  });

  it('picks a clear angle before arriving, so the camera never has to climb away once there', () => {
    // A tower wall east of every stop: any view from that side is blocked.
    const sight = (from: Vector3, to: Vector3) => from.x < to.x - 1;
    const d = new TourDirector(
      stops,
      { target: new Vector3(256, 0, 256), yaw: 0, pitch: 0.9, distance: 300 },
      (x, z) => city.grid.heightAt(x, z),
      undefined,
      undefined,
      sight,
    );
    let checked = 0;
    while (d.step(1 / 30)) {
      const s = d.stops[d.index]!;
      if (d.phase !== 'hold' || s.kind === 'opening' || s.kind === 'finale' || s.track) continue;
      expect(eye(d.pose).x).toBeLessThan(d.pose.target.x - 1);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('plans a young island too (no landmarks: the tallest buildings stand in)', () => {
    const y = makeSim(7);
    applyScenario(y.city, 'fresh-island');
    const t = planTour(y.city);
    expect(t[0]!.kind).toBe('opening');
    expect(t.at(-1)!.kind).toBe('finale');
  });
});
