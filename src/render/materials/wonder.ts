import { MeshStandardNodeMaterial, type Node } from 'three/webgpu';
import {
  abs,
  attribute,
  clamp,
  dot,
  float,
  fwidth,
  length,
  mix,
  mx_noise_float,
  normalView,
  normalWorld,
  positionViewDirection,
  positionWorld,
  sin,
  smoothstep,
  step,
  vec3,
} from 'three/tsl';
import { U } from '../uniforms';

/**
 * Surface kinds for the sea wonders' merged meshes (D-146), carried per vertex in `aSurf` = (roughness, metalness,
 * kind, 0). Kept in step with `SURF` in `modules/scenery/wonderKit.ts`.
 */
export const SURF_KIND = {
  plain: 0,
  stone: 1,
  pearl: 2,
  glass: 3,
  leaf: 4,
  sand: 5,
  wood: 6,
  water: 7,
} as const;

/**
 * The sea wonders' material (D-146): per-vertex colour, glow and surface. Each kind adds a little life the flat
 * colour lacks: stone gets mottling, strata and a dark wet waterline; pearl an iridescent sheen at grazing angles;
 * glass a sky-tinted rim; leaves and sand a soft mottle; wood a grain; water (falls) a slow downward flow. Every
 * pattern fades to its mean once its features are under a few pixels (`fwidth`), so nothing crawls or flashes as
 * the camera moves (D-064/D-070).
 */
export function wonderMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0.05 });
  const c = attribute('color', 'vec3');
  const s = attribute('aSurf', 'vec4');
  const kind = s.z;
  const is = (k: number) => float(1).sub(step(0.5, abs(kind.sub(k))));
  const p = positionWorld;
  const px = length(fwidth(p));
  /** 1 while features of `freq` per unit are several pixels wide, fading to 0 as they shrink to one. */
  const near = (freq: number) => smoothstep(0.45, 0.12, px.mul(freq));
  const n1 = mx_noise_float(p.mul(0.35));
  const n2 = mx_noise_float(p.mul(1.4));
  const n3 = mx_noise_float(p.mul(4.5));

  // Stone: broad mottling, finer grit, horizontal strata, and darker, wet rock near the waterline.
  const strata = sin(p.y.mul(2.1).add(n1.mul(3)))
    .mul(0.07)
    .mul(near(0.7));
  const wet = mix(float(0.62), float(1), smoothstep(-0.2, 1.6, p.y.sub(U.waterLevel)));
  const stone = float(1)
    .add(n1.mul(0.16))
    .add(n2.mul(0.09).mul(near(1.4)))
    .add(n3.mul(0.05).mul(near(4.5)))
    .add(strata)
    .mul(wet);
  // Leaves: clumps of lighter and darker green.
  const leaf = float(1)
    .add(n2.mul(0.2).mul(near(1.4)))
    .add(n1.mul(0.12));
  const sand = float(1)
    .add(n3.mul(0.07).mul(near(4.5)))
    .add(n1.mul(0.05));
  const wood = float(1).add(
    sin(p.x.add(p.z).mul(3.2).add(n2.mul(4)))
      .mul(0.07)
      .mul(near(1)),
  );
  // Falling water: soft bands sliding down.
  const flow = float(0.9).add(
    sin(p.y.mul(1.3).add(U.clock.mul(5)).add(n1.mul(5)))
      .mul(0.12)
      .mul(near(0.4)),
  );
  const shade = float(1)
    .add(is(1).mul(stone.sub(1)))
    .add(is(4).mul(leaf.sub(1)))
    .add(is(5).mul(sand.sub(1)))
    .add(is(6).mul(wood.sub(1)))
    .add(is(7).mul(flow.sub(1)));
  let col = c.mul(shade) as Node<'vec3'>;

  // Grazing-angle terms for pearl and glass.
  const fres = float(1).sub(clamp(dot(normalView, positionViewDirection), 0, 1));
  const f2 = fres.mul(fres);
  const hue = fres.mul(6).add(p.y.mul(0.12)).add(n1.mul(1.5));
  const irid = vec3(sin(hue), sin(hue.add(2.1)), sin(hue.add(4.2)))
    .mul(0.5)
    .add(0.5);
  const pearl = mix(col, col.mul(irid.mul(0.55).add(0.6)), f2.mul(0.7).add(0.12));
  col = mix(col, pearl, is(2)) as Node<'vec3'>;
  // Glass: deeper through the middle, the sky's colour along the rim.
  const sky = mix(U.horizon, U.zenith, clamp(normalWorld.y, 0, 1)) as unknown as Node<'vec3'>;
  const glass = mix(col.mul(0.7), sky.mul(1.1), f2.mul(0.65));
  col = mix(col, glass, is(3)) as Node<'vec3'>;

  m.colorNode = col;
  m.roughnessNode = s.x;
  m.metalnessNode = s.y;
  m.emissiveNode = c.mul(attribute('aGlow', 'float')).mul(U.night.mul(0.9).add(0.12));
  return m;
}
