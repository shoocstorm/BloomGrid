import type { GameContext, GameModule } from '@/game/context';
import { Building } from '@/ecs/components';
import { SYSTEMS, TIERS } from '@/sim/pulseState';
import { PROJECTS } from '@/sim/projects';
import { WONDER_SITES } from '@/modules/scenery/sites';
import { SYSTEM_LABELS } from '@/modules/pulse/PulsePanel';
import { SYSTEM_ORDER } from '@/sim/indicators';
import { Ceremony, type MomentSpec } from './Ceremony';
import './moments.css';

export type { MomentSpec } from './Ceremony';

/**
 * City moments (D-094): the big events of a city's life played as full-screen ceremonies (`Ceremony`), so they
 * land like achievements rather than one more toast:
 *
 * | Moment | Scale | When |
 * | --- | --- | --- |
 * | Flora awakens | grand | the Wake Flora project completes (the assistant calls `play`) |
 * | Sky-lanes, the Aeroline | grand | their unlock projects complete |
 * | A sea wonder rises | grand | `wonder:discovered` |
 * | A golden age | grand | every system Stable or better and six Thriving, held 20 s (once per city) |
 * | Population milestones | minor | 1k, 2.5k, 5k, 10k, 25k, 50k, 100k residents |
 * | Word spreads, a transit city | minor | those consequence rules come into force |
 * | A disaster weathered | minor | an earthquake, tornado or tsunami ends |
 * | Top level | minor | the city's first building reaches level 3 |
 *
 * One plays at a time (a queue, deduped by id, minor ones dropped when it backs up), none while a city loads or
 * settles (baselines are taken a few seconds after a city change, so loading a big city celebrates nothing) or while
 * the New Chapter dialog is open. Settings → Display: all moments, major only, or off (per viewer).
 */
export type MomentsMode = 'all' | 'major' | 'off';

export interface MomentsService {
  /** Queues a moment; `done` runs when it has played (or at once when moments are off). */
  play(m: MomentSpec, done?: () => void): void;
  mode: MomentsMode;
  readonly playing: boolean;
}

declare module '@/core/Services' {
  interface GameServices {
    moments: MomentsService;
  }
}

declare module '@/core/EventBus' {
  interface GameEvents {
    /** A moment's ceremony begins: the audio module plays its sound (D-094). */
    moment: { id: string; sound: MomentSpec['sound'] };
  }
}

const MODE_KEY = 'bloomgrid.moments';
const MILESTONES = [1000, 2500, 5000, 10000, 25000, 50000, 100000];
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** Centre of a building (tile coords) and its footprint. */
const spotOf = (eid: number) => ({ x: Building.x[eid]! + Building.w[eid]! / 2, z: Building.z[eid]! + Building.d[eid]! / 2, height: 20 });

function firstOf(ctx: GameContext, defId: string) {
  const eid = ctx.city.buildingEntities().find((e) => ctx.city.buildingDef(e).id === defId);
  return eid === undefined ? undefined : spotOf(eid);
}

/** Where most of the city is: the centre of the district with the most buildings. */
function heart(ctx: GameContext): { x: number; z: number } {
  const city = ctx.city;
  const n = new Map<string, number>();
  for (const e of city.buildingEntities()) {
    const d = city.districtAt(Building.x[e]!, Building.z[e]!);
    if (d) n.set(d, (n.get(d) ?? 0) + 1);
  }
  const best = [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
  const d = city.districts.find((a) => a.name === best);
  if (d) return { x: (d.x0 + d.x1 + 1) / 2, z: (d.z0 + d.z1 + 1) / 2 };
  const e = city.buildingEntities()[0];
  return e !== undefined ? spotOf(e) : { x: city.size / 2, z: city.size / 2 };
}

export const momentsModule: GameModule = {
  id: 'moments',
  deps: ['hud'],
  init(ctx) {
    const ceremony = new Ceremony(ctx);
    let mode: MomentsMode = 'all';
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === 'all' || m === 'major' || m === 'off') mode = m;
    } catch {
      /* storage blocked */
    }
    const queue: { m: MomentSpec; done?: () => void }[] = [];
    const play = (m: MomentSpec, done?: () => void) => {
      if (mode === 'off' || (mode === 'major' && m.scale === 'minor')) return void done?.();
      if (queue.some((q) => q.m.id === m.id)) return;
      queue.push({ m, done });
      // A backed-up queue keeps its grand moments.
      while (queue.length > 3) {
        const i = queue.findIndex((q) => q.m.scale === 'minor' && !q.done);
        if (i < 0) break;
        queue.splice(i, 1);
      }
    };
    const next = () => {
      if (ceremony.playing || !queue.length || ctx.loading || document.body.classList.contains('chapter-open')) return;
      const { m, done } = queue.shift()!;
      ceremony.play(m, () => done?.());
    };

    // ── Baselines: a city change arms the triggers a few seconds later, from where the city already is ──
    const city = () => ctx.city;
    let armIn = 4;
    let popLevel = 0;
    let golden = false;
    let goldenFor = 0;
    let topLevel = false;
    const arm = () => {
      const c = city();
      popLevel = MILESTONES.filter((m) => c.stats.population >= m).length;
      golden = isGolden();
      topLevel = c.buildingEntities().some((e) => Building.tier[e]! >= 2);
      goldenFor = 0;
    };
    const armed = () => armIn <= 0;
    for (const ev of ['city:reset', 'load:done'] as const)
      ctx.bus.on(ev, () => {
        armIn = 4;
        queue.length = 0;
      });
    const isGolden = () => {
      const t = city().pulse.tiers;
      return SYSTEMS.every((k) => t[k] <= 1) && SYSTEMS.filter((k) => t[k] === 0).length >= 6;
    };

    // ── Triggers ──
    ctx.bus.on('project:done', ({ id }) => {
      if (ctx.loading || id === 'flora') return;
      const p = PROJECTS[id];
      if (id === 'skylanes')
        play({
          id: 'skylanes',
          scale: 'grand',
          tone: 'sky',
          emblem: 'pod',
          eyebrow: 'Unlock · charter granted',
          title: 'Sky-lanes',
          lines: ['Air corridors licensed over the island', 'First pod pilots certified', 'Pod Docks, Interchanges and the Skylane Nexus unlocked'],
          sub: 'Commuters can fly now instead of jamming the streets. Build a Pod Dock near your busiest homes.',
          at: firstOf(ctx, 'drone-fabricator') ?? heart(ctx),
          sound: 'triumph',
        });
      else if (id === 'aeroline')
        play({
          id: 'aeroline',
          scale: 'grand',
          tone: 'gold',
          emblem: 'train',
          eyebrow: 'Unlock · the loop is complete',
          title: 'The Aeroline',
          lines: ['Maglev loop raised over the island', 'Four stations online', 'Pod transfers at every station'],
          sub: p.unlocks,
          at: firstOf(ctx, 'aeroline-station') ?? { x: city().size / 2, z: city().size / 2 },
          sound: 'triumph',
        });
    });

    ctx.bus.on('wonder:discovered', ({ id, name }) => {
      if (ctx.loading) return;
      const k = id as keyof typeof WONDER_SITES;
      const site = (k === 'whales' ? WONDER_SITES.whales[0] : WONDER_SITES[k]) as readonly [number, number] | undefined;
      const S = city().size;
      play({
        id: `wonder:${id}`,
        scale: 'grand',
        tone: 'sea',
        emblem: 'gem',
        eyebrow: 'Sea wonder · risen',
        title: name,
        lines: [...(city().growth.progression ? [`${city().growth.wonders.length} sea wonders found`] : []), `Day ${city().day} · ${fmt(city().stats.population)} residents`],
        sub: 'It rose from the sea where your city could see it. Residents flock to the shore, and harmony rises.',
        ...(site ? { at: { x: site[0] * S, z: site[1] * S, y: 0, height: 30 } } : {}),
        sound: 'wonder',
      });
    });

    ctx.bus.on('consequence', ({ rule, kind, text }) => {
      if (kind !== 'start' || ctx.loading || !armed()) return;
      if (rule === 'harmony-streak')
        play({ id: 'streak', scale: 'minor', tone: 'bloom', emblem: 'happy', eyebrow: 'Reputation · word spreads', title: 'A happy city', lines: [text.split('. ')[0] ?? text], sub: 'Visitors are coming, and Flora works at a discount.', sound: 'milestone' });
      else if (rule === 'transit-city')
        play({ id: 'transit', scale: 'minor', tone: 'sky', emblem: 'pod', eyebrow: 'Achievement · mobility', title: 'A transit city', lines: [text.split('. ')[0] ?? text], sub: 'Quieter streets near stations: land is worth more and residents are happier.', sound: 'milestone' });
    });

    ctx.bus.on('incident:logged', ({ record: r }) => {
      if (ctx.loading || !armed() || !['earthquake', 'tornado', 'tsunami'].includes(r.kind) || r.severity < 0.8) return;
      play({
        id: `weathered:${r.id}`,
        scale: 'minor',
        tone: 'storm',
        emblem: r.kind === 'tsunami' ? 'wave' : r.kind === 'tornado' ? 'storm' : 'quake',
        eyebrow: `Incident closed · ${r.district ?? 'the island'}`,
        title: `${r.name} weathered`,
        lines: [`${r.hits} hits · ${r.lost} ruined${r.displaced ? ` · ${fmt(r.displaced)} displaced` : ''}`, `Losses ◈${fmt(r.cost)}`],
        sub: r.prevented?.[0] ?? `The city stands. Repair what was hit (Dashboard → Incidents).`,
        ...(r.x !== undefined && r.z !== undefined ? { at: { x: r.x, z: r.z } } : {}),
        camera: false,
        sound: 'weathered',
      });
    });

    ctx.bus.on('building:tier', ({ eid, tier }) => {
      if (ctx.loading || !armed() || topLevel || tier < 2) return;
      topLevel = true;
      play({
        id: 'top-level',
        scale: 'minor',
        tone: 'gold',
        emblem: 'up',
        eyebrow: 'Achievement · thriving',
        title: 'Top level',
        lines: [`${ctx.city.buildingDef(eid).name} grew to level 3`],
        sub: 'Powered, watered, full, green and well kept: it thrives. Keep its neighbours that way too.',
        at: spotOf(eid),
        camera: false,
        sound: 'milestone',
      });
    });

    ctx.services.provide('moments', {
      play,
      get mode() {
        return mode;
      },
      set mode(m: MomentsMode) {
        mode = m;
        try {
          localStorage.setItem(MODE_KEY, m);
        } catch {
          /* ignore */
        }
      },
      get playing() {
        return ceremony.playing;
      },
    });

    let tick = 0;
    ctx.systems.add({
      id: 'moments',
      phase: 'render',
      order: 140,
      update: (_c, f) => {
        ceremony.update(f.dt);
        next();
        if ((tick += f.dt) < 1) return;
        tick = 0;
        if (ctx.loading) return;
        if (armIn > 0) {
          if ((armIn -= 1) <= 0) arm();
          return;
        }
        const c = city();
        // Population milestones (upward crossings only).
        const level = MILESTONES.filter((m) => c.stats.population >= m).length;
        if (level > popLevel) {
          popLevel = level;
          const m = MILESTONES[level - 1]!;
          play({
            id: `pop:${m}`,
            scale: m >= 10000 ? 'grand' : 'minor',
            tone: 'gold',
            emblem: 'people',
            eyebrow: `Milestone · ${c.growth.name || 'the city'}`,
            title: `${fmt(m)} residents`,
            lines: [`Day ${c.day} · ${c.buildingEntities().length} buildings`, `Harmony ${Math.round(c.stats.happiness)} · credits ◈${fmt(c.credits)}`],
            sub: MILESTONES[level] ? `Next milestone: ${fmt(MILESTONES[level])} residents.` : 'The island has never been home to so many.',
            at: heart(ctx),
            camera: false,
            sound: 'milestone',
          });
        }
        // A golden age: held for 20 s, once per city.
        if (!golden) {
          goldenFor = isGolden() ? goldenFor + 1 : 0;
          if (goldenFor >= 20) {
            golden = true;
            const t = c.pulse.tiers;
            play({
              id: 'golden',
              scale: 'grand',
              tone: 'gold',
              emblem: 'sparkle',
              eyebrow: 'Achievement · every system in harmony',
              title: 'A golden age',
              lines: SYSTEM_ORDER.map((k) => `${SYSTEM_LABELS[k]} ${TIERS[t[k]]}`).slice(0, 6),
              sub: `${c.growth.name || 'The city'} is thriving on every front. Remember what got you here: write it down in the Seedvault.`,
              at: heart(ctx),
              sound: 'triumph',
            });
          }
        }
      },
    });
  },
};
