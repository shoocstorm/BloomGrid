import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, TorusGeometry, Vector3 } from 'three/webgpu';
import { tf } from '@/render/bake';
import { getMaterial } from '@/render/materials/library';
import { hash2 } from '@/sim/random';
import { NEIGHBOURS } from '@/sim/archipelago';
import type { NeighbourId } from '@/sim/archipelagoState';
import { BALL_LO, boulder, CONE, CYL, CYL8, Kit, palm, sail, SURF, TINY } from '@/modules/scenery/wonderKit';
import { foam, islet } from '@/modules/scenery/wonderModels';

/**
 * The neighbours on the horizon (plan v8, Phase 39): four islands far out at sea on their bearings, big simple
 * silhouettes read through the fog at overview zoom (the Drift's moored flotilla, the Concord's walled bastion, the
 * Orders' archive holm, Kestrel Cay's green hill town), a dark squall over a neighbour in trouble, and a cargo boat
 * per agreement sailing between the island and its partner. Each island is one merged mesh in the sea wonders'
 * `wonder` material (lit windows glow at night), built at the origin and placed by its group. Render only.
 */

const BOX = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const STONE = [0x7d776e, 0x8a8378, 0x6f6a62] as const;
const WARM = 0xffcf86;
const LANTERN = 0xffd98a;

/** A hull: a long box with a tapered bow, deck at y = h. */
function hull(k: Kit, x: number, z: number, len: number, beam: number, yaw: number, col: number): void {
  k.part(BOX, tf(x, -0.6, z, 0, yaw, 0, beam, 2.2, len), col, SURF.paint);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  k.part(CONE, tf(x + s * (len / 2 + 1.2), 0.5, z + c * (len / 2 + 1.2), Math.PI / 2, yaw, 0, beam * 0.5, 2.6, 1.1), col, SURF.paint);
}

/** The Drift: a ring of moored fairground ships and market barges round a lagoon, sails up, a big wheel, lanterns. */
function flotilla(): Kit {
  const k = new Kit();
  const HULLS = [0xf06a5a, 0xffb35c, 0x5cc8ff, 0xf4f0e6, 0xc77dff, 0x7fe0a6] as const;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 34 + hash2(i, 1, 51) * 10;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const len = 12 + hash2(i, 2, 51) * 10;
    hull(k, x, z, len, 4 + hash2(i, 3, 51) * 2, a + Math.PI / 2 + (hash2(i, 4, 51) - 0.5) * 0.4, HULLS[i % HULLS.length]!);
    // Masts and sails on every other ship; a striped tent on the rest.
    if (i % 2) {
      k.part(CYL8, tf(x, 1.5, z, 0, 0, 0, 0.25, 14, 0.25), 0x6b4a32, SURF.wood);
      k.part(sail(6, 10), tf(x, 3, z, 0, a, 0), 0xfff4e0, SURF.matte);
    } else k.part(CONE, tf(x, 1.5, z, 0, 0, 0, 3, 5, 3), HULLS[(i + 2) % HULLS.length]!, SURF.paint);
    k.part(TINY, tf(x, 5.5, z, 0, 0, 0, 0.6), LANTERN, SURF.glass, 2.2);
  }
  // Market barges in the lagoon, joined by walkways.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    k.part(BOX, tf(Math.cos(a) * 16, -0.4, Math.sin(a) * 16, 0, a, 0, 10, 1.6, 7), 0xc8a57c, SURF.wood);
    k.part(BOX, tf(Math.cos(a) * 16, 1.2, Math.sin(a) * 16, 0, a, 0, 6, 3, 4), HULLS[(i + 1) % HULLS.length]!, SURF.paint);
    k.part(BOX, tf(Math.cos(a) * 26, 0.6, Math.sin(a) * 26, 0, a + Math.PI / 2, 0, 1.4, 0.3, 14), 0xb08a5e, SURF.wood);
  }
  // The great wheel on the central barge.
  k.part(BOX, tf(0, -0.4, 0, 0, 0, 0, 14, 1.6, 14), 0xc8a57c, SURF.wood);
  k.part(new TorusGeometry(11, 0.5, 6, 40), tf(0, 14, 0, 0, 0.4, 0), 0xfff4e0, SURF.metal, 1.2);
  for (let s = 0; s < 12; s++) {
    const a = (s / 12) * Math.PI * 2;
    k.part(CYL8, tf(0, 14, 0, 0, 0.4, a, 0.15, 11, 0.15), 0xe8e2d6, SURF.metal);
    k.part(BALL_LO, tf(Math.cos(0.4) * Math.cos(a) * 11, 14 + Math.sin(a) * 11, -Math.sin(0.4) * Math.cos(a) * 11, 0, 0, 0, 0.9), HULLS[s % HULLS.length]!, SURF.paint, 1.4);
  }
  for (const sx of [-1, 1]) k.part(CYL8, tf(sx * 3, 0.8, 0, 0, 0, sx * 0.22, 0.4, 14, 0.4), 0xe8e2d6, SURF.metal);
  foam(k, 0, 0, 44, 40, 5);
  return k;
}

/** The Concord: a granite rock ringed by a towering seawall, arcology towers rising inside, turbines in the sluices. */
function bastion(): Kit {
  const k = new Kit();
  islet(k, 0, 0, 52, 21, 12);
  const wallR = 40;
  k.part(new CylinderGeometry(wallR, wallR + 4, 26, 48, 1, true).translate(0, 13, 0), tf(0, -2, 0), 0xb9b4aa, SURF.stone);
  k.part(new CylinderGeometry(wallR + 0.6, wallR + 0.6, 1.4, 48, 1, true).translate(0, 0.7, 0), tf(0, 23.5, 0), 0x8d8a84, SURF.stone, 0.6);
  // Sluice gates with turbines.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    k.part(BOX, tf(Math.cos(a) * (wallR + 2), -1, Math.sin(a) * (wallR + 2), 0, -a, 0, 8, 12, 5), 0x6f6a62, SURF.stone);
    k.part(new TorusGeometry(2.4, 0.35, 6, 16), tf(Math.cos(a) * (wallR + 4.6), 4, Math.sin(a) * (wallR + 4.6), 0, -a + Math.PI / 2, 0), 0x9fb8d6, SURF.metal, 0.8);
  }
  // Arcology towers: stepped glass blocks, lit by night.
  const towers: [number, number, number, number][] = [
    [0, 0, 70, 12],
    [-16, 10, 52, 9],
    [15, -12, 58, 9],
    [14, 14, 44, 8],
    [-14, -15, 48, 8],
    [-26, -2, 34, 7],
    [26, 2, 38, 7],
  ];
  for (const [x, z, H, w] of towers) {
    for (let s = 0; s < 3; s++) {
      const ww = w * (1 - s * 0.22);
      k.part(BOX, tf(x, (H * s) / 3, z, 0, 0.3, 0, ww, H / 3, ww), s % 2 ? 0x9fb8d6 : 0xcfd8e0, SURF.glass);
    }
    for (let f = 1; f < 9; f++) k.part(BOX, tf(x, (H * f) / 9, z, 0, 0.3, 0, w * 1.02 * (1 - Math.floor((f * 3) / 9) * 0.22), 0.35, w * 0.2), WARM, SURF.glass, 1.6);
    k.part(CONE, tf(x, H, z, 0, 0, 0, w * 0.25, 6, w * 0.25), 0xe8e2d6, SURF.metal, 0.4);
  }
  return k;
}

/** The Lantern Orders: a grey holm crowded with narrow archive towers, a lantern burning in every window. */
function holm(): Kit {
  const k = new Kit();
  islet(k, 0, 0, 40, 33, 11);
  k.part(boulder(2), tf(0, -1, 0, 0, 0.6, 0, 30, 10, 26), 0x6f6a62, SURF.stone);
  for (let i = 0; i < 14; i++) {
    const a = hash2(i, 1, 77) * Math.PI * 2;
    const d = hash2(i, 2, 77) * 22;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const H = 18 + hash2(i, 3, 77) * 26;
    const r = 2.6 + hash2(i, 4, 77) * 2;
    const y0 = 6 - d * 0.15;
    k.part(CYL, tf(x, y0, z, 0, 0, 0, r, H, r), STONE[i % 3]!, SURF.stone);
    k.part(CONE, tf(x, y0 + H, z, 0, 0, 0, r * 1.25, r * 2.2, r * 1.25), 0x3d4a52, SURF.metal);
    for (let w = 0; w < 4; w++) {
      const wa = hash2(i, 10 + w, 77) * Math.PI * 2;
      k.part(TINY, tf(x + Math.cos(wa) * r, y0 + H * (0.3 + w * 0.17), z + Math.sin(wa) * r, 0, 0, 0, 0.9), LANTERN, SURF.glass, 2.4);
    }
  }
  // Lantern boats at the quay.
  for (let b = 0; b < 4; b++) {
    const a = 2.4 + b * 0.35;
    hull(k, Math.cos(a) * 44, Math.sin(a) * 44, 8, 3, a, 0x4a5560);
    k.part(TINY, tf(Math.cos(a) * 44, 3.5, Math.sin(a) * 44, 0, 0, 0, 0.7), LANTERN, SURF.glass, 2.4);
  }
  return k;
}

/** Kestrel Cay: a green hill with a young town of white houses down to a quay, palms, and its own light. */
function cay(): Kit {
  const k = new Kit();
  // A sandy apron and a green hill (an ellipsoid: the town follows its surface), surf all round.
  k.part(boulder(3), tf(0, -2.2, 0, 0, 0.4, 0, 50, 3.4, 44), 0xe8d6a8, SURF.sand);
  const HR = 36;
  const HH = 22;
  k.part(boulder(1), tf(0, 0, 0, 0, 0.3, 0, HR, HH, HR * 0.9), 0x6fb35c, SURF.leaf);
  for (let i = 0; i < 3; i++) k.part(boulder(i), tf(-30 + i * 26, -1, 30 - i * 8, 0, i, 0, 8, 5, 7), STONE[i]!, SURF.stone);
  const ground = (d: number) => HH * Math.sqrt(Math.max(0, 1 - (d / (HR * 0.95)) ** 2));
  for (let i = 0; i < 44; i++) {
    const a = hash2(i, 1, 33) * Math.PI * 2;
    const d = 6 + hash2(i, 2, 33) * 26;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d * 0.88;
    const y = ground(Math.hypot(x, z / 0.9)) - 1.2;
    const w = 3 + hash2(i, 3, 33) * 3;
    const hh = 3 + hash2(i, 4, 33) * 4;
    k.part(BOX, tf(x, y, z, 0, a, 0, w, hh, w * 0.8), i % 5 ? 0xf4f0e6 : 0x7fe0a6, SURF.paint);
    k.part(BOX, tf(x, y + hh * 0.55, z, 0, a, 0, w * 1.02, 0.4, w * 0.82), WARM, SURF.glass, 1.4);
    k.part(CONE, tf(x, y + hh, z, 0, a + Math.PI / 4, 0, w * 0.72, 2, w * 0.72), 0xd2715a, SURF.paint);
  }
  for (let p = 0; p < 6; p++) {
    const a = hash2(p, 5, 33) * Math.PI * 2;
    palm(k, Math.cos(a) * 40, 0.8, Math.sin(a) * 36, 9, a, p);
  }
  // A quay on the island side, and their own light on the summit.
  k.part(BOX, tf(0, -0.6, -46, 0, 0, 0, 16, 1.6, 8), 0xb08a5e, SURF.wood);
  k.part(CYL, tf(4, HH - 2, -3, 0, 0, 0, 2.2, 16, 2.2), 0xf4f0e6, SURF.paint);
  k.part(CYL, tf(4, HH + 14, -3, 0, 0, 0, 2.6, 2.4, 2.6), 0xffe9b0, SURF.glass, 3);
  foam(k, 0, 0, 50, 40, 9);
  return k;
}

const MODELS: Record<NeighbourId, () => Kit> = { drift: flotilla, concord: bastion, lantern: holm, kestrel: cay };
/** Each island's rough size (tiles): the pick box and the squall. */
export const ISLE_SIZE: Record<NeighbourId, [r: number, h: number]> = {
  drift: [46, 26],
  concord: [50, 76],
  lantern: [44, 50],
  kestrel: [48, 30],
};

/** The model of a neighbour at the origin (the gallery uses it too). */
export const isleModel = (id: NeighbourId): Kit => MODELS[id]();

/** A small cargo boat at the origin, bow toward +z (one shared geometry for every agreement). */
export function cargoBoat(): Kit {
  const k = new Kit();
  hull(k, 0, 0, 7, 2.4, 0, 0xf4f0e6);
  k.part(BOX, tf(0, 1.6, -0.6, 0, 0, 0, 2, 1, 3.2), 0xffb35c, SURF.paint);
  k.part(BOX, tf(0, 1.6, 2, 0, 0, 0, 1.6, 1.8, 1.4), 0x5cc8ff, SURF.paint);
  k.part(TINY, tf(0, 3.6, 2, 0, 0, 0, 0.3), LANTERN, SURF.glass, 2);
  return k;
}

/** Where each neighbour stands in the world (the island's centre plus its offset). */
export const islePos = (id: NeighbourId, S: number): [number, number] => {
  const at = NEIGHBOURS.find((n) => n.id === id)!.at;
  return [S / 2 + at[0], S / 2 + at[1]];
};

export class Horizon {
  readonly group = new Group();
  readonly isles = new Map<NeighbourId, Group>();
  private squalls = new Map<NeighbourId, Mesh>();
  readonly boats: Mesh[] = [];

  constructor(S: number) {
    const mat = getMaterial('wonder');
    // A squall: a heap of dark cloud and thin slanting rain.
    const squall = new Kit();
    for (let i = 0; i < 12; i++)
      squall.part(BALL_LO, tf((hash2(i, 1, 9) - 0.5) * 56, 58 + hash2(i, 2, 9) * 16, (hash2(i, 3, 9) - 0.5) * 56, 0, 0, 0, 14 + hash2(i, 4, 9) * 10, 9 + hash2(i, 7, 9) * 6, 13 + hash2(i, 8, 9) * 8), i % 3 ? 0x3a4048 : 0x4b525c, SURF.matte);
    for (let i = 0; i < 40; i++)
      squall.part(CYL8, tf((hash2(i, 5, 9) - 0.5) * 60, -2, (hash2(i, 6, 9) - 0.5) * 60, 0.22, 0.5, 0, 0.12, 58, 0.12), 0x8a96a2, SURF.matte);
    const squallGeo = squall.b.build();
    for (const def of NEIGHBOURS) {
      const g = new Group();
      const [x, z] = islePos(def.id, S);
      g.position.set(x, 0, z);
      // Face the island a little, so its town and quay look home.
      g.rotation.y = Math.atan2(-def.at[0], -def.at[1]);
      const mesh = new Mesh(MODELS[def.id]().b.build(), mat);
      mesh.name = `isle-${def.id}`;
      // Far beyond the shadow frustum: neither casts nor needs shadows.
      mesh.castShadow = mesh.receiveShadow = false;
      const s = new Mesh(squallGeo, mat);
      s.visible = false;
      g.add(mesh, s);
      g.visible = false;
      this.isles.set(def.id, g);
      this.squalls.set(def.id, s);
      this.group.add(g);
    }
    const boatGeo = cargoBoat().b.build();
    for (let i = 0; i < 6; i++) {
      const b = new Mesh(boatGeo, mat);
      b.visible = false;
      b.castShadow = false;
      this.boats.push(b);
      this.group.add(b);
    }
  }

  /** Shows the neighbours the city has met and a squall over those in trouble. */
  sync(met: (id: NeighbourId) => boolean, crisis: (id: NeighbourId) => boolean): void {
    for (const [id, g] of this.isles) {
      g.visible = met(id);
      this.squalls.get(id)!.visible = g.visible && crisis(id);
    }
  }

  /** A pick box for a neighbour in its group's frame. */
  static box(id: NeighbourId): Box3 {
    const [r, h] = ISLE_SIZE[id];
    return new Box3(new Vector3(-r, -2, -r), new Vector3(r, h, r));
  }
}
