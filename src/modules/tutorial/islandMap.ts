import type { BuildingCategory } from '@/content/types';
import { terrainHeight } from '@/sim/terrain';

/** Sea, shore and land colours by height (sea level 0, land ≈ 0.4–2.5, hills up to ≈ 10). */
export function shade(y: number): [number, number, number] {
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i]! - v) * Math.min(1, Math.max(0, t))) as [number, number, number];
  if (y < 0) return mix([31, 128, 140], [6, 36, 44], -y / 6);
  if (y < 0.35) return [214, 205, 156];
  if (y < 2.6) return mix([86, 164, 92], [52, 120, 70], (y - 0.35) / 2.25);
  return mix([52, 120, 70], [196, 214, 168], (y - 2.6) / 8);
}

/** Building colours by category on the city maps (and their legend). */
export const MAP_COLORS: Record<BuildingCategory, string> = {
  residential: '#f4d8a4',
  commercial: '#9cc8ff',
  industry: '#d0a27c',
  energy: '#ffd166',
  utility: '#78d6ea',
  tech: '#c9a8ff',
  nature: '#8ee39a',
  food: '#c4e57c',
  sports: '#ff9fb6',
};
export const MAP_ROAD = '#eef4ef';
export const MAP_LINE = '#5ff2da';

/** What a city map draws over the island: highway tiles, building lots and (optionally) the Aeroline loop. */
export interface MapCity {
  roads: Iterable<number>;
  lots: { x: number; z: number; w: number; d: number; cat: BuildingCategory }[];
  /** The Aeroline: corner points (loop order) and their rounding radius in tiles. */
  loop?: { corners: [number, number][]; radius: number };
}

const TERRAIN_CELLS = 128;

/**
 * Paints the island a seed makes, from the sim's own height function, and optionally a city over it: one pixel a
 * tile, so highways read as lines and lots as blocks when shown at ≈ 220 px (D-085). Terrain is ≈ 16k height
 * samples drawn smoothed; with a city the land is dimmed so the city stands out.
 */
export function drawIsland(canvas: HTMLCanvasElement, seed: number, size: number, city?: MapCity): void {
  const res = city ? size : TERRAIN_CELLS;
  canvas.width = res;
  canvas.height = res;
  const g = canvas.getContext('2d');
  if (!g) return;
  const t = document.createElement('canvas');
  t.width = t.height = TERRAIN_CELLS;
  const tg = t.getContext('2d')!;
  const img = tg.createImageData(TERRAIN_CELLS, TERRAIN_CELLS);
  const step = size / TERRAIN_CELLS;
  const dim = city ? 0.62 : 1;
  for (let z = 0; z < TERRAIN_CELLS; z++)
    for (let x = 0; x < TERRAIN_CELLS; x++) {
      const y = terrainHeight((x + 0.5) * step, (z + 0.5) * step, seed, size);
      const [r, gr, b] = shade(y);
      const k = y >= 0 ? dim : 1;
      const i = (z * TERRAIN_CELLS + x) * 4;
      img.data[i] = r * k;
      img.data[i + 1] = gr * k;
      img.data[i + 2] = b * k;
      img.data[i + 3] = 255;
    }
  tg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(t, 0, 0, res, res);
  if (!city) return;
  const s = res / size;
  g.fillStyle = MAP_ROAD;
  g.globalAlpha = 0.8;
  for (const i of city.roads) g.fillRect((i % size) * s, Math.floor(i / size) * s, s, s);
  g.globalAlpha = 1;
  for (const l of city.lots) {
    g.fillStyle = MAP_COLORS[l.cat];
    g.fillRect(l.x * s, l.z * s, Math.max(1, l.w * s - 0.5), Math.max(1, l.d * s - 0.5));
  }
  if (city.loop) {
    const c = city.loop.corners;
    const at = (i: number) => c[(i + c.length) % c.length]!;
    g.strokeStyle = MAP_LINE;
    g.lineWidth = 3 * s;
    g.beginPath();
    // Start mid-edge, then round each corner like the line itself.
    g.moveTo(((at(-1)[0] + at(0)[0]) / 2) * s, ((at(-1)[1] + at(0)[1]) / 2) * s);
    for (let i = 0; i < c.length; i++) g.arcTo(at(i)[0] * s, at(i)[1] * s, at(i + 1)[0] * s, at(i + 1)[1] * s, city.loop.radius * s);
    g.closePath();
    g.stroke();
  }
}
