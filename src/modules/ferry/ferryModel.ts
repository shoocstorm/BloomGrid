import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Ferry parts (`aPart`): the ferry shader colours, lights and moves each one (D-141). */
export const FERRY_PART = {
  hull: 0,
  deck: 1,
  white: 2,
  glass: 3,
  dome: 4,
  pool: 5,
  slide: 6,
  sail: 7,
  wheel: 8,
  gondola: 9,
  lifeboat: 10,
  lamp: 11,
  pad: 12,
  leaf: 13,
  trunk: 14,
  timber: 15,
  tourist: 16,
  navRed: 17,
  navGreen: 18,
  rail: 19,
  name: 20,
} as const;

/** Ship dimensions (tiles): length overall, beam, and the deck levels. The bow points along +x, the keel at −0.7. */
export const FERRY = {
  length: 22,
  beam: 4.2,
  main: 0.9,
  storey: 0.42,
  /** The sun deck (top of the fourth deck house) and a spot on it for the ride camera. */
  sun: 0.9 + 4 * 0.42,
  wheel: [-9.8, 2.35, 0] as const,
  pad: [8.4, 1.06] as const,
  /** The observation dome's centre (x) on the sun deck. */
  dome: 2.2,
};

const HALF = FERRY.length / 2;
/** Hull half-width at x: full beam aft, a fine bow in the forward quarter. */
function halfBeam(x: number): number {
  const b = FERRY.beam / 2;
  if (x > 4.5) return b * Math.sqrt(Math.max(0, 1 - ((x - 4.5) / (HALF - 4.5)) ** 2));
  if (x < -HALF + 1) return b * (0.82 + 0.18 * (x + HALF));
  return b;
}
/** Deck edge height at x: a gentle sheer rising to the bow. */
const sheer = (x: number) => FERRY.main + 0.3 * Math.max(0, (x - 2) / (HALF - 2)) ** 2;

function part(
  src: BufferGeometry,
  id: number,
  hub: [number, number, number] = [0, 0, 0],
  keepUv = false,
): BufferGeometry {
  const geo = src.index ? src.toNonIndexed() : src;
  const n = geo.getAttribute('position').count;
  // Only the name boards read a texture; every other part gets a zero uv (one attribute set to merge).
  if (!keepUv || !geo.getAttribute('uv'))
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2));
  geo.setAttribute('aPart', new BufferAttribute(new Float32Array(n).fill(id), 1));
  const h = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) h.set(hub, i * 3);
  geo.setAttribute('aHub', new BufferAttribute(h, 3));
  return geo;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** The hull as a lofted tube: stations along x, each a U-shaped section from the port deck edge to starboard's. */
function hull(): BufferGeometry {
  const ST = 44;
  const SEC = 12;
  const pos: number[] = [];
  const ring = (x: number): Vector3[] => {
    const w = halfBeam(x);
    const top = sheer(x);
    const pts: Vector3[] = [];
    for (let j = 0; j <= SEC; j++) {
      // From the port deck edge down round the bilge to the keel and up to starboard.
      const a = Math.PI * (j / SEC);
      const y = top - (top + 0.7) * Math.sin(a) ** 0.6;
      const bilge = y < -0.15 ? 0.6 + 0.4 * Math.max(0, (y + 0.7) / 0.55) : 1;
      pts.push(new Vector3(x, y, -Math.cos(a) * w * bilge));
    }
    return pts;
  };
  const tri = (a: Vector3, b: Vector3, c: Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  let prev = ring(-HALF);
  // Transom (flat stern), as a fan from its centre.
  const mid = new Vector3(-HALF, (sheer(-HALF) - 0.7) / 2, 0);
  for (let j = 0; j < SEC; j++) tri(mid, prev[j]!, prev[j + 1]!);
  // …and the strip under the deck plate between the two deck edges, or the stern gapes open.
  tri(mid, prev[SEC]!, prev[0]!);
  for (let i = 1; i <= ST; i++) {
    const x = -HALF + (FERRY.length * i) / ST;
    const cur = ring(Math.min(x, HALF - 0.01));
    for (let j = 0; j < SEC; j++) {
      tri(prev[j]!, cur[j]!, prev[j + 1]!);
      tri(cur[j]!, cur[j + 1]!, prev[j + 1]!);
    }
    // Deck plate between the two deck edges.
    tri(prev[0]!, prev[SEC]!, cur[0]!);
    tri(cur[0]!, prev[SEC]!, cur[SEC]!);
    prev = cur;
  }
  // The bow's last station still has a little beam: close it with a stem plate.
  const stem = new Vector3(HALF, (sheer(HALF) - 0.7) / 2, 0);
  for (let j = 0; j < SEC; j++) tri(stem, prev[j + 1]!, prev[j]!);
  tri(stem, prev[0]!, prev[SEC]!);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/** Deck houses as [aft x, front x, width], bottom to top (the model and its collision boxes share them). */
const HOUSES: readonly (readonly [number, number, number])[] = [
  [-8.4, 5.8, 3.7],
  [-8.0, 5.2, 3.4],
  [-6.0, 4.6, 3.2],
  [-4.4, 3.8, 3.0],
];

type Box6 = readonly [number, number, number, number, number, number];
/**
 * The ship as solid boxes in its own frame (explore collision, D-141): the hull in one-tile slices that follow the bow's
 * taper and the sheer, each deck house with its rounded front, the wheelhouse, dome, sky wheel and helideck. Walkers,
 * boards, drones and chase cameras stop at its sides instead of slipping inside, and can stand on its decks.
 */
export function ferrySolids(): Box6[] {
  const { main, storey: S, sun } = FERRY;
  const out: Box6[] = [];
  for (let x = -HALF; x < HALF; x += 1) {
    const w = Math.max(halfBeam(x), halfBeam(Math.min(HALF - 0.01, x + 1)));
    out.push([x, -0.7, -w, x + 1, Math.max(sheer(x), sheer(x + 1)), w]);
  }
  HOUSES.forEach(([x0, x1, w], i) => out.push([x0, main + i * S, -w / 2, x1 + 0.55 * (w / 2) * 0.8, main + (i + 1) * S, w / 2]));
  out.push([3.2, sun, -1.9, 4.23, sun + 0.4, 1.9]); // wheelhouse
  out.push([FERRY.dome - 0.8, sun, -0.8, FERRY.dome + 0.8, sun + 0.85, 0.8]); // observation dome
  const [wx, wy] = FERRY.wheel;
  out.push([wx - 1.15, main, -0.3, wx + 1.15, wy + 1.15, 0.3]); // sky wheel
  const [px, py] = FERRY.pad;
  out.push([px - 1.1, main, -1.1, px + 1.1, py + 0.08, 1.1]); // helideck
  return out;
}

/** A deck house: a box with a rounded, raked front (half a cylinder squashed along x). */
function deckHouse(x0: number, x1: number, w: number, y: number, h: number): BufferGeometry[] {
  const r = w / 2;
  const nose = 0.55;
  return [
    part(box(x1 - x0, h, w, (x0 + x1) / 2, y, 0), FERRY_PART.deck),
    part(
      new CylinderGeometry(r, r, h, 18, 1, false, 0, Math.PI).scale(nose, 1, 1).translate(x1, y + h / 2, 0),
      FERRY_PART.deck,
    ),
  ];
}

/** A rigid solar wing-sail on a mast: a tall cambered slab of sea-green petals with a gold edge. */
function wingSail(x: number, y: number, h: number): BufferGeometry[] {
  return [
    part(new CylinderGeometry(0.06, 0.08, h + 0.4, 8).translate(x, y + (h + 0.4) / 2, 0), FERRY_PART.white),
    part(
      new CylinderGeometry(1, 1, h, 16, 1, true, -0.5, 1)
        .scale(1.4, 1, 0.6)
        .translate(x, y + 0.3 + h / 2, -0.56),
      FERRY_PART.sail,
    ),
    part(box(0.05, 0.06, 0.8, x, y + 0.3 + h, 0), FERRY_PART.lamp),
  ];
}

/** A potted tree: trunk and a round canopy (sky garden). */
const tree = (x: number, y: number, z: number, s: number): BufferGeometry[] => [
  part(new CylinderGeometry(0.04 * s, 0.06 * s, 0.5 * s, 6).translate(x, y + 0.25 * s, z), FERRY_PART.trunk),
  part(new SphereGeometry(0.28 * s, 10, 7).scale(1, 0.8, 1).translate(x, y + 0.6 * s, z), FERRY_PART.leaf),
  part(
    new CylinderGeometry(0.14 * s, 0.11 * s, 0.14 * s, 8).translate(x, y + 0.07 * s, z),
    FERRY_PART.timber,
  ),
];

/** A tourist: body and head, about 0.17 tall (a steward's height). */
const tourist = (x: number, y: number, z: number): BufferGeometry[] => [
  // The hub is the figure's feet: the shader colours and sways each figure as one.
  part(new CylinderGeometry(0.03, 0.04, 0.11, 6).translate(x, y + 0.055, z), FERRY_PART.tourist, [x, y, z]),
  part(new SphereGeometry(0.028, 6, 5).translate(x, y + 0.14, z), FERRY_PART.tourist, [x, y, z]),
];

/**
 * The cruise ferry *Tidesong* (D-141), 22 tiles long, nose toward +x, waterline at y = 0: a navy hull with a gold
 * bloom stripe and portholes; four deck houses (promenade, the Bloom Bistro, spa cabins with balconies, the
 * lounge); a sun deck with an infinity pool, loungers, a spiral water slide and a glass observation dome; a sky garden
 * aft; a spinning sky wheel on the stern; two solar wing-sails; a helideck on the bow; lifeboats, rails, deck lamps,
 * navigation lights and tourists. One merged geometry (one draw call).
 */
export function ferryGeometry(): BufferGeometry {
  const { main, storey: S } = FERRY;
  const parts: BufferGeometry[] = [part(hull(), FERRY_PART.hull)];
  // ── Deck houses, stepping back toward the top ──
  const houses = HOUSES;
  houses.forEach(([x0, x1, w], i) => parts.push(...deckHouse(x0, x1, w, main + i * S, S)));
  // A white canopy edge over each deck (the balconies' roofs), a little proud of the house below.
  houses.forEach(([x0, x1, w], i) =>
    parts.push(
      part(
        box(x1 - x0 + 0.1, 0.035, w + 0.12, (x0 + x1) / 2, main + (i + 1) * S - 0.035, 0),
        FERRY_PART.white,
      ),
    ),
  );
  // Balcony rails on the cabin decks (2 and 3): one long rail per side.
  for (const i of [1, 2])
    for (const s of [-1, 1]) {
      const [x0, x1, w] = houses[i]!;
      parts.push(
        part(
          box(x1 - x0 - 0.4, 0.07, 0.02, (x0 + x1) / 2 - 0.2, main + i * S + 0.02, s * (w / 2 + 0.1)),
          FERRY_PART.rail,
        ),
      );
    }
  // Wheelhouse: a wide bridge with wings at the front of the top deck, a mast with a radar and a flag.
  const sun = FERRY.sun;
  parts.push(part(box(1.0, 0.36, 3.6, 3.7, sun, 0), FERRY_PART.glass));
  parts.push(part(box(1.06, 0.04, 3.8, 3.7, sun + 0.36, 0), FERRY_PART.white));
  parts.push(
    part(new CylinderGeometry(0.04, 0.05, 1.1, 6).translate(3.4, sun + 0.36 + 0.55, 0), FERRY_PART.white),
  );
  parts.push(part(box(0.06, 0.03, 0.6, 3.4, sun + 1.2, 0), FERRY_PART.white));
  parts.push(part(new SphereGeometry(0.05, 8, 6).translate(3.4, sun + 1.5, 0), FERRY_PART.lamp));
  // ── Sun deck ──
  // Observation dome (glass) on a ring.
  parts.push(
    part(
      new SphereGeometry(0.85, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(2.2, sun + 0.05, 0),
      FERRY_PART.dome,
    ),
  );
  parts.push(
    part(
      new TorusGeometry(0.85, 0.05, 6, 28).rotateX(Math.PI / 2).translate(2.2, sun + 0.05, 0),
      FERRY_PART.white,
    ),
  );
  // Infinity pool with a timber surround, loungers and parasols.
  parts.push(part(box(3.0, 0.06, 1.8, -1.7, sun, 0), FERRY_PART.timber));
  parts.push(part(box(2.7, 0.03, 1.4, -1.7, sun + 0.05, 0), FERRY_PART.pool));
  for (let k = 0; k < 5; k++)
    for (const s of [-1, 1]) {
      const x = -3.3 + k * 0.62;
      parts.push(part(box(0.32, 0.04, 0.12, x, sun + 0.06, s * 1.22), FERRY_PART.white));
      if (k % 2 === 0) {
        parts.push(
          part(
            new CylinderGeometry(0.01, 0.01, 0.34, 4).translate(x + 0.25, sun + 0.17, s * 1.3),
            FERRY_PART.white,
          ),
        );
        parts.push(
          part(new ConeGeometry(0.2, 0.08, 8).translate(x + 0.25, sun + 0.36, s * 1.3), FERRY_PART.lifeboat),
        );
      }
    }
  // Two solar wing-sails.
  parts.push(...wingSail(0.5, sun, 2.6), ...wingSail(-3.8, sun, 2.2));
  // Spiral water slide: a tower on the aft terrace below the sun deck, a tube winding down round it.
  const SX = -5.3;
  const base = main + 3 * S;
  parts.push(
    part(
      new CylinderGeometry(0.1, 0.12, sun + 1.0 - base, 8).translate(SX, (sun + 1.0 + base) / 2, 0.6),
      FERRY_PART.white,
    ),
  );
  parts.push(part(box(0.4, 0.04, 0.4, SX, sun + 1.0, 0.6), FERRY_PART.white));
  {
    const pts: Vector3[] = [];
    for (let k = 0; k <= 40; k++) {
      const t = k / 40;
      const a = t * Math.PI * 4.2;
      pts.push(
        new Vector3(SX + Math.cos(a) * 0.5, sun + 1.0 - t * (sun + 0.95 - base), 0.6 + Math.sin(a) * 0.5),
      );
    }
    parts.push(part(new TubeGeometry(new CatmullRomCurve3(pts), 90, 0.07, 7, false), FERRY_PART.slide));
  }
  // Sky garden on the second deck's aft terrace: a lawn, trees and planters.
  for (const [x, z, s] of [
    [-6.6, -1.1, 1.1],
    [-7.1, 0.1, 0.9],
    [-6.5, 1.2, 1.0],
    [-7.6, -0.8, 0.8],
    [-7.5, 0.9, 0.85],
  ] as const)
    parts.push(...tree(x, main + 2 * S + 0.04, z, s));
  parts.push(part(box(1.9, 0.04, 3.2, -7.0, main + 2 * S, 0), FERRY_PART.leaf));
  // ── Stern: the sky wheel ──
  const [wx, wy, wz] = FERRY.wheel;
  const hub: [number, number, number] = [wx, wy, wz];
  for (const s of [-0.22, 0.22]) {
    parts.push(part(new TorusGeometry(1.05, 0.035, 6, 40).translate(wx, wy, wz + s), FERRY_PART.wheel, hub));
    for (let k = 0; k < 8; k++)
      parts.push(
        part(
          box(0.02, 1.05, 0.02, 0, 0, 0)
            .rotateZ((k / 8) * Math.PI * 2)
            .translate(wx, wy, wz + s),
          FERRY_PART.wheel,
          hub,
        ),
      );
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    parts.push(
      part(
        new SphereGeometry(0.11, 8, 6).translate(wx + Math.cos(a) * 1.05, wy + Math.sin(a) * 1.05, wz),
        FERRY_PART.gondola,
        hub,
      ),
    );
  }
  for (const s of [-1, 1]) parts.push(part(box(0.08, wy - main, 0.08, wx, main, s * 0.4), FERRY_PART.white));
  // ── Bow: helideck on a raised platform, a forward mast and the anchor deck ──
  const [px, py] = FERRY.pad;
  parts.push(part(new CylinderGeometry(1.1, 1.05, 0.08, 28).translate(px, py, 0), FERRY_PART.pad));
  for (const s of [-1, 1])
    parts.push(part(box(0.08, py - main, 0.08, px - 0.4, main, s * 0.7), FERRY_PART.white));
  // ── Lifeboats along both sides between the first and second decks ──
  for (let k = 0; k < 6; k++)
    for (const s of [-1, 1]) {
      const x = -5.6 + k * 1.75;
      parts.push(
        part(new CapsuleLike(0.16, 0.7).translate(x, main + S + 0.05, s * 1.95), FERRY_PART.lifeboat),
      );
    }
  // ── Deck rails round the main deck edge, deck lamps ──
  for (const s of [-1, 1])
    parts.push(part(box(14.8, 0.08, 0.02, -1.0, main + 0.02, s * (FERRY.beam / 2 - 0.05)), FERRY_PART.rail));
  for (let k = 0; k < 9; k++) {
    const x = -8.2 + k * 2.0;
    for (const s of [-1, 1])
      parts.push(
        part(new SphereGeometry(0.045, 6, 5).translate(x, main + S * 2 + 0.02, s * 1.65), FERRY_PART.lamp),
      );
  }
  for (let k = 0; k < 7; k++)
    for (const s of [-1, 1])
      parts.push(
        part(new SphereGeometry(0.04, 6, 5).translate(-5 + k * 1.4, sun + 0.05, s * 1.5), FERRY_PART.lamp),
      );
  // Navigation lights: red to port (−z), green to starboard, on the bridge wings.
  parts.push(part(new SphereGeometry(0.07, 8, 6).translate(3.7, sun + 0.3, -1.85), FERRY_PART.navRed));
  parts.push(part(new SphereGeometry(0.07, 8, 6).translate(3.7, sun + 0.3, 1.85), FERRY_PART.navGreen));
  // ── Tourists: round the pool, at the rails of the promenade and on the foredeck ──
  const people: [number, number, number][] = [];
  for (let k = 0; k < 9; k++)
    people.push([-3.4 + k * 0.38, sun + 0.06, (k % 2 ? 1 : -1) * (0.95 + (k % 3) * 0.05)]);
  for (let k = 0; k < 14; k++) people.push([-6.5 + k * 0.95, main, (k % 2 ? 1 : -1) * 1.97]);
  for (let k = 0; k < 6; k++)
    people.push([-6.3 + (k % 3) * 0.35, main + 2 * S + 0.04, -0.4 + (k >> 1) * 0.5]);
  for (let k = 0; k < 6; k++) people.push([1.2 + k * 0.2, sun + 0.05, (k % 2 ? 1 : -1) * 1.15]);
  for (const [x, y, z] of people) parts.push(...tourist(x, y, z));
  // Name boards on both sides of the hull, forward of midships (the shader reads the name texture on them).
  for (const s of [1, -1]) {
    const g = new PlaneGeometry(4.8, 0.8);
    if (s < 0) g.rotateY(Math.PI);
    parts.push(part(g.translate(0.6, 0.3, s * (FERRY.beam / 2 + 0.012)), FERRY_PART.name, [0, 0, 0], true));
  }
  return mergeGeometries(parts)!;
}

/** A capsule lying along x (a lifeboat): a cylinder with two hemispheres, `r` radius, `len` long. */
class CapsuleLike extends BufferGeometry {
  constructor(r: number, len: number) {
    super();
    const g = mergeGeometries(
      [
        new CylinderGeometry(r, r, len, 10).rotateZ(Math.PI / 2),
        new SphereGeometry(r, 10, 6).translate(len / 2, 0, 0),
        new SphereGeometry(r, 10, 6).translate(-len / 2, 0, 0),
      ].map((p) => (p.deleteAttribute('uv'), p.toNonIndexed())),
    )!;
    this.copy(g);
  }
}

/**
 * Tidesong Pier (D-141), in the pier's own frame: root at the origin, out to sea along +x, the berth on `side` of z, deck
 * a little above the water. A timber deck on piles, a glass terminal pavilion with a green roof at the root, a
 * covered gangway out to where the ferry's promenade deck lies, bollards and lamps, a beacon at the end.
 */
export function pierGeometry(len: number, berthAlong: number, side = 1): BufferGeometry {
  const D = 0.32;
  const parts: BufferGeometry[] = [part(box(len, 0.1, 1.6, len / 2, D - 0.1, 0), FERRY_PART.timber)];
  for (let k = 0; k <= len; k += 2)
    for (const s of [-0.7, 0.7])
      parts.push(part(new CylinderGeometry(0.08, 0.08, 2.2, 6).translate(k, D - 1.2, s), FERRY_PART.trunk));
  // Terminal pavilion: glass walls under a wide planted roof.
  parts.push(part(box(3.2, 0.7, 2.4, 1.8, D, 0), FERRY_PART.glass));
  parts.push(part(box(3.8, 0.1, 3.0, 1.8, D + 0.7, 0), FERRY_PART.white));
  parts.push(part(box(3.6, 0.06, 2.8, 1.8, D + 0.8, 0), FERRY_PART.leaf));
  // The gangway: a covered walk from the pier to the ferry's side, at promenade height.
  const y = FERRY.main + 0.05;
  parts.push(part(box(0.5, 0.06, 1.6, berthAlong, y, 1.3 * side), FERRY_PART.white));
  parts.push(part(box(0.5, 0.04, 1.6, berthAlong, y + 0.3, 1.3 * side), FERRY_PART.glass));
  parts.push(part(box(0.5, y - D, 0.5, berthAlong, D, 0.4 * side), FERRY_PART.white));
  // Bollards and lamps along the berth edge, a beacon at the end.
  for (let k = 4; k < len; k += 3) {
    parts.push(
      part(new CylinderGeometry(0.07, 0.09, 0.14, 8).translate(k, D + 0.07, 0.65 * side), FERRY_PART.deck),
    );
    parts.push(
      part(
        new CylinderGeometry(0.02, 0.02, 0.5, 5).translate(k + 1.5, D + 0.25, -0.7 * side),
        FERRY_PART.white,
      ),
    );
    parts.push(
      part(new SphereGeometry(0.06, 6, 5).translate(k + 1.5, D + 0.52, -0.7 * side), FERRY_PART.lamp),
    );
  }
  parts.push(
    part(new CylinderGeometry(0.12, 0.16, 0.9, 8).translate(len - 0.3, D + 0.45, 0), FERRY_PART.white),
  );
  parts.push(part(new SphereGeometry(0.13, 8, 6).translate(len - 0.3, D + 0.98, 0), FERRY_PART.navGreen));
  return mergeGeometries(parts)!;
}
