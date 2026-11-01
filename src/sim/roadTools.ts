import type { AgentTool } from '@/core/AgentTools';
import type { ActionCtx } from './actionTools';
import { getObject } from './inventory';
import { MAX_ROAD_LEVEL, ROAD_LEVEL_NAMES, levelCounts, roadLevels, roadStretch, upgradeCost } from './roads';

/**
 * Highway levels for the city assistant (D-096): upgrade the highways of a district (or round an object) one
 * level, raw tracks to Living Highways and those to Bloom Boulevards, as one undoable command.
 */
export const roadTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'upgrade_roads',
    option: 'Upgrade highways a level (raw track → Living Highway → Bloom Boulevard)',
    description:
      'Raises the highways of a district, or the stretch nearest an object, one level: raw tracks become Living Highways (◈8 a tile), Living Highways become Bloom Boulevards (◈18 a tile). Higher levels carry more traffic (×0.75 / ×1 / ×1.6) and boulevards get street trees and lamps. One undo reverts it.',
    keywords: ['road', 'roads', 'highway', 'street', 'pave', 'upgrade', 'boulevard', 'traffic', 'track'],
    llmArgs: ['district', 'near'],
    input: {
      type: 'object',
      properties: {
        district: { type: 'string', description: 'Upgrade the highways in this district.' },
        near: { type: 'string', description: 'Or the stretch nearest this object id.' },
        limit: { type: 'integer', minimum: 1, maximum: 2000, description: 'At most this many tiles (default 400).' },
      },
    },
    effect: 'mutate',
    run({ city, commands }, a: { district?: string; near?: string; limit?: number }) {
      const g = city.grid;
      let tiles: number[] = [];
      if (a.district) {
        const d = city.districts.find((x) => x.name.toLowerCase() === a.district!.trim().toLowerCase());
        if (!d) throw new Error(`No district "${a.district}". Districts: ${city.districts.map((x) => x.name).join(', ')}`);
        for (let z = d.z0; z <= d.z1; z++) for (let x = d.x0; x <= d.x1; x++) if (g.road[g.index(x, z)] === 1) tiles.push(g.index(x, z));
      } else if (a.near) {
        const o = getObject(city, a.near);
        if (!o) throw new Error(`No object "${a.near}"`);
        // The nearest highway tile to the object, then its stretch.
        let best = -1;
        let bd = Infinity;
        for (let r = 0; r < 12 && best < 0; r++)
          for (let dz = -r; dz <= r; dz++)
            for (let dx = -r; dx <= r; dx++) {
              const [x, z] = [Math.floor(o.x) + dx, Math.floor(o.z) + dz];
              if (!g.inBounds(x, z) || g.road[g.index(x, z)] !== 1) continue;
              const dd = dx * dx + dz * dz;
              if (dd < bd) [best, bd] = [g.index(x, z), dd];
            }
        if (best < 0) throw new Error(`No highway near ${a.near}.`);
        tiles = roadStretch(city, best, a.limit ?? 60);
      } else throw new Error('Name a district or an object.');
      const lv = roadLevels(city);
      tiles = tiles.filter((t) => lv[t]! < MAX_ROAD_LEVEL);
      // The lowest level first: pave raw tracks before turning highways into boulevards.
      tiles.sort((x, y) => lv[x]! - lv[y]! || x - y);
      tiles = tiles.slice(0, a.limit ?? 400);
      if (!tiles.length) throw new Error('Those highways are all Bloom Boulevards already.');
      const was = tiles.map((t) => lv[t]!);
      const cost = upgradeCost(city, tiles);
      const credits = city.credits;
      if (!commands.execute('upgradeRoad', { tiles })) throw new Error(`Not enough credits: the first tile costs more than ◈${Math.round(city.credits)}.`);
      const after = levelCounts(city, tiles);
      return {
        upgraded: tiles.filter((t, i) => lv[t]! > was[i]!).length,
        now: `${after[0]} ${ROAD_LEVEL_NAMES[0]} · ${after[1]} ${ROAD_LEVEL_NAMES[1]} · ${after[2]} ${ROAD_LEVEL_NAMES[2]}`,
        cost: Math.round(credits - city.credits),
        ...(Math.round(credits - city.credits) < cost ? { note: 'Credits ran out before every tile was done.' } : {}),
        credits: Math.round(city.credits),
      };
    },
  },
];
