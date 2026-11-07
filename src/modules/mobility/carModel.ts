import { BoxGeometry, BufferAttribute, SphereGeometry, type BufferGeometry } from 'three/webgpu';
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
