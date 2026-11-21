import { Color, type Vector3, type Vector4 } from 'three/webgpu';
import { U } from './uniforms';

/**
 * A stage's light (D-196): the shared uniforms a side scene holds while it draws in place of the city frame
 * (`render.stage`: the gallery's studio, the 3D film stage), and the lights and sky it dresses itself with. The city
 * materials read `U`, so a model lit by a stage looks as it does on the island; `withStageLook` sets them for one
 * draw and puts them back, so the city's own frame is untouched.
 */
export interface StageLook {
  night: number;
  sun: number;
  sunDir: [number, number, number];
  key: number;
  keyI: number;
  rimI: number;
  hemiI: number;
  /** Sky dome: zenith and horizon of the backdrop. */
  top: number;
  low: number;
  bloom: number;
  zenith: number;
  horizon: number;
}

export type Lighting = 'day' | 'dusk' | 'night';

export const LOOKS: Record<Lighting, StageLook> = {
  day: { night: 0, sun: 0xfff2dc, sunDir: [0.45, 0.8, 0.4], key: 0xfff2dc, keyI: 2.7, rimI: 1.0, hemiI: 1.2, top: 0x0a2e33, low: 0x2c6f6c, bloom: 0.5, zenith: 0x5fb0ff, horizon: 0xcfeaff },
  dusk: { night: 0.45, sun: 0xffb27a, sunDir: [0.7, 0.28, 0.2], key: 0xffb27a, keyI: 2.2, rimI: 1.3, hemiI: 0.75, top: 0x161a33, low: 0x5a4256, bloom: 0.75, zenith: 0x4a5a9a, horizon: 0xffb48a },
  night: { night: 1, sun: 0x9ab8ff, sunDir: [0.3, 0.7, 0.3], key: 0x8fb0ff, keyI: 0.55, rimI: 0.9, hemiI: 0.35, top: 0x02060c, low: 0x0b2238, bloom: 1.0, zenith: 0x0b1530, horizon: 0x1c2f4a },
};

const COLOURS = ['sun', 'key', 'top', 'low', 'zenith', 'horizon'] as const;
const NUMBERS = ['night', 'keyI', 'rimI', 'hemiI', 'bloom'] as const;
const _a = new Color();
const _b = new Color();

/** A look between `a` and `b` (`t` in [0, 1]), into `out`: a night grading to dawn. */
export function mixLook(a: StageLook, b: StageLook, t: number, out: StageLook = { ...a, sunDir: [...a.sunDir] }): StageLook {
  const k = Math.min(1, Math.max(0, t));
  for (const n of NUMBERS) out[n] = a[n] + (b[n] - a[n]) * k;
  for (const c of COLOURS) out[c] = _a.setHex(a[c]).lerp(_b.setHex(b[c]), k).getHex();
  for (let i = 0; i < 3; i++) out.sunDir[i] = a.sunDir[i]! + (b.sunDir[i]! - a.sunDir[i]!) * k;
  return out;
}

/** Uniforms a stage overrides while it draws, restored after. */
const SAVED = ['night', 'lateNight', 'grid', 'overlay', 'storm', 'heat', 'algae', 'rain', 'seasonAmount', 'pollen', 'bloom', 'gradeSat', 'gradeCon', 'vignette', 'cloudShadow'] as const;
const SAVED_V = ['sunDir', 'zenith', 'horizon', 'sunColor', 'gradeLift', 'gradeGain', 'envTint', 'eye', 'walker', 'flash'] as const;
const saved: number[] = [];
const savedV = SAVED_V.map((k) => (U[k].value as Vector3 | Color | Vector4).clone());

/** Runs `draw` with the shared uniforms at `look`'s values (no lenses, weather or season), seen from `eye`. */
export function withStageLook(look: StageLook, eye: Vector3, draw: () => void): void {
  SAVED.forEach((k, i) => (saved[i] = U[k].value as number));
  SAVED_V.forEach((k, i) => (savedV[i] as { copy(v: unknown): void }).copy(U[k].value));
  U.night.value = look.night;
  U.lateNight.value = 0;
  U.grid.value = 0;
  U.overlay.value = 0;
  U.storm.value = U.heat.value = U.algae.value = U.rain.value = 0;
  U.seasonAmount.value = 0;
  U.pollen.value = 0;
  U.bloom.value = look.bloom;
  U.gradeSat.value = 1.04;
  U.gradeCon.value = 1.04;
  U.vignette.value = 0.32;
  U.cloudShadow.value = 0;
  U.sunDir.value.set(...look.sunDir).normalize();
  U.sunColor.value.setHex(look.sun);
  U.zenith.value.setHex(look.zenith);
  U.horizon.value.setHex(look.horizon);
  U.gradeLift.value.set(0, 0, 0);
  U.gradeGain.value.set(1, 1, 1);
  U.envTint.value.setRGB(1, 1, 1);
  U.eye.value.copy(eye);
  U.walker.value.set(0, 0, 0, 0);
  U.flash.value.w = 0;
  try {
    draw();
  } finally {
    SAVED.forEach((k, i) => ((U[k] as { value: number }).value = saved[i]!));
    SAVED_V.forEach((k, i) => (U[k].value as { copy(v: unknown): void }).copy(savedV[i]));
  }
}
