/**
 * The Archipelago's state (plan v8, Phase 37): the neighbouring islands as the city knows them (relation, prosperity,
 * their own crisis and director), the trade agreements in force and the envoy dispatch on the table. Plain data in
 * its own module (no imports) so `City` can hold it; saved (v30) and part of `city.hash()`.
 */

export type NeighbourId = 'drift' | 'concord' | 'lantern' | 'kestrel';
export type Good = 'energy' | 'water' | 'food';
export type TradeDir = 'export' | 'import';
/** A neighbour's own trouble: what it does to their supply and what it may send the island's way. */
export type NeighbourCrisis = 'storm' | 'drought' | 'swell' | 'blight' | 'fire';

export interface NeighbourState {
  id: NeighbourId;
  /** Contact made (first contact plays once; a growing island meets them by era). */
  met: boolean;
  /** −100 (hostile) … 100 (allied). */
  relation: number;
  /** 0..1: how well their island is doing (lights, prices, what they can spare). */
  prosperity: number;
  /** Their crisis now, and until when. */
  crisis: NeighbourCrisis | null;
  crisisUntil: number;
  /** Their director: the tick of their next event. */
  nextTick: number;
  /** Lifetime credits traded with them (+ earned, − paid). */
  traded: number;
}

export interface TradeAgreement {
  id: number;
  partner: NeighbourId;
  good: Good;
  dir: TradeDir;
  /** Units per second agreed (energy / water / food units, as the pulse counts them). */
  amount: number;
  /** Price multiplier on the live price (a premium request pays more; a gift pays nothing). */
  premium: number;
  /** Ends on its own at this tick (premium requests and gifts); 0 = standing. */
  until: number;
  since: number;
  /** Units actually moved last pulse (exports ship surplus only; imports only what the partner can spare). */
  moved: number;
  /** Credits last pulse (+ earned on exports, − paid on imports). */
  credits: number;
}

export type DispatchKind = 'aid' | 'families' | 'request' | 'offer' | 'rival' | 'loan' | 'dive';

export interface Dispatch {
  id: number;
  kind: DispatchKind;
  from: NeighbourId;
  /** open: waiting for an answer; goal: accepted, working toward a target (rival bids); done. */
  status: 'open' | 'goal';
  startTick: number;
  /** Answer by (open) or reach the target by (goal). */
  endTick: number;
  /** Credits the first choice costs (aid) or pays (dive, loan principal, offer gift). */
  credits?: number;
  /** Families: residents asking to settle. */
  residents?: number;
  /** Requests and offers: the good, and units per second. */
  good?: Good;
  amount?: number;
  /** Rival bids: what is measured and the bar to reach. */
  metric?: 'harmony' | 'ecology';
  target?: number;
  /** Their crisis that prompted it (aid, families). */
  cause?: NeighbourCrisis;
}

export interface Dealing {
  tick: number;
  partner: NeighbourId;
  text: string;
  /** Relation change it brought. */
  delta: number;
}

export interface ArchipelagoState {
  /** Off in tests (like happenings) so balance runs stay stable; on in play. */
  auto: boolean;
  neighbours: NeighbourState[];
  trades: TradeAgreement[];
  nextTradeId: number;
  dispatch: Dispatch | null;
  nextDispatchId: number;
  /** Tick after which the next envoy may come. */
  nextDispatchTick: number;
  /** Harmony change until this tick (a dive in the bay, newcomers settling), signed. */
  mood: number;
  moodUntil: number;
  /** The island's crisis (id) a friend last offered help for: once per crisis. */
  offered: number;
  /** Recent dealings, newest last (≤ 24). */
  log: Dealing[];
}

/** Where each neighbour starts: the Drift are old friends, the rest strangers. */
const START: Record<NeighbourId, number> = { drift: 25, concord: 0, lantern: 5, kestrel: 0 };

export const createArchipelagoState = (): ArchipelagoState => ({
  auto: true,
  neighbours: (Object.keys(START) as NeighbourId[]).map((id) => ({
    id,
    met: false,
    relation: START[id],
    prosperity: 0.6,
    crisis: null,
    crisisUntil: 0,
    nextTick: 0,
    traded: 0,
  })),
  trades: [],
  nextTradeId: 1,
  dispatch: null,
  nextDispatchId: 1,
  nextDispatchTick: 0,
  mood: 0,
  moodUntil: 0,
  offered: 0,
  log: [],
});

/** String for `city.hash()`. */
export function archipelagoHash(st: ArchipelagoState): string {
  const ns = st.neighbours.map((n) => `${n.id}:${n.met ? 1 : 0}:${n.relation.toFixed(3)}:${n.prosperity.toFixed(4)}:${n.crisis ?? ''}@${n.crisisUntil}:${n.nextTick}`).join(',');
  const ts = st.trades.map((t) => `${t.id}:${t.partner}:${t.good}:${t.dir}:${t.amount}:${t.premium}:${t.until}`).join(',');
  const d = st.dispatch ? `${st.dispatch.id}:${st.dispatch.kind}:${st.dispatch.from}:${st.dispatch.status}:${st.dispatch.endTick}` : '-';
  return `${st.auto ? 1 : 0}|${ns}|${ts}|${d}|${st.nextDispatchTick}|${st.nextTradeId}|${st.mood}@${st.moodUntil}|${st.log.length}|${st.offered}`;
}
