import {
  BackSide,
  Color,
  DoubleSide,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  type Material,
  type Node, AdditiveBlending } from 'three/webgpu';
import {
  abs,
  atan,
  attribute,
  color,
  float,
  floor,
  fract,
  fwidth,
  dot,
  exp,
  hash,
  instanceIndex,
  length,
  materialColor,
  instanceColor,
  max,
  min,
  mix,
  mod,
  mx_noise_float,
  mx_worley_noise_float,
  normalGeometry,
  normalView,
  normalWorld,
  positionGeometry,
  positionLocal,
  positionViewDirection,
  positionWorld,
  screenCoordinate,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { U } from '../uniforms';
import { cloudShade } from '@/render/grade';
import { activityGlow, bloomAt, overlayDim, withOverlay } from './overlay';
import { is, styleData } from './styles';
import { CODE_LINES, DISPLAY_FRAMES, DISPLAY_RECTS, displayAtlas } from './display';
import { wonderMaterial } from './wonder';
import { bumped, reliefFade, roomInterior } from './surface';

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

/**
 * Plants part round the explore walker's feet: within `U.walker.w` of them, blade tips fold down to ankle height and
 * lean away, so the steward's legs show in a meadow instead of vanishing into it. Off (w = 0) outside walk mode.
 */
const trampled = (p: Node<'vec3'>) => {
  const w = U.walker.w;
  const away = p.xz.sub(U.walker.xz);
  const k = float(1).sub(length(away).div(max(w, float(1e-4)))).clamp(0, 1).mul(step(float(1e-4), w));
  const above = p.y.sub(U.walker.y.add(0.012)).max(0);
  const lean = away.div(max(length(away), float(1e-4))).mul(above).mul(k).mul(0.8);
  return vec3(p.x.add(lean.x), p.y.sub(above.mul(k).mul(0.85)), p.z.add(lean.y));
};

/**
 * Pixel-footprint anti-aliasing (D-064): small lights pop in and out of pixels as the camera moves and bloom turns
 * that into flashing. `pieceCover` is how much of its glow a small piece keeps: full while the piece (unit extent in
 * its own geometry) spans `px` pixels or more, then in proportion. `stripes` is `step(edge, fract(v))` with
 * pixel-soft edges that fades to its mean (1 - edge) once a stripe is under a pixel.
 */
export const pieceCover = (px = 4) => min(float(1), float(1 / px).div(max(length(fwidth(positionGeometry)), float(1e-5))));
export const stripes = (v: Node<'float'>, edge: number) => {
  const w = fwidth(v);
  const sharp = smoothstep(float(edge).sub(w.mul(0.5)), float(edge).add(w.mul(0.5)), fract(v));
  // Fade from where a line is about a pixel wide to where it is a third of one (D-070): a line of one or two pixels
  // still steps between pixels as the camera moves, and that crawl reads as flashing on lit façades.
  const line = Math.min(1 - edge, 0.2);
  return mix(sharp, float(1 - edge), smoothstep(line, Math.min(line * 3, 0.6), w));
};
/** World units per pixel on the ground plane. */
const groundPx = () => max(fwidth(positionWorld.x), fwidth(positionWorld.z));

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
  /** Dissolve before the instancer's distance cull (D-162): for materials of pieces with a finite `lod`. */
  fade?: boolean;
  /** Dissolve where the piece is under about half a pixel across (D-238): for materials of fine detail. */
  thin?: boolean;
}

/**
 * Distance at which the drawn object's pieces are culled (`userData.fadeAt`, set per batch by the instancer), read
 * per object: one material serves every chunk's batch. Objects without one never fade.
 */
const fadeAt = uniform(1e9).onObjectUpdate(({ object }) => (object?.userData.fadeAt as number | undefined) ?? 1e9);

/**
 * LOD dissolve (D-162): the instancer drops a small piece's whole chunk at its `lod` distance, which popped whole
 * patches of grass, flowers, trees and bushes in and out as the camera moved. Fragments now dissolve over the last
 * 18 % before it with an interleaved-gradient dither (keyed to the frame under temporal AA, which averages it into a
 * smooth fade), measured like the instancer measures (from `U.eye`, height halved), so a chunk is gone before it is
 * culled. Applies in the shadow pass too (its `cameraPosition` is the sun's, hence `U.eye`).
 */
const lodKeep = () => {
  const e = U.eye;
  const d = length(vec3(positionWorld.x.sub(e.x), e.y.mul(0.5), positionWorld.z.sub(e.z)));
  const fade = smoothstep(fadeAt.mul(0.82), fadeAt, d);
  const px = screenCoordinate.xy.add(U.frame.mul(5.588238));
  const ign = fract(fract(px.x.mul(0.06711056).add(px.y.mul(0.00583715))).mul(52.9829189));
  return ign.greaterThanEqual(fade);
};

/**
 * Thin-detail dissolve (D-238): fins, handrails, posts and ivy strands a few centimetres across are under a pixel at
 * ordinary viewing distances. Such a sliver hits pixel centres on one frame and misses them on the next, and while
 * the camera moves (temporal AA's history rejected) that read as vertical lines flashing on every façade. Where a
 * face spans under ≈ 0.6 px across (from `fwidth(positionGeometry)`: a unit piece spans 1, as `pieceCover` reads it)
 * it dissolves with the same frame-keyed dither as the LOD fade, gone under ≈ 0.25 px: temporal AA averages that
 * into the sliver's true share of the pixel instead of a flash. Thicker pieces and close views are untouched.
 */
const thinKeep = () => {
  const g = fwidth(positionGeometry);
  const across = float(1).div(max(max(g.x, g.y), max(g.z, float(1e-5))));
  const keep = smoothstep(0.25, 0.6, across);
  const px = screenCoordinate.xy.add(U.frame.mul(5.588238)).add(vec2(17, 29));
  const ign = fract(fract(px.x.mul(0.06711056).add(px.y.mul(0.00583715))).mul(52.9829189));
  return ign.lessThan(keep);
};

function define(name: string, make: () => Material, opts: DefineOptions = {}): void {
  const m = make();
  if (m instanceof MeshStandardNodeMaterial && (opts.fade || opts.thin)) {
    const lod = opts.fade ? lodKeep() : null;
    const thin = opts.thin ? thinKeep() : null;
    m.maskNode = lod && thin ? lod.and(thin) : (lod ?? thin)!;
  }
  if (m instanceof MeshStandardNodeMaterial && opts.overlay !== 'none') {
    let base = (m.colorNode ?? materialColor) as Node<'vec3'>;
    if (opts.vitality) base = withVitality(base);
    m.colorNode = withOverlay(base, (opts.overlay ?? 'instanced') === 'instanced').mul(cloudShade());
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
    // World units per pixel: per-tile tones, fine grain, weave and fine noise fade to their mean once their cells
    // are a pixel or two wide, or they twinkle as the camera moves (D-070).
    const px = length(fwidth(P));
    const fade = (cell: number) => smoothstep(cell * 0.15, cell * 0.45, px);
    const n1 = mx_noise_float(P.mul(6)).mul(float(1).sub(fade(0.15)));
    const n2 = mx_noise_float(P.mul(1.3));
    // 1 Tile courses: staggered tiles with grout and a tone per tile.
    const row = floor(y.div(0.08));
    const tu = u.div(0.22).add(mod(row, 2).mul(0.5));
    const grout = max(stripes(y.div(0.08), 0.86), stripes(tu, 0.93));
    const tiles = mix(mix(hash(row.mul(13).add(floor(tu))).mul(0.16).add(0.9), float(0.98), fade(0.08)), float(0.74), grout);
    // 2 Rammed earth: wavy strata of warmer and cooler earth.
    const strata = sin(y.mul(38).add(n2.mul(3))).mul(0.5).add(0.5);
    const earth = mix(vec3(0.84, 0.8, 0.78), vec3(1.07, 1.02, 0.94), strata).sub(n1.mul(0.05));
    // 3 Lime plaster: soft mottling.
    const plaster = float(1).sub(n1.mul(0.06)).sub(n2.mul(0.06));
    // 4 Standing-seam copper: patina panels with seams and copper-brown weathering.
    const seam = stripes(u.mul(5), 0.94);
    const panel = mix(hash(floor(u.mul(5)).add(floor(y.mul(1.2)).mul(7))).mul(0.1).add(0.95), float(1), fade(0.2));
    const patina = mix(vec3(1), vec3(1.45, 0.82, 0.56), smoothstep(0.25, 0.7, n2)).mul(panel);
    const copper = mix(patina, vec3(0.62), seam);
    // 5 Glazed mosaic: small tiles, each its own shade and tint.
    const cell = floor(vec3(u.mul(14), y.mul(14), 0));
    const hm = vec3(hash(cell.x.add(cell.y.mul(57))), hash(cell.x.mul(3).add(cell.y.mul(11)).add(5)), hash(cell.x.mul(7).add(cell.y.mul(29)).add(9)));
    const mosaicGrout = max(stripes(u.mul(14), 0.86), stripes(y.mul(14), 0.86));
    const mosaic = mix(mix(hm.sub(0.5).mul(0.3).add(1), vec3(1), fade(0.07)), vec3(0.86), mosaicGrout);
    // 6 Charred boards: vertical boards with gaps and a crackled grain.
    const board = stripes(u.div(0.12), 0.92);
    const grain = sin(y.mul(90).add(n1.mul(8))).mul(0.08).mul(float(1).sub(fade(0.07)));
    const knotW = max(fwidth(n1), float(0.02));
    const charred = mix(float(1).add(grain).add(smoothstep(float(0.55).sub(knotW), float(0.55).add(knotW), n1).mul(0.25)), float(0.55), board);
    // 7 Ashlar: staggered stone blocks with pale mortar.
    const course = floor(y.div(0.16));
    const bu = u.div(0.36).add(mod(course, 2).mul(0.5));
    const mortar = max(stripes(y.div(0.16), 0.9), stripes(bu, 0.95));
    const ashlar = mix(mix(hash(course.mul(17).add(floor(bu))).mul(0.18).add(0.88), float(0.97), fade(0.16)).sub(n1.mul(0.04)), float(1.12), mortar);
    // 8 Woven bamboo: basket weave, strands alternating direction per cell.
    const checker = mod(floor(u.mul(10)).add(floor(y.mul(10))), 2);
    const w = mix(fract(u.mul(30)), fract(y.mul(30)), checker);
    const weave = mix(smoothstep(0, 0.25, w).mul(smoothstep(1, 0.75, w)).mul(0.25).add(0.8), float(0.99), fade(0.033));
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
    const walls = mix(patterned, vec3(smooth), smoothstep(0.6, 0.9, normalWorld.y));
    // Weathering (aParams.w = 1 − grime, D-073): rain streaks running down the walls and a warm dinge; the streaks
    // fade to their mean once they are a pixel or two wide.
    const grime = float(1).sub(iParams.w).clamp(0, 1);
    const streak = mix(smoothstep(-0.25, 0.55, mx_noise_float(vec3(u.mul(7), y.mul(0.45), P.y.mul(0.1)))), float(0.5), fade(0.12));
    const dinge = mix(vec3(1), vec3(0.6, 0.57, 0.52).add(vec3(0.24, 0.22, 0.2).mul(streak)), grime);
    // Char (grime 0.7..1, D-075): soot darkening the walls, heaviest along the streaks.
    const soot = smoothstep(0.7, 1.0, grime);
    m.colorNode = mix(walls.mul(dinge), vec3(0.11, 0.1, 0.09).add(vec3(0.08).mul(streak)), soot.mul(0.85));
    m.roughnessNode = st.roughness.add(n2.mul(0.08)).add(grout.mul(is(p, 1)).mul(0.1)).clamp(0.05, 1);
    m.metalnessNode = st.metalness.mul(float(1).sub(seam));
    // Relief (D-160), in world units: recessed grout and mortar, standing seams, board gaps and the basket weave
    // catch the sun, so a wall reads as built rather than printed. Walls only, like the patterns.
    const pickH = (k: number, v: Node<'float'>) => v.mul(is(p, k));
    // Smooth-noise relief reads as hammered metal above a millimetre or so: plaster and render stay nearly flat.
    const relief = pickH(0, n1.mul(0.0004))
      .add(pickH(1, grout.mul(-0.012)))
      .add(pickH(2, strata.mul(0.004).add(n1.mul(0.0008))))
      .add(pickH(3, n1.mul(0.0008).add(n2.mul(0.0015))))
      .add(pickH(4, seam.mul(0.016)))
      .add(pickH(5, mosaicGrout.mul(-0.007)))
      .add(pickH(6, board.mul(-0.016).add(grain.mul(0.04))))
      .add(pickH(7, mortar.mul(-0.02).sub(n1.mul(0.004))))
      .add(pickH(8, weave.mul(0.012)));
    m.normalNode = bumped(relief, float(1).sub(smoothstep(0.6, 0.9, normalWorld.y)).mul(reliefFade(0.12)));
    return m;
  });

  define('timber', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.9 });
    // Fine grain (~0.1-unit period) aliases once sub-pixel: fade it out with distance (D-064).
    const grain = sin(positionWorld.y.mul(60).add(mx_noise_float(positionWorld.mul(4)).mul(6)))
      .mul(0.06)
      .mul(float(1).sub(smoothstep(0.015, 0.05, length(fwidth(positionWorld)))));
    // Weathering (aParams.x = 1 − grime on building timber, D-073): silvered, darker boards.
    const grime = float(1).sub(iGreenery).clamp(0, 1);
    const soot = smoothstep(0.7, 1.0, grime);
    m.colorNode = mix(mix(color(0xffffff).add(grain), vec3(0.5, 0.49, 0.46), grime.mul(0.85)), vec3(0.12, 0.1, 0.09), soot.mul(0.85));
    // Raised grain and board joints every ~0.14 units (D-160); weathered timber dries rougher.
    const joints = stripes(positionWorld.x.add(positionWorld.z).div(0.14), 0.93);
    m.normalNode = bumped(grain.mul(0.05).sub(joints.mul(0.01)), reliefFade(0.1));
    m.roughnessNode = float(0.72).add(grime.mul(0.2)).add(joints.mul(0.1));
    return m;
  }, { thin: true });

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
    // Mullions and floor bands as pixel-soft stripes (D-070): hard steps make every window edge crawl in motion.
    const fyv = y.div(0.32);
    const fxv = u.mul(k);
    const grid = max(stripes(fyv, 0.88), stripes(fxv, 0.92));
    const ribbon = max(stripes(fyv, 0.6), stripes(fxv, 0.96));
    const slots = max(stripes(fyv, 0.85), stripes(fxv, 0.55));
    // Arched windows: a rectangle under a semicircle, measured in world units so the arch stays round.
    const ax = fx.sub(0.5).div(k);
    const archR = float(0.26).div(k);
    const arch = max(
      step(ax.abs(), archR).mul(step(0.1, fy)).mul(step(fy, 0.55)),
      step(length(vec2(ax, fy.sub(0.55).mul(0.32))), archR).mul(step(0.55, fy)),
    );
    const diagrid = max(max(stripes(da, 0.9), stripes(db, 0.9)), stripes(fyv, 0.94));
    const louvres = max(max(stripes(fxv, 0.9), stripes(fyv, 0.88)), stripes(y.mul(14), 0.55).mul(0.75));
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
    // Once a window spans only a few pixels, frames vs panes (by day) and lit vs dark windows (by night) twinkle as
    // the camera moves, and bloom makes the lights flash: blend them toward their averages so far façades read
    // evenly (D-064).
    const far = smoothstep(0.2, 0.5, max(fwidth(u.mul(k)), fwidth(y.div(0.32))));
    const frames = mix(mullion, float(0.25), far);
    // Weathering (aParams.x = 1 − grime on building glass, D-073): panes dull and brown, reflections soften.
    const grime = float(1).sub(iGreenery).clamp(0, 1);
    const soot = smoothstep(0.7, 1.0, grime);
    // Rooms behind the glass (D-160): on walls, each window is the front of a room traced by the view ray, so
    // façades have depth, furniture, blinds and ceiling lamps. Roofs and far façades keep the flat pane.
    const wall = float(1).sub(smoothstep(0.5, 0.85, abs(normalWorld.y)));
    // Rooms read fully while a window is ~20 px or more, and fade into the pane by ~7 px: a few-pixel room is a
    // dark speck, and a whole façade of them turned glass towers into perforated grey blocks.
    const cellPx = max(fwidth(fxv), fwidth(fyv));
    const near = float(1).sub(smoothstep(0.05, 0.14, cellPx)).mul(wall);
    const room = roomInterior(fxv, fyv, k, 0.32, 0.3, iSeed);
    const fabric = mix(color(0xeee8dc), color(0xd8cdb8), hash(floorIdx.add(col.mul(5)).add(iSeed)));
    // The pane: the room seen through tinted glass (the style tint multiplies in as instanceColor; classic glass
    // keeps its teal), with a share of the pane's own colour for the glass body; blinds where drawn.
    const glassTint = mix(vec3(1), vec3(0.62, 0.95, 0.98), classic);
    const seen = mix(room.day.mul(1.5).mul(glassTint), pane.mul(0.5), 0.3);
    const inside = mix(seen, fabric.mul(0.75), room.blind);
    const glazing = mix(pane.mul(0.55), inside, near);
    m.colorNode = mix(mix(mix(glazing, frame, frames), vec3(0.3, 0.28, 0.23), grime.mul(0.7)), vec3(0.05, 0.045, 0.04), soot.mul(0.8));
    // Mirror-sharp only close up: a far pane is many panes in a pixel, and a sharp sun glint on it sparkles.
    m.roughnessNode = mix(mix(mix(float(0.12), float(0.05), near), float(0.55), frames), float(0.75), grime);
    // Real glass: a dielectric whose reflection rises at grazing angles (Fresnel), with a light coating on some
    // towers; it was a half-metal mirror. Far façades keep more reflectance (the rooms are averaged out there).
    const coat = mix(hash(iSeed.mul(3.7)).mul(0.25).add(0.12), float(0.42), classic);
    m.metalnessNode = mix(mix(coat, float(0.4), float(1).sub(near)), float(0.0), frames);
    // Mullions and transoms stand proud of the glass: their edges catch the sun.
    m.normalNode = bumped(frames.mul(0.02), near.mul(reliefFade(0.25)));
    // aParams.w = power supply: windows go dark during brownouts.
    // About 40% of windows lit in the evening, thinning to ~10% in the small hours; each its own brightness and
    // tone (mostly amber lamps, a few cool screens), so façades read as rooms rather than glowing panels.
    const wh = hash(floorIdx.mul(17.0).add(col.mul(3.0)).add(iSeed.mul(91)));
    const cut = U.lateNight.mul(0.3).add(0.6);
    const lit = mix(step(cut, wh), float(1).sub(cut), far).mul(iParams.w);
    const tone = mix(hash(col.mul(1.7).add(floorIdx.mul(5.3)).add(iSeed.mul(13))), float(0.5), far);
    const warm = mix(mix(color(0xff9f4a), color(0xffd9a0), tone), color(0xcfe4ff), step(0.88, tone));
    const level = tone.mul(0.6).add(0.25);
    // Near, a lit window shows its lamp-lit room (a glowing blind where one is drawn); far, the flat average.
    const roomGlow = mix(room.lamp.mul(0.7), warm.mul(0.9), room.blind);
    const glowCol = mix(warm.mul(level), roomGlow.mul(level.add(0.35)), near);
    m.emissiveNode = glowCol.mul(lit).mul(float(1).sub(frames)).mul(float(1).sub(soot)).mul(U.night).mul(0.55).add(color(0xbff7ff).mul(iGlow).mul(U.night).mul(0.05));
    return m;
  });

  // Living membrane: concrete that is overtaken by moss as greenery rises; glowing veins at night.
  define('moss', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 1 });
    const p = positionWorld.mul(3.2);
    const n = mx_noise_float(p).mul(0.5).add(0.5);
    const up = smoothstep(0.4, 0.9, normalWorld.y);
    // The moss edge is a contour of a noise field: pale plaster on one side, dark moss on the other. Sharp, it is
    // a hairline that crawls as the camera moves (D-070), so its soft edge is at least ~a pixel wide.
    const reach = iGreenery.mul(0.9).add(up.mul(0.45)).add(0.22).sub(n);
    const edge = max(float(0.12), fwidth(reach).mul(1.2));
    const cover = smoothstep(edge.negate(), edge, reach);
    const mossA = color(0x4f8f3a);
    const mossB = color(0x8cc95a);
    const wpx = length(fwidth(positionWorld));
    const mossCol = mix(mossA, mossB, mx_noise_float(p.mul(2.7)).mul(float(1).sub(smoothstep(0.012, 0.04, wpx))).mul(0.5).add(0.5));
    const cells = mx_worley_noise_float(positionWorld.mul(9));
    // Blossom specks (~0.02 units) are sub-pixel beyond close range: fade them out instead of letting them sparkle.
    const blossom = step(cells, 0.07).mul(cover).mul(iGreenery).mul(float(1).sub(smoothstep(0.008, 0.025, wpx)));
    const petal = mix(color(0xffb7d5), color(0xffe08a), hash(floor(positionWorld.mul(9)).dot(vec3(1, 7, 13))));
    // Cushions of moss and fern (D-160): each Worley cell is a mound, darker in the hollows between them, lifted by
    // the relief below so living walls read as plants rather than a green print.
    // Mounds fade to their mean (not to the hollow) once cells are a few pixels, or far walls darken and crawl.
    const near = float(1).sub(smoothstep(0.012, 0.045, wpx));
    const mound = float(1).sub(cells);
    // Two scales of cushion, the larger breaking up the cell grid so it never reads as paving.
    const big = mx_noise_float(positionWorld.mul(2.1)).mul(0.5).add(0.5);
    const hollow = mix(float(0.9), mix(float(0.8), float(1.06), mound.mul(0.55).add(big.mul(0.45))), near);
    m.colorNode = mix(mix(color(0xe9e4d6), mossCol.mul(hollow), cover), petal, blossom);
    // Relief only where the moss is thick: bare plaster stays smooth (mound cells on plaster read as hammered metal).
    m.normalNode = bumped(mound.mul(0.03).add(n.mul(0.008)).mul(smoothstep(0.45, 0.9, cover)), near.mul(reliefFade(0.11)));
    m.roughnessNode = mix(float(0.9), float(1), cover);
    // Glowing veins are thin contour lines of a noise field: drawn at least ~a pixel wide and dimmed as they widen.
    const vn = abs(mx_noise_float(positionWorld.mul(1.8)));
    const vpx = fwidth(vn);
    const vw = max(float(0.04), vpx.mul(0.7));
    const vsoft = max(vpx.mul(0.5), float(0.04));
    const veins = float(1).sub(smoothstep(vw.sub(vsoft), vw.add(vsoft), vn)).mul(min(float(1), float(0.06).div(vw))).mul(cover);
    m.emissiveNode = color(0x6ff7d8).mul(veins).mul(bioPulse()).mul(0.3).add(petal.mul(blossom).mul(U.night).mul(0.6)).mul(activityGlow());
    return m;
  }, { vitality: true });

  define('plinth', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 1 });
    const strata = mx_noise_float(vec3(positionWorld.x.mul(0.8), positionWorld.y.mul(7), positionWorld.z.mul(0.8))).mul(0.5).add(0.5);
    const stone = mix(color(0x8a7458), color(0xb9a27c), strata);
    const top = smoothstep(0.5, 0.8, normalWorld.y);
    // Dressed stone courses on the sides (D-160): bedding joints, a rough face per block, a lawn on top.
    const course = positionWorld.y.div(0.22);
    const along = positionWorld.x.add(positionWorld.z).div(0.55).add(mod(floor(course), 2).mul(0.5));
    const joint = max(stripes(course, 0.92), stripes(along, 0.96));
    const blockTone = hash(floor(course).mul(13).add(floor(along))).mul(0.12).sub(0.06);
    const face = mx_noise_float(positionWorld.mul(5)).mul(0.5).add(0.5);
    m.colorNode = mix(stone.add(blockTone).mul(float(1).sub(joint.mul(0.35))), color(0x6fae4a), top);
    m.normalNode = bumped(joint.mul(-0.018).add(face.mul(0.01)), float(1).sub(top).mul(reliefFade(0.15)));
    return m;
  });

  // Foliage (canopies, bushes, grass, ivy): flat-shaded low-poly with wind sway + bioluminescent tint.
  const foliage = (amp: number, side = false, trample = false) => () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.9, flatShading: true });
    if (side) m.side = DoubleSide;
    m.positionNode = trample ? trampled(swayed(amp)) : swayed(amp);
    const v = mx_noise_float(positionWorld.mul(2.3)).mul(0.18);
    // Seasonal foliage: a gentle wash toward the season tint (golden Harvest, dusty Haze).
    m.colorNode = mix(color(0xffffff).add(v), seasonTint.div(max(instanceColor, vec3(0.08))), U.seasonAmount.mul(0.6));
    // Luminous canopies: busy streets light up even un-flagged foliage with a faint teal rim.
    const glow = activityGlow();
    const rim = float(1).sub(normalWorld.y.abs()).mul(glow.sub(0.6).max(0)).mul(0.06);
    m.emissiveNode = mix(instanceColor, color(0x7ff7e6), 0.6).mul(iGlow.mul(0.2).add(rim)).mul(bioPulse()).mul(glow);
    return m;
  };
  // Tree crowns (D-160): smooth-shaded clustered lobes (normals bent round the crown, see `crownGeometry`), the
  // baked occlusion in uv.y darkening the crown's heart and underside, and a leaf-scale dapple with relief that
  // fades once leaves are sub-pixel.
  define('canopy', () => {
    const m = foliage(0.015)() as MeshStandardNodeMaterial;
    m.flatShading = false;
    // The crown's own shade fades to its mean once a crown is under ~14 px: a dark speck on a bright lawn pops in
    // and out of pixels as the camera moves (the island view flickered with every tree, D-070).
    const ao = mix(float(0.78), uv().y, pieceCover(14));
    const fine = float(1).sub(smoothstep(0.01, 0.04, length(fwidth(positionWorld))));
    const leaves = mx_worley_noise_float(positionWorld.mul(16));
    const dapple = float(1).sub(leaves).mul(fine);
    const hue = mx_noise_float(positionWorld.mul(0.6)).mul(0.5).add(0.5);
    const tone = mix(vec3(0.92, 1.0, 0.86), vec3(1.06, 1.02, 0.9), hue);
    m.colorNode = (m.colorNode as Node<'vec3'>).mul(tone).mul(ao.mul(0.85).add(0.15)).mul(dapple.mul(0.3).add(0.85));
    m.normalNode = bumped(dapple.mul(0.025), fine);
    m.roughnessNode = float(0.75);
    return m;
  }, { vitality: true, fade: true });
  // Broad-leaf clumps are open blades (D-127): both faces show.
  define('bush', foliage(0.015, true), { vitality: true, fade: true });
  // Palms (D-127): one mesh, parts tagged in uv.x (0 trunk, 1 frond, 2 nut). Fronds take the instance tint and the
  // foliage look; the trunk and nuts divide the tint out for their own colours. Only frond tips sway, gently.
  define('palm', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.85, flatShading: true });
    m.side = DoubleSide;
    const part = uv().x;
    const leaf = step(0.5, part).mul(step(part, 1.5));
    const nut = step(1.5, part);
    const tip = uv().y.mul(uv().y).mul(leaf);
    const phase = positionLocal.x.mul(0.7).add(positionLocal.z.mul(0.5)).add(time.mul(1.1));
    const gust = sin(time.mul(0.23).add(positionLocal.x.mul(0.05))).mul(0.35).add(0.65);
    const sway = sin(phase).mul(0.03).mul(tip).mul(U.wind).mul(gust);
    m.positionNode = positionLocal.add(vec3(sway, sway.mul(-0.4), sway.mul(0.6)));
    const v = mx_noise_float(positionWorld.mul(2.3)).mul(0.18);
    const tintIn = max(instanceColor, vec3(0.08));
    const frond = mix(color(0xffffff).add(v), seasonTint.div(tintIn), U.seasonAmount.mul(0.6));
    // Fronds lighten toward the tip: the young green of a sunlit crown.
    const leafCol = frond.mul(uv().y.mul(0.25).add(0.9));
    const bark = mix(vec3(0.09, 0.055, 0.03), vec3(0.22, 0.17, 0.1), positionGeometry.y.clamp(0, 1)).div(tintIn);
    const coco = vec3(0.26, 0.16, 0.03).div(tintIn);
    m.colorNode = mix(mix(bark, leafCol, leaf), coco, nut) as Node<'vec3'>;
    const glow = activityGlow();
    m.emissiveNode = mix(instanceColor, color(0x7ff7e6), 0.6).mul(iGlow.mul(0.2)).mul(leaf).mul(bioPulse()).mul(glow);
    return m;
  }, { vitality: true, fade: true });
  define('grass', foliage(0.03, true, true), { vitality: true, fade: true });
  define('ivy', foliage(0.025, true), { vitality: true, fade: true, thin: true });

  define('bark', () => new MeshStandardNodeMaterial({ roughness: 1, flatShading: true }), { fade: true });

  // Pastel flowers: glow in their own colour at night (bioluminescent street lighting).
  // Flowers open with the bloom field: closed buds are green; open blooms take the instance
  // colour (shifted toward the season's tint) and glow. Divide out the instance tint for the bud.
  define('flower', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.6, flatShading: true });
    m.positionNode = trampled(swayed(0.02));
    // A flower is a tenth of a unit: under a few pixels its bright petals popped in and out of pixels as the camera
    // moved (gardens round the stadium and sports fields sparkled, D-232). It shades to its leafy green, the mean of a
    // flower bed seen from afar, instead.
    const open = smoothstep(0.12, 0.55, bloomAt(positionWorld.x, positionWorld.z)).mul(pieceCover(4));
    const tinted = mix(vec3(1), seasonTint.div(max(instanceColor, vec3(0.08))), U.seasonAmount.mul(0.6));
    m.colorNode = mix(vec3(0.44, 0.6, 0.29).div(max(instanceColor, vec3(0.08))), tinted, open);
    // Flowers are a few pixels at street zoom: their glow fades below ~10 px or the gardens sparkle in motion (D-070).
    m.emissiveNode = instanceColor.mul(iGlow).mul(bioPulse()).mul(1.3).mul(open).mul(activityGlow()).mul(pieceCover(10));
    return m;
  }, { vitality: true, fade: true });

  define('lily', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.5, flatShading: true });
    m.positionNode = positionLocal.add(vec3(0, sin(time.mul(0.9).add(iSeed.mul(30))).mul(0.01), 0));
    const petal = smoothstep(0.03, 0.06, positionGeometry.y);
    m.colorNode = mix(vec3(0.31, 0.6, 0.23).div(max(instanceColor, vec3(0.08))), vec3(1), petal);
    m.emissiveNode = instanceColor.mul(petal).mul(U.night).mul(0.8).mul(pieceCover());
    return m;
  }, { fade: true });

  // Koi swim lazy circles around their instance origin.
  define('koi', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.1 });
    const a = time.mul(0.7).add(iSeed.mul(6.283));
    m.positionNode = positionLocal.add(vec3(sin(a).mul(0.28), 0, sin(a.add(1.5708)).mul(0.28)));
    const spots = step(0.55, mx_noise_float(positionLocal.mul(30)));
    m.colorNode = mix(vec3(1), vec3(1.0, 0.98, 0.95).div(max(instanceColor, vec3(0.08))), spots);
    return m;
  }, { fade: true });

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
    m.emissiveNode = color(0x8ff3ff).mul(cap).mul(iGlow).mul(bioPulse()).mul(1.6).mul(activityGlow()).mul(pieceCover());
    return m;
  }, { vitality: true, fade: true });

  // Solar petals: soft sage-to-mint photovoltaic cells with a pearl sheen and white busbars, so the crowns read as
  // light foliage beside the gardens (silicon blue, then teal-bronze, read too dark and busy against the greens).
  define('solar', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.2, side: DoubleSide });
    const g = uv();
    const cells = max(stripes(g.x.mul(8), 0.9), stripes(g.y.mul(3), 0.85));
    const irid = sin(positionWorld.x.add(positionWorld.z).mul(3).add(time.mul(0.3))).mul(0.5).add(0.5);
    m.colorNode = mix(mix(color(0x5f9f7e), color(0xbfe2cc), irid.mul(0.5)), color(0xf8f6ee), cells);
    m.emissiveNode = color(0xfff1d0).mul(cells).mul(U.night).mul(0.4);
    return m;
  });

  define('algae', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0.1 });
    const bubbles = stripes(positionWorld.y.mul(5).sub(time.mul(0.6)).add(hash(floor(positionWorld.x.mul(20)))), 0.82).mul(
      float(1).sub(smoothstep(0.02, 0.06, length(fwidth(positionWorld)))),
    );
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
    const ribs = max(stripes(g.x.mul(16), 0.95), stripes(g.y.mul(6), 0.93));
    m.colorNode = mix(color(0xffffff), color(0xf2efe2), ribs);
    m.opacityNode = mix(float(0.22), float(0.95), ribs);
    m.emissiveNode = color(0xbff7ff).mul(ribs).mul(U.night).mul(0.35);
    return m;
  });

  // Clear glazing for a dome whose structure is drawn as separate ribs (the Mycelium Work Dome): almost no body
  // colour, faint panel seams, and a brighter rim where the glass turns edge-on, so it reads as glass and the
  // interior shows through.
  define('domeClear', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.02, metalness: 0.5, transparent: true, side: DoubleSide, depthWrite: false });
    const g = uv();
    const seams = max(stripes(g.x.mul(20), 0.97), stripes(g.y.mul(5), 0.96));
    const edge = float(1).sub(abs(dot(normalView, positionViewDirection))).pow(3);
    m.colorNode = mix(color(0xeefcff), color(0xf4ecdc), seams);
    m.opacityNode = float(0.07).add(edge.mul(0.35)).add(seams.mul(0.25)).min(0.6);
    m.emissiveNode = color(0xbff7ff).mul(seams).mul(U.night).mul(0.05);
    return m;
  });

  // Laptop screens (D-132): the -z face shows a BloomGrid app from the display atlas (display.ts), each laptop on its
  // own cycle through splash, City Pulse, code and map, with the moving parts drawn here (loading bar, live chart,
  // current line and caret, radar sweep); the +z face is the silver lid with a glowing logo. Glow 0 (lights
  // switched off) turns the screen off. Fine motion fades to the atlas once a screen is a few pixels wide (D-070).
  const atlas = displayAtlas();
  define('screen', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.2, metalness: 0.35 });
    const g = uv();
    const nz = normalGeometry.z;
    const face = smoothstep(0.5, 0.9, nz.negate());
    const lid = smoothstep(0.5, 0.9, nz);
    // The display inside its bezel, in frame space (0..1, y up).
    const q = vec2(g.x.sub(0.05).div(0.9), g.y.sub(0.07).div(0.88));
    const inside = step(0, q.x).mul(step(q.x, 1)).mul(step(0, q.y)).mul(step(q.y, 1));
    const seed = fract(iSeed.mul(7.31));
    const t = time.add(seed.mul(40));
    const frame = floor(mod(t.mul(0.11).add(seed.mul(4)), DISPLAY_FRAMES));
    const at = (k: number) => step(abs(frame.sub(k)), float(0.5));
    const qy = q.y.clamp(0.003, 0.997);
    const base = atlas ? texture(atlas, vec2(q.x.clamp(0, 1), float(DISPLAY_FRAMES - 1).sub(frame).add(qy).div(DISPLAY_FRAMES))).rgb : vec3(0.05, 0.14, 0.13);
    const detail = float(1).sub(smoothstep(0.01, 0.05, length(fwidth(g))));
    const within = (r: readonly number[]) => step(r[0]!, q.x).mul(step(q.x, r[2]!)).mul(step(r[1]!, q.y)).mul(step(q.y, r[3]!));
    const teal = vec3(0.37, 0.95, 0.85);
    const leaf = vec3(0.56, 0.94, 0.48);
    // 0 Splash: the loading bar fills, again and again.
    const B = DISPLAY_RECTS.bar;
    const fill = step(q.x, float(B[0]).add(fract(t.mul(0.22)).mul(B[2] - B[0]))).mul(within(B));
    // 1 City Pulse: a live line over a soft area.
    const C = DISPLAY_RECTS.chart;
    const px = q.x.sub(C[0]).div(C[2] - C[0]);
    const py = q.y.sub(C[1]).div(C[3] - C[1]);
    const val = sin(px.mul(9).sub(t.mul(1.6))).mul(0.2).add(sin(px.mul(23).add(t.mul(0.9))).mul(0.08)).add(0.5);
    const line = float(1).sub(smoothstep(0.015, 0.05, abs(py.sub(val)))).mul(within(C));
    const area = step(py, val).mul(within(C)).mul(0.16);
    // 2 Code: the current line glows and a caret blinks along it.
    const K = DISPLAY_RECTS.code;
    const row = floor(float(1).sub(q.y.sub(K[1]).div(K[3] - K[1])).mul(CODE_LINES));
    const cur = floor(mod(t.mul(0.7), CODE_LINES));
    const onRow = step(abs(row.sub(cur)), float(0.5)).mul(within(K));
    const caretX = float(K[0]).add(fract(cur.mul(0.37)).mul(0.45));
    const caret = onRow.mul(step(caretX, q.x)).mul(step(q.x, caretX.add(0.014))).mul(step(0.5, fract(t.mul(1.7))));
    // 3 Map: a radar sweep turns over the island.
    const Rr = DISPLAY_RECTS.radar;
    const d = vec2(q.x.sub(Rr[0]).mul(512 / 358), q.y.sub(Rr[1]));
    const sweep = fract(atan(d.y, d.x).div(Math.PI * 2).sub(t.mul(0.25)));
    const radar = float(1).sub(sweep).pow(6).mul(step(length(d), float(Rr[2]))).mul(0.55);
    const moving = teal
      .mul(fill.mul(at(0)))
      .add(leaf.mul(line.add(area)).mul(at(1)))
      .add(vec3(1).mul(onRow.mul(0.1).add(caret)).mul(at(2)))
      .add(teal.mul(radar).mul(at(3)))
      .mul(detail);
    const shine = sin(q.y.mul(220)).mul(0.03).mul(detail).add(1);
    const disp = base.add(moving).mul(shine).mul(inside);
    // Lid: a small four-petal logo glows in the middle.
    const lu = abs(g.x.sub(0.5));
    const lv = abs(g.y.sub(0.5)).mul(0.7);
    const logo = float(1).sub(smoothstep(0.08, 0.1, lu.add(lv))).mul(lid);
    const on = iGlow.min(1);
    m.colorNode = mix(color(0x15191c), color(0xc9ced2), lid).add(disp.mul(face).mul(on).mul(0.15));
    m.emissiveNode = disp
      .mul(face)
      .mul(U.night.mul(0.35).add(0.85))
      .add(teal.mul(logo).mul(0.6))
      .mul(on)
      .mul(pieceCover(6));
    return m;
  }, { fade: true });

  // A playing field (D-232): turf with mowing stripes and the markings painted on, not built from thin white slabs.
  // Lines a few hundredths of a unit wide are under a pixel from mid zoom, and white on green popped in and out of
  // pixels as the camera moved (the stadium and the sports fields flashed). As a pattern, every line is at least a
  // pixel soft and fades to the field's mean once it is thinner than one. The top face's uv runs along the pitch
  // (u = length, laid along the piece's x), proportions for a pitch about 1.5 times as long as it is wide.
  define('pitch', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.95 });
    const A = 1.5;
    const t = uv();
    const q = vec2(t.x.sub(0.5).mul(A), t.y.sub(0.5));
    const aq = abs(q);
    const rect = (cx: number, hx: number, hy: number) => {
      const d = vec2(abs(aq.x.sub(cx)).sub(hx), aq.y.sub(hy));
      return abs(length(max(d, vec2(0, 0))).add(min(max(d.x, d.y), float(0))));
    };
    const edge = A / 2 - 0.04;
    const d = min(
      min(min(rect(0, edge, 0.46), aq.x), abs(length(q).sub(0.13))),
      min(min(rect(edge - 0.11, 0.11, 0.21), rect(edge - 0.04, 0.04, 0.1)), max(length(q).sub(0.012), float(0))),
    );
    const hw = float(0.007);
    const px = max(fwidth(d), float(1e-5));
    const sharp = float(1).sub(smoothstep(hw.sub(px), hw.add(px), d));
    // ≈ the share of the field the lines cover: what they average to from afar.
    const lines = mix(sharp, float(0.08), smoothstep(0.6, 1.6, px.div(hw)));
    const bands = t.x.mul(12);
    const mow = sin(bands.mul(Math.PI)).mul(0.5).add(0.5).mul(float(1).sub(smoothstep(0.25, 0.6, fwidth(bands))));
    const turf = mix(color(0x4a963a), color(0x5aab46), mix(float(0.5), mow, float(1)));
    const top = smoothstep(0.5, 0.9, normalGeometry.y);
    m.colorNode = mix(turf.mul(mix(float(0.82), float(1), top)), color(0xf2f5ee), lines.mul(top));
    return m;
  });

  define('pool', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.04, metalness: 0.2 });
    // Fine ripples alias from afar: fade them once they are under a couple of pixels (D-070).
    const ripple = mx_noise_float(vec3(positionWorld.x.mul(6), time.mul(0.5), positionWorld.z.mul(6)))
      .mul(0.08)
      .mul(float(1).sub(smoothstep(0.03, 0.09, groundPx())));
    m.colorNode = color(0x3fb6c0).add(ripple);
    const lily = step(mx_worley_noise_float(positionWorld.mul(7)), 0.12).mul(float(1).sub(smoothstep(0.04, 0.12, groundPx())));
    m.colorNode = mix(m.colorNode, color(0x5fae4a), lily);
    m.emissiveNode = color(0x4fe0ff).mul(U.night).mul(0.25).add(color(0xffb7d5).mul(lily).mul(U.night).mul(0.3));
    return m;
  });

  // Landmark light-work: pearl in daylight, glowing aqua at night (instance glow sets the strength).
  // Ribs and rings are thin: their glow follows how many pixels they cover (`lumenThin` for the halo torus, whose
  // tube is 1/20 of the piece, D-064).
  const lumen = (px: number) => () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.15 });
    m.colorNode = color(0xf2faf7);
    m.emissiveNode = color(0x8ff8ec).mul(iGlow).mul(U.night.mul(0.6).add(0.1)).mul(pieceCover(px));
    return m;
  };
  define('lumen', lumen(8), { fade: true, thin: true });
  // The halo torus is on sixty-odd building types: from the overview hundreds of thin white loops were the city's
  // loudest detail (D-230). It dissolves out by its piece `lod` like greenery, so rings belong to close views.
  define('lumenThin', lumen(80), { fade: true, thin: true });

  // Commuter pod shell: pearl body with a glowing window band (instance glow brightens it at night).
  define('pod', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0.2 });
    const band = smoothstep(0.03, 0.0, abs(positionGeometry.y.sub(0.25)));
    m.colorNode = mix(color(0xf6f8f4), color(0x2f6f78), band);
    m.emissiveNode = color(0x7ff7e6).mul(band).mul(iGlow.mul(U.night).mul(0.8).add(0.12));
    return m;
  }, { fade: true });

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
  }, { overlay: 'plain', fade: true });

  // Living Highway (D-134): a carriageway of dark permeable eco-paving with moss gutters, lane edge lines and the
  // glowing pollen guideline toward connected neighbours; raised stone pavements along open sides (geometry in
  // RoadRenderer), zebra crossings on the approaches to junctions. `aRoad` = neighbour mask, overgrowth, level, born.
  define('road', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 0.92 });
    const info = attribute('aRoad', 'vec4');
    const mask = info.x;
    const bit = (k: number) => mod(floor(mask.div(2 ** k)), 2);
    const c = uv().sub(0.5);
    const bN = bit(0);
    const bE = bit(1);
    const bS = bit(2);
    const bW = bit(3);
    const far = float(1);
    const dN = mix(far, abs(c.x), bN.mul(step(c.y, 0)));
    const dS = mix(far, abs(c.x), bS.mul(step(0, c.y)));
    const dE = mix(far, abs(c.y), bE.mul(step(0, c.x)));
    const dW = mix(far, abs(c.y), bW.mul(step(c.x, 0)));
    const d = min(min(min(dN, dS), min(dE, dW)), c.length().mul(0.8));
    // Anti-aliased guideline (D-064). Zoomed out, a tile spans a few pixels: a hairline and its running dashes
    // flicker in and out of pixels as the camera moves, and bloom turns that into flashes. The line is drawn at
    // least about a pixel wide and dimmed as it widens (its average light stays put); dashes and paving joints
    // fade to their average once they are smaller than a pixel.
    const px = groundPx();
    const hw = float(0.03);
    const drawW = max(hw, px.mul(0.7));
    const soft = max(px.mul(0.5), float(0.012));
    const lineAt = (dist: Node<'float'>) => float(1).sub(smoothstep(drawW.sub(soft), drawW.add(soft), dist)).mul(min(float(1), hw.mul(1.5).div(drawW)));
    const line = lineAt(d);
    const dash = step(0.45, fract(positionWorld.x.add(positionWorld.z).mul(3).sub(time.mul(0.8))));
    const dots = mix(dash, float(0.55), smoothstep(0.04, 0.12, px));
    const detail = float(1).sub(smoothstep(0.06, 0.2, px));
    // Highway levels (D-096): 0 raw track, 1 Living Highway, 2 Bloom Boulevard.
    const og = info.y;
    const lvl = info.z;
    const raw = float(1).sub(step(0.5, lvl));
    const blvd = step(1.5, lvl);
    // Distance into the carriageway from the nearest pavement (negative on it): pavements line open sides only,
    // as wide as RoadRenderer's PAVE_W for the level.
    const W = mix(float(0.13), float(0.17), blvd).mul(float(1).sub(raw));
    const half = float(0.5).sub(W);
    const e = min(
      min(mix(c.y.add(half), far, bN), mix(half.sub(c.y), far, bS)),
      min(mix(half.sub(c.x), far, bE), mix(c.x.add(half), far, bW)),
    );
    const aa = max(px.mul(0.6), float(0.003));
    const pave = float(1).sub(smoothstep(aa.negate(), aa, e)).mul(float(1).sub(raw));
    // Kerb stones: the near-vertical face (0..0.012 into the carriageway) and a pale cap along the pavement's edge.
    const kerbFace = smoothstep(aa.negate(), aa, e).mul(float(1).sub(smoothstep(float(0.012).sub(aa), float(0.012).add(aa), e)));
    const kerbCap = pave.mul(smoothstep(float(-0.028).sub(aa), float(-0.028).add(aa), e));
    // Carriageway: dark permeable eco-paving, its block joints filled with moss (faded to their mean far away).
    const wx = positionWorld.x;
    const wz = positionWorld.z;
    const joint = max(stripes(wx.mul(7), 0.9), stripes(wz.mul(7).add(fract(floor(wx.mul(7)).mul(0.5))), 0.9));
    const grain = mx_noise_float(positionWorld.mul(23)).mul(detail).mul(0.5).add(0.5);
    const asphalt = mix(color(0x5b5c55), color(0x6c6c63), grain).mul(float(1).sub(joint.mul(0.1)));
    const mossJoint = mix(asphalt, color(0x5f7d45), joint.mul(0.25).mul(detail));
    // A living gutter: a moss band along each kerb.
    const gutter = float(1).sub(smoothstep(0.02, 0.06, e)).mul(step(0.0, e));
    const carriage = mix(mossJoint, color(0x5b8a46), gutter.mul(0.55));
    // Lane edge lines just inside each kerb, and (boulevards) a second guideline beside the first.
    const edgeLine = lineAt(abs(e.sub(0.075))).mul(0.85).mul(float(1).sub(raw));
    const line2 = lineAt(abs(d.sub(0.1))).mul(blvd);
    const lines = max(line, line2);
    // Zebra crossings on the approaches to a junction (mask bits 4–7), across the carriageway only.
    const zone = (jbit: number, along: Node<'float'>) => bit(jbit).mul(smoothstep(0.2, 0.18, along)).mul(smoothstep(0.03, 0.05, along));
    const zebraX = stripes(c.x.mul(9).add(0.25), 0.5);
    const zebraZ = stripes(c.y.mul(9).add(0.25), 0.5);
    const zebra = max(
      max(zone(4, c.y.add(0.5)).mul(zebraX), zone(6, float(0.5).sub(c.y)).mul(zebraX)),
      max(zone(5, float(0.5).sub(c.x)).mul(zebraZ), zone(7, c.x.add(0.5)).mul(zebraZ)),
    )
      .mul(smoothstep(0.03, 0.05, e))
      .mul(float(1).sub(raw));
    // Pavements: pale stone flags with fine joints; boulevards plant a flower strip behind the kerb.
    const flag = max(stripes(wx.mul(5), 0.94), stripes(wz.mul(5), 0.94));
    const stone = mix(color(0xd8d1c1), color(0xc9c1af), mx_noise_float(positionWorld.mul(9)).mul(detail).mul(0.5).add(0.5)).mul(
      float(1).sub(flag.mul(0.16)),
    );
    const blooms = step(0.6, mx_noise_float(positionWorld.mul(14))).mul(detail);
    const strip = blvd.mul(smoothstep(-0.03, -0.035, e)).mul(smoothstep(-0.09, -0.085, e));
    const walk = mix(stone, mix(color(0x5c9a48), color(0xffb7d5), blooms), strip);
    const kerbCol = mix(color(0xeeeae0), color(0xa7a08f), kerbFace);
    // Raw track: packed earth with two darker wheel ruts and a grass crown, fading into the verge; no light.
    const earth = mix(color(0x8a6e4e), color(0xa88a62), mx_noise_float(positionWorld.mul(7)).mul(detail).mul(0.5).add(0.5));
    const ruts = float(1).sub(smoothstep(0.03, max(px, float(0.04)).add(0.03), abs(d.sub(0.19)))).mul(0.22).mul(detail.mul(0.7).add(0.3));
    const crown = float(1).sub(smoothstep(0.05, 0.1, d)).mul(0.6);
    const verge = smoothstep(0.32, 0.46, d);
    const track = mix(mix(earth.mul(float(1).sub(ruts)), color(0x6f9a4a), crown), color(0x6f9a4a), verge);
    // Unfunded highways are reclaimed: wild meadow creeps in and the guideline goes dark.
    const wild = mix(color(0x6f9a3c), color(0x9cbf5a), mx_noise_float(positionWorld.mul(9)).mul(detail).mul(0.5).add(0.5));
    const onRoad = float(1).sub(pave).mul(float(1).sub(kerbFace));
    const lit = lines.mul(float(1).sub(smoothstep(0.3, 0.9, og))).mul(float(1).sub(raw)).mul(onRoad).mul(float(1).sub(zebra));
    let paved = mix(carriage, color(0xe9e6dc), max(edgeLine.mul(onRoad), zebra));
    paved = mix(paved, color(0xd9fff4), lit.mul(0.75));
    paved = mix(paved, walk, pave);
    paved = mix(paved, kerbCol, max(kerbFace, kerbCap));
    // The skirt under an open edge (vertical faces) is the kerb's stone side.
    const side = float(1).sub(smoothstep(0.3, 0.6, abs(normalGeometry.y)));
    paved = mix(paved, color(0x9d9686), side);
    m.colorNode = mix(mix(paved, track, raw), wild, smoothstep(0.2, 1, og));
    m.roughnessNode = mix(float(0.92), float(0.75), pave.add(kerbCap).min(1));
    // Roadworks (D-128): a newly laid tile waits under the ground until its time (`aBorn`, clock seconds; 0 = old),
    // rises out of it in a third of a second and flashes as it lands, the flash fading behind the paving wave.
    const born = info.w;
    const isNew = step(0.001, born);
    const since = U.clock.sub(born);
    const up = mix(float(1), smoothstep(0, 0.35, since), isNew);
    m.positionNode = positionLocal.sub(vec3(0, float(1).sub(up).mul(0.6), 0));
    const flash = isNew.mul(step(0, since)).mul(exp(since.max(0).mul(-2.2))).mul(float(1).sub(d.mul(1.4)).clamp(0.25, 1));
    m.emissiveNode = color(0x7ff7e6)
      .mul(lit)
      .mul(dots.mul(0.6).add(0.4))
      .mul(U.night.mul(0.75).mul(activityGlow()).add(0.1))
      .mul(blvd.mul(0.3).add(1))
      .add(mix(color(0xfff1c4), color(0x7ff7e6), since.clamp(0, 1)).mul(flash).mul(1.6));
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
  define('wonder', wonderMaterial, { overlay: 'plain' });
  define('glowline', scenery(true), { overlay: 'plain' });

  // Selection highlight (D-090): unlit, so it reads in daylight as well as at night (glow adds bloom after dark).
  // `beacon-xray` draws over everything (the marker over a selected building is never hidden behind a tower).
  const beacon = (xray: boolean) => () => {
    const m = new MeshBasicNodeMaterial({ transparent: xray, depthTest: !xray, depthWrite: !xray });
    const c = attribute('color', 'vec3');
    m.colorNode = c.mul(attribute('aGlow', 'float').mul(U.night.mul(0.4)).add(1));
    if (xray) m.opacityNode = float(0.92);
    return m;
  };
  define('beacon', beacon(false));
  define('beacon-xray', beacon(true));
  // Landing rings (D-121): additive, so an instance colour fading to black fades the ring out.
  define('land-ring', () => {
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    m.colorNode = attribute('color', 'vec3');
    return m;
  });

  // Firework sparks (D-068): every particle's flight is a closed-form function of `U.clock` from its
  // per-instance launch data, so the CPU only writes a particle once (at launch) and never re-poses it.
  // aBurst = origin xyz + start time, aVel = velocity xyz + life, aLook = drag, gravity, size, crackle.
  define('firework', () => {
    const m = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
    const burst = attribute('aBurst', 'vec4');
    const vel = attribute('aVel', 'vec4');
    const look = attribute('aLook', 'vec4');
    const age = U.clock.sub(burst.w);
    const life = vel.w;
    const alive = step(0, age).mul(step(age, life));
    const k = max(look.x, float(0.001));
    const travel = float(1).sub(exp(age.max(0).mul(k).negate())).div(k);
    const fall = vec3(0, look.y.mul(age.max(0)).mul(age.max(0)).mul(0.5), 0);
    const u = age.div(life).clamp(0, 1);
    const fade = float(1).sub(u.mul(u));
    const crackle = mix(float(1), step(0.45, fract(hash(instanceIndex).add(age.mul(11)))), look.w);
    const size = look.z.mul(fade).mul(alive).mul(crackle).mul(U.sparkScale);
    // Streak each spark along its current velocity (fast sparks are long, slowing ones round up).
    const vNow = vel.xyz.mul(exp(age.max(0).mul(k).negate())).sub(vec3(0, look.y.mul(age.max(0)), 0));
    const speed = length(vNow);
    const dir = vNow.div(max(speed, float(1e-3)));
    const p = positionLocal.mul(size);
    const streak = p.add(dir.mul(dot(p, dir)).mul(speed.mul(0.09).min(5)));
    m.positionNode = streak.add(burst.xyz).add(vel.xyz.mul(travel)).sub(fall);
    m.colorNode = instanceColor.mul(0.15);
    // Bright enough for bloom at night; fainter by day (a daylight show is a modest sight).
    m.emissiveNode = instanceColor.mul(fade.mul(fade).mul(5).add(0.6)).mul(U.night.mul(0.75).add(0.25));
    return m;
  }, { overlay: 'none' });

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
