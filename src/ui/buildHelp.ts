import type { BuildingDef } from '@/content/types';
import {
  BRIDGE_COST,
  CHANNEL_COST,
  DEMOLISH_REFUND,
  RETROFIT_RADIUS,
  RETROFIT_SHARE,
  ROAD_COST,
} from '@/sim/commands';
import { MIST_COST } from '@/sim/floranet';
import { BANYAN_SHARE, BRIDGE_MAX, BRIDGE_MIN, BRIDGES_PER_TOWER } from '@/sim/weaver';

/**
 * Plain-language help for the Build tab (D-069): what each building action does, how to use it and what it
 * costs, and a building type's numbers and special abilities in words. Numbers come from the sim's constants,
 * so the text can't drift from the rules.
 */

export interface ActionHelp {
  /** Short label for the tile (the tool's full name is the title). */
  short: string;
  what: string;
  how: string;
  cost: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const ACTION_HELP: Record<string, ActionHelp> = {
  select: {
    short: 'Inspect',
    what: 'Look before you act. Click any building, street or channel to open the inspector: what it is, how healthy it is, its problems and the actions it offers.',
    how: 'Click an object. Drag to pan the camera. Esc comes back here from any other tool.',
    cost: 'Free',
  },
  road: {
    short: 'Highway',
    what: 'Living Highways are the city’s streets: they carry power, water and commuters. A building only gets power and water when it touches one. Drawn over water, a highway becomes a bridge.',
    how: 'Drag from start to end; the path bends once (an L). Drawing over an overgrown stretch clears it.',
    cost: `◈${ROAD_COST} a tile · ◈${BRIDGE_COST} a tile over water`,
  },
  channel: {
    short: 'Channel',
    what: 'Filtration Channels are open water lines that clean runoff and irrigate the gardens beside them, so greenery keeps growing even when the taps run dry.',
    how: 'Drag a line across free, dry, gentle land.',
    cost: `◈${CHANNEL_COST} a tile`,
  },
  bulldoze: {
    short: 'Remove',
    what: 'Return to Nature removes a building, highway or channel and lets the land go back to meadow.',
    how: 'Click one object, or drag a box to clear an area. Undo (⌘Z) brings it back.',
    cost: `Buildings refund ${pct(DEMOLISH_REFUND)} of their price`,
  },
  retrofit: {
    short: 'Retrofit',
    what: `Bloom Retrofit upgrades every building within ${RETROFIT_RADIUS} tiles at once: flower walls, ivy curtains and sunflower solar crowns roll out in a wave. Retrofitted buildings grow greenery 1.5× faster, give 1.5× the ecology and pollute 30% less; channels nearby turn lush.`,
    how: 'Click a spot. The ring shows which buildings are included and the total price.',
    cost: `${pct(RETROFIT_SHARE)} of each included building’s price`,
  },
  mist: {
    short: 'Mist',
    what: 'Flora-Net Mist sends the gardening drones to mist dry soil around a spot. Parched soil makes plants wilt and farms yield less; misting restores it.',
    how: 'Click a dry area (the Hydration lens shows where the soil is dry).',
    cost: `◈${MIST_COST} a dispatch`,
  },
  weave: {
    short: 'Weaver',
    what: `The Green Weaver grows a flowering sky-bridge between two towers (more ecology, a walkway in the sky), or merges one tower with a giant banyan (twice the ecology, residents love it).`,
    how: `Click a tower, then a second tower ${BRIDGE_MIN}–${BRIDGE_MAX} tiles away for a bridge (up to ${BRIDGES_PER_TOWER} per tower); click the same tower again for a banyan. Esc cancels.`,
    cost: `Bridge ◈100 + ◈35 a tile · banyan ${pct(BANYAN_SHARE)} of the tower’s price`,
  },
  reclaim: {
    short: 'Reclaim',
    what: 'Reclaim Land raises shallow sea next to the coast into new flat land you can build on.',
    how: 'Drag a box over shallow water touching the shore; deep water is left alone.',
    cost: '◈30 a tile, more the deeper the water',
  },
};

/** A building's numbers as labelled rows (only the ones that apply). */
export function buildingStats(def: BuildingDef): { label: string; value: string; tone?: 'good' | 'bad' }[] {
  const s = def.stats;
  const signed = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(v).toLocaleString()}`;
  const rows: { label: string; value: string; tone?: 'good' | 'bad' }[] = [
    { label: 'Price', value: `◈${s.cost.toLocaleString()}` },
    { label: 'Upkeep', value: `◈${s.upkeep.toFixed(2)}/s` },
    { label: 'Lot', value: `${def.footprint[0]} × ${def.footprint[1]} tiles` },
  ];
  const add = (label: string, v: number, goodWhenPositive = true) => {
    if (v) rows.push({ label, value: signed(v), tone: v > 0 === goodWhenPositive ? 'good' : 'bad' });
  };
  add('Homes (residents)', s.population);
  add('Jobs', s.jobs);
  add(s.energy > 0 ? 'Power made' : 'Power used', s.energy);
  add(s.water > 0 ? 'Water supplied' : 'Water used', s.water);
  add('Feeds (residents)', s.food);
  add('Ecology', s.eco);
  add('Harmony', s.happiness);
  if (s.pollution)
    rows.push({ label: 'Pollution', value: signed(s.pollution), tone: s.pollution > 0 ? 'bad' : 'good' });
  return rows;
}

/** What makes a building special, in a sentence each. */
export function buildingAbilities(def: BuildingDef): string[] {
  const out: string[] = [];
  if (def.placement?.nearWater) out.push('Must touch the sea or a reservoir.');
  if (def.cleanEnergy) out.push('Clean power: raises the clean-energy share that feeds the bloom.');
  if (def.pollinators) out.push('Pollinator habitat: spreads bloom to its neighbours.');
  if (def.symbiosis)
    out.push(`Pairs with ${def.symbiosis.partners.join(', ').replace(/-/g, ' ')}: ${def.symbiosis.label}.`);
  if (def.transit?.hub) out.push('Sky-lane hub: links Pod Docks around it into the pod network.');
  else if (def.transit?.rail)
    out.push(`Aeroline station: carries up to ${def.transit.riders} commuters by train.`);
  else if (def.transit)
    out.push(`Flies up to ${def.transit.riders} commuters from homes within ${def.transit.radius} tiles.`);
  if (def.drones)
    out.push(
      `${def.drones.count} gardening drones pollinate, harvest and mist within ${def.drones.radius} tiles.`,
    );
  if (def.defence)
    out.push(`Holds back floods up to ${def.defence.height} high within ${def.defence.radius} tiles.`);
  if (def.response) out.push(`Fights any fire within ${def.response.radius} tiles on its own.`);
  if (def.fireworks)
    out.push(
      `Makes ${def.fireworks.rate} fireworks shells a minute (stores ${def.fireworks.storage}) and fires a show every night at 21:00.`,
    );
  if (def.tower)
    out.push('A tower: the Green Weaver can bridge it to other towers or merge it with a banyan.');
  if (def.floodproof) out.push('Floodproof.');
  return out;
}
