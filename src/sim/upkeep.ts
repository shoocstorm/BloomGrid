import { Service } from '@/ecs/components';
import type { City } from './City';

/** Overgrowth value at which a highway is impassable (blocks its utility network). */
export const OVERGROWN = 255;
const OVERGROW_STEP = 64;

/**
 * Building condition per pulse (1 s): decays under austerity, flooding and abandonment;
 * recovers when fully funded. Returns the new condition.
 */
export function updateCondition(eid: number, funding: number, flooded: boolean, abandoned: boolean, floodSeverity: number): number {
  let c = Service.condition[eid]!;
  if (flooded) c -= 0.01 * Math.max(0.5, floodSeverity);
  if (funding < 1) c -= 0.004 * (1 - funding);
  if (abandoned) c -= 0.001;
  if (funding >= 1 && !flooded) c += 0.003;
  c = Math.min(1, Math.max(0, c));
  Service.condition[eid] = c;
  return c;
}

/**
 * Nature reclaims unfunded highways: under austerity, a few random road tiles grow over each
 * pulse; at OVERGROWN they stop carrying power and water. Funding lets crews cut it back.
 * Emits `road:overgrowth` with tiles that crossed a visual/network threshold.
 */
export function updateOvergrowth(city: City): void {
  const st = city.steward;
  const g = city.grid;
  const og = g.addLayer('overgrowth', (n) => new Uint8Array(n));
  const changed: number[] = [];
  const bump = (t: number, v: number) => {
    const old = og[t]!;
    const nv = Math.max(0, Math.min(OVERGROWN, v));
    if (nv === old) return;
    og[t] = nv;
    if (old === 0) st.overgrown++;
    if (nv === 0) st.overgrown--;
    // Visual threshold (half) and network threshold (full).
    if (old < 128 !== nv < 128 || old < OVERGROWN !== nv < OVERGROWN) changed.push(t);
    if (old < OVERGROWN !== nv < OVERGROWN) city.networks.dirty = true;
  };
  if (st.funding < 1) {
    const roads = g.road;
    const k = Math.ceil(city.roadCount * 0.003 * (1 - st.funding));
    for (let i = 0; i < k; i++) {
      const t = Math.floor(city.rng.next() * roads.length);
      // Probe forward to the next road tile so picks land on highways.
      for (let j = 0; j < 64; j++) {
        const u = (t + j * 97) % roads.length;
        if (roads[u]) {
          bump(u, og[u]! + OVERGROW_STEP);
          break;
        }
      }
    }
  } else if (st.overgrown > 0) {
    for (let t = 0; t < og.length; t++) if (og[t]) bump(t, og[t]! - 24);
  }
  if (changed.length) city.bus.emit('road:overgrowth', { tiles: changed });
}
