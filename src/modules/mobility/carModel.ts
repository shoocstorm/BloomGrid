import { BoxGeometry, BufferAttribute, SphereGeometry, type BufferGeometry, type MeshStandardNodeMaterial, type Node } from 'three/webgpu';
import { abs, attribute, color, dot, float, fract, fwidth, length, max, min, mix, normalGeometry, positionGeometry, positionView, sin, smoothstep, step, transformNormalToView } from 'three/tsl';
import { U } from '@/render/uniforms';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Car parts (the `aPart` vertex attribute): the street shader colours and lights each one. */
export const CAR_PART = { paint: 0, glass: 1, solar: 2, head: 3, tail: 4, skid: 5, trim: 6, leaf: 7 } as const;

/**
 * Vehicle kinds (the `aType` vertex attribute). Every kind lives in one merged geometry: the shader keeps the
 * instance's kind and collapses the others, so the mix costs no draw calls.
 */
export const CAR_TYPE = { car: 0, micro: 1, van: 2, bus: 3 } as const;
/** Cumulative shares of street traffic: compact cars, micro cars, vans; the rest are shuttle buses. */
export const CAR_MIX = [0.56, 0.78, 0.92] as const;

/** How far hulls float above the carriageway. */
export const CAR_HOVER = 0.03;

function part(src: BufferGeometry, id: number, type: number): BufferGeometry {
  // RoundedBoxGeometry is not indexed: merge everything unindexed.
  const geo = src.index ? src.toNonIndexed() : src;
  geo.deleteAttribute('uv');
  const n = geo.getAttribute('position').count;
  geo.setAttribute('aPart', new BufferAttribute(new Float32Array(n).fill(id), 1));
  geo.setAttribute('aType', new BufferAttribute(new Float32Array(n).fill(type), 1));
  return geo;
}

/** A box whose top face is pulled back by `rake` at the front (+x), in by `back` at the rear and `pinch` on z. */
function cabin(len: number, h: number, w: number, rake: number, back: number, pinch: number): BufferGeometry {
  const g = new BoxGeometry(len, h, w);
  const p = g.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) <= 0) continue;
    const x = p.getX(i);
    p.setX(i, x > 0 ? x - rake : x + back);
    p.setZ(i, p.getZ(i) * pinch);
  }
  g.computeVertexNormals();
  return g;
}

/** Light bars at the nose and tail, a dark sill and two hover skids: what every kind shares. */
function running(len: number, w: number, lightY: number, type: number): BufferGeometry[] {
  return [
    part(new BoxGeometry(0.012, 0.011, w * 0.8).translate(len / 2 - 0.003, lightY, 0), CAR_PART.head, type),
    part(new BoxGeometry(0.012, 0.013, w * 0.86).translate(-len / 2 + 0.003, lightY + 0.002, 0), CAR_PART.tail, type),
    part(new BoxGeometry(len - 0.03, 0.012, w + 0.004).translate(0, 0.02, 0), CAR_PART.trim, type),
    part(new BoxGeometry(len * 0.75, 0.01, 0.026).translate(0, 0.006, w * 0.33), CAR_PART.skid, type),
    part(new BoxGeometry(len * 0.75, 0.01, 0.026).translate(0, 0.006, -w * 0.33), CAR_PART.skid, type),
  ];
}

/** Compact hover-car: rounded hull, glass cabin with a raked windscreen, a roof rim round a solar panel. */
function car(): BufferGeometry[] {
  const T = CAR_TYPE.car;
  const len = 0.32;
  const roofTop = 0.13;
  return [
    part(new RoundedBoxGeometry(len, 0.062, 0.158, 1, 0.024).translate(0, 0.043, 0), CAR_PART.paint, T),
    part(cabin(0.18, 0.056, 0.136, 0.05, 0.022, 0.84).translate(-0.012, 0.102, 0), CAR_PART.glass, T),
    part(new BoxGeometry(0.118, 0.008, 0.118).translate(-0.022, roofTop + 0.001, 0), CAR_PART.paint, T),
    part(new BoxGeometry(0.09, 0.006, 0.096).translate(-0.024, roofTop + 0.006, 0), CAR_PART.solar, T),
    ...running(len, 0.158, 0.058, T),
  ];
}

/** Micro bubble-car: a short two-seater, a glass dome over a low tub. */
function micro(): BufferGeometry[] {
  const T = CAR_TYPE.micro;
  const len = 0.21;
  return [
    part(new RoundedBoxGeometry(len, 0.05, 0.13, 1, 0.022).translate(0, 0.037, 0), CAR_PART.paint, T),
    part(
      new SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.15, 0.17, 0.112).translate(-0.008, 0.06, 0),
      CAR_PART.glass,
      T,
    ),
    ...running(len, 0.13, 0.048, T),
  ];
}

/** Delivery van: a short cab with a steep windscreen and a cargo box with a planted green roof. */
function van(): BufferGeometry[] {
  const T = CAR_TYPE.van;
  const len = 0.38;
  return [
    part(new RoundedBoxGeometry(len, 0.06, 0.17, 1, 0.02).translate(0, 0.042, 0), CAR_PART.paint, T),
    part(cabin(0.1, 0.07, 0.15, 0.03, 0, 0.92).translate(0.11, 0.107, 0), CAR_PART.glass, T),
    part(new BoxGeometry(0.075, 0.008, 0.14).translate(0.095, 0.146, 0), CAR_PART.paint, T),
    part(new RoundedBoxGeometry(0.25, 0.12, 0.172, 1, 0.012).translate(-0.058, 0.132, 0), CAR_PART.paint, T),
    part(new BoxGeometry(0.22, 0.014, 0.146).translate(-0.058, 0.196, 0), CAR_PART.leaf, T),
    ...running(len, 0.17, 0.055, T),
  ];
}

/** Solar shuttle bus: a long hull, a continuous window band and a full-length solar roof. */
function bus(): BufferGeometry[] {
  const T = CAR_TYPE.bus;
  const len = 0.6;
  return [
    part(new RoundedBoxGeometry(len, 0.07, 0.19, 1, 0.026).translate(0, 0.047, 0), CAR_PART.paint, T),
    part(cabin(len - 0.03, 0.07, 0.18, 0.025, 0.006, 0.97).translate(0, 0.117, 0), CAR_PART.glass, T),
    part(new RoundedBoxGeometry(len - 0.02, 0.016, 0.19, 1, 0.007).translate(-0.004, 0.156, 0), CAR_PART.paint, T),
    part(new BoxGeometry(len - 0.12, 0.006, 0.15).translate(-0.02, 0.166, 0), CAR_PART.solar, T),
    ...running(len, 0.19, 0.064, T),
  ];
}

/**
 * The street's hover vehicles (D-134), nose toward +x on y = 0 (skids float `CAR_HOVER` up): compact cars, micro
 * bubble-cars, delivery vans and solar shuttle buses in one geometry (`aType`, see `CAR_TYPE`).
 */
export function carGeometry(): BufferGeometry {
  return mergeGeometries([...car(), ...micro(), ...van(), ...bus()])!;
}

/**
 * A hover vehicle's paint, glass, solar roof, lights and night glow on `am` (D-096, D-134): `seed` picks its pastel,
 * `kind` its type (`CAR_TYPE`: buses wear transit teal, vans a cream cargo box), `cong` (0..1.5) tints its lights as
 * lanes jam, and `turn` rotates local vectors to its heading. The street shader and the model gallery share it.
 */
export function carSurface(
  am: MeshStandardNodeMaterial,
  seed: Node<'float'>,
  kind: Node<'float'>,
  cong: Node<'float'>,
  turn: (v: Node<'vec3'>) => Node<'vec3'>,
): void {
  const isPart = (id: number) => step(abs(attribute('aPart', 'float').sub(id)), 0.5);
  // Warm headlights (distinct from the cyan guidelines) turning amber, then coral, as lanes jam.
  const tint = mix(mix(color(0xfff1c9), color(0xffb347), smoothstep(0.5, 1.0, cong)), color(0xff5f6d), smoothstep(1.0, 1.5, cong));
  // A pastel body per car (D-096), smoked glass, a dark solar roof with gold busbars, dark sill and skids.
  const pick = fract(seed.mul(17.31)).mul(6).floor();
  const paint = mix(
    mix(mix(color(0xf4f1e8), color(0x7fd1c7), step(0.5, pick)), mix(color(0xffc58a), color(0x9ec5ff), step(2.5, pick)), step(1.5, pick)),
    mix(color(0xf7d36b), color(0xe79bb4), step(4.5, pick)),
    step(3.5, pick),
  );
  const glass = isPart(CAR_PART.glass);
  const solar = isPart(CAR_PART.solar);
  const head = isPart(CAR_PART.head);
  const tail = isPart(CAR_PART.tail);
  const skid = isPart(CAR_PART.skid);
  const trim = isPart(CAR_PART.trim);
  const leaf = isPart(CAR_PART.leaf);
  // Liveries: shuttle buses wear the transit teal, vans a cream cargo box over their own colour.
  const isBus = step(CAR_TYPE.bus - 0.5, kind);
  const isVan = step(CAR_TYPE.van - 0.5, kind).mul(float(1).sub(isBus));
  const cargo = isVan.mul(step(0.075, positionGeometry.y)).mul(step(positionGeometry.x, 0.06));
  const livery = mix(mix(paint, color(0xf2ecdc), cargo), color(0x2fa39a), isBus);
  const g = positionGeometry;
  const busbar = smoothstep(0.0016, 0.0006, abs(fract(g.z.mul(32).add(0.5)).sub(0.5)).div(32)).mul(solar);
  const fresnel = float(1).sub(max(dot(transformNormalToView(turn(normalGeometry)).normalize(), positionView.normalize().negate()), 0)).pow(3);
  const pane = mix(color(0x16232a), mix(U.horizon, U.zenith, 0.5), fresnel.mul(0.45).add(0.05));
  let body = mix(livery, pane, glass);
  body = mix(body, mix(color(0x23305e), color(0xd6b25a), busbar), solar);
  body = mix(body, color(0x2b3136), trim.add(skid).min(1));
  body = mix(body, color(0xfff6e0), head);
  body = mix(body, color(0xb3202e), tail);
  const sprig = sin(positionGeometry.z.mul(150)).mul(0.5).add(0.5);
  body = mix(body, mix(color(0x4f8f3a), color(0x7fbf4a), sprig), leaf);
  // Up close the parts read; once a car is a few pixels across its detail would shimmer, so it turns into a
  // single soft swatch of its traffic tint at night, as before (D-064).
  const pxw = length(fwidth(positionGeometry));
  const near = smoothstep(0.05, 0.022, pxw);
  const cover = min(float(1), float(0.08).div(max(pxw, float(1e-5))));
  am.colorNode = mix(mix(livery, tint, U.night.mul(0.6)), body, near);
  am.roughnessNode = mix(float(0.35), float(0.08), glass.add(solar).min(1).mul(near));
  // Lights: the nose bar and the skids carry the traffic tint, tail bars glow red, cabins warm after dark.
  const lights = tint
    .mul(head.mul(2.2).add(skid.mul(0.9)))
    .mul(U.night.mul(1.4).add(0.25))
    .add(color(0xff3b3b).mul(tail).mul(U.night.mul(1.6).add(0.35)))
    .add(color(0xffb45e).mul(glass).mul(U.night.mul(0.25)));
  am.emissiveNode = mix(tint.mul(U.night.mul(1.6).add(0.05)), lights, near).mul(cover);
}
