import { BoxGeometry, BufferAttribute, CylinderGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Drone parts (`aPart`): the police shader colours, lights and spins each one (D-137). */
export const DRONE_PART = { body: 0, trim: 1, eye: 2, red: 3, blue: 4, blade: 5, duct: 6, lamp: 7, skid: 8 } as const;

/** Rotor hubs (local x, z), at the ends of the diagonal arms. */
const HUBS: [number, number][] = [
  [0.3, 0.3],
  [0.3, -0.3],
  [-0.3, 0.3],
  [-0.3, -0.3],
];
const HUB_Y = 0.035;

function part(src: BufferGeometry, id: number, hub: [number, number, number] = [0, 0, 0]): BufferGeometry {
  const geo = src.index ? src.toNonIndexed() : src;
  geo.deleteAttribute('uv');
  const n = geo.getAttribute('position').count;
  geo.setAttribute('aPart', new BufferAttribute(new Float32Array(n).fill(id), 1));
  const h = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) h.set(hub, i * 3);
  geo.setAttribute('aHub', new BufferAttribute(h, 3));
  return geo;
}

/**
 * A police quadcopter (D-137), about a tile across, nose toward +x, skids on y = 0: a sleek white-and-navy shell with a
 * glowing sensor eye under the nose, a red/blue light bar on top, a tail fin, four ducted rotors on swept arms and
 * landing skids. The heavy drone on the Harmony Gate is the same model at a larger scale.
 */
export function droneGeometry(): BufferGeometry {
  const Y = 0.16; // body centre above the skids
  const parts: BufferGeometry[] = [
    // Shell: a long, flattened teardrop, white above a navy belly (the shader splits it by height).
    part(new SphereGeometry(0.5, 20, 12).scale(0.62, 0.17, 0.34).translate(0.02, Y, 0), DRONE_PART.body),
    // Canopy ridge and tail fin in navy.
    part(new SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.3, 0.09, 0.2).translate(-0.02, Y + 0.05, 0), DRONE_PART.trim),
    part(new BoxGeometry(0.14, 0.1, 0.016).translate(-0.27, Y + 0.08, 0), DRONE_PART.trim),
    // Sensor eye under the nose, and a white headlamp strip.
    part(new SphereGeometry(0.06, 12, 8).translate(0.2, Y - 0.07, 0), DRONE_PART.eye),
    part(new BoxGeometry(0.012, 0.018, 0.16).translate(0.32, Y + 0.005, 0), DRONE_PART.lamp),
    // Light bar on the canopy: red to port (+z), blue to starboard.
    part(new BoxGeometry(0.07, 0.03, 0.075).translate(-0.02, Y + 0.105, 0.042), DRONE_PART.red),
    part(new BoxGeometry(0.07, 0.03, 0.075).translate(-0.02, Y + 0.105, -0.042), DRONE_PART.blue),
    // Landing skids on two struts each.
    ...[-1, 1].flatMap((s) => [
      part(new BoxGeometry(0.46, 0.018, 0.022).translate(0, 0.01, s * 0.13), DRONE_PART.skid),
      part(new BoxGeometry(0.02, Y - 0.06, 0.02).translate(0.1, (Y - 0.06) / 2, s * 0.12), DRONE_PART.skid),
      part(new BoxGeometry(0.02, Y - 0.06, 0.02).translate(-0.1, (Y - 0.06) / 2, s * 0.12), DRONE_PART.skid),
    ]),
  ];
  for (const [hx, hz] of HUBS) {
    const len = Math.hypot(hx, hz);
    const yaw = Math.atan2(-hz, hx);
    // A swept arm from the body to the duct, a duct ring with a light rim, a hub cap and two crossed blades.
    parts.push(part(new BoxGeometry(len, 0.03, 0.05).translate(len / 2, 0, 0).rotateY(yaw).translate(0, Y + 0.01, 0), DRONE_PART.trim));
    parts.push(part(new TorusGeometry(0.15, 0.024, 6, 24).rotateX(Math.PI / 2).translate(hx, Y + HUB_Y, hz), DRONE_PART.duct));
    parts.push(part(new CylinderGeometry(0.03, 0.03, 0.04, 10).translate(hx, Y + HUB_Y, hz), DRONE_PART.trim));
    const hub: [number, number, number] = [hx, Y + HUB_Y, hz];
    for (const r of [0, Math.PI / 2]) parts.push(part(new BoxGeometry(0.27, 0.006, 0.036).rotateY(r).translate(hx, Y + HUB_Y + 0.012, hz), DRONE_PART.blade, hub));
  }
  return mergeGeometries(parts)!;
}
