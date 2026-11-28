import {
  Fn,
  abs,
  dot,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  mx_noise_float,
  perspectiveDepthToViewZ,
  screenCoordinate,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { Vector2, type Node, type TextureNode } from 'three/webgpu';
import { U } from './uniforms';

/**
 * Post-processing for the styles that change the picture itself, not only its colours (D-244, D-245). The post
 * pipeline is built for the looks on screen only (the chosen style and one still fading out: `PostFX.setLooks`), so
 * a look costs nothing while it is off. Three stages:
 *
 * 1. `beforeTaa` (scene colour in linear light, before temporal AA): anything with hard per-pixel edges, so TAA
 *    resolves it like the geometry instead of it following each frame's sub-pixel jitter and shimmering on a still
 *    view: outlines (Painted's pooled pigment, Ink's black ink, Blueprint's white linework), Ink's light bands and
 *    Blueprint's paper. Outlines are the Laplacian of inverse depth (`1/z` is linear across a plane in screen space,
 *    so flat ground and walls give zero and only silhouettes and creases remain), one pixel either side of the edge,
 *    relative to the distance so they mean the same up close and from the island view.
 * 2. `display` (after tone mapping and the grade): Painted's paper and soft banding, Synthwave's sunset ramp, Blueprint's grid,
 *    Miniature's toy colour. Screen-space textures (paper, grain, grid) are static on screen, so they never flicker.
 * 3. `resample` (reads the finished frame as a texture: one more full-screen target): Miniature's tilt-shift blur and
 *    Pixel's blocks, banded palette, ordered dither and block outlines (it reads depth too).
 *
 * Every look scales with its weight uniform, so styles ease in and out.
 */
export type PostLook = 'painted' | 'ink' | 'synth' | 'blueprint' | 'pixel' | 'mini';
export type Looks = ReadonlySet<PostLook>;

/** Looks drawn before TAA (they need the scene colour and depth as textures: one extra target with TAA). */
export const needsBeforeTaa = (l: Looks) =>
  l.has('painted') || l.has('ink') || l.has('blueprint') || l.has('pixel') || l.has('synth');
/** Looks that read the finished frame back (one extra target). */
export const needsResample = (l: Looks) => l.has('pixel') || l.has('mini');

export class PostInputs {
  readonly near = uniform(0.5);
  readonly far = uniform(4000);
  /** One drawing-buffer pixel in uv. */
  readonly texel = uniform(new Vector2(1 / 1920, 1 / 1080));
  /** Drawing-buffer pixels per CSS pixel (pixel blocks and blur radii are sized in CSS pixels). */
  readonly dpr = uniform(1);
}

const LUM = vec3(0.2126, 0.7152, 0.0722);

/** `levels` steps with soft risers (`soft` = riser width as a fraction of a step). */
const bands = (v: Node<'float'>, levels: number, soft: number) => {
  const t = v.mul(levels);
  return floor(t)
    .add(smoothstep(0.5 - soft / 2, 0.5 + soft / 2, fract(t)))
    .div(levels);
};

export function beforeTaa(color: TextureNode, depth: TextureNode, k: PostInputs, looks: Looks): Node<'vec4'> {
  return Fn(() => {
    const at = (o: Node<'vec2'>) =>
      perspectiveDepthToViewZ(depth.sample(uv().add(o)).r, k.near, k.far).negate();
    const z0 = at(vec2(0, 0));
    const tx = vec2(k.texel.x, 0);
    const ty = vec2(0, k.texel.y);
    const w0 = float(1).div(z0);
    const sum = float(1)
      .div(at(tx))
      .add(float(1).div(at(tx.negate())))
      .add(float(1).div(at(ty)))
      .add(float(1).div(at(ty.negate())));
    // Both sides of a silhouette or crease: a two-pixel line centred on the edge (one pixel was averaged to a faint
    // grey by TAA's jitter). A wide ramp: creases near the threshold fade in rather than pop as the view moves.
    const lap = w0.mul(4).sub(sum).abs().mul(z0);
    const edge = smoothstep(0.02, 0.14, lap);
    // Lighter in the distance, where the city is dense and every pixel is an edge.
    const fade = mix(float(1), float(0.3), smoothstep(120, 600, z0));
    const c0 = color.sample(uv());
    let c = c0.rgb as Node<'vec3'>;
    const lin = dot(c, LUM).max(0);
    if (looks.has('ink')) {
      // Ink's light bands, before TAA too: banded after it, a hair of shading change while the camera moved flipped
      // whole bands (1.5 % of pixels flashing against ≤ 0.04 % in Bloom). In linear light, on a perceptual scale.
      const stepped = bands(lin.pow(1 / 2.2), 4, 0.22).pow(2.2);
      c = mix(c, c.mul(stepped.add(0.002).div(lin.add(0.002))), U.cel.mul(0.8)) as Node<'vec3'>;
    }
    if (looks.has('blueprint')) {
      // Drafting paper: the scene's light as shades of one blue (sky included), lighter where it is brighter.
      const t = lin.div(lin.add(0.55));
      c = mix(c, mix(vec3(0.008, 0.035, 0.13), vec3(0.07, 0.19, 0.47), t), U.blueprint) as Node<'vec3'>;
    }
    // Each look's line colour and coverage (its own: Pixel's lines are wider than the others'), weighted by how much
    // of the look is on screen.
    let weight: Node<'float'> = float(0);
    let amount: Node<'float'> = float(0);
    let target: Node<'vec3'> = vec3(0);
    const line = (w: Node<'float'>, colour: Node<'vec3'>, coverage: Node<'float'>) => {
      weight = weight.add(w);
      amount = amount.add(w.mul(coverage));
      target = target.add(colour.mul(w)) as Node<'vec3'>;
    };
    const near = edge.mul(fade);
    // Pooled pigment is darker and more saturated (c² in linear light); ink is near-black; blueprint lines are white.
    if (looks.has('painted'))
      line(U.painted, c.mul(c).mul(0.85).add(c.mul(0.1)) as Node<'vec3'>, near.mul(0.7));
    if (looks.has('ink')) line(U.cel, vec3(0.012, 0.014, 0.02), near.mul(0.92));
    // Blueprint's white on dark blue is the most contrast any look draws: a softer ramp, a paler line and a stronger
    // fade with distance, or its lines flashed as the view moved (0.5–1.9 % of pixels).
    if (looks.has('blueprint')) {
      const soft = smoothstep(0.04, 0.45, lap).mul(mix(float(1), float(0.45), smoothstep(80, 400, z0)));
      line(U.blueprint, vec3(0.5, 0.62, 0.86), min(near, soft).mul(0.8));
    }
    // Pixel's sprite outlines (D-246): drawn here so TAA steadies them (read from the raw, jittered depth at block
    // scale they flickered even on a still view: 0.6–2.2 % of pixels), and a block wide (the Laplacian's span is the block size, 3 CSS px,
    // and its near side is lined across that span) so the blocks along an edge come out dark: thinner lines were
    // averaged into the blocks' mean as a faint grey. Only the rim of a form that carries on past the line:
    // a pole or wire with nothing at its own depth beside it stays unlined (lined, they peppered the sky with specks).
    if (looks.has('pixel')) {
      const span = k.dpr.mul(3).max(2);
      const sx = vec2(k.texel.x, 0).mul(span);
      const sy = vec2(0, k.texel.y).mul(span);
      const ws = [at(sx), at(sx.negate()), at(sy), at(sy.negate())].map((z) => float(1).div(z));
      const lap2 = ws.reduce((acc, w) => acc.sub(w), w0.mul(4) as Node<'float'>).mul(z0);
      const same = ws.reduce((acc, w) => min(acc, w.sub(w0).abs().mul(z0)), float(1) as Node<'float'>);
      const rim = smoothstep(0.025, 0.1, lap2)
        .mul(float(1).sub(smoothstep(0.02, 0.06, same)))
        .mul(mix(float(1), float(0.5), smoothstep(150, 600, z0)));
      line(U.pixel, vec3(0.006, 0.006, 0.012), rim);
    }
    // Synthwave's neon outlines (D-247): bright lines on every edge, which the sunset ramp then reads as its hottest
    // colours (gold and pink tubes on violet). Cyan toward the camera, magenta toward the horizon, so at night, where
    // the scene is dark, some of their own hue survives the ramp.
    if (looks.has('synth')) {
      const neon = mix(vec3(0.02, 0.75, 1.0), vec3(1.0, 0.04, 0.7), smoothstep(60, 420, z0));
      line(U.synth, neon, near.mul(0.85));
    }
    return vec4(mix(c, target.div(max(weight, float(1e-4))), amount), c0.a);
  })() as Node<'vec4'>;
}

/** 1 on the lines of a screen grid `step` CSS-ish pixels apart, `width` wide (soft-edged). */
const gridLines = (px: Node<'vec2'>, step: number, width: number) => {
  const f = fract(px.div(step));
  const dist = min(f, f.oneMinus()).mul(step);
  return float(1).sub(smoothstep(0, width, min(dist.x, dist.y)));
};

export function display(c: Node<'vec3'>, looks: Looks, k: PostInputs): Node<'vec3'> {
  let o = c;
  const lum = dot(c, LUM);
  const px = screenCoordinate.xy;
  if (looks.has('ink')) o = mix(o, mix(vec3(lum), c, 1.12), U.cel) as Node<'vec3'>;
  if (looks.has('painted')) {
    // Soft banding per channel, pigment granulation in the darks, paper grain, a slow wash and paper white.
    const grain = mx_noise_float(vec3(px.mul(0.42), 0))
      .mul(0.6)
      .add(mx_noise_float(vec3(px.mul(0.13), 3.7)).mul(0.4));
    const wash = mx_noise_float(vec3(uv().mul(vec2(4.2, 2.6)), 9.1));
    let paint = mix(c, vec3(bands(c.x, 7, 0.5), bands(c.y, 7, 0.5), bands(c.z, 7, 0.5)), 0.5) as Node<'vec3'>;
    paint = paint.mul(float(1).sub(float(1).sub(lum).mul(grain.mul(0.5).add(0.5)).mul(0.22))) as Node<'vec3'>;
    paint = paint.mul(wash.mul(0.08).add(1)) as Node<'vec3'>;
    paint = mix(vec3(dot(paint, LUM)), paint, 1.1) as Node<'vec3'>;
    paint = mix(paint, vec3(0.97, 0.95, 0.9), 0.05).mul(grain.mul(0.045).add(0.975)) as Node<'vec3'>;
    o = mix(o, paint, U.painted) as Node<'vec3'>;
  }
  if (looks.has('synth')) {
    // Synthwave (D-247): brightness mapped onto an 80s sunset ramp (indigo shadows, violet, hot pink, orange, pale gold
    // highlights) with a quarter of the scene's own hue kept so surfaces stay apart, faint scanlines every 3 CSS px
    // (static on screen, so they never crawl) and a soft violet vignette.
    // Weighted toward the dark end, so a sunlit city sits in violet and pink and only highlights reach orange and gold.
    const l0 = smoothstep(0.02, 0.98, lum);
    const l = l0.mul(l0).mul(0.55).add(l0.mul(0.3));
    const ramp = mix(
      mix(vec3(0.03, 0.01, 0.1), vec3(0.3, 0.06, 0.45), smoothstep(0, 0.35, l)),
      mix(
        vec3(0.95, 0.25, 0.6),
        mix(vec3(1, 0.6, 0.28), vec3(1, 0.93, 0.7), smoothstep(0.82, 1, l)),
        smoothstep(0.6, 0.82, l),
      ),
      smoothstep(0.35, 0.6, l),
    );
    const hue = c
      .div(max(lum, float(0.04)))
      .mul(dot(ramp, LUM))
      .clamp(0, 1.5);
    let wave = mix(ramp, hue, 0.25) as Node<'vec3'>;
    // Only strongly saturated pixels (lamps, signs, lens colours) keep their own colour; grass and roofs join the
    // palette.
    const chroma = max(c.x, max(c.y, c.z)).sub(min(c.x, min(c.y, c.z)));
    wave = mix(wave, c, smoothstep(0.45, 0.8, chroma)) as Node<'vec3'>;
    const row = fract(px.y.div(k.dpr).div(3));
    wave = wave.mul(float(1).sub(smoothstep(0.5, 0.9, row).mul(0.1))) as Node<'vec3'>;
    const d = length(uv().sub(0.5).mul(vec2(1, 0.8)));
    wave = mix(wave, vec3(0.12, 0.02, 0.2), smoothstep(0.35, 0.85, d).mul(0.45)) as Node<'vec3'>;
    o = mix(o, wave, U.synth) as Node<'vec3'>;
  }
  if (looks.has('blueprint')) {
    // One blue throughout (the glow and grade bring other hues back), white where it is brightest, and a drafting
    // grid: minor lines every 24 CSS px, major every 120.
    const l = dot(o, LUM);
    const blue = mix(
      vec3(l.mul(0.5), l.mul(0.78), l.mul(1.3)),
      vec3(0.93, 0.96, 1),
      smoothstep(0.55, 0.95, l),
    );
    const css = px.div(k.dpr);
    const grid = max(gridLines(css, 24, 1).mul(0.05), gridLines(css, 120, 1.3).mul(0.12));
    o = mix(o, blue.add(vec3(0.55, 0.75, 1).mul(grid)), U.blueprint) as Node<'vec3'>;
  }
  if (looks.has('mini')) {
    // Toy-model colour: more saturation and contrast, a touch brighter (the blur is in `resample`).
    const toy = mix(vec3(lum), c, 1.3).sub(0.5).mul(1.08).add(0.52);
    o = mix(o, toy, U.mini) as Node<'vec3'>;
  }
  return o.clamp(0, 1) as Node<'vec3'>;
}

/** Vogel disc offsets (unit radius) for the tilt-shift blur. */
const TAPS = Array.from({ length: 12 }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / 12);
  const a = i * 2.39996323;
  return [Math.cos(a) * r, Math.sin(a) * r] as const;
});

export function resample(frame: TextureNode, k: PostInputs, looks: Looks): Node<'vec4'> {
  return Fn(() => {
    let c = frame.sample(uv()).rgb as Node<'vec3'>;
    if (looks.has('mini')) {
      // Tilt-shift: sharp across a band through the middle of the screen, blurring above and below it like a macro
      // lens on a model. Up to 7 CSS px.
      const r = smoothstep(0.08, 0.42, abs(uv().y.sub(0.52)))
        .mul(7)
        .mul(k.dpr)
        .mul(U.mini);
      let sum: Node<'vec3'> = vec3(0);
      for (const [x, y] of TAPS)
        sum = sum.add(frame.sample(uv().add(vec2(x, y).mul(r).mul(k.texel))).rgb) as Node<'vec3'>;
      c = sum.div(TAPS.length) as Node<'vec3'>;
    }
    if (looks.has('pixel')) {
      // 16-bit sprite art (D-246). Point-sampling one pixel per block from a detailed frame read as noise, and a
      // random dither as speckle: forms never came through. Now:
      // - each 3-CSS-px block (5 px turned a bird's-eye city to mush, D-247) is the mean of nine sub-samples, so it
      //   holds one steady colour;
      // - shading falls into seven hue-preserving bands and colour is pushed bolder, so surfaces read as flat fills;
      // - a limited palette: twelve brightness levels with a light 4×4 ordered (Bayer) dither, colour on a coarse grid
      //   (below): fills stay flat, and only gradients break into the classic grey checker;
      // - a dark outline round every form (drawn before TAA in `beforeTaa`, thick enough that a block's sub-samples
      //   always catch it), so buildings stand out like sprites.
      const size = k.dpr.mul(3).max(2).floor();
      const block = floor(uv().div(k.texel).div(size));
      const at = (b: Node<'vec2'>, ox: number, oy: number) =>
        min(
          b
            .add(vec2(0.5 + ox, 0.5 + oy))
            .mul(size)
            .mul(k.texel),
          vec2(1, 1),
        );
      // Nine sub-samples (3 × 3 across the block): with four, a frame's slight noise still tipped blocks across a
      // palette step on a still view.
      let p: Node<'vec3'> = vec3(0);
      for (const x of [-1 / 3, 0, 1 / 3])
        for (const y of [-1 / 3, 0, 1 / 3]) p = p.add(frame.sample(at(block, x, y)).rgb) as Node<'vec3'>;
      p = p.div(9) as Node<'vec3'>;
      const lum = dot(p, LUM);
      const banded = bands(lum, 7, 0.06);
      let art = p.mul(banded.add(0.02).div(lum.add(0.02))) as Node<'vec3'>;
      art = mix(vec3(dot(art, LUM)), art, 1.3)
        .sub(0.5)
        .mul(1.08)
        .add(0.5) as Node<'vec3'>;
      // Bayer 4×4 from two 2×2 levels: b2(x, y) = (2x + 3y) mod 4 → 0 2 / 3 1.
      const b2 = (v: Node<'vec2'>) => fract(v.x.mul(2).add(v.y.mul(3)).div(4)).mul(4);
      const m = fract(block.div(2)).mul(2);
      const n = fract(floor(block.div(2)).div(2)).mul(2);
      const bayer = b2(m).mul(4).add(b2(n)).add(0.5).div(16);
      // Brightness and colour quantised apart: per-channel steps broke pale, hazy areas into coloured checkers (each
      // channel crossing its step in a different place). Brightness takes eight levels and the dither; colour (the
      // offset from grey) snaps to a coarse grid without one, so fills stay one clean colour.
      const artC = art.clamp(0, 1);
      const l = dot(artC, LUM);
      const lq = floor(l.mul(11).add(bayer.sub(0.5).mul(0.25)).add(0.5)).div(11);
      const chroma = floor(artC.sub(l).div(0.06).add(0.5)).mul(0.06);
      const q = vec3(lq).add(chroma).clamp(0, 1);
      c = mix(c, q, U.pixel) as Node<'vec3'>;
    }
    return vec4(c, 1);
  })() as Node<'vec4'>;
}
