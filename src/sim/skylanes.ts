import { Building } from '@/ecs/components';
import { buildings } from '@/content';

/**
 * The sky-lane network (D-051). Hubs (Pod Interchanges, the Dragonfly Skyport, the central Skylane Nexus) relay
 * pods between lanes: every Pod Dock within a hub's reach links to the nearest one by a spoke, and hubs link to
 * each other by trunks (a minimum spanning tree over hubs within `TRUNK_MAX`, where a link to a central hub
 * costs half, so the Nexus becomes the backbone; a central hub also links straight to every hub in its reach).
 * A linked dock flies its riders anywhere on the network, so it carries more (`NETWORK_BONUS`, more again when
 * the network has a central hub). Aeroline stations are transfer points (D-052): each links by a rail link to
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
  const trunk = (i: number, j: number) => {
    const [a, b] = i < j ? [i, j] : [j, i];
    const key = `${a}-${b}`;
    if (has.has(key)) return;
    has.add(key);
    const [ha, hb] = [hubs[a]!, hubs[b]!];
    links.push({ kind: 'trunk', a, b, ax: ha.x, az: ha.z, bx: hb.x, bz: hb.z, eid: -1 });
  };
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
      trunk(bi, bj);
    }
  }
  for (let i = 0; i < n; i++) {
    if (!hubs[i]!.central) continue;
    const r = Math.min(TRUNK_MAX, reach(hubs[i]!));
    for (let j = 0; j < n; j++)
      if (
        j !== i &&
        hubs[j]!.net === hubs[i]!.net &&
        d2(hubs[i]!.x, hubs[i]!.z, hubs[j]!.x, hubs[j]!.z) <= r * r
      )
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
