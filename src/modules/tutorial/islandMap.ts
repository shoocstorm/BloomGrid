import { terrainHeight } from '@/sim/terrain';

/** Sea, shore and land colours by height (sea level 0, land ≈ 0.4–2.5, hills up to ≈ 10). */
function shade(y: number): [number, number, number] {
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i]! - v) * Math.min(1, Math.max(0, t))) as [number, number, number];
  if (y < 0) return mix([31, 128, 140], [6, 36, 44], -y / 6);
  if (y < 0.35) return [214, 205, 156];
  if (y < 2.6) return mix([86, 164, 92], [52, 120, 70], (y - 0.35) / 2.25);
  return mix([52, 120, 70], [196, 214, 168], (y - 2.6) / 8);
}

/**
 * Paints the island a seed makes, from the sim's own height function, as a small map for the New Chapter dialog
 * (D-085). About 15k height samples; callers run it off the opening frame.
 */
export function drawIsland(canvas: HTMLCanvasElement, seed: number, size: number, cells = 120): void {
  canvas.width = cells;
  canvas.height = cells;
  const g = canvas.getContext('2d');
  if (!g) return;
  const img = g.createImageData(cells, cells);
  const step = size / cells;
  for (let z = 0; z < cells; z++)
    for (let x = 0; x < cells; x++) {
      const [r, gr, b] = shade(terrainHeight((x + 0.5) * step, (z + 0.5) * step, seed, size));
      const i = (z * cells + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gr;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
}
