/**
 * Shared film art (D-188): the detailed scenery the films draw from, as SVG markup built from numbers (no data
 * reaches it). A skyline of solarpunk buildings by depth, cumulus clouds, and a seeded random so a city's films
 * look the same each time they are replayed.
 */

/** A small seeded random (mulberry32): the same city draws the same skyline. */
export function seeded(seed: number): () => number {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SkylineLayer {
  /** Left and right edges and the ground line, in the SVG's units. */
  x0: number;
  x1: number;
  ground: number;
  /** Tallest building. */
  tall: number;
  /** Buildings across the span. */
  count: number;
  /** Lit face, shaded side, and window light; far layers are paler (haze). */
  face: string;
  side: string;
  glass: string;
  lit: string;
  /** Share of windows lit (0 by day far away, more at dusk). */
  litShare: number;
  /** Green on roofs and terraces. */
  green: string;
  /** Draw windows and roof details (near layers). */
  detail: boolean;
}

const f = (v: number) => v.toFixed(1);

/**
 * One layer of a skyline: towers with a lit face and a shaded side, window grids, and solarpunk tops (roof gardens,
 * terraces with trees, domes, spires, solar petals). Deterministic for a given `rand`.
 */
export function skyline(L: SkylineLayer, rand: () => number): string {
  let out = '';
  const span = (L.x1 - L.x0) / L.count;
  for (let i = 0; i < L.count; i++) {
    const w = span * (0.55 + rand() * 0.4);
    const x = L.x0 + i * span + (span - w) * rand();
    const ht = L.tall * (0.35 + rand() * 0.65);
    const y = L.ground - ht;
    const kind = rand();
    const sideW = w * 0.28;
    // Body: the lit face and its shaded side.
    out += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(ht + 2)}" fill="${L.face}"/>`;
    out += `<rect x="${f(x + w - sideW)}" y="${f(y)}" width="${f(sideW)}" height="${f(ht + 2)}" fill="${L.side}"/>`;
    // A stepped top for some: a narrower storey above.
    let top = y;
    if (kind < 0.3) {
      const w2 = w * 0.62;
      const h2 = ht * (0.12 + rand() * 0.14);
      top = y - h2;
      out += `<rect x="${f(x + (w - w2) / 2)}" y="${f(top)}" width="${f(w2)}" height="${f(h2 + 1)}" fill="${L.face}"/>`;
      out += `<rect x="${f(x + (w - w2) / 2 + w2 * 0.72)}" y="${f(top)}" width="${f(w2 * 0.28)}" height="${f(h2 + 1)}" fill="${L.side}"/>`;
    }
    const cx = x + w / 2;
    // The crown.
    if (kind < 0.12) out += `<path d="M${f(cx - w * 0.18)} ${f(top)} L${f(cx)} ${f(top - ht * 0.22)} L${f(cx + w * 0.18)} ${f(top)}Z" fill="${L.face}"/><rect x="${f(cx - 0.8)}" y="${f(top - ht * 0.34)}" width="1.6" height="${f(ht * 0.14)}" fill="${L.side}"/>`;
    else if (kind < 0.24) out += `<path d="M${f(x + w * 0.1)} ${f(top)} A${f(w * 0.4)} ${f(w * 0.4)} 0 0 1 ${f(x + w * 0.9)} ${f(top)}Z" fill="${L.glass}" opacity="0.9"/>`;
    else if (kind < 0.36 && L.detail) {
      // Solar petals on a mast.
      out += `<rect x="${f(cx - 1)}" y="${f(top - w * 0.5)}" width="2" height="${f(w * 0.5)}" fill="${L.side}"/>`;
      for (const a of [-55, -20, 20, 55]) out += `<ellipse cx="${f(cx)}" cy="${f(top - w * 0.5 - w * 0.16)}" rx="${f(w * 0.07)}" ry="${f(w * 0.2)}" fill="${L.glass}" transform="rotate(${a} ${f(cx)} ${f(top - w * 0.5)})"/>`;
    } else if (kind < 0.7) {
      // A roof garden: a few round crowns.
      const n = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) out += `<circle cx="${f(x + w * (0.18 + (k / n) * 0.7))}" cy="${f(top - w * 0.06)}" r="${f(w * (0.09 + rand() * 0.07))}" fill="${L.green}"/>`;
    }
    if (!L.detail) continue;
    // Windows: a grid on the lit face, some lit.
    const cols = Math.max(2, Math.round((w - sideW) / 9));
    const rows = Math.max(3, Math.round(ht / 12));
    const cw = (w - sideW - 6) / cols;
    const rh = (ht - 10) / rows;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const lit = rand() < L.litShare;
        out += `<rect x="${f(x + 3 + c * cw + cw * 0.18)}" y="${f(y + 6 + r * rh)}" width="${f(cw * 0.64)}" height="${f(rh * 0.55)}" fill="${lit ? L.lit : L.glass}"${lit ? '' : ' opacity="0.55"'}/>`;
      }
    // Terraces: a green ledge with planters every few floors on some towers.
    if (kind > 0.8)
      for (let r = 2; r < rows; r += 3) {
        const ty = y + 6 + r * rh - 2;
        out += `<rect x="${f(x - 2)}" y="${f(ty)}" width="${f(w + 4)}" height="2.5" fill="${L.side}"/>`;
        for (let k = 0; k < 3; k++) out += `<circle cx="${f(x + w * (0.2 + k * 0.3))}" cy="${f(ty - 2)}" r="${f(Math.min(5, w * 0.08))}" fill="${L.green}"/>`;
      }
  }
  return out;
}

/** A cumulus cloud: overlapping puffs with a lit top and a shaded underside (centred at 0, 0; ≈ 200 × 70). */
export function cloud(rand: () => number, lit: string, shade: string): string {
  let top = '';
  let under = '';
  const n = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const x = -80 + (i / (n - 1)) * 160 + (rand() - 0.5) * 16;
    const r = 18 + rand() * 22 * (1 - Math.abs(x) / 120);
    const y = -r * 0.55;
    under += `<circle cx="${f(x)}" cy="${f(y + 6)}" r="${f(r)}" fill="${shade}"/>`;
    top += `<circle cx="${f(x - 2)}" cy="${f(y)}" r="${f(r * 0.94)}" fill="${lit}"/>`;
  }
  return `${under}${top}<rect x="-92" y="-4" width="184" height="12" rx="6" fill="${shade}"/>`;
}
