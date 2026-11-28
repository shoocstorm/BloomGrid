import type { GameModule } from '@/game/context';
import { U } from '@/render/uniforms';
import type { PostLook } from '@/render/stylize';

/**
 * The island's looks (D-243, D-244, D-245): Bloom is the stylised solarpunk storybook; Natural a realistic take;
 * Painted a watercolour; Miniature a tilt-shift toy model; Synthwave an 80s neon sunset; Blueprint an architect's drawing;
 * Pixel a 16-bit game; Ink a cel-shaded comic.
 */
export type VisualStyle = 'bloom' | 'natural' | 'painted' | 'miniature' | 'synthwave' | 'blueprint' | 'pixel' | 'ink';

/** Surface colour parameters (`render/materials/looks.ts`): blended on the CPU, one curve per fragment. */
interface Surface {
  /** Saturation round the luminance (1 = unchanged). */
  sat: number;
  /** Tone curve a·c² + b·c. */
  a: number;
  b: number;
  /** Broad brightness / warmth variation across the city. */
  noise: number;
  /** Lift toward a colour: rgb, amount. */
  lift: [number, number, number, number];
  gain: number;
  /** Emissive gain. */
  glow: number;
}

export interface StyleInfo {
  name: string;
  blurb: string;
  surface: Surface;
  /** Its post-processing look, if any (needs Medium graphics or higher). */
  post?: PostLook;
  /** Its weight uniform (Bloom has none: all weights 0). */
  weight?: { value: number };
}

const NONE: Surface['lift'] = [1, 1, 1, 0];
export const VISUAL_STYLES: Record<VisualStyle, StyleInfo> = {
  bloom: { name: 'Bloom', blurb: 'Stylised solarpunk: saturated colour and glow', surface: { sat: 1, a: 0, b: 1, noise: 0, lift: NONE, gain: 1, glow: 1 } },
  natural: {
    name: 'Natural',
    blurb: 'Realistic sunlight, colour, sky and haze',
    surface: { sat: 0.66, a: 0.24, b: 0.66, noise: 0.07, lift: NONE, gain: 1, glow: 0.68 },
    weight: U.realism,
  },
  painted: {
    name: 'Painted',
    blurb: 'Watercolour washes on textured paper',
    surface: { sat: 0.95, a: 0, b: 1, noise: 0, lift: [0.95, 0.92, 0.84, 0.08], gain: 1, glow: 0.8 },
    post: 'painted',
    weight: U.painted,
  },
  miniature: {
    name: 'Miniature',
    blurb: 'Tilt-shift blur: the city as a toy model',
    surface: { sat: 1.2, a: 0.1, b: 0.92, noise: 0.04, lift: NONE, gain: 1.04, glow: 1 },
    post: 'mini',
    weight: U.mini,
  },
  synthwave: { name: 'Synthwave', blurb: '80s neon sunset: hot pink, violet and glowing outlines', surface: { sat: 1.1, a: 0, b: 1, noise: 0, lift: NONE, gain: 1, glow: 1.4 }, post: 'synth', weight: U.synth },
  blueprint: {
    name: 'Blueprint',
    blurb: 'White linework on blue drafting paper',
    surface: { sat: 0.3, a: 0, b: 1, noise: 0, lift: NONE, gain: 1, glow: 0.5 },
    post: 'blueprint',
    weight: U.blueprint,
  },
  pixel: { name: 'Pixel', blurb: 'Sprite art: chunky pixels, bold palette, outlines', surface: { sat: 1.15, a: 0, b: 1, noise: 0, lift: NONE, gain: 1.02, glow: 1 }, post: 'pixel', weight: U.pixel },
  ink: { name: 'Ink', blurb: 'Cel-shaded light with comic outlines', surface: { sat: 1.22, a: 0, b: 1, noise: 0, lift: NONE, gain: 1.06, glow: 1 }, post: 'ink', weight: U.cel },
};
export const STYLE_ORDER = Object.keys(VISUAL_STYLES) as VisualStyle[];

export interface StyleService {
  readonly style: VisualStyle;
  /** Switches the look; `instant` skips the ease (scripts, captures). Remembered per viewer. */
  set(style: VisualStyle, instant?: boolean): void;
  /** The next style in `STYLE_ORDER` (F4), with a toast. */
  cycle(): void;
}

declare module '@/core/Services' {
  interface GameServices {
    style: StyleService;
  }
}

declare module '@/core/EventBus' {
  interface GameEvents {
    'style:changed': { style: VisualStyle };
  }
}

const STORAGE_KEY = 'bloomgrid.style';
/** Seconds a switch eases over: a cross-fade of light and colour, not a cut. */
const EASE = 0.9;
const WEIGHTED = STYLE_ORDER.filter((id) => VISUAL_STYLES[id].weight);

/** Writes the surface uniforms for the current weights (Bloom fills whatever weight the others leave). */
function blendSurfaces(): void {
  const acc = { ...VISUAL_STYLES.bloom.surface, lift: [0, 0, 0, 0] as number[] };
  let rest = 1;
  const keys = ['sat', 'a', 'b', 'noise', 'gain', 'glow'] as const;
  for (const k of keys) acc[k] = 0;
  const add = (s: Surface, w: number) => {
    for (const k of keys) acc[k] += s[k] * w;
    // The lift colour is weighted by its amount, so a style without a lift doesn't pull another's colour to white.
    for (let i = 0; i < 3; i++) acc.lift[i]! += s.lift[i]! * s.lift[3] * w;
    acc.lift[3]! += s.lift[3] * w;
  };
  for (const id of WEIGHTED) {
    const w = VISUAL_STYLES[id].weight!.value;
    if (w > 0) add(VISUAL_STYLES[id].surface, w);
    rest -= w;
  }
  add(VISUAL_STYLES.bloom.surface, Math.max(0, rest));
  const amt = acc.lift[3]!;
  U.alb.value.set(acc.sat, acc.a, acc.b, acc.noise);
  U.albLift.value.set(amt > 0 ? acc.lift[0]! / amt : 1, amt > 0 ? acc.lift[1]! / amt : 1, amt > 0 ? acc.lift[2]! / amt : 1, amt);
  U.albGain.value = acc.gain;
  U.glowGain.value = acc.glow;
}

/**
 * Visual style switch (D-243, D-244, D-245). Each style has a weight uniform (Bloom: all 0) that the sky, water,
 * terrain, fog and atmosphere keys (Natural) and the post looks blend on, and a surface parameter set blended here
 * into the materials' one colour curve; a switch eases the weights, so it compiles no material. Post looks are built
 * only while their style is chosen or still fading out (`PostFX.setLooks`: post nodes only). Settings → Display,
 * **F4** cycles, `?style=<id>`; kept in localStorage.
 */
export const styleModule: GameModule = {
  id: 'style',
  init(ctx) {
    const isStyle = (v: unknown): v is VisualStyle => typeof v === 'string' && v in VISUAL_STYLES;
    let style: VisualStyle = 'bloom';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isStyle(saved)) style = saved;
    } catch {
      /* storage blocked: Bloom */
    }
    const param = ctx.params.get('style');
    if (isStyle(param)) style = param;

    const syncLooks = () => {
      const looks: PostLook[] = [];
      for (const id of STYLE_ORDER) {
        const s = VISUAL_STYLES[id];
        if (s.post && (id === style || (s.weight?.value ?? 0) > 0)) looks.push(s.post);
      }
      ctx.services.tryGet('render')?.postfx.setLooks(looks);
    };
    const snap = () => {
      for (const id of WEIGHTED) VISUAL_STYLES[id].weight!.value = id === style ? 1 : 0;
      blendSurfaces();
    };
    snap();
    syncLooks();

    const service: StyleService = {
      get style() {
        return style;
      },
      set(next, instant = false) {
        if (next !== style) {
          style = next;
          try {
            localStorage.setItem(STORAGE_KEY, next);
          } catch {
            /* remembered for the session only */
          }
          ctx.bus.emit('style:changed', { style: next });
        }
        if (instant) snap();
        syncLooks();
      },
      cycle() {
        const next = STYLE_ORDER[(STYLE_ORDER.indexOf(style) + 1) % STYLE_ORDER.length]!;
        service.set(next);
        ctx.bus.emit('toast', { text: `Visual style: ${VISUAL_STYLES[next].name} · F4 for the next`, tone: 'info' });
      },
    };
    ctx.services.provide('style', service);

    ctx.systems.add({
      id: 'style.ease',
      phase: 'sync',
      update(_c, f) {
        const step = Math.min(1, f.dt / EASE);
        let moved = false;
        for (const id of WEIGHTED) {
          const u = VISUAL_STYLES[id].weight!;
          const target = id === style ? 1 : 0;
          if (u.value === target) continue;
          u.value = Math.abs(target - u.value) <= step ? target : u.value + Math.sign(target - u.value) * step;
          moved = true;
        }
        if (!moved) return;
        blendSurfaces();
        // Drop a look's post pass once its style has faded out.
        syncLooks();
      },
    });

    ctx.input.onKey((e) => {
      if (e.code !== 'F4' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
      service.cycle();
      return true;
    });
  },
};
