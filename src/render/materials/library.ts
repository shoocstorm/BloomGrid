import {
  BackSide,
  Color,
  DoubleSide,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  type Material,
  type Node,
} from 'three/webgpu';
import {
  abs,
  attribute,
  color,
  float,
  floor,
  fract,
  dot,
  hash,
  materialColor,
  instanceColor,
  max,
  min,
  mix,
  mod,
  mx_noise_float,
  mx_worley_noise_float,
  normalWorld,
  positionGeometry,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  step,
  time,
  uv,
  vec3,
} from 'three/tsl';
import { U } from '../uniforms';
import { activityGlow, bloomAt, overlayDim, withOverlay } from './overlay';

/**
 * Shared material library. Every instanced piece references one of these, so the whole city
 * renders with ~15 pipelines. Per-instance variation comes from `instanceColor` (tint) and the
 * `aParams` vec4 attribute: x = greenery, y = seed, z = glow, w = extra.
 */
const iParams = attribute('aParams', 'vec4');
const iGreenery = iParams.x;
const iSeed = iParams.y;
const iGlow = iParams.z;

/** Night-only bioluminescence factor with a gentle breathing pulse. */
const bioPulse = (seed = iSeed) => U.night.mul(sin(time.mul(1.4).add(seed.mul(40))).mul(0.15).add(0.85));

/** Vertex wind sway, stronger toward the top of a unit piece. */
const swayed = (amp: number) => {
  const h = abs(positionGeometry.y);
  const phase = positionLocal.x.mul(0.7).add(positionLocal.z.mul(0.5)).add(time.mul(1.6));
  const s = sin(phase).mul(amp).mul(h).mul(U.wind);
  return positionLocal.add(vec3(s, 0, s.mul(0.6)));
};

/** Season tint as a vec3 node (uniform colour nodes are typed as `color`). */
const seasonTint = U.seasonTint as unknown as Node<'vec3'>;

const lib = new Map<string, Material>();

/**
 * Per-instance vitality (aParams.w on plant and membrane pieces): 1 = thriving, 0 = failing.
 * Struggling buildings visibly wilt: greens turn dry and brown, and their glow fades.
 */
const iVitality = iParams.w;
const withVitality = (base: Node<'vec3'>) => {
  // Dry straw-brown keeps the base's lightness so the form still reads.
  const lum = dot(base, vec3(0.3, 0.59, 0.11));
  const dry = vec3(lum.mul(0.9).add(0.18)).mul(vec3(1.0, 0.8, 0.52));
  return mix(dry, base, smoothstep(0.15, 0.9, iVitality)) as Node<'vec3'>;
};

interface DefineOptions {
  /** How the data-lens overlay applies: per-instance tint divided out, plain mesh, or not at all. */
  overlay?: 'instanced' | 'plain' | 'none';
  /** Wilt with low vitality (aParams.w). */
  vitality?: boolean;
}

function define(name: string, make: () => Material, opts: DefineOptions = {}): void {
  const m = make();
  if (m instanceof MeshStandardNodeMaterial && opts.overlay !== 'none') {
    let base = (m.colorNode ?? materialColor) as Node<'vec3'>;
    if (opts.vitality) base = withVitality(base);
    m.colorNode = withOverlay(base, (opts.overlay ?? 'instanced') === 'instanced');
    if (m.emissiveNode) {
      let e = m.emissiveNode as Node<'vec3'>;
      if (opts.vitality) e = e.mul(iVitality) as Node<'vec3'>;
      m.emissiveNode = overlayDim(e);
    }
  }
  lib.set(name, m);
}

export function getMaterial(name: string): Material {
  const m = lib.get(name);
  if (!m) throw new Error(`Unknown material "${name}"`);
  return m;
}

/** Registers an externally created material (e.g. from a GLB) under a name. */
export function registerMaterial(name: string, material: Material): void {
  lib.set(name, material);
}

export function initMaterials(): void {
  if (lib.size) return;

  define('concrete', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0 });
    const n = mx_noise_float(positionWorld.mul(6)).mul(0.04);
    m.colorNode = color(0xffffff).sub(n);
    return m;
  });

  define('timber', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.9 });
    const grain = sin(positionWorld.y.mul(60).add(mx_noise_float(positionWorld.mul(4)).mul(6))).mul(0.06);
    m.colorNode = color(0xffffff).add(grain);
    return m;
  });

  // Solar-glass composite: reflective tinted panes, mullions, and warm lit windows at night.
  define('glass', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.65 });
    const floorIdx = floor(positionWorld.y.div(0.32));
    const fy = fract(positionWorld.y.div(0.32));
    const col = floor(positionWorld.x.add(positionWorld.z).mul(4));
    const fx = fract(positionWorld.x.add(positionWorld.z).mul(4));
    const mullion = max(step(0.88, fy), step(0.92, fx));
    const pane = mix(color(0x4f8f96), color(0x86c4c0), smoothstep(-0.4, 0.6, mx_noise_float(positionWorld.mul(0.35))));
    m.colorNode = mix(pane, color(0xf3efe4), mullion);
    m.roughnessNode = mix(float(0.12), float(0.7), mullion);
    m.metalnessNode = mix(float(0.45), float(0.0), mullion);
    // aParams.w = power supply: windows go dark during brownouts.
    const lit = step(0.45, hash(floorIdx.mul(17.0).add(col.mul(3.0)).add(iSeed.mul(91)))).mul(iParams.w);
    const warm = mix(color(0xffc77a), color(0xfff0d0), hash(col.add(floorIdx)));
    m.emissiveNode = warm.mul(lit).mul(float(1).sub(mullion)).mul(U.night).mul(0.9).add(color(0xbff7ff).mul(iGlow).mul(U.night).mul(0.4));
    return m;
  });

  // Living membrane: concrete that is overtaken by moss as greenery rises; glowing veins at night.
  define('moss', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 1 });
    const p = positionWorld.mul(3.2);
    const n = mx_noise_float(p).mul(0.5).add(0.5);
    const up = smoothstep(0.4, 0.9, normalWorld.y);
    const cover = smoothstep(n.sub(0.12), n.add(0.12), iGreenery.mul(0.9).add(up.mul(0.45)).add(0.22));
    const mossA = color(0x4f8f3a);
    const mossB = color(0x8cc95a);
    const mossCol = mix(mossA, mossB, mx_noise_float(p.mul(2.7)).mul(0.5).add(0.5));
    const cells = mx_worley_noise_float(positionWorld.mul(9));
    const blossom = step(cells, 0.07).mul(cover).mul(iGreenery);
    const petal = mix(color(0xffb7d5), color(0xffe08a), hash(floor(positionWorld.mul(9)).dot(vec3(1, 7, 13))));
    m.colorNode = mix(mix(color(0xe9e4d6), mossCol, cover), petal, blossom);
    const veins = smoothstep(0.08, 0.0, abs(mx_noise_float(positionWorld.mul(1.8)))).mul(cover);
    m.emissiveNode = color(0x6ff7d8).mul(veins).mul(bioPulse()).mul(0.55).add(petal.mul(blossom).mul(U.night).mul(0.6)).mul(activityGlow());
    return m;
  }, { vitality: true });

  define('plinth', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 1 });
    const strata = mx_noise_float(vec3(positionWorld.x.mul(0.8), positionWorld.y.mul(7), positionWorld.z.mul(0.8))).mul(0.5).add(0.5);
    const stone = mix(color(0x8a7458), color(0xb9a27c), strata);
    const top = smoothstep(0.5, 0.8, normalWorld.y);
    m.colorNode = mix(stone, color(0x6fae4a), top);
    return m;
  });

  // Foliage (canopies, bushes, grass, ivy): flat-shaded low-poly with wind sway + bioluminescent tint.
  const foliage = (amp: number, side = false) => () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.9, flatShading: true });
    if (side) m.side = DoubleSide;
    m.positionNode = swayed(amp);
    const v = mx_noise_float(positionWorld.mul(2.3)).mul(0.18);
    // Seasonal foliage: a gentle wash toward the season tint (golden Harvest, dusty Haze).
    m.colorNode = mix(color(0xffffff).add(v), seasonTint.div(max(instanceColor, vec3(0.08))), U.seasonAmount.mul(0.6));
    // Luminous canopies: busy streets light up even un-flagged foliage with a faint teal rim.
    const glow = activityGlow();
    const rim = float(1).sub(normalWorld.y.abs()).mul(glow.sub(0.6).max(0)).mul(0.12);
    m.emissiveNode = mix(instanceColor, color(0x7ff7e6), 0.6).mul(iGlow.mul(0.5).add(rim)).mul(bioPulse()).mul(glow);
    return m;
  };
  define('canopy', foliage(0.05), { vitality: true });
  define('bush', foliage(0.05), { vitality: true });
  define('grass', foliage(0.25, true), { vitality: true });
  define('ivy', foliage(0.12, true), { vitality: true });

  define('bark', () => new MeshStandardNodeMaterial({ roughness: 1, flatShading: true }));

  // Pastel flowers: glow in their own colour at night (bioluminescent street lighting).
  // Flowers open with the bloom field: closed buds are green; open blooms take the instance
  // colour (shifted toward the season's tint) and glow. Divide out the instance tint for the bud.
  define('flower', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.6, flatShading: true });
    m.positionNode = swayed(0.3);
    const open = smoothstep(0.12, 0.55, bloomAt(positionWorld.x, positionWorld.z));
    const tinted = mix(vec3(1), seasonTint.div(max(instanceColor, vec3(0.08))), U.seasonAmount.mul(0.6));
    m.colorNode = mix(vec3(0.44, 0.6, 0.29).div(max(instanceColor, vec3(0.08))), tinted, open);
    m.emissiveNode = instanceColor.mul(iGlow).mul(bioPulse()).mul(1.3).mul(open).mul(activityGlow());
    return m;
  }, { vitality: true });

  define('lily', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.5, flatShading: true });
    m.positionNode = positionLocal.add(vec3(0, sin(time.mul(0.9).add(iSeed.mul(30))).mul(0.01), 0));
    const petal = smoothstep(0.03, 0.06, positionGeometry.y);
    m.colorNode = mix(vec3(0.31, 0.6, 0.23).div(max(instanceColor, vec3(0.08))), vec3(1), petal);
    m.emissiveNode = instanceColor.mul(petal).mul(U.night).mul(0.8);
    return m;
  });

  // Koi swim lazy circles around their instance origin.
  define('koi', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.1 });
    const a = time.mul(0.7).add(iSeed.mul(6.283));
    m.positionNode = positionLocal.add(vec3(sin(a).mul(0.28), 0, sin(a.add(1.5708)).mul(0.28)));
    const spots = step(0.55, mx_noise_float(positionLocal.mul(30)));
    m.colorNode = mix(vec3(1), vec3(1.0, 0.98, 0.95).div(max(instanceColor, vec3(0.08))), spots);
    return m;
  });

  // Filtration channel: clear green-blue water with drifting ripples and a faint night glow.
  define('channel', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.1 });
    const rip = mx_noise_float(vec3(positionWorld.x.mul(2.5), time.mul(0.6), positionWorld.z.mul(2.5)));
    const lush = attribute('aLush', 'float');
    m.colorNode = mix(mix(color(0x2f8f8a), color(0x4fc3a8), rip.mul(0.5).add(0.5)), color(0x3fa0b8), lush.mul(0.4));
    m.emissiveNode = color(0x4fe0ff).mul(U.night).mul(0.18).mul(rip.mul(0.5).add(0.6));
    return m;
  }, { overlay: 'plain' });

  define('fungus', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.5 });
    const cap = smoothstep(0.35, 0.6, positionGeometry.y);
    m.colorNode = mix(color(0xf6efe4), color(0xffffff), cap);
    m.emissiveNode = color(0x8ff3ff).mul(cap).mul(iGlow).mul(bioPulse()).mul(1.6).mul(activityGlow());
    return m;
  }, { vitality: true });

  // Solar petals: deep iridescent cells with a faint cyan circuit glow at night.
  define('solar', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0.6, side: DoubleSide });
    const g = uv();
    const cells = max(step(0.9, fract(g.x.mul(8))), step(0.85, fract(g.y.mul(3))));
    const irid = sin(positionWorld.x.add(positionWorld.z).mul(3).add(time.mul(0.3))).mul(0.5).add(0.5);
    m.colorNode = mix(mix(color(0x2f5fb0), color(0x6a58c0), irid), color(0xe8f4ff), cells);
    m.emissiveNode = color(0x7ff7e6).mul(cells).mul(U.night).mul(0.5);
    return m;
  });

  define('algae', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0.1 });
    const bubbles = step(0.82, fract(positionWorld.y.mul(5).sub(time.mul(0.6)).add(hash(floor(positionWorld.x.mul(20))))));
    m.colorNode = color(0x5fd36a);
    m.emissiveNode = color(0x4dff7a)
      .mul(U.night.mul(0.9).add(0.15))
      .mul(sin(time.add(positionWorld.y.mul(4))).mul(0.15).add(0.85))
      .add(color(0xd8ffe0).mul(bubbles).mul(0.4));
    return m;
  });

  define('dome', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.32, side: DoubleSide, depthWrite: false });
    const g = uv();
    const ribs = max(step(0.95, fract(g.x.mul(16))), step(0.93, fract(g.y.mul(6))));
    m.colorNode = mix(color(0xffffff), color(0xf2efe2), ribs);
    m.opacityNode = mix(float(0.22), float(0.95), ribs);
    m.emissiveNode = color(0xbff7ff).mul(ribs).mul(U.night).mul(0.35);
    return m;
  });

  define('pool', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.04, metalness: 0.2 });
    const ripple = mx_noise_float(vec3(positionWorld.x.mul(6), time.mul(0.5), positionWorld.z.mul(6))).mul(0.08);
    m.colorNode = color(0x3fb6c0).add(ripple);
    const lily = step(mx_worley_noise_float(positionWorld.mul(7)), 0.12);
    m.colorNode = mix(m.colorNode, color(0x5fae4a), lily);
    m.emissiveNode = color(0x4fe0ff).mul(U.night).mul(0.25).add(color(0xffb7d5).mul(lily).mul(U.night).mul(0.3));
    return m;
  });

  // Commuter pod shell: pearl body with a glowing window band (instance glow brightens it at night).
  define('pod', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0.2 });
    const band = smoothstep(0.03, 0.0, abs(positionGeometry.y.sub(0.25)));
    m.colorNode = mix(color(0xf6f8f4), color(0x2f6f78), band);
    m.emissiveNode = color(0x7ff7e6).mul(band).mul(iGlow.mul(U.night).mul(1.4).add(0.15));
    return m;
  });

  // Façade waterfall (retrofit courtyards): white-water streaks sliding down a teal sheet,
  // foam where it lands, and a soft cyan glow at night that follows street activity.
  define('waterfall', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0.1, side: DoubleSide });
    const g = uv();
    const lane = floor(g.x.mul(14));
    const flow = fract(g.y.mul(3).add(time.mul(hash(lane).mul(0.6).add(0.9))).add(hash(lane.add(7))));
    const streak = smoothstep(0.55, 0.95, flow).mul(step(0.25, hash(lane.add(3))));
    const foam = smoothstep(0.12, 0.0, g.y);
    const white = streak.mul(0.7).add(foam).min(1);
    m.colorNode = mix(color(0x5fc8d8), color(0xf2fdff), white);
    m.emissiveNode = color(0x7fe9ff).mul(white.mul(0.6).add(0.25)).mul(U.night).mul(0.7).mul(activityGlow());
    return m;
  }, { overlay: 'plain' });

  // Living Highway: bio-turf track with a glowing pollen guideline toward connected neighbours.
  define('road', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.95 });
    const mask = attribute('aMask', 'float');
    const c = uv().sub(0.5);
    const bN = mod(mask, 2);
    const bE = mod(floor(mask.div(2)), 2);
    const bS = mod(floor(mask.div(4)), 2);
    const bW = floor(mask.div(8));
    const far = float(1);
    const dN = mix(far, abs(c.x), bN.mul(step(c.y, 0)));
    const dS = mix(far, abs(c.x), bS.mul(step(0, c.y)));
    const dE = mix(far, abs(c.y), bE.mul(step(0, c.x)));
    const dW = mix(far, abs(c.y), bW.mul(step(c.x, 0)));
    const d = min(min(min(dN, dS), min(dE, dW)), c.length().mul(0.8));
    const line = smoothstep(0.05, 0.02, d);
    const dots = step(0.45, fract(positionWorld.x.add(positionWorld.z).mul(3).sub(time.mul(0.8))));
    const turf = mix(color(0x3e7a3a), color(0x5c9a48), mx_noise_float(positionWorld.mul(5)).mul(0.5).add(0.5));
    const rut = smoothstep(0.12, 0.2, d).mul(0.12);
    // Unfunded highways are reclaimed: wild meadow creeps in and the guideline goes dark.
    const og = attribute('aOvergrowth', 'float');
    const wild = mix(color(0x6f9a3c), color(0x9cbf5a), mx_noise_float(positionWorld.mul(9)).mul(0.5).add(0.5));
    const lit = line.mul(float(1).sub(smoothstep(0.3, 0.9, og)));
    m.colorNode = mix(mix(turf.add(rut), color(0xd9fff4), lit.mul(0.6)), wild, smoothstep(0.2, 1, og));
    m.emissiveNode = color(0x7ff7e6).mul(lit).mul(dots.mul(0.6).add(0.4)).mul(U.night.mul(1.2).mul(activityGlow()).add(0.12));
    return m;
  }, { overlay: 'plain' });

  // Floating problem marker: bobbing, spinning-light octahedron in its alert colour.
  define('alert', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.3, flatShading: true });
    m.positionNode = positionLocal.add(vec3(0, sin(time.mul(3).add(iSeed.mul(20))).mul(0.18), 0));
    m.emissiveNode = instanceColor.mul(sin(time.mul(5).add(iSeed.mul(20))).mul(0.3).add(1.2));
    return m;
  }, { overlay: 'none' });

  define('ghost', () => {
    const m = new MeshBasicNodeMaterial({ transparent: true, opacity: 0.42, depthWrite: false });
    m.colorNode = U.ghost;
    return m;
  });

  // Footprint cursor: glowing tile outline with a soft fill.
  define('cursor', () => {
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const c = uv().sub(0.5).abs();
    const edge = smoothstep(0.42, 0.5, max(c.x, c.y));
    m.colorNode = U.ghost;
    m.opacityNode = edge.mul(0.85).add(0.12);
    return m;
  });

  define('sky', () => {
    const m = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
    const dir = positionLocal.normalize();
    const up = max(dir.y, 0);
    const base = mix(U.horizon, U.zenith, up.pow(0.55));
    const sd = max(dir.dot(U.sunDir), 0);
    const sun = sd.pow(900).mul(6).add(sd.pow(12).mul(0.35));
    const cell = floor(dir.mul(260));
    const stars = step(0.9975, hash(cell.dot(vec3(1, 57, 113)))).mul(U.night).mul(smoothstep(0.0, 0.25, dir.y));
    m.colorNode = base.add(U.sunColor.mul(sun).mul(float(1).sub(U.night.mul(0.9)))).add(vec3(stars));
    return m;
  });
}

export const tmpColor = new Color();
