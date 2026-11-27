import { Building } from '@/ecs/components';
import { buildings } from '@/content';

/**
 * The sky-lane network (D-051). Hubs (Pod Interchanges, the Dragonfly Skyport, the central Skylane Nexus) relay
 * pods between lanes: every Pod Dock within a hub's reach links to the nearest one by a spoke, and hubs link to
 * each other by trunks (a minimum spanning tree over hubs within `TRUNK_MAX`, where a link to a central hub
 * costs half, so the Nexus becomes the backbone; a central hub also links straight to every hub in its reach).
 * A linked dock flies its riders anywhere on the network, so it carries more (`NETWORK_BONUS`, more again when
 * the network has a central hub). Round a central hub the trunks are laid out as a rosette instead (D-234): the
 * other hubs fall into rings by distance, the Nexus links to the inner ring, each ring links round itself, and each
 * hub of an outer ring links to the inner hub in line with it, or the two either side (a petal); ring links follow
 * their circle and petal edges bulge (`bow`), so from above the network reads as a flower. Hubs the rings leave
 * out still join by the spanning tree. Aeroline stations are transfer points (D-052): each links by a rail link to
 * the nearest hub within reach (`RAIL_REACH` beyond the hub's own), so riders can fly in and change to the trains;
 * a network with a station carries more again (`RAIL_BONUS`), and a linked station takes more riders
 * (`RAIL_FEED`: pods bring them from beyond its walking radius). Derived each mobility pass from buildings alone:
 * deterministic, never saved.
 */

/** Longest trunk between two hubs (tiles). */
export const TRUNK_MAX = 150;
/** Rider capacity bonus for a dock or hub on a network of two or more hubs; extra with a central hub. */
export const NETWORK_BONUS = 0.2;
export const CENTRAL_BONUS = 0.15;
/** Extra rider share for docks and hubs whose network reaches an Aeroline station, and for a linked station. */
export const RAIL_BONUS = 0.1;
export const RAIL_FEED = 0.25;
/** A station links to a hub up to this much beyond the hub's own reach (stations sit on the loop, between towns). */
export const RAIL_REACH = 20;

export interface SkyHub {
  eid: number;
  def: string;
  x: number;
  z: number;
  central: boolean;
  /** Docks linked by spokes, Aeroline stations linked, and the hub's network component (index of its lowest hub). */
  stations: number;
  rail: number;
  net: number;
}

/**
 * A spoke (`a` = -1: dock at ax/az → hub `b`), a trunk (hub `a` ↔ hub `b`) or a rail link (`a` = -1: Aeroline
 * station at ax/az → hub `b`, where riders change between pods and trains).
 */
export interface SkyLink {
  kind: 'spoke' | 'trunk' | 'rail';
  a: number;
  b: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Dock or station entity (-1 for trunks). */
  eid: number;
  /**
   * A designed curve for the lane (D-234): its offset at the middle as a share of its length, to the left of a → b
   * (the renderer's `legXZ` bow). Unset: the renderer picks the bow that keeps the lane lowest.
   */
  bow?: number;
}

export interface SkyNet {
  hubs: SkyHub[];
  links: SkyLink[];
}

export interface TransitStop {
  eid: number;
  cap: number;
  x: number;
  z: number;
}

/**
 * Links operating transit stops into the network and scales the linked stops' rider capacity in place.
 * `stops` are the mobility pass's docks, Aeroline stations included (they join as transfer points).
 */
export function buildSkyNet(stops: TransitStop[]): SkyNet {
  const hubs: SkyHub[] = [];
  const hubStop: TransitStop[] = [];
  const docks: TransitStop[] = [];
  const rails: TransitStop[] = [];
  for (const s of stops) {
    const t = buildings.at(Building.def[s.eid]!).transit!;
    if (s.cap <= 0) continue;
    if (t.rail) rails.push(s);
    else if (t.hub) {
      hubs.push({
        eid: s.eid,
        def: buildings.at(Building.def[s.eid]!).id,
        x: s.x,
        z: s.z,
        central: !!t.hub.central,
        stations: 0,
        rail: 0,
        net: hubs.length,
      });
      hubStop.push(s);
    } else docks.push(s);
  }
  const links: SkyLink[] = [];
  const reach = (h: SkyHub) => buildings.at(Building.def[h.eid]!).transit!.hub!.reach;
  const d2 = (ax: number, az: number, bx: number, bz: number) => (ax - bx) ** 2 + (az - bz) ** 2;

  // Trunks: Prim's tree from hub 0 per component (ties keep the lower index), then central stars.
  const n = hubs.length;
  const inTree = new Uint8Array(n);
  const has = new Set<string>();
  const trunk = (i: number, j: number, bow?: number) => {
    const [a, b] = i < j ? [i, j] : [j, i];
    const key = `${a}-${b}`;
    if (has.has(key)) return;
    has.add(key);
    const [ha, hb] = [hubs[a]!, hubs[b]!];
    // The bow was given for i → j; the link runs a → b.
    const link: SkyLink = { kind: 'trunk', a, b, ax: ha.x, az: ha.z, bx: hb.x, bz: hb.z, eid: -1 };
    if (bow !== undefined) link.bow = a === i ? bow : -bow;
    links.push(link);
  };
  /** The spanning tree's edges, laid after the rosettes (only those still needed to join a hub in). */
  const tree: [number, number][] = [];
  const cost = (i: number, j: number) => {
    const [hi, hj] = [hubs[i]!, hubs[j]!];
    const d = Math.sqrt(d2(hi.x, hi.z, hj.x, hj.z));
    return d > TRUNK_MAX ? Infinity : d * (hi.central || hj.central ? 0.5 : 1);
  };
  for (let root = 0; root < n; root++) {
    if (inTree[root]) continue;
    inTree[root] = 1;
    const members = [root];
    for (;;) {
      let best = Infinity;
      let bi = -1;
      let bj = -1;
      for (const i of members)
        for (let j = 0; j < n; j++) {
          if (inTree[j]) continue;
          const c = cost(i, j);
          if (c < best) [best, bi, bj] = [c, i, j];
        }
      if (bj < 0) break;
      inTree[bj] = 1;
      members.push(bj);
      hubs[bj]!.net = root;
      tree.push([bi, bj]);
    }
  }
  // Rosettes round central hubs; then the tree's edges that join anything the rosettes left apart.
  const joined = rosettes(hubs, trunk);
  const find = (i: number): number => (joined[i] === i ? i : (joined[i] = find(joined[i]!)));
  for (const [i, j] of tree) {
    const [a, b] = [find(i), find(j)];
    if (a === b) continue;
    joined[a] = b;
    trunk(i, j);
  }

  // Spokes: each dock to the nearest hub whose reach covers it.
  const hubOf = new Map<TransitStop, number>();
  for (const dk of docks) {
    let best = Infinity;
    let bi = -1;
    for (let i = 0; i < n; i++) {
      const h = hubs[i]!;
      const dd = d2(dk.x, dk.z, h.x, h.z);
      if (dd <= reach(h) ** 2 && dd < best) [best, bi] = [dd, i];
    }
    if (bi < 0) continue;
    hubs[bi]!.stations++;
    hubOf.set(dk, bi);
    const h = hubs[bi]!;
    links.push({ kind: 'spoke', a: -1, b: bi, ax: dk.x, az: dk.z, bx: h.x, bz: h.z, eid: dk.eid });
  }

  // Rail links: each Aeroline station to the nearest hub within that hub's reach plus RAIL_REACH.
  for (const st of rails) {
    let best = Infinity;
    let bi = -1;
    for (let i = 0; i < n; i++) {
      const h = hubs[i]!;
      const dd = d2(st.x, st.z, h.x, h.z);
      if (dd <= (reach(h) + RAIL_REACH) ** 2 && dd < best) [best, bi] = [dd, i];
    }
    if (bi < 0) continue;
    hubs[bi]!.rail++;
    st.cap *= 1 + RAIL_FEED;
    const h = hubs[bi]!;
    links.push({ kind: 'rail', a: -1, b: bi, ax: st.x, az: st.z, bx: h.x, bz: h.z, eid: st.eid });
  }

  // Network effect: per component, how many hubs, whether one is central, whether it reaches the trains.
  const size = new Map<number, number>();
  const central = new Set<number>();
  const rail = new Set<number>();
  for (const h of hubs) {
    size.set(h.net, (size.get(h.net) ?? 0) + 1);
    if (h.central) central.add(h.net);
    if (h.rail) rail.add(h.net);
  }
  const bonus = (net: number) =>
    (size.get(net)! >= 2 ? NETWORK_BONUS : 0) +
    (central.has(net) ? CENTRAL_BONUS : 0) +
    (rail.has(net) ? RAIL_BONUS : 0);
  for (const [dk, i] of hubOf) dk.cap *= 1 + bonus(hubs[i]!.net);
  hubs.forEach((h, i) => (hubStop[i]!.cap *= 1 + bonus(h.net)));
  return { hubs, links };
}

/** Distance growth that starts a new ring round a central hub (and a floor in tiles). */
const RING_GAP = 1.3;
const RING_GAP_MIN = 12;
/** Ring neighbours further apart than this (radians) are not linked; an outer hub this close in angle is "in line". */
const RING_SPAN = (110 * Math.PI) / 180;
const IN_LINE = (12 * Math.PI) / 180;
/** How far petal edges bulge (share of their length). */
const PETAL_BOW = 0.12;

/**
 * Lays the rosette round each central hub (see the file comment) through `trunk(i, j, bow)` and returns a union-find
 * parent array of what it joined (index → parent), for the spanning tree to complete.
 */
function rosettes(hubs: SkyHub[], trunk: (i: number, j: number, bow?: number) => void): number[] {
  const parent = hubs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const link = (i: number, j: number, bow?: number) => {
    const [hi, hj] = [hubs[i]!, hubs[j]!];
    if (Math.hypot(hi.x - hj.x, hi.z - hj.z) > TRUNK_MAX) return;
    trunk(i, j, bow);
    parent[find(i)] = find(j);
  };
  /** The bow that bulges the link i → j toward the point (ox, oz) (`amount` of its length at the middle). */
  const bowToward = (i: number, j: number, ox: number, oz: number, amount: number) => {
    const [a, b] = [hubs[i]!, hubs[j]!];
    const [mx, mz] = [(a.x + b.x) / 2, (a.z + b.z) / 2];
    // Left of a → b is (−dz, dx).
    const side = -(b.z - a.z) * (ox - mx) + (b.x - a.x) * (oz - mz);
    return side >= 0 ? amount : -amount;
  };
  hubs.forEach((c, ci) => {
    if (!c.central) return;
    const reach = buildings.at(Building.def[c.eid]!).transit!.hub!.reach;
    const around = hubs
      .map((h, i) => ({ i, d: Math.hypot(h.x - c.x, h.z - c.z), a: Math.atan2(h.z - c.z, h.x - c.x) }))
      .filter((o) => o.i !== ci && hubs[o.i]!.net === c.net && o.d <= Math.max(reach, TRUNK_MAX) * 1.4)
      .sort((p, q) => p.d - q.d || p.i - q.i);
    // Rings by distance: a jump of more than RING_GAP (and RING_GAP_MIN tiles) starts the next one.
    const rings: (typeof around)[] = [];
    for (const o of around) {
      const ring = rings[rings.length - 1];
      const last = ring?.[ring.length - 1];
      if (!ring || (o.d > last!.d * RING_GAP && o.d - last!.d > RING_GAP_MIN)) rings.push([o]);
      else ring.push(o);
    }
    // A "ring" of one or two (a hub a little nearer than its fellows) belongs to the ring outside it.
    for (let k = rings.length - 2; k >= 0; k--) if (rings[k]!.length < 3) rings.splice(k, 2, [...rings[k]!, ...rings[k + 1]!]);
    for (const ring of rings) ring.sort((p, q) => p.a - q.a || p.i - q.i);
    const gap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
    rings.forEach((ring, k) => {
      // The inner ring hangs on the Nexus by straight spokes.
      if (k === 0) for (const o of ring) link(ci, o.i);
      // Round the ring, each link following the circle (bulging away from the centre by its arc's sagitta).
      if (ring.length >= 3)
        ring.forEach((o, m) => {
          const nx = ring[(m + 1) % ring.length]!;
          const span = gap(o.a, nx.a);
          if (span > RING_SPAN) return;
          const sag = Math.tan(span / 4) / 2;
          const [a, b] = [hubs[o.i]!, hubs[nx.i]!];
          const [mx, mz] = [(a.x + b.x) / 2, (a.z + b.z) / 2];
          link(o.i, nx.i, bowToward(o.i, nx.i, mx + (mx - c.x), mz + (mz - c.z), sag));
        });
      if (k === 0) return;
      // Out to the ring inside: the hub in line (straight), or a petal to the two either side.
      const inner = rings[k - 1]!;
      for (const o of ring) {
        const line = inner.find((q) => gap(q.a, o.a) < IN_LINE);
        if (line) {
          link(line.i, o.i);
          continue;
        }
        // The nearest inner hub on each side of it by angle.
        const wrap = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        let left = inner[0]!;
        let right = inner[0]!;
        for (const q of inner) {
          if (wrap(q.a - o.a) < wrap(left.a - o.a)) left = q;
          if (wrap(o.a - q.a) < wrap(o.a - right.a)) right = q;
        }
        for (const q of left === right ? [left] : [left, right]) {
          if (gap(q.a, o.a) > RING_SPAN / 1.5) continue;
          // A petal: each edge bulges away from the petal's axis (the line from the centre through its tip).
          const tip = hubs[o.i]!;
          const base = hubs[q.i]!;
          const [ax, az] = [tip.x - c.x, tip.z - c.z];
          const len = Math.hypot(ax, az) || 1;
          // The base's side of the axis, pushed further out on that side.
          const side = Math.sign((base.x - c.x) * -az / len + (base.z - c.z) * ax / len) || 1;
          const [px, pz] = [(tip.x + base.x) / 2 + (-az / len) * side * 50, (tip.z + base.z) / 2 + (ax / len) * side * 50];
          link(q.i, o.i, bowToward(q.i, o.i, px, pz, PETAL_BOW));
        }
      }
    });
  });
  return parent;
}
