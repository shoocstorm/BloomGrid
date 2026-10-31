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
  fwidth,
  dot,
  hash,
  length,
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
  vec2,
  vec3,
} from 'three/tsl';
import { U } from '../uniforms';
import { activityGlow, bloomAt, overlayDim, withOverlay } from './overlay';
import { is, styleData } from './styles';

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

/**
 * Vertex wind sway, stronger toward the top of a unit piece. `amp` is in world units, so it must
 * stay small next to tiny pieces (a 0.1-unit flower): a gentle lean, not a wave. A slow second
 * term keeps neighbouring plants from moving in lock-step.
 */
const swayed = (amp: number) => {
  const h = abs(positionGeometry.y);
  const phase = positionLocal.x.mul(0.7).add(positionLocal.z.mul(0.5)).add(time.mul(0.9));
  const gust = sin(time.mul(0.23).add(positionLocal.x.mul(0.05))).mul(0.35).add(0.65);
  const s = sin(phase).mul(amp).mul(h).mul(U.wind).mul(gust);
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

  // Walls and floor plates, in the building's style (see styles.ts): each pattern is a light/dark and
  // slight hue modulation around 1, multiplied by the instance tint (the style's wall colour).
  define('concrete', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0 });
    const st = styleData(floor(iSeed));
    const p = st.wallPattern;
    const P = positionWorld;
    const u = P.x.add(P.z);
    const y = P.y;
    const n1 = mx_noise_float(P.mul(6));
    const n2 = mx_noise_float(P.mul(1.3));
    // 1 Tile courses: staggered tiles with grout and a tone per tile.
    const row = floor(y.div(0.08));
    const tu = u.div(0.22).add(mod(row, 2).mul(0.5));
    const grout = max(step(0.86, fract(y.div(0.08))), step(0.93, fract(tu)));
    const tiles = mix(hash(row.mul(13).add(floor(tu))).mul(0.16).add(0.9), float(0.74), grout);
    // 2 Rammed earth: wavy strata of warmer and cooler earth.
    const strata = sin(y.mul(38).add(n2.mul(3))).mul(0.5).add(0.5);
    const earth = mix(vec3(0.84, 0.8, 0.78), vec3(1.07, 1.02, 0.94), strata).sub(n1.mul(0.05));
    // 3 Lime plaster: soft mottling.
    const plaster = float(1).sub(n1.mul(0.06)).sub(n2.mul(0.06));
    // 4 Standing-seam copper: patina panels with seams and copper-brown weathering.
    const seam = step(0.94, fract(u.mul(5)));
    const panel = hash(floor(u.mul(5)).add(floor(y.mul(1.2)).mul(7))).mul(0.1).add(0.95);
    const patina = mix(vec3(1), vec3(1.45, 0.82, 0.56), smoothstep(0.25, 0.7, n2)).mul(panel);
    const copper = mix(patina, vec3(0.62), seam);
    // 5 Glazed mosaic: small tiles, each its own shade and tint.
    const cell = floor(vec3(u.mul(14), y.mul(14), 0));
    const hm = vec3(hash(cell.x.add(cell.y.mul(57))), hash(cell.x.mul(3).add(cell.y.mul(11)).add(5)), hash(cell.x.mul(7).add(cell.y.mul(29)).add(9)));
    const mosaicGrout = max(step(0.86, fract(u.mul(14))), step(0.86, fract(y.mul(14))));
    const mosaic = mix(hm.sub(0.5).mul(0.3).add(1), vec3(0.86), mosaicGrout);
    // 6 Charred boards: vertical boards with gaps and a crackled grain.
    const board = step(0.92, fract(u.div(0.12)));
    const grain = sin(y.mul(90).add(n1.mul(8))).mul(0.08);
    const charred = mix(float(1).add(grain).add(step(0.55, n1).mul(0.25)), float(0.55), board);
    // 7 Ashlar: staggered stone blocks with pale mortar.
    const course = floor(y.div(0.16));
    const bu = u.div(0.36).add(mod(course, 2).mul(0.5));
    const mortar = max(step(0.9, fract(y.div(0.16))), step(0.95, fract(bu)));
    const ashlar = mix(hash(course.mul(17).add(floor(bu))).mul(0.18).add(0.88).sub(n1.mul(0.04)), float(1.12), mortar);
    // 8 Woven bamboo: basket weave, strands alternating direction per cell.
    const checker = mod(floor(u.mul(10)).add(floor(y.mul(10))), 2);
    const w = mix(fract(u.mul(30)), fract(y.mul(30)), checker);
    const weave = smoothstep(0, 0.25, w).mul(smoothstep(1, 0.75, w)).mul(0.25).add(0.8);
    const pick = (k: number, v: Node<'vec3'> | Node<'float'>) => vec3(v as Node<'vec3'>).mul(is(p, k));
    const smooth = float(1).sub(n1.mul(0.04));
    const patterned = pick(0, smooth)
      .add(pick(1, tiles))
      .add(pick(2, earth))
      .add(pick(3, plaster))
      .add(pick(4, copper))
      .add(pick(5, mosaic))
      .add(pick(6, charred))
      .add(pick(7, ashlar))
      .add(pick(8, weave));
    // Roofs and floor-plate tops stay plain; patterns read on the walls.
    m.colorNode = mix(patterned, vec3(smooth), smoothstep(0.6, 0.9, normalWorld.y));
    m.roughnessNode = st.roughness;
    m.metalnessNode = st.metalness.mul(float(1).sub(seam));
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
    // The building's style (styles.ts) picks the window pattern, frame colour and glazing tint.
    const si = floor(iSeed);
    const st = styleData(si);
    const gp = st.glassPattern;
    const u = positionWorld.x.add(positionWorld.z);
    const y = positionWorld.y;
    // Columns per world unit for each pattern (grid, ribbon, slots, arched, diagrid, louvres).
    const k = is(gp, 0).mul(4).add(is(gp, 1).mul(2.5)).add(is(gp, 2).mul(3.2)).add(is(gp, 3).mul(2.4)).add(is(gp, 5).mul(3)).add(is(gp, 4).mul(3));
    const fy = fract(y.div(0.32));
    const fx = fract(u.mul(k));
    // Diagrid cells run on the diagonals; everything else on floors × columns.
    const da = u.mul(3).add(y.mul(3));
    const db = u.mul(3).sub(y.mul(3));
    const diag = is(gp, 4);
    const floorIdx = mix(floor(y.div(0.32)), floor(db), diag);
    const col = mix(floor(u.mul(k)), floor(da), diag);
    const grid = max(step(0.88, fy), step(0.92, fx));
    const ribbon = max(step(0.6, fy), step(0.96, fx));
    const slots = max(step(0.85, fy), step(0.55, fx));
    // Arched windows: a rectangle under a semicircle, measured in world units so the arch stays round.
    const ax = fx.sub(0.5).div(k);
    const archR = float(0.26).div(k);
    const arch = max(
      step(ax.abs(), archR).mul(step(0.1, fy)).mul(step(fy, 0.55)),
      step(length(vec2(ax, fy.sub(0.55).mul(0.32))), archR).mul(step(0.55, fy)),
    );
    const diagrid = max(max(step(0.9, fract(da)), step(0.9, fract(db))), step(0.94, fy));
    const louvres = max(max(step(0.9, fx), step(0.88, fy)), step(0.55, fract(y.mul(14))).mul(0.75));
    const mullion = grid
      .mul(is(gp, 0))
      .add(ribbon.mul(is(gp, 1)))
      .add(slots.mul(is(gp, 2)))
      .add(float(1).sub(arch).mul(is(gp, 3)))
      .add(diagrid.mul(is(gp, 4)))
      .add(louvres.mul(is(gp, 5)));
    const classic = step(si, 0.5);
    const shimmer = smoothstep(-0.4, 0.6, mx_noise_float(positionWorld.mul(0.35)));
    // Classic keeps its teal panes; styled glazing is a neutral reflectance times the style's pane tint.
    const pane = mix(vec3(mix(float(0.62), float(1), shimmer)), mix(color(0x4f8f96), color(0x86c4c0), shimmer), classic);
    const frame = mix(st.frame.div(max(instanceColor, vec3(0.08))), color(0xf3efe4), classic);
    m.colorNode = mix(pane, frame, mullion);
    m.roughnessNode = mix(float(0.12), float(0.7), mullion);
    m.metalnessNode = mix(float(0.45), float(0.0), mullion);
    // aParams.w = power supply: windows go dark during brownouts.
    // About 40% of windows lit in the evening, thinning to ~10% in the small hours; each its own brightness and
    // tone (mostly amber lamps, a few cool screens), so façades read as rooms rather than glowing panels.
    const wh = hash(floorIdx.mul(17.0).add(col.mul(3.0)).add(iSeed.mul(91)));
    const lit = step(U.lateNight.mul(0.3).add(0.6), wh).mul(iParams.w);
    const tone = hash(col.mul(1.7).add(floorIdx.mul(5.3)).add(iSeed.mul(13)));
    const warm = mix(mix(color(0xff9f4a), color(0xffd9a0), tone), color(0xcfe4ff), step(0.88, tone));
    const level = tone.mul(0.6).add(0.25);
    m.emissiveNode = warm.mul(lit).mul(level).mul(float(1).sub(mullion)).mul(U.night).mul(0.55).add(color(0xbff7ff).mul(iGlow).mul(U.night).mul(0.05));
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
    m.emissiveNode = color(0x6ff7d8).mul(veins).mul(bioPulse()).mul(0.3).add(petal.mul(blossom).mul(U.night).mul(0.6)).mul(activityGlow());
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
    const rim = float(1).sub(normalWorld.y.abs()).mul(glow.sub(0.6).max(0)).mul(0.06);
    m.emissiveNode = mix(instanceColor, color(0x7ff7e6), 0.6).mul(iGlow.mul(0.2).add(rim)).mul(bioPulse()).mul(glow);
    return m;
  };
  define('canopy', foliage(0.015), { vitality: true });
  define('bush', foliage(0.015), { vitality: true });
  define('grass', foliage(0.03, true), { vitality: true });
  define('ivy', foliage(0.025, true), { vitality: true });

  define('bark', () => new MeshStandardNodeMaterial({ roughness: 1, flatShading: true }));

  // Pastel flowers: glow in their own colour at night (bioluminescent street lighting).
  // Flowers open with the bloom field: closed buds are green; open blooms take the instance
  // colour (shifted toward the season's tint) and glow. Divide out the instance tint for the bud.
  define('flower', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.6, flatShading: true });
    m.positionNode = swayed(0.02);
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

  // Solar petals: soft sage-to-mint photovoltaic cells with a pearl sheen and white busbars, so the crowns read as
  // light foliage beside the gardens (silicon blue, then teal-bronze, read too dark and busy against the greens).
  define('solar', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.2, side: DoubleSide });
    const g = uv();
    const cells = max(step(0.9, fract(g.x.mul(8))), step(0.85, fract(g.y.mul(3))));
    const irid = sin(positionWorld.x.add(positionWorld.z).mul(3).add(time.mul(0.3))).mul(0.5).add(0.5);
    m.colorNode = mix(mix(color(0x5f9f7e), color(0xbfe2cc), irid.mul(0.5)), color(0xf8f6ee), cells);
    m.emissiveNode = color(0xfff1d0).mul(cells).mul(U.night).mul(0.4);
    return m;
  });

  define('algae', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0.1 });
    const bubbles = step(0.82, fract(positionWorld.y.mul(5).sub(time.mul(0.6)).add(hash(floor(positionWorld.x.mul(20))))));
    m.colorNode = color(0x5fd36a);
    m.emissiveNode = color(0x4dff7a)
      .mul(U.night.mul(0.35).add(0.1))
      .mul(sin(time.add(positionWorld.y.mul(4))).mul(0.15).add(0.85))
      .add(color(0xd8ffe0).mul(bubbles).mul(0.25));
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

  // Landmark light-work: pearl in daylight, glowing aqua at night (instance glow sets the strength).
  define('lumen', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.15 });
    m.colorNode = color(0xf2faf7);
    m.emissiveNode = color(0x8ff8ec).mul(iGlow).mul(U.night.mul(0.6).add(0.1));
    return m;
  });

  // Commuter pod shell: pearl body with a glowing window band (instance glow brightens it at night).
  define('pod', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0.2 });
    const band = smoothstep(0.03, 0.0, abs(positionGeometry.y.sub(0.25)));
    m.colorNode = mix(color(0xf6f8f4), color(0x2f6f78), band);
    m.emissiveNode = color(0x7ff7e6).mul(band).mul(iGlow.mul(U.night).mul(0.8).add(0.12));
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
    // Anti-aliased guideline (D-064). Zoomed out, a tile spans a few pixels: a hairline and its running dashes
    // flicker in and out of pixels as the camera moves, and bloom turns that into flashes. The line is drawn at
    // least about a pixel wide and dimmed as it widens (its average light stays put); dashes and turf noise fade
    // to their average once they are smaller than a pixel.
    const px = max(fwidth(positionWorld.x), fwidth(positionWorld.z));
    const hw = float(0.035);
    const drawW = max(hw, px.mul(0.7));
    const soft = max(px.mul(0.5), float(0.015));
    const line = float(1).sub(smoothstep(drawW.sub(soft), drawW.add(soft), d)).mul(min(float(1), hw.mul(1.5).div(drawW)));
    const dash = step(0.45, fract(positionWorld.x.add(positionWorld.z).mul(3).sub(time.mul(0.8))));
    const dots = mix(dash, float(0.55), smoothstep(0.04, 0.12, px));
    const detail = float(1).sub(smoothstep(0.06, 0.2, px));
    const turf = mix(color(0x3e7a3a), color(0x5c9a48), mx_noise_float(positionWorld.mul(5)).mul(detail).mul(0.5).add(0.5));
    const rut = smoothstep(0.12, 0.2, d).mul(0.12);
    // Unfunded highways are reclaimed: wild meadow creeps in and the guideline goes dark.
    const og = attribute('aOvergrowth', 'float');
    const wild = mix(color(0x6f9a3c), color(0x9cbf5a), mx_noise_float(positionWorld.mul(9)).mul(detail).mul(0.5).add(0.5));
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

  // Merged scenery meshes (sea wonders): per-vertex colour, and `aGlow` for parts that light up at night.
  // `glowline` is the same for meshes whose lit parts are thin strips (the Aeroline's rails and flanks): once a
  // pixel is wider than a strip, it pops in and out of coverage as the camera moves, so its glow is dimmed toward
  // the strip's share of the pixel and bloom has no flashes to amplify (D-064).
  const scenery = (thin: boolean) => () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0.05 });
    const c = attribute('color', 'vec3');
    const cover = thin ? min(float(1), float(0.08).div(max(length(fwidth(positionWorld)).mul(0.6), float(1e-4)))) : float(1);
    m.colorNode = c;
    m.emissiveNode = c.mul(attribute('aGlow', 'float')).mul(cover).mul(U.night.mul(0.9).add(0.12));
    return m;
  };
  define('scenery', scenery(false), { overlay: 'plain' });
  define('glowline', scenery(true), { overlay: 'plain' });

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
