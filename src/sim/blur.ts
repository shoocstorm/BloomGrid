let scratch = new Float32Array(0);
let colSum = new Float64Array(0);

/**
 * Separable box blur with a sliding window: O(tiles) per pass regardless of radius. Several
 * passes approximate a Gaussian, which is how point deposits become smooth fields cheaply.
 */
export function boxBlur(a: Float32Array, w: number, h: number, r: number, passes = 1): void {
  if (scratch.length < a.length) scratch = new Float32Array(a.length);
  const t = scratch;
  const k = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    // Horizontal: a → t. Edge samples clamp; the interior runs branch-free.
    for (let z = 0; z < h; z++) {
      const row = z * w;
      const first = a[row]!;
      const last = a[row + w - 1]!;
      let s = first * (r + 1);
      for (let i = 1; i <= r; i++) s += a[row + Math.min(w - 1, i)]!;
      for (let x = 0; x < w; x++) {
        t[row + x] = s * k;
        const add = x + r + 1 < w ? a[row + x + r + 1]! : last;
        const sub = x - r >= 0 ? a[row + x - r]! : first;
        s += add - sub;
      }
    }
    // Vertical: t → a, swept row by row with one running sum per column, so every access is
    // contiguous (a column-wise walk strides the whole map and thrashes the cache at 512²).
    if (colSum.length < w) colSum = new Float64Array(w);
    const cs = colSum;
    const lastRow = (h - 1) * w;
    for (let x = 0; x < w; x++) cs[x] = t[x]! * (r + 1);
    for (let i = 1; i <= r; i++) {
      const row = Math.min(h - 1, i) * w;
      for (let x = 0; x < w; x++) cs[x] += t[row + x]!;
    }
    for (let z = 0; z < h; z++) {
      const row = z * w;
      const addRow = z + r + 1 < h ? (z + r + 1) * w : lastRow;
      const subRow = z - r >= 0 ? (z - r) * w : 0;
      for (let x = 0; x < w; x++) {
        a[row + x] = cs[x]! * k;
        cs[x] += t[addRow + x]! - t[subRow + x]!;
      }
    }
  }
}

/** Peak value a unit point deposit reaches after `passes` blurs of radius r (to scale deposits). */
export function blurPeak(r: number, passes: number): number {
  // 1-D: centre weight of the n-fold convolution of a (2r+1)-wide box; 2-D is its square.
  let dist = [1];
  for (let p = 0; p < passes; p++) {
    const next = new Array(dist.length + 2 * r).fill(0);
    dist.forEach((v, i) => {
      for (let j = 0; j <= 2 * r; j++) next[i + j] += v / (2 * r + 1);
    });
    dist = next;
  }
  const c = dist[(dist.length - 1) / 2];
  return c * c;
}
