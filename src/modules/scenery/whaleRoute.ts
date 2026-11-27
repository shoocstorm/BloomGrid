/**
 * Where the whale pods are (D-231): they no longer circle one spot for ever but roam a ring of feeding grounds round
 * the island, lingering at each (circling, blowing, breaching) and then swimming slowly on to the next. Pure maths
 * on the animation clock (`U.clock`), so the shader's pose, the inspector, the ferry and the demo agree; no sim
 * state, nothing saved. The scenery module moves each pod's mesh to `podAt(...)` every frame and hands the shader
 * the pod's velocity (the whales head along it while travelling).
 *
 * Grounds are normalised map coordinates in deep sea (tested on several seeds) and the legs between them keep
 * clear of the standing sea wonders (`tests/whaleRoute.test.ts`). The ring runs clockwise: north, east, south, west.
 */

export const GROUNDS: readonly (readonly [number, number])[] = [
  [0.68, 0.0], // north, between the Lotus Atoll and the lighthouse (pod 2's home)
  [1.08, 0.02], // north-east, beyond the lighthouse
  [1.08, 0.5], // east
  [1.05, 0.98], // south-east, past Turtle Isle
  [0.6, 1.07], // south
  [0.3, 0.95], // south-west, off the south shore (pod 1's home)
  [0.1, 1.06], // round the Tide Gates' seaward side
  [-0.06, 0.76], // west, off the industrial islet
  [-0.08, 0.42], // west
  [-0.08, 0.0], // north-west, seaward of the Verdant Pillars and the Prism Geode
  [0.24, -0.1], // north, seaward of the Lotus Atoll
];
/** Seconds a pod lingers at a feeding ground. */
export const DWELL = 150;
/** Mean speed between grounds (world units per second; the pod eases in and out, so it peaks at 1.5×). */
export const CRUISE = 1.0;
/** Each pod's home ground (where it is at clock 0: the old fixed sites). */
const HOME = [5, 0];

export interface PodState {
  /** Pod centre (world). */
  x: number;
  z: number;
  /** Velocity of the centre (world units per second). */
  vx: number;
  vz: number;
  /** 0 while lingering at a ground, 1 under way (eased). */
  travel: number;
  /** Ground it is at (or the one it left). */
  ground: number;
  /** Ground it is heading for (= `ground` while lingering). */
  next: number;
}

/** Length of each leg (normalised map units). */
const legs = GROUNDS.map((a, i) => {
  const b = GROUNDS[(i + 1) % GROUNDS.length]!;
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
});

/** Seconds from leaving ground 0 to arriving back, on a map `S` wide. */
export function lapSeconds(S: number): number {
  return starts(S)[GROUNDS.length]!;
}

/** Start time (seconds into a lap) of the dwell at each ground, and the lap's end, on a map `S` wide. */
function starts(S: number): number[] {
  const out = [0];
  for (let k = 0; k < GROUNDS.length; k++) out.push(out[k]! + DWELL + (legs[k]! * S) / CRUISE);
  return out;
}

/** Pod `p` at animation time `clock` on a map `S` wide. */
export function podAt(p: number, clock: number, S: number): PodState {
  const at = starts(S);
  const lap = at[GROUNDS.length]!;
  const home = (HOME[p % HOME.length]! + Math.floor(p / HOME.length) * 3) % GROUNDS.length;
  const t = ((((clock + at[home]!) % lap) + lap) % lap);
  let i = GROUNDS.length - 1;
  while (i > 0 && at[i]! > t) i--;
  // Snap a hair before a ground's start onto it (float error at exact boundaries such as clock 0).
  if (at[i + 1]! - t < 1e-6) i = (i + 1) % GROUNDS.length;
  const [ax, az] = GROUNDS[i]!;
  const j = (i + 1) % GROUNDS.length;
  const into = Math.max(0, t - at[i]! - DWELL);
  if (t - at[i]! < DWELL || at[i + 1]! - t < 1e-6) return { x: ax * S, z: az * S, vx: 0, vz: 0, travel: 0, ground: i, next: i };
  const dur = (legs[i]! * S) / CRUISE;
  const [bx, bz] = GROUNDS[j]!;
  const u = Math.min(1, into / dur);
  const e = u * u * (3 - 2 * u);
  // d(e)/dt for the eased position.
  const de = (6 * u * (1 - u)) / dur;
  const travel = Math.min(1, Math.min(u, 1 - u) * 8);
  return {
    x: (ax + (bx - ax) * e) * S,
    z: (az + (bz - az) * e) * S,
    vx: (bx - ax) * S * de,
    vz: (bz - az) * S * de,
    travel: travel * travel * (3 - 2 * travel),
    ground: i,
    next: j,
  };
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Compass bearing of a world point from the island's centre. */
export function bearingOf(x: number, z: number, S: number): string {
  return COMPASS[Math.round((Math.atan2(x - S / 2, -(z - S / 2)) / (Math.PI * 2)) * 8 + 8) % 8]!;
}

/** What the pod is doing on its journey, for the inspector ("Feeding off the south-west", "Swimming east"). */
export function journeyOf(p: number, clock: number, S: number): string {
  const s = podAt(p, clock, S);
  if (s.travel === 0 && s.ground === s.next) return `Feeding off the ${bearingOf(s.x, s.z, S)}`;
  const [nx, nz] = GROUNDS[s.next]!;
  return `Swimming on to the ${bearingOf(nx * S, nz * S, S)}`;
}

/** Pod `p`'s centre now as normalised map coordinates (where `WONDER_SITES` entries are). */
export function podSite(p: number, clock: number, S: number): [number, number] {
  const s = podAt(p, clock, S);
  return [s.x / S, s.z / S];
}
