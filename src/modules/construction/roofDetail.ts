import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { BuildingDef } from '@/content/types';
import { isHero } from '@/content/heroes';
import { Rng, hash2 } from '@/sim/random';
import type { TemplatePiece } from './BuildingRenderer';

/**
 * Roof detail (D-160): everyday buildings were boxes with bare flat lids, which is what gave a city view its toy
 * look from above. After a recipe runs, every flat roof it leaves bare (a slab, glass or timber block whose top
 * nothing stands on) gets what real roofs carry: a parapet with a coping round the edge, and a little plant (AC
 * condensers with fan grilles, vent stacks, a hatch, a water tank on legs on bigger roofs). Pieces are kit pieces
 * the city already draws (`slab`, `concreteCyl`), so this adds instances, never draw calls. Heroes keep their
 * hand-made roofs.
 *
 * Levels (D-100): a roof is judged per level, so a roof a later level builds on is dressed only below that level,
 * and a new level's own roof is dressed from that level on. The dressing joins the recipe's designed level pieces
 * with that tier range. A recipe without designed levels gets the generic level overlay (a terrace on the main roof
 * from level 2), so its main-roof plant shows at level 1 only (`main`).
 */

/** Pieces a roof can be: flat-topped boxes. */
const ROOFS = new Set(['slab', 'glassBox', 'timberBox']);
/** Thin decor that may sit on a roof without making it "used" (ivy hangs down, flowers are specks). */
const IGNORE = new Set(['ivy', 'flower', 'grass']);
/** Smallest roof (local units, both sides) worth dressing, and the most roofs dressed per building and level. */
const MIN_SIDE = 0.55;
const MAX_ROOFS = 2;
/** Plant colours: below the restyle threshold (styles.ts), so they stay metal and never take the wall colour. */
const METAL = 0xa4abaf;
const DARK = 0x3b3f42;
/** Coping: a light neutral, so it takes the building's wall colour like the walls under it. */
const COPING = 0xf0ece4;

const _e = new Euler();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _m = new Matrix4();
const UNIT = new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5));

/** Local AABB of a unit piece under its matrix. */
const boxOf = (p: TemplatePiece): Box3 => UNIT.clone().applyMatrix4(p.local);

/** Upright and turned by quarter turns only, so its box is its footprint. */
function squareOn(p: TemplatePiece): boolean {
  _e.setFromRotationMatrix(_m.extractRotation(p.local), 'YXZ');
  const k = Math.abs((_e.y / (Math.PI / 2)) % 1);
  return Math.abs(_e.x) < 1e-3 && Math.abs(_e.z) < 1e-3 && Math.min(k, 1 - k) < 1e-3;
}

export interface RoofDetail {
  /** Shown at every level. */
  always: TemplatePiece[];
  /** Designed-level recipes: dressing with a tier range (`from` / `to` / `top`), to join the template's `ranged`. */
  ranged: TemplatePiece[];
  /** Generic-level recipes: plant on the main roof, shown at level 1 only. */
  main: TemplatePiece[];
}

/** Bare roofs among `vis` (largest first). */
function bareRoofs(vis: TemplatePiece[]): Box3[] {
  const boxes = vis.map(boxOf);
  const out: Box3[] = [];
  vis.forEach((p, i) => {
    if (!ROOFS.has(p.piece) || !squareOn(p)) return;
    const b = boxes[i]!;
    if (b.max.x - b.min.x < MIN_SIDE || b.max.z - b.min.z < MIN_SIDE || b.max.y < 0.3) return;
    // Bare if nothing else reaches above the roof over its middle (a margin in from the rim, so a railing or a
    // neighbouring wing touching the edge does not count).
    const inner = new Box3(
      new Vector3(b.min.x + 0.08, b.max.y + 0.005, b.min.z + 0.08),
      new Vector3(b.max.x - 0.08, b.max.y + 4, b.max.z - 0.08),
    );
    if (!vis.some((q, j) => j !== i && !IGNORE.has(q.piece) && boxes[j]!.intersectsBox(inner))) out.push(b);
  });
  return out.sort(
    (a, b) => (b.max.x - b.min.x) * (b.max.z - b.min.z) - (a.max.x - a.min.x) * (a.max.z - a.min.z),
  );
}

const keyOf = (b: Box3) => [b.min.x, b.min.z, b.max.x, b.max.z, b.max.y].map((v) => v.toFixed(3)).join(',');

/**
 * Dresses the bare roofs of a recipe's pieces. `pieces` are its base pieces, `ranged` its designed level pieces,
 * `top` its solid top (the roof the generic level overlay builds on), `seed` keeps each roof's plant stable.
 */
export function roofDetail(
  def: BuildingDef,
  pieces: TemplatePiece[],
  ranged: TemplatePiece[],
  top: number,
  seed: number,
): RoofDetail {
  const res: RoofDetail = { always: [], ranged: [], main: [] };
  if (isHero(def) || def.category === 'nature') return res;
  // Which tiers (0 = level 1) each roof is bare at.
  const roofs = new Map<string, { box: Box3; tiers: number[] }>();
  for (let tier = 0; tier <= (ranged.length ? 2 : 0); tier++) {
    const vis = ranged.length
      ? pieces.concat(ranged.filter((p) => p.from! <= tier && tier <= p.to!))
      : pieces;
    for (const box of bareRoofs(vis).slice(0, MAX_ROOFS)) {
      const k = keyOf(box);
      const r = roofs.get(k) ?? { box, tiers: [] };
      r.tiers.push(tier);
      roofs.set(k, r);
    }
  }
  for (const { box, tiers } of roofs.values()) {
    // Contiguous tiers only (a roof that is covered and then bare again keeps its first run).
    const from = tiers[0]!;
    let to = from;
    while (tiers.includes(to + 1)) to++;
    const rng = new Rng(
      Math.floor(
        hash2(
          Math.round(box.min.x * 100) + 7 * Math.round(box.max.y * 100),
          Math.round(box.min.z * 100),
          seed,
        ) *
          2 ** 31,
      ),
    );
    const generic = !ranged.length;
    const onMain = generic && Math.abs(box.max.y - top) < 0.01;
    dress(box, rng, (piece, local, tint, isPlant) => {
      const p: TemplatePiece = {
        piece,
        local,
        tint,
        glow: 0,
        growAt: 0,
        seed: rng.next(),
        y: local.elements[13]!,
      };
      if (generic) (isPlant && onMain ? res.main : res.always).push(p);
      else if (from === 0 && to === 2) res.always.push(p);
      else res.ranged.push(Object.assign(p, { from, to, top: p.y + local.elements[5]! }));
    });
  }
  return res;
}

type Emit = (piece: string, local: Matrix4, tint: number, plant: boolean) => void;

function dress(box: Box3, rng: Rng, emit: Emit): void {
  const add = (
    piece: string,
    p: [number, number, number],
    s: [number, number, number],
    tint: number,
    plant = true,
    r = 0,
  ) => {
    _q.setFromEuler(_e.set(0, r, 0, 'YXZ'));
    emit(piece, new Matrix4().compose(_v.set(...p), _q, _s.set(...s)), tint, plant);
  };
  const top = box.max.y;
  const [x0, x1, z0, z1] = [box.min.x, box.max.x, box.min.z, box.max.z];
  const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
  const [w, d] = [x1 - x0, z1 - z0];
  // Parapet: four low walls flush with the façade, the long sides a hair proud of it like a coping.
  const H = 0.045;
  const T = 0.025;
  add('slab', [cx, top, z0 + T / 2], [w + 0.01, H, T], COPING, false);
  add('slab', [cx, top, z1 - T / 2], [w + 0.01, H, T], COPING, false);
  add('slab', [x0 + T / 2, top, cz], [T, H, d - 2 * T], COPING, false);
  add('slab', [x1 - T / 2, top, cz], [T, H, d - 2 * T], COPING, false);
  // Plant, kept off the parapet: condensers in a row, a vent stack or two, a hatch, a tank on bigger roofs.
  const pad = 0.12;
  const spot = (): [number, number] => [rng.range(x0 + pad, x1 - pad), rng.range(z0 + pad, z1 - pad)];
  const units = 1 + Math.floor(rng.next() * Math.min(3, w * d * 2));
  const [ux, uz] = spot();
  const alongX = w >= d;
  for (let k = 0; k < units; k++) {
    const off = (k - (units - 1) / 2) * 0.15;
    const [x, z] = alongX
      ? [Math.min(x1 - pad, Math.max(x0 + pad, ux + off)), uz]
      : [ux, Math.min(z1 - pad, Math.max(z0 + pad, uz + off))];
    add('slab', [x, top, z], [0.12, 0.075, 0.1], METAL, true, alongX ? 0 : Math.PI / 2);
    // Fan grille on each condenser.
    add('concreteCyl', [x, top + 0.075, z], [0.075, 0.008, 0.075], DARK);
  }
  for (let k = 0, n = 1 + Math.floor(rng.next() * 2); k < n; k++) {
    const [x, z] = spot();
    add('concreteCyl', [x, top, z], [0.035, 0.11 + rng.next() * 0.08, 0.035], METAL);
    add('concreteCyl', [x, top + 0.13, z], [0.05, 0.015, 0.05], DARK);
  }
  {
    const [x, z] = spot();
    add('slab', [x, top, z], [0.1, 0.03, 0.12], DARK);
  }
  if (w * d > 1.2 && rng.next() < 0.6) {
    const [x, z] = spot();
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      add('slab', [x + dx * 0.05, top, z + dz * 0.05], [0.014, 0.07, 0.014], DARK);
    add('concreteCyl', [x, top + 0.07, z], [0.16, 0.15, 0.16], 0xb9b3a4);
  }
}
