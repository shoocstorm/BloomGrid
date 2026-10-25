/**
 * Minimal canvas line chart for one series: recessive grid, 2px line with a soft area,
 * min/max/zero labels in text ink, and a hover crosshair + tooltip. One series per chart
 * (small multiples) — never two y-scales.
 */
export interface LineChartOptions {
  format: (v: number) => string;
  /** Seconds between samples (for the time axis and tooltip). */
  step: number;
}

export class LineChart {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private tip: HTMLElement;
  private data: number[] = [];
  private hover = -1;

  constructor(private opts: LineChartOptions) {
    this.canvas = document.createElement('canvas');
    this.tip = document.createElement('div');
    this.tip.className = 'lc-tip';
    this.el = document.createElement('div');
    this.el.className = 'lc';
    this.el.append(this.canvas, this.tip);
    // Hit target is the whole plot, not the 2px line.
    this.canvas.addEventListener('pointermove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const n = this.data.length;
      if (n < 2) return;
      this.hover = Math.round(((e.clientX - r.left - PAD_L) / (r.width - PAD_L - PAD_R)) * (n - 1));
      this.hover = Math.max(0, Math.min(n - 1, this.hover));
      this.draw();
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = -1;
      this.draw();
    });
  }

  setData(data: number[]): void {
    this.data = data;
    this.draw();
  }

  draw(): void {
    const c = this.canvas;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(this.el);
    const ink2 = css.getPropertyValue('--lc-ink2').trim() || '#52514e';
    const grid = css.getPropertyValue('--lc-grid').trim() || 'rgba(0,0,0,0.08)';
    const line = css.getPropertyValue('--lc-line').trim() || '#2a78d6';
    const d = this.data;
    g.font = '10px "JetBrains Mono", ui-monospace, monospace';
    if (d.length < 2) {
      g.fillStyle = ink2;
      g.fillText('Collecting data…', PAD_L, h / 2);
      this.tip.style.display = 'none';
      return;
    }
    let min = Math.min(...d);
    let max = Math.max(...d);
    if (min > 0 && min < max * 0.5) min = 0; // anchor near-zero series at zero
    if (max === min) {
      max += 1;
      min -= 1;
    }
    const pw = w - PAD_L - PAD_R;
    const ph = h - PAD_T - PAD_B;
    const X = (i: number) => PAD_L + (i / (d.length - 1)) * pw;
    const Y = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * ph;

    // Recessive grid: top, bottom, and zero if in range.
    g.strokeStyle = grid;
    g.lineWidth = 1;
    const hl = (y: number) => {
      g.beginPath();
      g.moveTo(PAD_L, Math.round(y) + 0.5);
      g.lineTo(w - PAD_R, Math.round(y) + 0.5);
      g.stroke();
    };
    hl(Y(max));
    hl(Y(min));
    if (min < 0 && max > 0) hl(Y(0));
    g.fillStyle = ink2;
    g.textAlign = 'right';
    g.fillText(this.opts.format(max), PAD_L - 6, Y(max) + 4);
    g.fillText(this.opts.format(min), PAD_L - 6, Y(min) + 4);
    g.textAlign = 'left';
    const span = ((d.length - 1) * this.opts.step) / 60;
    g.fillText(span < 1 ? `−${Math.round(span * 60)} s` : `−${span.toFixed(0)} min`, PAD_L, h - 4);
    g.textAlign = 'right';
    g.fillText('now', w - PAD_R, h - 4);

    // Area + 2px line.
    g.beginPath();
    d.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
    g.lineTo(X(d.length - 1), Y(Math.max(min, Math.min(max, 0))));
    g.lineTo(X(0), Y(Math.max(min, Math.min(max, 0))));
    g.closePath();
    g.globalAlpha = 0.12;
    g.fillStyle = line;
    g.fill();
    g.globalAlpha = 1;
    g.beginPath();
    d.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
    g.strokeStyle = line;
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.stroke();

    // Hover: crosshair + 8px marker + tooltip.
    if (this.hover >= 0) {
      const x = X(this.hover);
      const y = Y(d[this.hover]!);
      g.strokeStyle = ink2;
      g.globalAlpha = 0.4;
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, PAD_T);
      g.lineTo(Math.round(x) + 0.5, PAD_T + ph);
      g.stroke();
      g.globalAlpha = 1;
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fillStyle = line;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = css.getPropertyValue('--lc-surface').trim() || '#fff';
      g.stroke();
      const ago = ((d.length - 1 - this.hover) * this.opts.step) / 60;
      this.tip.textContent = `${this.opts.format(d[this.hover]!)} · ${ago < 0.5 ? 'now' : `${ago.toFixed(1)} min ago`}`;
      this.tip.style.display = 'block';
      this.tip.style.left = `${Math.min(w - 120, Math.max(0, x - 50))}px`;
      this.tip.style.top = `${Math.max(0, y - 30)}px`;
    } else this.tip.style.display = 'none';
  }
}

const PAD_L = 52;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 18;
