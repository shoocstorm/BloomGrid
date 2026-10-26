import { BRIDGE } from './City';
import type { Grid } from './Grid';

/** A straight run of bridge tiles: start tile (x, z), length, and whether it runs along x. */
export interface BridgeSpan {
  x: number;
  z: number;
  len: number;
  alongX: boolean;
}

/** Straight runs of bridge tiles at least `min` long, row by row then column by column (deterministic). */
export function findBridgeSpans(g: Grid, min: number): BridgeSpan[] {
  const out: BridgeSpan[] = [];
  const isB = (x: number, z: number) => g.inBounds(x, z) && g.road[g.index(x, z)] === BRIDGE;
  for (const alongX of [true, false])
    for (let a = 0; a < (alongX ? g.h : g.w); a++)
      for (let b = 0; b < (alongX ? g.w : g.h); ) {
        const [x, z] = alongX ? [b, a] : [a, b];
        if (!isB(x, z)) {
          b++;
          continue;
        }
        let len = 1;
        while (alongX ? isB(x + len, z) : isB(x, z + len)) len++;
        if (len >= min) out.push({ x, z, len, alongX });
        b += len;
      }
  return out;
}
