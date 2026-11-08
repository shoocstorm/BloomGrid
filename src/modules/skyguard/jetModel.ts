import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  BoxGeometry,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Jet parts (`aPart`): the shader paints, lights and stretches each one (D-141). */
export const JET_PART = {
  top: 0,
  belly: 1,
  finOut: 2,
  metal: 3,
  canopy: 4,
  edge: 5,
  nozzle: 6,
  flame: 7,
  navRed: 8,
  navGreen: 9,
  strobe: 10,
} as const;

/** Jet size (tiles): nose at +x, tail at −x, starboard +z; the three engines' lateral offsets and nozzle station. */
export const JET = {
  nose: 3.2,
  tail: -3.2,
  span: 2.9,
  engines: [-1.15, 0, 1.15] as const,
  nozzleX: -3.35,
};

/** Atlas (1024²) regions, in canvas pixels: wing top, belly, fins; and a solid gunmetal texel for the rest. */
const ATLAS = 1024;
const SOLID: [number, number] = [0.875, 0.125];

/** Planform half-span at u (0 nose … 1 tail): a straight swept leading edge to the tips, notched trailing edge. */
function halfSpan(u: number): number {
  return u <= 0.82 ? (JET.span * u) / 0.82 : JET.span - (JET.span - 1.75) * ((u - 0.82) / 0.18);
}
const xOf = (u: number) => JET.nose - (JET.nose - JET.tail) * u;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Upper and lower surface heights at (u, z): a thin lifting body with a raised spine. */
function surface(u: number, z: number, s: number): [number, number] {
  const v = s > 1e-4 ? Math.min(1, Math.abs(z) / s) : 1;
  const T = 0.15 * smooth(0, 0.3, u);
  const shape = Math.pow(Math.max(0, 1 - v * v), 0.7);
  const spine = 0.3 * Math.pow(Math.sin(Math.PI * Math.min(1, u / 0.97)), 0.6) * Math.exp(-((z / 0.5) ** 2));
  return [T * shape + spine, -(0.55 * T * shape + 0.35 * spine)];
}

/** A geometry with the jet's attributes: positions, normals, atlas uvs, part and the stretch hub. */
function finish(
  pos: number[],
  uvs: number[],
  id: number,
  hub: [number, number, number] = [0, 0, 0],
): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  g.computeVertexNormals();
  return tag(g, id, hub);
}
function tag(
  g: BufferGeometry,
  id: number,
  hub: [number, number, number] = [0, 0, 0],
  uv: [number, number] = SOLID,
): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.getAttribute('position').count;
  if (!geo.getAttribute('uv') || uv !== SOLID) {
    const a = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) a.set(uv, i * 2);
    geo.setAttribute('uv', new BufferAttribute(a, 2));
  }
  geo.setAttribute('aPart', new BufferAttribute(new Float32Array(n).fill(id), 1));
  const h = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) h.set(hub, i * 3);
  geo.setAttribute('aHub', new BufferAttribute(h, 3));
  return geo;
}
/** A primitive part with a solid-colour uv (the atlas is only read on the livery parts). */
const solid = (g: BufferGeometry, id: number, hub: [number, number, number] = [0, 0, 0]) => {
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  return tag(g.index ? g.toNonIndexed() : g, id, hub);
};

/** Wing-top livery uv at (x, z): nose to the canvas's right, starboard down (read from above, nose right). */
const topUv = (x: number, z: number): [number, number] => [
  ((x - JET.tail) / 6.4) * 0.5,
  1 - ((z + 3) / 6) * 0.5,
];
/** Belly uv: the same planform, mirrored across the fuselage so text reads from below (nose right). */
const bellyUv = (x: number, z: number): [number, number] => [
  0.5 + ((x - JET.tail) / 6.4) * 0.5,
  1 - ((3 - z) / 6) * 0.5,
];

/** The lifting body: upper and lower surfaces over the planform, closed along the trailing edge. */
function body(): BufferGeometry[] {
  const NU = 44;
  const NV = 28;
  const grid = (lower: boolean) => {
    const pos: number[] = [];
    const uvs: number[] = [];
    const at = (i: number, j: number) => {
      const u = i / NU;
      const s = halfSpan(u);
      const z = s * ((j / NV) * 2 - 1);
      const x = xOf(u);
      const [yt, yb] = surface(u, z, s);
      return [x, lower ? yb : yt, z] as const;
    };
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < NV; j++) {
        const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
        // Upper faces wind to face up, lower ones down.
        const tris = lower ? [a, c, b, b, c, d] : [a, b, c, b, d, c];
        for (const p of tris) {
          pos.push(p[0], p[1], p[2]);
          uvs.push(...(lower ? bellyUv(p[0], p[2]) : topUv(p[0], p[2])));
        }
      }
    return finish(pos, uvs, lower ? JET_PART.belly : JET_PART.top);
  };
  // Trailing edge: a strip from the upper to the lower surface at u = 1.
  const pos: number[] = [];
  const s = halfSpan(1);
  for (let j = 0; j < NV; j++) {
    const [z0, z1] = [s * ((j / NV) * 2 - 1), s * (((j + 1) / NV) * 2 - 1)];
    const [t0, b0] = surface(1, z0, s);
    const [t1, b1] = surface(1, z1, s);
    const x = JET.tail;
    pos.push(x, t0, z0, x, b0, z0, x, t1, z1, x, t1, z1, x, b0, z0, x, b1, z1);
  }
  const edge = new BufferGeometry();
  edge.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  edge.computeVertexNormals();
  return [grid(false), grid(true), solid(edge, JET_PART.metal)];
}

/** A canted fin: outer face with the fin livery, inner face plain; `z` its root's side (±). */
function fin(side: number): BufferGeometry[] {
  // Root chord x −1.45 … −3.15 at y 0.18, tip chord −2.55 … −3.3 at y 1.25; canted outward.
  const cant = 0.38 * side;
  const z0 = 0.78 * side;
  const pts = [
    [-3.15, 0.18],
    [-1.45, 0.18],
    [-2.55, 1.25],
    [-3.3, 1.25],
  ];
  const place = (x: number, y: number, off: number): [number, number, number] => {
    const yy = y - 0.18;
    return [x, 0.18 + yy * Math.cos(cant), z0 + yy * Math.sin(cant) + off];
  };
  const quad = (off: number, outer: boolean) => {
    const pos: number[] = [];
    const uvs: number[] = [];
    const order = outer === side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of order) {
      const [x, y] = pts[k]!;
      pos.push(...place(x, y, off));
      // Nose to the canvas's right on either fin's outer face.
      const fx = (x + 3.3) / 1.85;
      const fy = (y - 0.18) / 1.07;
      uvs.push(outer ? (side > 0 ? fx : 1 - fx) * 0.5 : SOLID[0], outer ? 0.25 + fy * 0.25 : SOLID[1]);
    }
    return finish(pos, uvs, outer ? JET_PART.finOut : JET_PART.metal);
  };
  return [quad(0.025 * side, true), quad(-0.025 * side, false)];
}

/**
 * The BloomGrid Sky Guard interceptor (D-141), 6.4 tiles long: a delta lifting body with a raised spine and a gold
 * canopy, three engines in nacelles along the trailing edge (glowing nozzles, flames the shader stretches with
 * the throttle), canted twin fins, sea-green leading-edge light strips, navigation lights and a tail strobe. The wing
 * top, belly and fins read a painted livery atlas (`liveryTexture`); one merged geometry.
 */
export function jetGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [...body(), ...fin(1), ...fin(-1)];
  // Canopy: a long gold-tinted teardrop on the spine.
  parts.push(
    solid(new SphereGeometry(0.5, 20, 10).scale(1.25, 0.32, 0.36).translate(1.05, 0.42, 0), JET_PART.canopy),
  );
  for (const z of JET.engines) {
    const y = z === 0 ? 0.08 : 0.02;
    const r = z === 0 ? 0.3 : 0.26;
    // Nacelle, a bronze nozzle ring, the glowing nozzle and its flame (stretched about the nozzle).
    parts.push(
      solid(
        new CylinderGeometry(r, r * 0.92, 1.6, 16).rotateZ(Math.PI / 2).translate(-2.5, y, z),
        JET_PART.metal,
      ),
    );
    parts.push(
      solid(
        new CylinderGeometry(r * 0.75, r * 0.95, 0.2, 16).rotateZ(Math.PI / 2).translate(-1.62, y, z),
        JET_PART.metal,
      ),
    );
    parts.push(
      solid(
        new TorusGeometry(r * 0.88, 0.05, 6, 20).rotateY(Math.PI / 2).translate(JET.nozzleX + 0.03, y, z),
        JET_PART.edge,
      ),
    );
    parts.push(
      solid(
        new CylinderGeometry(r * 0.8, r * 0.8, 0.04, 16)
          .rotateZ(Math.PI / 2)
          .translate(JET.nozzleX + 0.02, y, z),
        JET_PART.nozzle,
      ),
    );
    const hub: [number, number, number] = [JET.nozzleX, y, z];
    parts.push(
      solid(
        new ConeGeometry(r * 0.72, 1.3, 14, 1, true).rotateZ(Math.PI / 2).translate(JET.nozzleX - 0.65, y, z),
        JET_PART.flame,
        hub,
      ),
    );
  }
  // Leading-edge light strips from the nose to each tip, and the lights at the tips and tail.
  const tipX = xOf(0.82);
  for (const side of [-1, 1]) {
    const len = Math.hypot(JET.nose - tipX, JET.span);
    const yaw = Math.atan2(JET.span * side, JET.nose - tipX);
    parts.push(
      solid(
        new BoxGeometry(len, 0.035, 0.06)
          .translate(-len / 2, 0.01, 0)
          .rotateY(yaw)
          .translate(JET.nose, 0, 0),
        JET_PART.edge,
      ),
    );
    parts.push(
      solid(
        new SphereGeometry(0.07, 8, 6).translate(tipX, 0.02, side * (JET.span + 0.02)),
        side < 0 ? JET_PART.navRed : JET_PART.navGreen,
      ),
    );
  }
  parts.push(
    solid(
      new SphereGeometry(0.06, 8, 6).translate(-3.0, 1.18, 0.78 + 1.07 * Math.sin(0.38)),
      JET_PART.strobe,
    ),
  );
  parts.push(
    solid(
      new SphereGeometry(0.06, 8, 6).translate(-3.0, 1.18, -0.78 - 1.07 * Math.sin(0.38)),
      JET_PART.strobe,
    ),
  );
  return mergeGeometries(parts)!;
}

/** The Sky Guard emblem: a gold-rimmed hexagonal shield, swept wings behind it and a six-petal bloom on navy. */
function emblem(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.translate(x, y);
  // Wings: two swept gold chevrons either side.
  g.fillStyle = '#f2c14e';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * r * 0.55, -r * 0.25);
    g.lineTo(s * r * 1.55, -r * 0.62);
    g.lineTo(s * r * 1.25, -r * 0.18);
    g.lineTo(s * r * 1.5, -r * 0.05);
    g.lineTo(s * r * 0.6, r * 0.25);
    g.closePath();
    g.fill();
  }
  const hex = (rr: number) => {
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      g[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  };
  hex(r);
  g.fillStyle = '#f2c14e';
  g.fill();
  hex(r * 0.86);
  g.fillStyle = '#10213a';
  g.fill();
  // The bloom.
  for (let k = 0; k < 6; k++) {
    g.save();
    g.rotate((k * Math.PI) / 3);
    g.fillStyle = k % 2 ? '#7ff5d0' : '#19c39a';
    g.beginPath();
    g.ellipse(0, -r * 0.36, r * 0.15, r * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.fillStyle = '#f2c14e';
  g.beginPath();
  g.arc(0, 0, r * 0.16, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/**
 * The livery atlas (D-141): the wing top (pearl with sea-green leading-edge bands, a navy spine, BLOOMGRID and
 * SKY GUARD on the wings and an emblem on each), the belly (navy, a big emblem and the name), the fins (emblem and
 * name), and a solid gunmetal corner for every other part. Drawn once on a canvas.
 */
export function liveryTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS;
  const g = c.getContext('2d')!;
  const font = (w: number, px: number) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const px = (x: number) => ((x - JET.tail) / 6.4) * 512;
  const pz = (z: number) => ((z + 3) / 6) * 512;
  const planform = (ox: number, mirror: boolean) => {
    const zz = (z: number) => (mirror ? pz(-z) : pz(z));
    const tipX = xOf(0.82);
    g.beginPath();
    g.moveTo(ox + px(JET.nose), zz(0));
    g.lineTo(ox + px(tipX), zz(-JET.span));
    g.lineTo(ox + px(JET.tail), zz(-1.75));
    g.lineTo(ox + px(JET.tail), zz(1.75));
    g.lineTo(ox + px(tipX), zz(JET.span));
    g.closePath();
  };
  g.fillStyle = '#3a4250';
  g.fillRect(0, 0, ATLAS, ATLAS);
  // ── Wing top ──
  g.fillStyle = '#e9eff0';
  g.fillRect(0, 0, 512, 512);
  g.save();
  planform(0, false);
  g.clip();
  // Sea-green leading-edge bands with a gold pinstripe.
  const tipX = xOf(0.82);
  for (const s of [-1, 1]) {
    g.strokeStyle = '#0e8f86';
    g.lineWidth = 46;
    g.beginPath();
    g.moveTo(px(JET.nose), pz(0));
    g.lineTo(px(tipX), pz(s * JET.span));
    g.stroke();
    g.strokeStyle = '#f2c14e';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(px(JET.nose) - 34, pz(0));
    g.lineTo(px(tipX) - 8, pz(s * (JET.span - 0.32)));
    g.stroke();
  }
  // Navy spine with a gold centreline, panel lines across the wings.
  g.fillStyle = '#13233a';
  g.fillRect(0, pz(-0.32), px(2.6), pz(0.32) - pz(-0.32));
  g.fillStyle = '#f2c14e';
  g.fillRect(0, pz(0) - 2, px(2.4), 4);
  g.strokeStyle = 'rgba(40, 60, 70, 0.35)';
  g.lineWidth = 2;
  for (let k = 1; k < 6; k++) {
    g.beginPath();
    g.moveTo(px(JET.tail + k * 0.9), 0);
    g.lineTo(px(JET.tail + k * 0.9), 512);
    g.stroke();
  }
  emblem(g, px(-1.95), pz(-1.85), 40);
  emblem(g, px(-1.95), pz(1.85), 40);
  g.fillStyle = '#13233a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Forward of the fins, inboard where the wing is still wide enough under the nose.
  g.font = font(900, 32);
  g.fillText('BLOOMGRID', px(-0.12), pz(-0.74));
  g.fillText('SKY GUARD', px(-0.12), pz(0.74));
  g.restore();
  // ── Belly (mirrored planform: reads from below) ──
  g.fillStyle = '#13233a';
  g.fillRect(512, 0, 512, 512);
  g.save();
  planform(512, true);
  g.clip();
  g.strokeStyle = '#0e8f86';
  g.lineWidth = 30;
  planform(512, true);
  g.stroke();
  emblem(g, 512 + px(-0.9), pz(0), 72);
  g.fillStyle = '#f2c14e';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font(900, 34);
  g.fillText('BLOOMGRID', 512 + px(-1.0), pz(-1.6));
  g.fillText('SKY GUARD', 512 + px(-1.0), pz(1.6));
  g.restore();
  // ── Fins (outer faces): navy with a sea-green crown, the emblem and the name ──
  g.fillStyle = '#13233a';
  g.fillRect(0, 512, 512, 256);
  g.fillStyle = '#0e8f86';
  g.fillRect(0, 512, 512, 46);
  g.fillStyle = '#f2c14e';
  g.fillRect(0, 556, 512, 5);
  emblem(g, 250, 640, 46);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font(900, 30);
  g.fillText('SKY GUARD', 190, 728);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
