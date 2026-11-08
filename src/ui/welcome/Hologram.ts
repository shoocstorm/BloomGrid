import { terrainHeight } from '@/sim/terrain';
import type { MapCity } from '@/modules/tutorial/islandMap';
import { MAP_COLORS } from '@/modules/tutorial/islandMap';
import type { BuildingCategory } from '@/content/types';

/** What stands on the island: nothing (an unclaimed island), a saved city's lots, or the showcase's skyline. */
export type HoloCity = null | 'showcase' | MapCity;

const TAU = Math.PI * 2;
/** Vertical exaggeration: real hills are ≈ 10 tiles on a 512-tile map, too flat to read at this scale. */
const LIFT = 4.5;
/** Perspective focal length in map tiles. */
const FOCAL = 1100;
const PITCH = 0.98;
/** Sea dots shimmer in this many phase groups (one fill each). */
const SEA_GROUPS = 3;

/** Point colour groups (one path and one fill each per frame). */
const LAND = ['#5ff2da', '#3fbf7f', '#6fdc8a', '#b9efa0', '#f2fff8'] as const;
/** Their opacity: a bright shoreline, then land brightening with height. */
const LAND_ALPHA = [0.95, 0.5, 0.62, 0.78, 0.95] as const;

interface Pt {
  x: number;
  z: number;
  /** Height now shown / target. */
  h0: number;
  h1: number;
  /** Colour group: 0..SEA_GROUPS-1 sea, then shore and land bands. */
  g: number;
  seaPhase: number;
}

interface Tower {
  x: number;
  z: number;
  base: number;
  height: number;
  cat: number;
  delay: number;
}

const CATS = Object.keys(MAP_COLORS) as BuildingCategory[];

const hash = (x: number, z: number, s: number) => {
  let n = (x * 374761393 + z * 668265263 + s * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

/**
 * The welcome screen's backdrop (D-148): the island a choice would open, as a slowly turning hologram of light points
 * drawn on a 2D canvas from the sim's own height function (`terrainHeight`), so it is ready in milliseconds with no
 * GPU device, no three.js and no city. Changing island sinks the old one and raises the new one; a city grows on it
 * as glowing towers. Points are batched by colour (one fill per group), capped at 30 fps, and it stops when the
 * game takes over.
 */
export class Hologram {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private pts: Pt[] = [];
  private towers: Tower[] = [];
  private roads: { x: number; z: number; base: number }[] = [];
  private grid: number;
  private size: number;
  private seed = -1;
  private city: HoloCity = null;
  /** Island change: 0..1 sinking, 1..2 rising. */
  private morph = 2;
  private next: { seed: number; city: HoloCity } | null = null;
  private born = 0;
  private yaw = 0.6;
  private spin = 0.045;
  private spinGoal = 0.045;
  /** A glide in progress: where the island lands and when (performance.now ms). */
  private glideTo: { x: number; y: number; r: number; at: number } | null = null;
  private frame = { x: 0, y: 0, r: 100 };
  private target = { x: 0, y: 0, r: 100 };
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private t = 0;
  private still: boolean;
  private stopped = false;

  constructor(size: number, compact: boolean) {
    this.size = size;
    this.grid = compact ? 60 : 84;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wl-holo';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.g = this.canvas.getContext('2d', { alpha: true })!;
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  /** Where the island sits on screen (CSS px): centre and radius. Eases there unless `snap`. */
  place(x: number, y: number, r: number, snap = false): void {
    if (this.glideTo) return void Object.assign(this.glideTo, { x, y, r });
    this.target = { x, y, r };
    if (snap || this.frame.r === 100) this.frame = { ...this.target };
  }

  /**
   * Moves the island to a new place as a CSS transform on the canvas, so the compositor plays it even while the boot's
   * work holds the main thread (a canvas-drawn ease only gets the odd frame then). The drawing jumps to the new place
   * in the same frame the transform is dropped, so the hand-over does not show.
   */
  glide(x: number, y: number, r: number, ms = 800): Promise<void> {
    const f = this.frame;
    // Freeze any canvas-drawn ease where it is: the transform starts from what is on screen.
    this.target = { ...f };
    if (this.still || ms <= 0) return (this.place(x, y, r, true), Promise.resolve());
    const c = this.canvas;
    const k = r / f.r;
    c.style.transition = 'none';
    c.style.transformOrigin = `${f.x}px ${f.y}px`;
    c.style.transform = 'translate(0px, 0px) scale(1)';
    void c.offsetWidth; // commit the start state, so the change below transitions
    c.style.transition = `transform ${ms}ms cubic-bezier(0.45, 0, 0.2, 1)`;
    c.style.transform = `translate(${x - f.x}px, ${y - f.y}px) scale(${k})`;
    this.glideTo = { x, y, r, at: performance.now() + ms + 30 };
    return new Promise((done) => setTimeout(done, ms));
  }

  /** Spin rate in radians per second (the boot speeds it up as it dives in); eased, never a jump. */
  setSpin(s: number): void {
    this.spinGoal = s;
  }

  /** Shows an island: the same one changes only its city; another sinks and the new one rises. */
  show(seed: number, city: HoloCity): void {
    if (seed === this.seed && this.morph >= 2) {
      if (city !== this.city) this.setCity(city);
      return;
    }
    if (this.seed < 0) {
      this.build(seed, city);
      this.morph = 1;
      return;
    }
    this.next = { seed, city };
    if (this.morph >= 1) this.morph = 2 - this.morph;
  }

  start(): void {
    this.stopped = false;
    const loop = (now: number) => {
      if (this.stopped) return;
      this.raf = requestAnimationFrame(loop);
      // 30 fps is plenty for a slow turn and keeps laptops cool while the player reads.
      if (now - this.last < 32) return;
      const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
      this.last = now;
      const gl = this.glideTo;
      if (gl && now >= gl.at) {
        // Land: drop the transform and draw at the new place in this same frame.
        this.glideTo = null;
        this.canvas.style.transition = 'none';
        this.canvas.style.transform = '';
        this.place(gl.x, gl.y, gl.r, true);
      }
      this.step(dt);
      this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
  }

  private resize = (): void => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(innerWidth * this.dpr);
    this.canvas.height = Math.round(innerHeight * this.dpr);
  };

  /** Samples the island (≈ 7k height samples) and keeps the points near it. */
  private build(seed: number, city: HoloCity): void {
    this.seed = seed;
    const n = this.grid;
    const step = this.size / n;
    const half = this.size / 2;
    const pts: Pt[] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * step;
        const z = (j + 0.5) * step;
        const dx = x - half;
        const dz = z - half;
        const d = Math.hypot(dx, dz) / half;
        if (d > 1.02) continue;
        const h = terrainHeight(x, z, seed, this.size);
        const sea = h < -0.6;
        // Open sea thins out towards the rim, so the island reads as floating in a disc of light.
        if (sea && ((i + j) % 2 || hash(i, j, 7) > 1.15 - d)) continue;
        const g = sea ? Math.floor(hash(i, j, 3) * SEA_GROUPS) : h < 0.4 ? SEA_GROUPS : h < 1.4 ? SEA_GROUPS + 1 : h < 3 ? SEA_GROUPS + 2 : h < 6 ? SEA_GROUPS + 3 : SEA_GROUPS + 4;
        pts.push({ x: dx, z: dz, h0: 0, h1: Math.max(0, h), g, seaPhase: hash(i, j, 11) });
      }
    this.pts = pts;
    this.setCity(city);
  }

  private ground(x: number, z: number): number {
    return Math.max(0, terrainHeight(x, z, this.seed, this.size));
  }

  private setCity(city: HoloCity): void {
    this.city = city;
    this.born = this.t;
    const half = this.size / 2;
    const towers: Tower[] = [];
    const roads: { x: number; z: number; base: number }[] = [];
    if (city === 'showcase') {
      // A skyline like the founding city's: dense and tall round the centre, thinning to the coast, on a 14-tile grid.
      const cx = 292;
      const cz = 222;
      for (let z = 4; z < this.size; z += 9)
        for (let x = 4; x < this.size; x += 9) {
          const h = terrainHeight(x, z, this.seed, this.size);
          if (h < 0.4 || h > 7) continue;
          const d = Math.hypot(x - cx, z - (cz + 40)) / 190;
          if (d > 1 || hash(x, z, 1) > 0.95 - d * 0.55) continue;
          const tall = Math.pow(Math.max(0, 1 - d), 2.2);
          const cat = d < 0.3 ? (hash(x, z, 2) < 0.6 ? 1 : 5) : hash(x, z, 2) < 0.62 ? 0 : Math.floor(hash(x, z, 4) * CATS.length);
          towers.push({ x: x - half, z: z - half, base: Math.max(0, h), height: 3 + tall * 52 * (0.4 + hash(x, z, 5)), cat, delay: d * 1.1 + hash(x, z, 6) * 0.4 });
          if (x % 18 === 4 || z % 18 === 4) roads.push({ x: x - half, z: z - half, base: Math.max(0, h) });
        }
      // The Aurora Gemini twin towers at the heart.
      for (const dx of [-3, 3]) towers.push({ x: cx + dx - half, z: cz - half, base: this.ground(cx, cz), height: 86, cat: 5, delay: 1.3 });
    } else if (city) {
      for (const l of city.lots) {
        const x = l.x + l.w / 2;
        const z = l.z + l.d / 2;
        const area = l.w * l.d;
        const cat = Math.max(0, CATS.indexOf(l.cat));
        const kind = l.cat === 'commercial' || l.cat === 'tech' ? 2.2 : l.cat === 'nature' ? 0.4 : 1;
        const d = Math.hypot(x - half, z - half) / half;
        towers.push({ x: x - half, z: z - half, base: this.ground(x, z), height: (2 + Math.sqrt(area) * 2.4 * (0.6 + hash(l.x, l.z, 5))) * kind, cat, delay: d * 1.2 + hash(l.x, l.z, 6) * 0.3 });
      }
      let k = 0;
      for (const t of city.roads) {
        if (k++ % 3) continue;
        const x = t % this.size;
        const z = Math.floor(t / this.size);
        roads.push({ x: x - half, z: z - half, base: this.ground(x, z) });
      }
    }
    this.towers = towers;
    this.roads = roads;
  }

  private step(dt: number): void {
    this.t += dt;
    this.spin += (this.spinGoal - this.spin) * (1 - Math.exp(-dt * 1.2));
    if (!this.still) this.yaw += this.spin * dt;
    const f = this.frame;
    const k = 1 - Math.exp(-dt * 3.2);
    f.x += (this.target.x - f.x) * k;
    f.y += (this.target.y - f.y) * k;
    f.r += (this.target.r - f.r) * k;
    if (this.morph < 2) {
      this.morph = Math.min(2, this.morph + dt * (this.morph < 1 ? 2.4 : 1.1));
      if (this.still) this.morph = this.morph < 1 ? 1 : 2;
      if (this.morph >= 1 && this.next) {
        const nx = this.next;
        this.next = null;
        this.build(nx.seed, nx.city);
        this.morph = 1;
      }
    }
  }

  private draw(): void {
    const { g, dpr } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const cx = this.frame.x * dpr;
    const cy = this.frame.y * dpr;
    const scale = (this.frame.r * dpr) / (this.size / 2);
    const ca = Math.cos(this.yaw);
    const sa = Math.sin(this.yaw);
    const cp = Math.cos(PITCH);
    const sp = Math.sin(PITCH);
    // 0 → 1 sinking (the old island), 1 → 2 rising (the new one).
    const m = this.morph;
    const rise = m < 1 ? 1 - easeInOut(m) : easeInOut(m - 1);
    const alpha = m < 1 ? 1 - m * 0.7 : 0.3 + 0.7 * Math.min(1, (m - 1) * 1.6);

    // A soft pool of light under the island.
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, this.frame.r * dpr * 1.25);
    glow.addColorStop(0, 'rgba(95, 242, 218, 0.10)');
    glow.addColorStop(0.6, 'rgba(95, 242, 218, 0.035)');
    glow.addColorStop(1, 'rgba(95, 242, 218, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    g.globalCompositeOperation = 'lighter';
    const proj = (x: number, y: number, z: number, out: number[]) => {
      const rx = x * ca - z * sa;
      const rz = x * sa + z * ca;
      const zc = rz * cp + y * sp;
      const k = FOCAL / (FOCAL - zc);
      out[0] = cx + rx * k * scale;
      out[1] = cy + (rz * sp - y * cp) * k * scale;
      out[2] = k;
    };
    const p = [0, 0, 0];

    // Sonar rings on the sea, rolling outward.
    g.lineWidth = dpr;
    for (let r = 0; r < 3; r++) {
      const rad = ((this.t * 26 + r * 90) % 270) + 40;
      g.strokeStyle = `rgba(95, 242, 218, ${(0.16 * (1 - (rad - 40) / 270) * alpha).toFixed(3)})`;
      g.beginPath();
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * TAU;
        proj(Math.cos(a) * rad, 0, Math.sin(a) * rad, p);
        if (i) g.lineTo(p[0]!, p[1]!);
        else g.moveTo(p[0]!, p[1]!);
      }
      g.stroke();
    }

    // Terrain points, one path per colour group.
    const groups = SEA_GROUPS + LAND.length;
    const unit = Math.max(1, scale * (this.size / this.grid) * 0.42);
    for (let grp = 0; grp < groups; grp++) {
      const sea = grp < SEA_GROUPS;
      g.beginPath();
      for (const q of this.pts) {
        if (q.g !== grp) continue;
        const h = q.h1 * rise;
        proj(q.x, h * LIFT, q.z, p);
        const s = (sea ? unit * 0.55 : unit) * p[2]!;
        g.rect(p[0]! - s / 2, p[1]! - s / 2, s, s);
      }
      if (sea) {
        const shimmer = 0.5 + 0.5 * Math.sin(this.t * 1.6 + (grp * TAU) / SEA_GROUPS);
        g.fillStyle = `rgba(47, 185, 196, ${((0.18 + 0.22 * shimmer) * alpha).toFixed(3)})`;
      } else {
        g.fillStyle = LAND[grp - SEA_GROUPS]!;
        // Land dims under a city, as on the dialog's maps, so the towers stand out.
        g.globalAlpha = LAND_ALPHA[grp - SEA_GROUPS]! * alpha * (this.towers.length && grp > SEA_GROUPS ? 0.55 : 1);
      }
      g.fill();
      g.globalAlpha = 1;
    }

    // The city: highway dots, then towers as rising light lines with a bright crown.
    if (m >= 1 && (this.towers.length || this.roads.length)) {
      const grow = (d: number) => (this.still ? 1 : clamp01((this.t - this.born - 0.3 - d) / 0.7));
      g.beginPath();
      const rs = unit * 0.5;
      for (const r of this.roads) {
        proj(r.x, r.base * LIFT * rise, r.z, p);
        g.rect(p[0]! - rs / 2, p[1]! - rs / 2, rs * p[2]!, rs * p[2]!);
      }
      g.fillStyle = `rgba(238, 244, 239, ${(0.35 * alpha).toFixed(3)})`;
      g.fill();
      g.lineWidth = Math.max(1, 2 * dpr * (this.frame.r / 300));
      g.lineCap = 'round';
      const tip = [0, 0, 0];
      for (let c = 0; c < CATS.length; c++) {
        const col = MAP_COLORS[CATS[c]!];
        g.beginPath();
        const caps: number[] = [];
        for (const t of this.towers) {
          if (t.cat !== c) continue;
          const k = grow(t.delay);
          if (k <= 0) continue;
          const y = t.base * LIFT * rise;
          proj(t.x, y, t.z, p);
          proj(t.x, y + t.height * easeOut(k), t.z, tip);
          g.moveTo(p[0]!, p[1]!);
          g.lineTo(tip[0]!, tip[1]!);
          caps.push(tip[0]!, tip[1]!);
        }
        g.strokeStyle = col;
        g.globalAlpha = 0.7 * alpha;
        g.stroke();
        g.globalAlpha = 0.9 * alpha;
        g.fillStyle = col;
        g.beginPath();
        const cs = 2.4 * dpr;
        for (let i = 0; i < caps.length; i += 2) g.rect(caps[i]! - cs / 2, caps[i + 1]! - cs / 2, cs, cs);
        g.fill();
        g.globalAlpha = 1;
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
