import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three/webgpu';

/**
 * Laptop screens (D-132): one canvas atlas of four BloomGrid "apps" stacked top to bottom, sampled by the `screen`
 * material, which picks a frame per laptop and animates what moves (loading bar, live chart, caret, radar sweep).
 * Drawn once at boot with system fonts (no web-font wait). Frame rectangles the shader animates are in
 * `DISPLAY_RECTS`, in the frame's own 0..1 space with y up, so the drawing and the shader stay in step.
 */

export const DISPLAY_FRAMES = 4;
const W = 512;
const FH = 358;

/** Regions the shader animates: [x0, y0, x1, y1] in frame space (0..1, y up). */
export const DISPLAY_RECTS = {
  /** Splash: the loading bar. */
  bar: [0.22, 0.17, 0.78, 0.21],
  /** City Pulse: the live chart. */
  chart: [0.36, 0.14, 0.95, 0.7],
  /** Code: the editor body (14 lines). */
  code: [0.12, 0.06, 0.97, 0.8],
  /** Map: the radar's centre and radius (x, y, r). */
  radar: [0.5, 0.45, 0.36, 0],
} as const;
export const CODE_LINES = 14;

const TEAL = '#5ff2da';
const LEAF = '#8ef07a';
const INK = '#dcf5ee';
const SOFT = '#86aaa0';
const BG = '#0b1f1d';

/** Canvas rect from a frame-space rect (y up) in frame `k`. */
const rect = (k: number, r: readonly number[]): [number, number, number, number] => [r[0]! * W, k * FH + (1 - r[3]!) * FH, (r[2]! - r[0]!) * W, (r[3]! - r[1]!) * FH];

function logo(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  // The brand diamond in four petals.
  const cols = [TEAL, LEAF, '#ffd36e', '#c78bff'];
  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate(x, y);
    g.rotate((i * Math.PI) / 2);
    g.fillStyle = cols[i]!;
    g.beginPath();
    g.ellipse(s * 0.2, -s * 0.2, s * 0.27, s * 0.14, -Math.PI / 4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

function header(g: CanvasRenderingContext2D, k: number, title: string): void {
  const y = k * FH;
  g.fillStyle = '#123532';
  g.fillRect(0, y, W, 44);
  logo(g, 26, y + 22, 26);
  g.fillStyle = INK;
  g.font = 'bold 22px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('BloomGrid', 48, y + 23);
  g.fillStyle = SOFT;
  g.font = '18px ui-monospace, monospace';
  g.fillText(title, 172, y + 23);
}

function draw(g: CanvasRenderingContext2D): void {
  g.fillStyle = BG;
  g.fillRect(0, 0, W, FH * DISPLAY_FRAMES);
  g.textBaseline = 'middle';

  // 0 Splash: logo, wordmark, tagline, an empty loading bar (the shader fills it).
  const grad = g.createLinearGradient(0, 0, 0, FH);
  grad.addColorStop(0, '#103a35');
  grad.addColorStop(1, '#07120f');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, FH);
  logo(g, W / 2, 96, 96);
  const word = g.createLinearGradient(110, 0, 400, 0);
  word.addColorStop(0, TEAL);
  word.addColorStop(1, LEAF);
  g.fillStyle = word;
  g.font = 'bold 76px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('BloomGrid', W / 2, 196);
  g.fillStyle = SOFT;
  g.font = '20px ui-monospace, monospace';
  g.fillText('I S L A N D   O S', W / 2, 244);
  g.textAlign = 'left';
  const [bx, by, bw, bh] = rect(0, DISPLAY_RECTS.bar);
  g.strokeStyle = 'rgba(95,242,218,0.6)';
  g.lineWidth = 3;
  g.strokeRect(bx, by, bw, bh);

  // 1 City Pulse: KPI tiles and a chart frame (the shader draws the live line).
  header(g, 1, 'City Pulse');
  const tiles: [string, string, string][] = [
    ['Energy', '+42', '#ffd36e'],
    ['Water', '96%', TEAL],
    ['Eco', 'A+', LEAF],
  ];
  tiles.forEach(([label, value, col], i) => {
    const y = FH + 64 + i * 92;
    g.fillStyle = '#123532';
    g.fillRect(16, y, 150, 78);
    g.fillStyle = SOFT;
    g.font = '18px system-ui, sans-serif';
    g.fillText(label, 28, y + 22);
    g.fillStyle = col;
    g.font = 'bold 34px system-ui, sans-serif';
    g.fillText(value, 28, y + 55);
  });
  const [cx, cy, cw, ch] = rect(1, DISPLAY_RECTS.chart);
  g.fillStyle = '#0f2a27';
  g.fillRect(cx, cy, cw, ch);
  g.strokeStyle = 'rgba(134,170,160,0.25)';
  g.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(cx, cy + (ch * i) / 4);
    g.lineTo(cx + cw, cy + (ch * i) / 4);
    g.stroke();
  }
  g.fillStyle = INK;
  g.font = 'bold 20px system-ui, sans-serif';
  g.fillText('Bloom index', cx, cy - 18);

  // 2 Code: a tab and fourteen lines of a city script (the shader moves the caret and the current line).
  header(g, 2, 'bloom.ts');
  const code: [string, string][] = [
    ['// grow the island, gently', SOFT],
    ["import { bloom } from 'grid';", TEAL],
    ['', INK],
    ['const city = bloom({', INK],
    ["  island: 'Verdance',", LEAF],
    ['  energy: sun + wind,', '#ffd36e'],
    ['  water: rain.harvest(),', TEAL],
    ['});', INK],
    ['', INK],
    ['for (const roof of city.roofs)', '#c78bff'],
    ['  roof.plant(garden);', LEAF],
    ['', INK],
    ['city.lights.on(); // ✿', '#ffd36e'],
    ['export default city;', TEAL],
  ];
  const [kx, ky, , kh] = rect(2, DISPLAY_RECTS.code);
  const lh = kh / CODE_LINES;
  g.font = '19px ui-monospace, monospace';
  code.forEach(([line, col], i) => {
    const y = ky + (i + 0.5) * lh;
    g.fillStyle = 'rgba(134,170,160,0.5)';
    g.fillText(String(i + 1).padStart(2, ' '), 14, y);
    g.fillStyle = col;
    g.fillText(line, kx, y);
  });

  // 3 Map: the island with its districts and lit dots (the shader sweeps a radar over it).
  header(g, 3, 'Island map');
  const [mx, my, mr] = DISPLAY_RECTS.radar;
  const ox = mx * W;
  const oy = 3 * FH + (1 - my) * FH;
  const R = mr * FH;
  g.fillStyle = '#0d2b3a';
  g.beginPath();
  g.arc(ox, oy, R * 1.05, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1f5a3f';
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = R * (0.72 + 0.12 * Math.sin(a * 3) + 0.06 * Math.cos(a * 5));
    if (i === 0) g.moveTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r);
    else g.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r);
  }
  g.fill();
  const dots = [
    [-0.3, -0.2, TEAL],
    [0.25, -0.3, LEAF],
    [0.1, 0.2, '#ffd36e'],
    [-0.15, 0.35, '#c78bff'],
    [0.4, 0.1, TEAL],
  ] as const;
  for (const [dx, dy, col] of dots) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(ox + dx * R, oy + dy * R, 7, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(95,242,218,0.35)';
  g.lineWidth = 2;
  for (const f of [0.5, 1]) {
    g.beginPath();
    g.arc(ox, oy, R * f, 0, Math.PI * 2);
    g.stroke();
  }
}

/** The display atlas, or null where there is no DOM canvas (tests). */
export function displayAtlas(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = FH * DISPLAY_FRAMES;
  const g = canvas.getContext('2d');
  if (!g) return null;
  draw(g);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  return tex;
}
