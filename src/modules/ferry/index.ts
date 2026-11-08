import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  NormalBlending,
  SRGBColorSpace,
  Vector3,
} from 'three/webgpu';
import {
  abs,
  atan,
  attribute,
  color,
  cos,
  float,
  floor,
  fract,
  fwidth,
  length,
  max,
  min,
  mix,
  mrt,
  normalGeometry,
  positionGeometry,
  sign,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { GameModule } from '@/game/context';
import { U } from '@/render/uniforms';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { wonderVisible } from '@/sim/wonders';
import { registerPickable } from '@/modules/construction/pick';
import { WONDER_SITES } from '@/modules/scenery/sites';
import { FERRY, FERRY_PART, ferryGeometry, pierGeometry } from './ferryModel';
import './ferry.css';
import {
  BERTH_ALONG,
  BERTH_SIDE,
  PIER_LEN,
  findPier,
  pierPoint,
  seaMap,
  voyageCourse,
  type Course,
  type P2,
  type Pier,
  type SeaMap,
} from './route';

/**
 * The cruise ferry *Tidesong* (D-141): a multi-deck solar-sail cruise ferry that runs a timetable from Tidesong Pier
 * on the south bay out to the sea wonders and back, one wonder per voyage, with a sightseeing loop round it. At the
 * pier it boards for half a minute, backs off the berth, turns in the basin and sails a water-only course
 * (`route.ts`); it slows for the loop and eases into the berth again.
 *
 * Click it (or its pier) for its inspector: the voyage, timetable and facilities, and the steward's requests to the
 * captain: **Depart now** while boarding, **Full ahead** under way (a hydrofoil burst to the end of the voyage),
 * **Charter** the next voyage to any risen wonder, a **Deck show** (the lamps, the hull's waterline glow and the sky
 * wheel cycle colours), the **Horn**, **Ride aboard** (an explore ride on the sun deck) and **Locate**.
 *
 * Render-only like the police drones: no sim state, nothing saved (a reload starts the timetable afresh). The ship
 * is one merged mesh posed by its object matrix (no buffer uploads); the wheel spins and the tourists bob in the
 * shader. Three draw calls: ship, wake (under way), pier.
 */

const NAME = 'Tidesong';
const PIER_NAME = 'Tidesong Pier';
/**
 * Where the pier should go: the Bloomtopia islet's east shore on the south bay, outside the Aeroline's loop (its
 * pylons fence the bay off). Anywhere else, the nearest coast with room; further out if none.
 */
const PREFER: P2 = [296, 436];
/** Speeds (tiles/s): cruising, round a wonder, backing off the berth; Full ahead's factor; acceleration. */
const CRUISE = 8;
const SIGHT = 3.5;
const ASTERN = 1.5;
const FULL = 2;
const ACCEL = 0.8;
/** Seconds boarding at the pier and turning in the basin; Deck show length. */
const BOARD = 30;
const TURN = 14;
const SHOW = 45;
/** Shown speed in knots per tile/s (cruising reads 22 kn, Full ahead 44). */
const KNOTS = 2.75;

type Site = { key: keyof typeof WONDER_SITES; name: string; r: number; at: (S: number) => P2 };
const site = (key: Exclude<keyof typeof WONDER_SITES, 'whales'>, name: string, r: number): Site => ({
  key,
  name,
  r,
  at: (S) => [WONDER_SITES[key][0] * S, WONDER_SITES[key][1] * S],
});
/** Voyage destinations in timetable order, with the sightseeing loop's radius round each. */
const SITES: Site[] = [
  site('lotus', 'Lotus Atoll', 30),
  site('dome', 'Abyssal Dome', 30),
  site('lighthouse', 'Tidewatch Lighthouse', 26),
  site('tideGates', 'Tide Gates', 32),
  {
    key: 'whales',
    name: 'Whale pod',
    r: 30,
    at: (S) => [WONDER_SITES.whales[0][0] * S, WONDER_SITES.whales[0][1] * S],
  },
  site('stacks', 'Verdant Pillars', 22),
];

type Phase = 'board' | 'astern' | 'turn' | 'sail';
const PHASE_NAMES: Record<Phase, string> = {
  board: 'Boarding',
  astern: 'Leaving the berth',
  turn: 'Turning in the basin',
  sail: 'Under way',
};

export interface FerryService {
  /** Whether the ferry is sailing (a wonder has risen and the coast has room for its pier). */
  readonly active: boolean;
  /** The ride camera on the sun deck: eye and a point ahead (explore mode `ferry`). */
  ride(eye: Vector3, ahead: Vector3): boolean;
  /** Where it is now (x, z). */
  readonly position: Readonly<Vector3>;
  /** Opens its inspector. */
  inspect(): void;
  /** For scripts: skip the dwell, Full ahead, charter, show. */
  departNow(): void;
  fullAhead(on?: boolean): void;
  charter(key: string): boolean;
  deckShow(): void;
  /** For scripts: sails the timetable on by `seconds` at once. */
  advance(seconds: number): void;
}

declare module '@/core/Services' {
  interface GameServices {
    ferry: FerryService;
  }
}
declare module '@/core/EventBus' {
  interface GameEvents {
    /** The ferry's horn (audio), at its position. */
    'ferry:horn': { x: number; z: number };
  }
}

/** The name boards on both sides of the hull: the ship's name over its line, with a bloom mark. */
function nameTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1536;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  // A six-petal bloom mark.
  g.save();
  g.translate(120, 128);
  for (let k = 0; k < 6; k++) {
    g.rotate(Math.PI / 3);
    g.fillStyle = k % 2 ? '#f2c14e' : '#3fe0b0';
    g.beginPath();
    g.ellipse(0, -42, 20, 42, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(0, 0, 18, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.fillStyle = '#ffffff';
  g.font = '800 150px system-ui, -apple-system, "Segoe UI", sans-serif';
  g.textBaseline = 'middle';
  g.fillText(NAME.toUpperCase(), 236, 104);
  g.fillStyle = '#f2c14e';
  g.font = '700 40px system-ui, -apple-system, "Segoe UI", sans-serif';
  g.fillText('BLOOMGRID CRUISES  ·  PORT BLOOM', 236, 208);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const ferryModule: GameModule = {
  id: 'ferry',
  deps: ['world', 'construction', 'hud', 'scenery'],
  init(ctx) {
    const { city, bus } = ctx;
    const S = city.size;

    // ── The ship ─────────────────────────────────────────────────────────────────────────────────────────────
    const show = uniform(0);
    const wake = uniform(0);
    const geo = ferryGeometry();
    const mat = new MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.1, side: DoubleSide });
    {
      const partId = attribute('aPart', 'float');
      const is = (id: number) => step(abs(partId.sub(id)), 0.5);
      const p = positionGeometry;
      // The sky wheel turns slowly about its hub (gondolas are balls, so they read as hanging level).
      const hub = attribute('aHub', 'vec3');
      const a = U.clock.mul(0.3);
      const rel = p.sub(hub);
      const spun = hub.add(
        vec3(rel.x.mul(cos(a)).sub(rel.y.mul(sin(a))), rel.x.mul(sin(a)).add(rel.y.mul(cos(a))), rel.z),
      );
      const turning = is(FERRY_PART.wheel).add(is(FERRY_PART.gondola));
      // Tourists shift their weight a little (ambient motion stays subtle).
      const tourist = is(FERRY_PART.tourist);
      const bob = sin(U.clock.mul(1.7).add(hub.x.mul(9)).add(hub.z.mul(5)))
        .mul(0.006)
        .mul(tourist);
      mat.positionNode = mix(p, spun, turning).add(vec3(0, bob, 0));

      const night = U.night;
      // Lights under a few pixels dim to their share of a pixel (D-064).
      const cover = min(float(1), float(0.03).div(max(length(fwidth(p)), float(1e-5))));
      // Deck show: a rainbow running along the ship.
      const rainbow = vec3(0.5).add(
        vec3(0.5).mul(cos(vec3(0, 2.1, 4.2).add(U.clock.mul(1.6)).sub(p.x.mul(0.35)))),
      );
      const y = p.y;
      // Hull: navy over a dark antifouling, a gold bloom stripe, white bulwark, portholes, a waterline glow.
      const hullCol = mix(
        mix(color(0x0e2a36), color(0x173a52), smoothstep(-0.05, 0.05, y)),
        color(0xf1f3ee),
        smoothstep(0.63, 0.66, y),
      );
      const stripe = smoothstep(0.03, 0.01, abs(y.sub(0.55)));
      const port = step(abs(y.sub(0.77)), 0.045).mul(step(fract(p.x.mul(1.6)), 0.3));
      const glowLine = smoothstep(0.035, 0.0, abs(y.sub(0.06)));
      const hull = mix(mix(hullCol, color(0xe8b84a), stripe), color(0x2a3a40), port);
      // Deck houses: white walls with a window band each storey (mullions every 0.45), lit at night.
      const f = fract(y.sub(FERRY.main).div(FERRY.storey));
      const side = step(abs(normalGeometry.y), 0.5);
      const band = step(0.3, f).mul(step(f, 0.78)).mul(side);
      const mull = step(fract(p.x.div(0.45).add(p.z.mul(0.3))), 0.12);
      const pane = band.mul(float(1).sub(mull));
      const deck = mix(color(0xf4f5f2), color(0x1f4a58), pane);
      // Some windows dark: a hash per pane.
      const cell = vec2(floor(p.x.div(0.45)), floor(y.div(FERRY.storey)).add(sign(p.z)));
      const lit = step(0.3, fract(sin(cell.x.mul(12.9898).add(cell.y.mul(78.233))).mul(43758.5)));
      // Helideck: green with a yellow ring and a white H.
      const q = vec2(p.x.sub(FERRY.pad[0]), p.z);
      const r = length(q);
      const ring = smoothstep(0.05, 0.02, abs(r.sub(0.88)));
      const H = step(abs(q.y), 0.3)
        .mul(step(abs(abs(q.x).sub(0.22)), 0.05))
        .add(step(abs(q.x), 0.22).mul(step(abs(q.y), 0.05)))
        .min(1);
      const top = step(0.5, normalGeometry.y);
      const pad = mix(mix(color(0x2c5a48), color(0xf2c14e), ring.mul(top)), color(0xffffff), H.mul(top));
      // Solar wing-sails: sea-green petals with gold busbars.
      const sail = mix(color(0x2a8f78), color(0xd7a640), step(fract(y.mul(2.4)), 0.08));
      // Gondolas and tourists: a candy palette by position.
      // Gondolas by their slot round the wheel, tourists by where they stand: one colour each.
      const slot = floor(atan(rel.y, rel.x).div(Math.PI / 6).add(0.5));
      const hsh = fract(sin(mix(slot.mul(1.7), hub.x.mul(41.3).add(hub.z.mul(17.1)), tourist)).mul(9631.7));
      const candy = vec3(0.5).add(vec3(0.5).mul(cos(vec3(0, 2.1, 4.2).add(hsh.mul(6.283)))));
      const slide = mix(color(0xffc93c), color(0xff6a3d), step(0.5, fract(y.mul(3))));
      const pool = color(0x2fd6e6).add(sin(U.clock.mul(2).add(p.x.mul(8)).add(p.z.mul(6))).mul(0.06));

      let col = hull.mul(is(FERRY_PART.hull));
      col = col.add(deck.mul(is(FERRY_PART.deck)));
      col = col.add(color(0xf4f5f2).mul(is(FERRY_PART.white).add(is(FERRY_PART.rail))));
      col = col.add(color(0x1d4b5a).mul(is(FERRY_PART.glass)));
      col = col.add(color(0x8fe9e2).mul(is(FERRY_PART.dome)));
      col = col.add(pool.mul(is(FERRY_PART.pool)));
      col = col.add(slide.mul(is(FERRY_PART.slide)));
      col = col.add(sail.mul(is(FERRY_PART.sail)));
      col = col.add(color(0xeef2f0).mul(is(FERRY_PART.wheel)));
      col = col.add(candy.mul(is(FERRY_PART.gondola).add(is(FERRY_PART.tourist))));
      col = col.add(color(0xff7a2f).mul(is(FERRY_PART.lifeboat)));
      col = col.add(color(0xfff1c9).mul(is(FERRY_PART.lamp)));
      col = col.add(pad.mul(is(FERRY_PART.pad)));
      col = col.add(color(0x4ea85a).mul(is(FERRY_PART.leaf)));
      col = col.add(color(0x6b4f3a).mul(is(FERRY_PART.trunk)));
      col = col.add(color(0xb58a5a).mul(is(FERRY_PART.timber)));
      col = col.add(color(0xff2a3d).mul(is(FERRY_PART.navRed)));
      col = col.add(color(0x2bff8a).mul(is(FERRY_PART.navGreen)));

      const warm = color(0xffd9a0);
      const lampCol = mix(color(0xfff1c9), rainbow, show);
      const glow = warm
        .mul(
          pane
            .mul(lit)
            .mul(is(FERRY_PART.deck))
            .mul(0.9)
            .add(is(FERRY_PART.glass).mul(0.8))
            .add(port.mul(is(FERRY_PART.hull)).mul(0.9)),
        )
        .mul(night)
        .add(color(0x5ff4e0).mul(is(FERRY_PART.dome).mul(night.mul(0.7).add(0.05))))
        .add(color(0x40e6ff).mul(is(FERRY_PART.pool).mul(night.mul(0.9).add(0.08))))
        .add(lampCol.mul(is(FERRY_PART.lamp).mul(night.mul(1.6).add(0.2).add(show.mul(1.5)))))
        .add(
          mix(color(0x2bffc0), rainbow, show).mul(
            glowLine.mul(is(FERRY_PART.hull)).mul(night.mul(1.2).add(show.mul(1.5))),
          ),
        )
        .add(rainbow.mul(is(FERRY_PART.wheel).mul(show.mul(1.4).add(night.mul(0.5)))))
        .add(candy.mul(is(FERRY_PART.gondola).mul(night.mul(0.4))))
        .add(color(0xff2a3d).mul(is(FERRY_PART.navRed).mul(night.mul(2).add(0.4))))
        .add(color(0x2bff8a).mul(is(FERRY_PART.navGreen).mul(night.mul(2).add(0.4))))
        .add(color(0x2a8f78).mul(is(FERRY_PART.sail).mul(night.mul(0.25))));
      // Name boards (D-141): the ship's name from its texture, cut out by its alpha, glowing softly at night.
      const name = texture(nameTexture(), uv());
      const isName = is(FERRY_PART.name);
      mat.colorNode = col.add(name.rgb.mul(isName));
      mat.opacityNode = mix(float(1), name.a, isName);
      mat.alphaTest = 0.5;
      mat.emissiveNode = glow.mul(cover.mul(0.6).add(0.4)).add(name.rgb.mul(isName).mul(night.mul(0.5)));
    }
    const ship = new Mesh(geo, mat);
    ship.castShadow = false;
    ship.receiveShadow = true;
    ship.name = 'ferry.ship';

    // Wake: a V of churned foam spreading behind the stern, stronger with speed.
    const wakeGeo = new BufferGeometry();
    {
      const NU = 40;
      const NW = 10;
      const pos: number[] = [];
      const uvs: number[] = [];
      for (let i = 0; i < NU; i++)
        for (let j = 0; j < NW; j++) {
          const quad = [
            [i, j],
            [i + 1, j],
            [i, j + 1],
            [i + 1, j],
            [i + 1, j + 1],
            [i, j + 1],
          ];
          for (const [a, b] of quad) {
            const u = a! / NU;
            const w = (b! / NW) * 2 - 1;
            pos.push(-FERRY.length / 2 + 1 - u * 46, 0.03, w * (2 + u * 13));
            uvs.push(u, w);
          }
        }
      wakeGeo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      wakeGeo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    }
    const wakeMat = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      side: DoubleSide,
    });
    {
      const u = uv().x;
      const w = uv().y;
      const edge = smoothstep(0.2, 0.0, abs(abs(w).sub(0.85)));
      const churn = sin(u.mul(60).sub(U.clock.mul(7)).add(w.mul(9)))
        .mul(sin(u.mul(37).add(w.mul(15)).add(U.clock.mul(3))))
        .mul(0.5)
        .add(0.5);
      // Broken foam, not a clean band: the edges break up with the churn, the centre is the propeller wash.
      const centre = smoothstep(0.5, 0.0, abs(w)).mul(smoothstep(0.3, 0.85, churn));
      const fade = float(1)
        .sub(u)
        .pow(2.2)
        .mul(smoothstep(0, 0.04, u));
      const op = edge
        .mul(smoothstep(0.2, 0.7, churn))
        .mul(0.4)
        .add(centre.mul(0.55))
        .mul(fade)
        .mul(wake)
        .mul(0.5)
        .min(1);
      wakeMat.colorNode = color(0xeefcfa);
      wakeMat.opacityNode = op;
      wakeMat.mrtNode = mrt({ emissive: vec4(0, 0, 0, op) });
    }
    const wakeMesh = new Mesh(wakeGeo, wakeMat);
    wakeMesh.name = 'ferry.wake';
    wakeMesh.renderOrder = 7;

    const vessel = new Group();
    vessel.name = 'ferry';
    vessel.add(ship, wakeMesh);
    // The pier (static): placed once the coast is known.
    const pierMesh = new Mesh(new BufferGeometry(), mat);
    pierMesh.name = 'ferry.pier';
    pierMesh.receiveShadow = true;
    pierMesh.visible = false;
    ctx.scene.add(vessel, pierMesh);
    registerPickable({
      object: 'ferry',
      node: ship,
      box: new Box3(new Vector3(-11, -0.7, -2.2), new Vector3(11, FERRY.sun + 2.6, 2.2)),
    });
    registerPickable({
      object: 'ferry',
      node: pierMesh,
      box: new Box3(new Vector3(0, -0.5, -1), new Vector3(PIER_LEN, 1.2, 1)),
    });

    // ── Timetable state ──────────────────────────────────────────────────────────────────────────────────────
    let sea: SeaMap | null = null;
    let pier: Pier | null = null;
    let dirty = true;
    const courses = new Map<string, { course: Course; loop: [number, number] } | null>();
    let phase: Phase = 'board';
    let clock = 0;
    let s = 0;
    let v = 0;
    let voyageNo = 1;
    let rotation = 0;
    let charter: Site | null = null;
    let dest: Site | null = null;
    let full = false;
    let showUntil = -1;
    const pos = new Vector3();
    let heading = 0;
    let shown = false;
    const tmp: P2 = [0, 0];

    const open = () => SITES.filter((x) => wonderVisible(city, x.key));
    const pierHeading = () => (pier ? Math.atan2(-pier.dz, -pier.dx) : 0);
    const courseTo = (d: Site) => {
      if (!courses.has(d.key)) courses.set(d.key, sea && pier ? voyageCourse(sea, pier, d.at(S), d.r) : null);
      return courses.get(d.key)!;
    };
    /** The next destination: the chartered wonder, else the next risen one in timetable order the sea reaches. */
    const pickNext = (): Site | null => {
      const list = open();
      if (charter && list.includes(charter) && courseTo(charter)) {
        const c = charter;
        charter = null;
        return c;
      }
      charter = null;
      for (let k = 0; k < SITES.length; k++) {
        const d = SITES[(rotation + k) % SITES.length]!;
        if (!list.includes(d) || !courseTo(d)) continue;
        rotation = (SITES.indexOf(d) + 1) % SITES.length;
        return d;
      }
      return null;
    };
    const berth = () => pierPoint(pier!, BERTH_ALONG, BERTH_SIDE);
    /** The Aeroline's pylons, when its viaduct stands: courses and the pier keep clear of them. */
    const pylons = () => ctx.services.tryGet('aeroline')?.pylons ?? [];
    let pylonCount = 0;
    const layout = () => {
      dirty = false;
      courses.clear();
      const g = city.grid;
      const obstacles = pylons();
      pylonCount = obstacles.length;
      pier = findPier(g, PREFER, 90, obstacles) ?? findPier(g, PREFER, 260, obstacles);
      sea = pier ? seaMap(g, obstacles) : null;
      if (pier) {
        pierMesh.geometry.dispose();
        pierMesh.geometry = pierGeometry(PIER_LEN, BERTH_ALONG, pier.side);
        pierMesh.position.set(pier.x + 0.5, Math.max(0, U.waterLevel.value), pier.z + 0.5);
        pierMesh.rotation.y = Math.atan2(-pier.dz, pier.dx);
        pierMesh.updateMatrixWorld();
        ctx.services.tryGet('world')?.atmosphere.invalidateShadows();
      }
      phase = 'board';
      clock = 0;
      s = v = 0;
      dest = pier ? pickNext() : null;
      if (pier) {
        [pos.x, pos.z] = berth();
        heading = pierHeading();
      }
    };
    const refresh = () => {
      const on = !!pier && open().length > 0;
      if (on && !dest) dest = pickNext();
      shown = on && !!dest;
      vessel.visible = shown;
      pierMesh.visible = !!pier && on;
    };
    layout();
    refresh();
    for (const ev of ['city:reset', 'load:done'] as const)
      bus.on(ev, () => {
        layout();
        refresh();
      });
    bus.on('wonder:discovered', () => {
      courses.clear();
      refresh();
    });
    // A new coast or bridge changes the courses: re-plan from the next departure (the pier stays put).
    for (const ev of ['terrain:changed', 'road:changed'] as const)
      bus.on(ev, () => (sea ? (dirty = true) : undefined));

    const depart = () => {
      if (phase !== 'board' || !pier) return;
      // The Aeroline rose (or came down) since the pier was placed: place it again, clear of the viaduct.
      if (pylons().length !== pylonCount) {
        layout();
        refresh();
        if (!pier) return;
      }
      if (dirty) {
        sea = seaMap(city.grid, pylons());
        courses.clear();
        dirty = false;
      }
      if (!dest || !courseTo(dest)) dest = pickNext();
      if (!dest) return;
      phase = 'astern';
      clock = 0;
      v = 0;
    };

    /** Sails the timetable on by `dt` seconds. */
    const sail = (dt: number) => {
      if (!shown || !pier) return;
      clock += dt;
      const [bx, bz] = berth();
      if (phase === 'board') {
        [pos.x, pos.z] = [bx, bz];
        heading = pierHeading();
        v = 0;
        if (clock >= BOARD) depart();
      } else if (phase === 'astern') {
        // Backing straight off the berth along the pier, bow still to the shore.
        const d = 18;
        v = Math.min(ASTERN, v + ACCEL * 0.5 * dt, Math.sqrt(2 * ACCEL * 0.5 * Math.max(0, d - s)) + 0.1);
        s = Math.min(d, s + v * dt);
        pos.set(bx + pier.dx * s, 0, bz + pier.dz * s);
        heading = pierHeading();
        if (s >= d) {
          phase = 'turn';
          clock = 0;
          s = 0;
        }
      } else if (phase === 'turn') {
        // Bow thrusters: swing round on the spot, away from the pier.
        const k = Math.min(1, clock / TURN);
        heading = pierHeading() - pier.side * Math.PI * (k * k * (3 - 2 * k));
        v = 0;
        if (k >= 1) {
          phase = 'sail';
          s = 0;
        }
      } else {
        const plan = dest && courseTo(dest);
        if (!plan) {
          phase = 'board';
          clock = 0;
          return;
        }
        const L = plan.course.length;
        const inLoop = s >= plan.loop[0] && s <= plan.loop[1];
        let target = (inLoop ? SIGHT : CRUISE) * (full ? FULL : 1);
        // Ease into the berth: never faster than it can stop in the water left.
        target = Math.min(target, Math.sqrt(2 * ACCEL * Math.max(0, L - s)) + 0.12);
        v += Math.sign(target - v) * Math.min(Math.abs(target - v), ACCEL * (target < v ? 1.6 : 1) * dt);
        s = Math.min(L, s + v * dt);
        const want = plan.course.sample(s, tmp);
        pos.set(tmp[0], 0, tmp[1]);
        // The bow swings toward the course rather than snapping at a joint.
        let dh = want - heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        heading += dh * Math.min(1, dt * 1.6);
        if (s >= L - 0.02) {
          phase = 'board';
          clock = 0;
          s = 0;
          full = false;
          voyageNo++;
          dest = pickNext();
        }
      }
      const t = U.clock.value;
      vessel.position.set(pos.x, U.waterLevel.value + 0.02 + Math.sin(t * 0.9) * 0.025, pos.z);
      vessel.rotation.set(Math.sin(t * 0.7) * 0.012, -heading, Math.sin(t * 0.55 + 1) * 0.008, 'YXZ');
      wake.value += (Math.min(1.4, Math.abs(v) / CRUISE) - wake.value) * Math.min(1, dt * 2);
      wakeMesh.visible = wake.value > 0.01;
      show.value += ((t < showUntil ? 1 : 0) - show.value) * Math.min(1, dt * 1.5);
    };
    ctx.systems.add({ id: 'ferry.sail', phase: 'sync', update: (_c, f) => sail(Math.min(0.1, f.dt)) });

    // ── The steward's requests ───────────────────────────────────────────────────────────────────────────────
    const toast = (text: string) => bus.emit('toast', { text, tone: 'info', at: { x: pos.x, z: pos.z } });
    const departNow = () => {
      if (phase !== 'board') return;
      depart();
      if (dest) toast(`${NAME} casts off early for ${dest.name}`);
    };
    const fullAhead = (on = !full) => {
      if (phase === 'board') return departNow();
      full = on;
      toast(
        full
          ? `Full ahead: ${NAME} rides up on the foils for ${dest?.name ?? 'the bay'}`
          : `${NAME} eases back to cruising speed`,
      );
    };
    const charterTo = (key: string) => {
      const d = open().find((x) => x.key === key);
      if (!d || !courseTo(d)) return false;
      if (phase === 'board') dest = d;
      else charter = d;
      toast(
        phase === 'board'
          ? `Chartered: this voyage sails for ${d.name}`
          : `Chartered: the next voyage sails for ${d.name}`,
      );
      return true;
    };
    const deckShow = () => {
      showUntil = U.clock.value + SHOW;
      toast(`Deck show aboard ${NAME}: lights along every deck`);
    };
    const horn = () => {
      bus.emit('ferry:horn', { x: pos.x, z: pos.z });
      toast(`${NAME}'s horn rolls across the water`);
    };
    const locate = () => ctx.cameraCtl.locate(pos.x, pos.z, { size: 34, height: 5 });
    const ride = (eye: Vector3, ahead: Vector3) => {
      if (!shown) return false;
      const c = Math.cos(heading);
      const sn = Math.sin(heading);
      // On the wheelhouse roof's front edge, the helideck and the sea ahead.
      const [lx, ly, lz] = [4.25, FERRY.sun + 0.62, 0];
      eye.set(pos.x + lx * c - lz * sn, vessel.position.y + ly, pos.z + lx * sn + lz * c);
      ahead.set(eye.x + c * 12, eye.y - 1.2, eye.z + sn * 12);
      return true;
    };

    // ── Inspector (D-141) ───────────────────────────────────────────────────────────────────────────────────
    const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
    const btn = (glyph: string, label: string, title: string, run: () => void, on = false) =>
      h(
        'button',
        { class: `tool ${on ? 'on' : ''}`, title, onClick: run },
        h('span', { class: 'g' }, icon(glyph)),
        label,
      );
    /** What is aboard, as chips (static). */
    const facilities = h(
      'div',
      { class: 'ix-group fy-aboard', title: 'Aboard the Tidesong' },
      ...[
        'Infinity pool',
        'Spiral slide',
        'Sky garden',
        'Observation dome',
        'Bloom Bistro',
        'Spa cabins',
        'Sky wheel',
        'Helideck',
        'Solar wing-sails',
      ].map((f) => h('span', { class: 'ix-chip' }, f)),
    );
    const hud = ctx.services.get('hud');
    hud.objectInspector('ferry', () => {
      if (!shown || !pier) return null;
      const plan = dest ? courseTo(dest) : null;
      const left = plan ? Math.max(0, plan.course.length - s) : 0;
      const eta = phase === 'board' ? BOARD - clock : phase === 'sail' ? left / Math.max(1.5, v) : 0;
      const inLoop = !!plan && phase === 'sail' && s >= plan.loop[0] && s <= plan.loop[1];
      const status =
        phase === 'sail'
          ? inLoop
            ? `Sightseeing round ${dest!.name}`
            : s < (plan?.loop[0] ?? 0)
              ? `Bound for ${dest!.name}`
              : `Returning to ${PIER_NAME}`
          : PHASE_NAMES[phase];
      const aboard = 820 + ((voyageNo * 7919) % 640);
      const chips = h(
        'div',
        {
          class: 'ix-group fy-charter',
          title: 'Charter a voyage: the next departure sails for the wonder you pick',
        },
        h('span', { class: 'ix-more' }, phase === 'board' ? 'This voyage:' : 'Charter next:'),
        ...open()
          .filter((d) => courseTo(d))
          .map((d) =>
            h(
              'button',
              {
                class: `ix-chip ${(phase === 'board' ? dest : charter) === d ? 'on' : ''}`,
                title: `Sail for ${d.name}`,
                onClick: () => charterTo(d.key),
              },
              d.name.replace(/^the /, ''),
            ),
          ),
      );
      return {
        glyph: 'ferry',
        code: 'FERRY · TS-1',
        place: phase === 'board' ? `At ${PIER_NAME}` : 'Open sea',
        title: NAME,
        desc: 'A solar-sail cruise ferry on a timetable from Tidesong Pier to the sea wonders: one wonder per voyage, a slow loop round it, then home.',
        vitals: [
          [
            'wave',
            'Status',
            phase === 'sail'
              ? full
                ? 'Full ahead'
                : inLoop
                  ? 'Sightseeing'
                  : 'Cruising'
              : PHASE_NAMES[phase].split(' ')[0]!,
            full ? 'good' : '',
          ],
          ['fast', 'Speed', `${Math.round(Math.abs(v) * KNOTS)} kn`],
          ['people', 'Aboard', aboard.toLocaleString()],
          [
            'calendar',
            phase === 'board' ? 'Departs' : 'Arrives',
            phase === 'board' || phase === 'sail' ? mmss(eta) : '—',
          ],
        ],
        body: [chips, facilities],
        rows: [
          ['Voyage', `#${voyageNo} · ${dest?.name ?? '—'}`],
          ['Now', status],
          ['Next', charter ? `${charter.name} (chartered)` : 'Timetable'],
          ['Round trip', plan ? `${Math.round(plan.course.length)} tiles` : '—'],
        ],
        note: 'Requests go to the captain: Full ahead lasts to the end of the voyage; a charter changes only the next departure.',
        actions: [
          phase === 'board'
            ? btn('play', 'Depart now', 'Cast off now instead of waiting out the boarding', departNow)
            : btn(
                'fast',
                full ? 'Ease off' : 'Full ahead',
                full
                  ? 'Back to cruising speed'
                  : 'Ask the captain for full speed: hydrofoils up to the end of this voyage',
                () => fullAhead(),
                full,
              ),
          btn(
            'fireworks',
            'Deck show',
            'Light every deck, the waterline and the sky wheel in a running rainbow for 45 seconds',
            deckShow,
            U.clock.value < showUntil,
          ),
          btn('horn', 'Horn', 'Sound the ship’s horn', horn),
          btn('ferry', 'Ride aboard', 'Ride on the bridge to the sea wonders (drag to look, Esc back)', () =>
            ctx.services.get('explore').setMode('ferry'),
          ),
          btn('locate', 'Locate', 'Fly the camera to the ferry', locate),
        ],
      };
    });
    const inspect = () => bus.emit('selection:changed', { eid: null, object: 'ferry' });

    ctx.services.provide('ferry', {
      get active() {
        return shown;
      },
      ride,
      position: pos,
      inspect,
      departNow,
      fullAhead,
      charter: charterTo,
      deckShow,
      advance: (seconds) => {
        for (let k = 0; k < seconds * 10; k++) sail(0.1);
      },
    });
  },
};
