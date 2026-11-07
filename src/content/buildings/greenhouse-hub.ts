import { defineBuilding } from '../types';
import { PALETTE, TRIM, beam, flowers, lamp, planter } from '../kit';

export default defineBuilding({
  id: 'greenhouse-hub',
  name: 'Mycelium Work Dome',
  description: 'Living workspaces grown from shaped timber and mycelium beneath a solar-glass dome.',
  category: 'commercial',
  footprint: [3, 3],
  stats: { cost: 260, energy: -10, eco: 4, happiness: 3, population: 0, jobs: 40, pollution: 1, water: -5, food: 60 },
  growthTime: 120,
  pollinators: 0.4,
  recipe(b) {
    // (D-095) A timber-ribbed geodesic dome on a stone ring with a deck round it, a sunflower crown lantern and a
    // timber entrance vestibule. The skin is clear glass (`glassDome`), so the workplace inside reads from outside:
    // a ring of desks facing the view, each with a chair, a laptop and a mycelium desk lamp, a shared round table
    // in the middle, and glowing fungus floor lamps between the desks.
    b.add({ piece: 'slab', p: [0, 0, 0], s: [2.9, 0.05, 2.9], tint: 0xd8cfbf });
    b.add({ piece: 'concreteCyl', p: [0, 0.05, 0], s: [2.62, 0.12, 2.62], tint: 0xc4ae8e });
    const F = 0.17;
    // Workstation at (cx, cz) turned by yaw `r`: the worker sits at local -z and faces +z.
    const station = (cx: number, cz: number, r: number, chairTint: number, lampAt: number) => {
      const [c, s] = [Math.cos(r), Math.sin(r)];
      const at = (x: number, y: number, z: number): [number, number, number] => [cx + x * c + z * s, F + y, cz - x * s + z * c];
      b.add({ piece: 'timberBox', p: at(0, 0.09, 0), s: [0.24, 0.014, 0.12], r, tint: 0xd2ad7a });
      for (const sx of [-1, 1]) b.add({ piece: 'timberBox', p: at(sx * 0.11, 0, 0), s: [0.014, 0.09, 0.11], r, tint: 0x9c7650 });
      // Laptop: a silver base and a lit screen hinged open away from the worker.
      b.add({ piece: 'slab', p: at(0, 0.104, -0.01), s: [0.066, 0.005, 0.046], r, tint: 0xc9ced2 });
      b.add({ piece: 'screen', p: at(0, 0.106, 0.013), s: [0.066, 0.046, 0.004], r, rx: 0.28, glow: 1 });
      // A light disc hung from the dome on a cable (the lights switch turns these, the screens and lamps off).
      b.add({ piece: 'lumenRib', p: at(0, 0.36, 0), s: [0.13, 0.012, 0.13], r, glow: 1 });
      b.add({ piece: 'slab', p: at(0, 0.372, 0), s: [0.004, 0.4, 0.004], r, tint: TRIM.charcoal });
      // Mycelium desk lamp on one corner.
      b.add({ piece: 'fungus', p: at(lampAt * 0.085, 0.104, 0.03), s: 0.07, r, tint: 0xf3e3ff, glow: 0.8 });
      // Chair: pedestal, seat and backrest.
      b.add({ piece: 'slab', p: at(0, 0, -0.1), s: [0.014, 0.055, 0.014], r, tint: TRIM.charcoal });
      b.add({ piece: 'slab', p: at(0, 0.055, -0.1), s: [0.066, 0.012, 0.06], r, tint: chairTint });
      b.add({ piece: 'slab', p: at(0, 0.067, -0.132), s: [0.066, 0.06, 0.012], r, tint: chairTint });
    };
    const CHAIRS = [0x6f9a82, 0xd9a35f, 0x5f87a8, 0xc8714f];
    let n = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      // The front (+z) bay is the entrance aisle.
      if (Math.abs(a - Math.PI / 2) < 0.1) continue;
      // Yaw that turns local +z to point outward along `a`.
      station(Math.cos(a) * 0.86, Math.sin(a) * 0.86, Math.PI / 2 - a, CHAIRS[n % CHAIRS.length], n % 2 ? 1 : -1);
      n++;
      // Fungus floor lamps between the desks, near the glass.
      const m = a + Math.PI / 8;
      b.add({ piece: 'fungus', p: [Math.cos(m) * 1.04, F, Math.sin(m) * 1.04], s: b.range(0.12, 0.16), tint: 0xf3e3ff, glow: 0.9, growAt: 0.1 + i * 0.05 });
    }
    // Shared round table with four chairs and two open laptops, under a round light disc.
    b.add({ piece: 'lumenRib', p: [0, F + 0.42, 0], s: [0.26, 0.014, 0.26], glow: 1 });
    b.add({ piece: 'slab', p: [0, F + 0.434, 0], s: [0.006, 0.6, 0.006], tint: TRIM.charcoal });
    b.add({ piece: 'concreteCyl', p: [0, F, 0], s: [0.1, 0.09, 0.1], tint: TRIM.charcoal });
    b.add({ piece: 'concreteCyl', p: [0, F + 0.09, 0], s: [0.46, 0.016, 0.46], tint: 0xd2ad7a });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const r = -Math.PI / 2 - a;
      const [c, s] = [Math.cos(r), Math.sin(r)];
      const at = (z: number, y: number): [number, number, number] => [Math.cos(a) * 0.32 + z * s, F + y, Math.sin(a) * 0.32 + z * c];
      b.add({ piece: 'slab', p: at(0, 0), s: [0.014, 0.055, 0.014], r, tint: TRIM.charcoal });
      b.add({ piece: 'slab', p: at(0, 0.055), s: [0.066, 0.012, 0.06], r, tint: CHAIRS[k] });
      b.add({ piece: 'slab', p: at(-0.032, 0.067), s: [0.066, 0.06, 0.012], r, tint: CHAIRS[k] });
      if (k % 2) continue;
      const lp = (z: number): [number, number, number] => [Math.cos(a) * 0.15 + z * s, F + 0.106, Math.sin(a) * 0.15 + z * c];
      b.add({ piece: 'slab', p: lp(0), s: [0.066, 0.005, 0.046], r, tint: 0xc9ced2 });
      b.add({ piece: 'screen', p: lp(0.023), s: [0.066, 0.046, 0.004], r, rx: 0.28, glow: 1 });
    }
    // Glass skin and its timber ribs: 10 meridians of 5 straight segments, two rings of chords.
    const R = 1.3;
    const H = 1.05;
    const at = (a: number, t: number): [number, number, number] => [Math.cos(a) * R * Math.cos(t), F + H * Math.sin(t), Math.sin(a) * R * Math.cos(t)];
    b.add({ piece: 'glassDome', p: [0, F, 0], s: [R * 2, H * 2, R * 2], tint: 0xffffff });
    const M = 10;
    for (let i = 0; i < M; i++) {
      const a = (i / M) * Math.PI * 2;
      for (let k = 0; k < 5; k++) beam(b, 'timberBox', at(a, (k / 5) * 1.35), at(a, ((k + 1) / 5) * 1.35), 0.035, { tint: 0xb08a5c });
      for (const t of [0.42, 0.95]) beam(b, 'timberBox', at(a, t), at(a + (2 * Math.PI) / M, t), 0.028, { tint: 0xb08a5c });
    }
    // Crown: an oculus lantern with a ring of solar petals.
    const top = 0.17 + H;
    const crown = (y: number, s: number) => {
      b.add({ piece: 'concreteCyl', p: [0, y - 0.06, 0], s: [0.42 * s, 0.08, 0.42 * s], tint: 0xe9e1d0 });
      b.add({ piece: 'glassCyl', p: [0, y + 0.02, 0], s: [0.28 * s, 0.16 * s, 0.28 * s], tint: 0xfff2c8, glow: 0.6 });
      for (let i = 0; i < 10; i++) b.add({ piece: 'solarLeaf', p: [0, y + 0.05, 0], s: [0.45 * s, 1, 0.45 * s], r: (i / 10) * Math.PI * 2, rz: 0.4, growAt: 0.1 + i * 0.03 });
    };
    b.upTo(1, () => crown(top, 1));
    // Entrance vestibule on the front (+z): a walk-through timber portal (D-132) whose two glass leaves slide apart
    // into its thick side walls when the steward opens the door in walk mode, under a canopy and a lit sign.
    for (const sx of [-1, 1]) {
      b.add({ piece: 'timberBox', p: [sx * 0.31, 0.05, 1.28], s: [0.2, 0.6, 0.36], tint: 0xb08a5c });
      b.add({ piece: 'glassBox', p: [sx * 0.105, 0.05, 1.4], s: [0.21, 0.44, 0.02], tint: 0xd6f2ee, door: sx * 0.95 });
    }
    b.add({ piece: 'timberBox', p: [0, 0.57, 1.28], s: [0.42, 0.08, 0.36], tint: 0xb08a5c });
    b.add({ piece: 'glassBox', p: [0, 0.49, 1.4], s: [0.42, 0.08, 0.02], tint: 0xd6f2ee });
    b.add({ piece: 'slab', p: [0, 0.65, 1.34], s: [0.96, 0.04, 0.6], tint: PALETTE.timber });
    b.add({ piece: 'slab', p: [0, 0.575, 1.465], s: [0.42, 0.06, 0.015], tint: 0x6a3f86, glow: 0.6, sign: 'name' });
    // Deck furniture: planters, benches, lamps, a bike rack.
    for (const sx of [-1, 1]) {
      planter(b, sx * 0.85, 0.05, 1.2, 0.36, 0.2, 0.2);
      lamp(b, sx * 1.3, 0.05, 1.3);
      b.add({ piece: 'timberBox', p: [sx * 1.25, 0.05, -0.6], s: [0.12, 0.08, 0.4], tint: 0xa47c56 });
    }
    for (let k = 0; k < 4; k++) b.add({ piece: 'willowArch', p: [-1.25 + k * 0.12, 0.05, 0.6], s: [0.1, 0.12, 0.02], r: Math.PI / 2, tint: TRIM.steel });

    // Levels (D-100). Level 2: a glazed drum (a mezzanine gallery) lifts the lantern, and climbing-rose arches
    // ring the back of the deck.
    const drum = top - 0.08;
    b.level(2, () => {
      b.add({ piece: 'glassCyl', p: [0, drum, 0], s: [0.95, 0.32, 0.95], tint: PALETTE.glassWarm, glow: 0.5 });
      b.add({ piece: 'concreteCyl', p: [0, drum + 0.32, 0], s: [1.05, 0.05, 1.05], tint: 0xe9e1d0 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        b.add({ piece: 'timberBox', p: [Math.cos(a) * 0.48, drum, Math.sin(a) * 0.48], s: [0.035, 0.32, 0.035], tint: 0xb08a5c });
      }
      b.upTo(2, () => crown(drum + 0.4, 1));
      for (const a of [-2.4, -1.57, -0.74]) {
        const [x, z] = [Math.cos(a) * 1.33, Math.sin(a) * 1.33];
        b.add({ piece: 'willowArch', p: [x, 0.05, z], s: [0.5, 0.55, 0.5], r: -a + Math.PI / 2, tint: PALETTE.bark });
        flowers(b, x, 0.05, z, 0.18, 4, 0.1, 0.6);
      }
    });
    // Level 3: a second, smaller dome over the gallery with its own ribs, a larger sunflower crown and a halo.
    b.level(3, () => {
      const R2 = 0.5;
      const y0 = drum + 0.37;
      b.add({ piece: 'dome', p: [0, y0, 0], s: [R2 * 2, 0.7, R2 * 2], tint: PALETTE.glass });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const at2 = (t: number): [number, number, number] => [Math.cos(a) * R2 * Math.cos(t), y0 + 0.35 * Math.sin(t), Math.sin(a) * R2 * Math.cos(t)];
        for (let k = 0; k < 3; k++) beam(b, 'timberBox', at2((k / 3) * 1.3), at2(((k + 1) / 3) * 1.3), 0.03, { tint: 0xb08a5c });
      }
      crown(y0 + 0.38, 1.35);
      b.add({ piece: 'haloRing', p: [0, y0 + 0.75, 0], s: [1.1, 3, 1.1], glow: 0.9 });
    });
  },
});
