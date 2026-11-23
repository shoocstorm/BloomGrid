import type { AgentTool } from '@/core/AgentTools';
import type { ActionCtx } from './actionTools';
import {
  CRISIS_NAMES,
  DISPATCH_NAMES,
  GOOD_NAMES,
  NEIGHBOURS,
  TRADE_SIZES,
  describeDispatch,
  dispatchChoices,
  neighbour,
  neighbourDef,
  priceOf,
  spareOf,
  surplusOf,
  tierOf,
  tradeBlock,
  tradeLine,
  unitsFor,
} from './archipelago';
import type { Good, NeighbourId, TradeDir } from './archipelagoState';
import { PULSE_TICKS } from './pulseConst';

/**
 * Flora's Archipelago tools (plan v8, Phase 40): who the neighbours are, how they feel about the island, what they
 * sell and want at today's prices, the agreements in force and the envoy waiting; and signing or ending an agreement
 * through the same undoable commands the chart uses. Answering an envoy stays with the steward on its card (answers
 * are final, like claiming a request or a story choice). Registered last so menus for other requests keep their letters.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;
const IDS = NEIGHBOURS.map((n) => n.id);
const GOODS: Good[] = ['energy', 'water', 'food'];

export const archipelagoTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'neighbour_islands',
    option: 'Check the neighbouring islands: relations, trade and envoys',
    description:
      "The Archipelago: the neighbouring islands (Brightwater Flotilla of the Drift, Bastion Halden of the Concord, Vellum Holm of the Lantern Orders, Kestrel Cay), each one's relation tier, fortunes and trouble, what they sell and buy at today's prices, the perk friendship brings; the trade agreements in force (units moved, credits a second); the island's spare energy, water and food; and the envoy waiting for an answer, with its two choices.",
    keywords: ['neighbour', 'neighbor', 'island', 'archipelago', 'trade', 'export', 'import', 'envoy', 'drift', 'concord', 'lantern', 'kestrel', 'diplomacy', 'relations'],
    input: { type: 'object', properties: {} },
    effect: 'read',
    run({ city }) {
      const st = city.archipelago;
      const d = st.dispatch;
      return {
        neighbours: NEIGHBOURS.filter((def) => neighbour(city, def.id).met).map((def) => {
          const n = neighbour(city, def.id);
          return {
            id: def.id,
            name: def.name,
            faction: def.faction,
            relation: `${tierOf(n.relation).name} (${Math.round(n.relation)} of 100)`,
            fortunes: n.prosperity > 0.7 ? 'thriving' : n.prosperity > 0.45 ? 'steady' : 'struggling',
            ...(n.crisis ? { trouble: CRISIS_NAMES[n.crisis] } : {}),
            sells: def.sells.map((g) => ({ good: g, pricePerUnit: r2(priceOf(city, def.id, g, 'import') * 100) / 100, canSparePercent: Math.round(spareOf(n, g) * 100) })),
            buys: def.wants.map((g) => ({ good: g, pricePerUnit: r2(priceOf(city, def.id, g, 'export') * 100) / 100 })),
            friendPerk: def.perk,
          };
        }),
        agreements: st.trades.map((t) => ({ id: t.id, what: tradeLine(t), moved: Math.round(t.moved), creditsPerSecond: r2(t.credits) })),
        tradePerSecond: r2(city.stats.trade),
        islandSpare: Object.fromEntries(GOODS.map((g) => [g, Math.round(Math.max(0, surplusOf(city, g)))])),
        envoy: d
          ? {
              from: neighbourDef(d.from).name,
              kind: DISPATCH_NAMES[d.kind],
              says: describeDispatch(city, d),
              ...(d.status === 'open' ? { choices: dispatchChoices(d), note: 'The steward answers on the envoy card.' } : {}),
              secondsLeft: Math.max(0, Math.ceil((d.endTick - city.tick) / PULSE_TICKS)),
            }
          : null,
        ...(st.neighbours.some((n) => n.met) ? {} : { note: 'No neighbour met yet: the Drift and Kestrel Cay come in the Grove era, the Concord and the Lantern Orders in Canopy.' }),
      };
    },
  },
  {
    name: 'set_trade',
    option: 'Sign or end a trade agreement with a neighbouring island',
    description:
      "Signs a standing agreement with a neighbour (sign: true): export (ship the island's spare energy, water or food to a neighbour who buys it, for credits) or import (buy a good the neighbour sells), sized small / medium / large (5 / 10 / 20% of the island's own use). Exports only ever ship surplus. sign: false ends the agreement for that neighbour, good and direction. Undoable.",
    keywords: ['trade', 'export', 'import', 'sell', 'buy', 'agreement', 'neighbour', 'island'],
    input: {
      type: 'object',
      properties: {
        neighbour: { type: 'string', enum: IDS },
        good: { type: 'string', enum: GOODS },
        direction: { type: 'string', enum: ['export', 'import'] },
        size: { type: 'string', enum: TRADE_SIZES.map((s) => s.id) },
        sign: { type: 'boolean' },
      },
      required: ['neighbour', 'good', 'direction', 'sign'],
    },
    effect: 'mutate',
    run({ city, commands }, { neighbour: id, good, direction, size, sign }: { neighbour: NeighbourId; good: Good; direction: TradeDir; size?: string; sign: boolean }) {
      const def = NEIGHBOURS.find((n) => n.id === id);
      if (!def) throw new Error(`No neighbour ${id}. Known: ${IDS.join(', ')}.`);
      if (!sign) {
        const t = city.archipelago.trades.find((x) => x.partner === id && x.good === good && x.dir === direction);
        if (!t) throw new Error(`No ${direction} of ${GOOD_NAMES[good]} with ${def.name} to end.`);
        commands.execute('endTrade', { id: t.id });
        return { ended: tradeLine(t), agreements: city.archipelago.trades.length };
      }
      const why = tradeBlock(city, id, good, direction);
      if (why) throw new Error(why);
      const ix = Math.max(0, TRADE_SIZES.findIndex((s) => s.id === size));
      if (!commands.execute('signTrade', { partner: id, good, dir: direction, size: size ? ix : 1 }))
        throw new Error(`The agreement with ${def.name} could not be signed.`);
      const units = unitsFor(city, good, size ? ix : 1);
      return {
        signed: `${direction === 'export' ? 'Ship' : 'Buy'} ${units} ${GOOD_NAMES[good]}/s ${direction === 'export' ? 'to' : 'from'} ${def.name}`,
        pricePerUnit: r2(priceOf(city, id, good, direction) * 100) / 100,
        ...(direction === 'export' ? { islandSpare: Math.round(Math.max(0, surplusOf(city, good))) } : {}),
      };
    },
  },
];
