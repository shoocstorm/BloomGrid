import { hash2 } from './random';

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 2D value noise in [-1,1]. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty) * 2 - 1;
}

export function fbm(x: number, y: number, seed: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal in [0,1] — sharp mountain crests. */
export function ridged(x: number, y: number, seed: number, octaves = 5): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let prev = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(valueNoise(x * freq, y * freq, seed + i * 57));
    n *= n;
    sum += n * amp * prev;
    prev = n;
    amp *= 0.5;
    freq *= 2;
  }
  return Math.min(1, sum);
}
