/**
 * The game's mouse cursors (D-132): a dark-teal arrow with a sprouting leaf for the default, and a bright teal
 * arrow with a small bloom for anything clickable, so "this does something" reads at a glance. Both keep the
 * familiar arrow silhouette and tip (the hotspot), with a pale halo so they show on the dark HUD and on bright
 * meadows alike. Drawn once on a canvas at 1x and 2x (PNG renders crisply in every browser and the desktop
 * webview, where SVG cursors don't) and published as `--cur-default` / `--cur-pointer` on <html>; the CSS uses
 * them with the system cursors as fallback. Text fields keep the text caret, drags keep grab / grabbing.
 */

const SIZE = 32;
/** Hotspot: the arrow's tip, in CSS pixels. */
const HOT = [4, 3] as const;
const ARROW = 'M4 3 L4 24.5 L9.6 19.4 L13.2 27.4 L16.8 25.8 L13.3 18 L20.6 18 Z';
const LEAF = 'M17 26 C17.5 21 22 18.5 27.5 19 C27 24.5 22.5 27 17 26 Z';
const VEIN = 'M17.8 25.4 Q22 22.6 26.4 19.8';
const HALO = 'rgba(255, 255, 255, 0.92)';
const DARK = '#06201c';

type Draw = (g: CanvasRenderingContext2D) => void;

const arrow =
  (fill: string, edge: string): Draw =>
  (g) => {
    const p = new Path2D(ARROW);
    g.lineJoin = 'round';
    g.strokeStyle = HALO;
    g.lineWidth = 3.4;
    g.stroke(p);
    g.fillStyle = fill;
    g.fill(p);
    g.strokeStyle = edge;
    g.lineWidth = 1.3;
    g.stroke(p);
  };

const leaf: Draw = (g) => {
  const p = new Path2D(LEAF);
  g.strokeStyle = HALO;
  g.lineWidth = 2.6;
  g.stroke(p);
  g.fillStyle = '#8ef07a';
  g.fill(p);
  g.strokeStyle = DARK;
  g.lineWidth = 1;
  g.stroke(p);
  g.strokeStyle = 'rgba(6, 32, 28, 0.55)';
  g.lineWidth = 0.8;
  g.stroke(new Path2D(VEIN));
};

const bloom: Draw = (g) => {
  const [cx, cy] = [23.5, 23.5];
  g.lineWidth = 2.4;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * 3.1, cy + Math.sin(a) * 3.1, 2.7, 1.9, a, 0, Math.PI * 2);
    g.strokeStyle = HALO;
    g.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * 3.1, cy + Math.sin(a) * 3.1, 2.7, 1.9, a, 0, Math.PI * 2);
    g.fillStyle = '#ff9ec7';
    g.fill();
    g.strokeStyle = DARK;
    g.lineWidth = 0.8;
    g.stroke();
  }
  g.beginPath();
  g.arc(cx, cy, 1.9, 0, Math.PI * 2);
  g.fillStyle = '#ffd36e';
  g.fill();
  g.strokeStyle = DARK;
  g.stroke();
};

function png(draw: Draw[], scale: number): string | null {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE * scale;
  const g = c.getContext('2d');
  if (!g) return null;
  g.scale(scale, scale);
  for (const d of draw) d(g);
  return c.toDataURL('image/png');
}

/** A `cursor` value for the parts, 2x where the browser takes `image-set`, else 1x; null without a canvas. */
function cursorValue(draw: Draw[], fallback: string): string | null {
  const one = png(draw, 1);
  const two = png(draw, 2);
  if (!one) return null;
  const hot = `${HOT[0]} ${HOT[1]}`;
  if (two) {
    for (const fn of ['image-set', '-webkit-image-set']) {
      const v = `${fn}(url("${two}") 2x, url("${one}") 1x) ${hot}, ${fallback}`;
      if (CSS.supports('cursor', v)) return v;
    }
  }
  return `url("${one}") ${hot}, ${fallback}`;
}

/** Draws the cursors and publishes them as CSS variables (touch-only devices never see a cursor; harmless there). */
export function installCursors(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  const def = cursorValue([arrow('#0e2f2a', '#5ff2da'), leaf], 'default');
  const ptr = cursorValue([arrow('#5ff2da', DARK), bloom], 'pointer');
  if (def) root.setProperty('--cur-default', def);
  if (ptr) root.setProperty('--cur-pointer', ptr);
}
