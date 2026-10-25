let scratch = new Float32Array(0);

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
    // Vertical: t → a.
    for (let x = 0; x < w; x++) {
      const first = t[x]!;
      const last = t[(h - 1) * w + x]!;
      let s = first * (r + 1);
      for (let i = 1; i <= r; i++) s += t[Math.min(h - 1, i) * w + x]!;
      for (let z = 0, idx = x; z < h; z++, idx += w) {
        a[idx] = s * k;
        const add = z + r + 1 < h ? t[idx + (r + 1) * w]! : last;
        const sub = z - r >= 0 ? t[idx - r * w]! : first;
        s += add - sub;
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
