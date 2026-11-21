import type { GameContext, GameModule } from '@/game/context';
import { Building } from '@/ecs/components';
import { SYSTEMS, TIERS } from '@/sim/pulseState';
import { PROJECTS } from '@/sim/projects';
import { CHARTERS } from '@/sim/charters';
import { ERAS } from '@/sim/eras';
import { WONDERS } from '@/sim/wonders';
import { WONDER_SITES } from '@/modules/scenery/sites';
import { isOpen, type UnlockId } from '@/sim/growthState';
import { SYSTEM_LABELS } from '@/modules/pulse/PulsePanel';
import { SYSTEM_ORDER } from '@/sim/indicators';
import { Ceremony, type MomentSpec } from './Ceremony';
import { openReel, reelClock, type Reel, type ReelOptions } from './reel';
import { finishFilm, leadIn } from './finish';
import { FilmStage } from './FilmStage';
import { playMaidenFlight } from './films/flight';
import { playSomethingStirs } from './films/stirs';
import { playWhatTheSeaRemembers } from './films/remembers';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import './moments.css';

export type { MomentSpec } from './Ceremony';
export type { Reel, ReelOptions, EndCard } from './reel';
export { reelClock } from './reel';

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
 * | A new era | grand | `era:advanced` (Grove, Canopy, Bloom; plan v5 Phase 28) |
 * | A Gold charter, a challenge won or lost | minor | `charter:claimed` at Gold, `objective:won` / `objective:lost` |
 *
 * One plays at a time (a queue, deduped by id, minor ones dropped when it backs up), none while a city loads or
 * settles (baselines are taken a few seconds after a city change, so loading a big city celebrates nothing) or while
 * the New Chapter dialog is open. Settings → Display: all moments, major only, or off (per viewer).
 */
export type MomentsMode = 'all' | 'major' | 'off';

/**
 * A replayable film (D-181): a cutscene (`run`) or a ceremony (`spec`). Register every new cutscene here and it
 * shows in Build → Goals → Replays once `earned` says the city has seen it.
 */
export interface Film {
  id: string;
  title: string;
  /** Icon key (`icons.ts`). */
  icon: string;
  /** A line for its gallery poster (D-183). */
  blurb?: string;
  earned(): boolean;
  /** A cutscene: plays and calls `finish` when over. A replay must not change the city. */
  run?: (finish: () => void) => void;
  /** A ceremony: the spec to play again. */
  spec?: () => MomentSpec;
}

export interface MomentsService {
  /** Queues a moment; `done` runs when it has played (or at once when moments are off). */
  play(m: MomentSpec, done?: () => void): void;
  /**
   * Queues a custom sequence (a cutscene, D-178) in the same line as the ceremonies: `run` starts when its turn
   * comes and calls `finish` when it is over; meanwhile `playing` is true (HUD juice and charms wait). It plays
   * whatever the Settings mode, being a story beat rather than a celebration.
   */
  stage(id: string, run: (finish: () => void) => void): void;
  /**
   * Starts a sequence at once, not at the next frame's turn (D-184): a film that must be up before a loading screen
   * lifts. Ignores the queue (it was cleared by the city change); `playing` is true until `finish`.
   */
  stageNow(id: string, run: (finish: () => void) => void): void;
  /** The film kit (D-185): opens a reel for a cutscene (see `reel.ts`); modules make their films with it. */
  reel(opts: ReelOptions, done: () => void): Reel;
  /** Every reel's clock (and the 3D film stage's): scripts hold it to freeze a frame (`scripts/scenes/film.js`). */
  readonly clock: { held: boolean };
  /** The cinematic finish (grade, drift, vignette, grain; D-188) for a film that builds its own root. */
  finish(root: HTMLElement, set: HTMLElement, leak?: string): void;
  /** The lead-in (D-194) for a film with its own root: resolves when the iris has closed to black (start there). */
  leadIn(root: HTMLElement): Promise<void>;
  mode: MomentsMode;
  readonly playing: boolean;
  /** Registers a replayable film (a later call with the same id replaces it). */
  film(f: Film): void;
  /** The films this city has earned, in registration order. */
  films(): Film[];
  /** Plays a film again now (whatever the Settings mode). */
  replay(id: string): void;
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
/** Films' gallery titles and blurbs (D-185). */
const FILM_TITLES: Partial<Record<string, string>> = { skylanes: 'Maiden Flight' };
const FILM_BLURBS: Partial<Record<string, string>> = {
  skylanes: 'The first pod, a very nervous test pilot, and a gull that did not buy a ticket.',
};

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
    /** `chain`: the second half of a film (its ceremony, D-187): no gap before it, and it may move the camera. */
    const queue: { m: MomentSpec; done?: () => void; run?: (finish: () => void) => void; chain?: boolean }[] = [];
    /** A staged sequence is on (D-178). */
    let staged = false;
    /**
     * Breathing room between moments (D-186): nothing starts until a few seconds after the last one ended, so a
     * ceremony never runs on from a film (or into one) as if they were one sequence.
     */
    const GAP = 3;
    let calmUntil = 0;
    /** When the last film ended: ceremonies that waited behind a film keep the camera where the player is. */
    let filmEnded = -Infinity;
    const now = () => performance.now() / 1000;
    const play = (m: MomentSpec, done?: () => void) => {
      if (mode === 'off' || (mode === 'major' && m.scale === 'minor')) return void done?.();
      if (queue.some((q) => q.m.id === m.id)) return;
      // Arriving during a film: it will play after it, where the player already is.
      queue.push({ m: staged ? { ...m, camera: false } : m, done });
      // A backed-up queue keeps its grand moments.
      while (queue.length > 3) {
        const i = queue.findIndex((q) => q.m.scale === 'minor' && !q.done);
        if (i < 0) break;
        queue.splice(i, 1);
      }
    };
    const runStaged = (run: (finish: () => void) => void) => {
      staged = true;
      document.body.classList.add('moment-on');
      let over = false;
      run(() => {
        if (over) return;
        over = true;
        staged = false;
        document.body.classList.remove('moment-on');
        filmEnded = now();
        calmUntil = now() + GAP;
      });
    };
    const next = () => {
      if (staged || ceremony.playing || !queue.length || ctx.loading || document.body.classList.contains('chapter-open')) return;
      if (now() < calmUntil && !queue[0]!.chain) return;
      const { m, done, run, chain } = queue.shift()!;
      if (run) return runStaged(run);
      // Right after a film, a ceremony never flies the camera off (to the city's heart), unless it is the film's own.
      const spec = !chain && now() - filmEnded < GAP + 2 ? { ...m, camera: false } : m;
      ceremony.play(spec, () => {
        calmUntil = now() + GAP;
        done?.();
      });
    };
    const stage = (id: string, run: (finish: () => void) => void) => {
      if (queue.some((q) => q.m.id === id)) return;
      // Ahead of anything waiting: it is the story beat the waiting moments would interrupt.
      queue.unshift({ m: { id, scale: 'grand' } as MomentSpec, run });
    };

    // ── Replays (D-181) ──
    const films = new Map<string, Film>();
    const film = (f: Film) => {
      const fresh = !films.has(f.id);
      films.set(f.id, f);
      // Every film hangs in the gallery's Cutscenes hall (D-183), whether or not this city has seen it.
      if (fresh) ctx.services.tryGet('gallery')?.add(filmExhibit(f.id));
    };
    const filmExhibit = (id: string) => {
      const f = () => films.get(id)!;
      const kind = () => (f().run ? 'Cutscene' : 'Ceremony');
      return {
        id: `film:${id}`,
        name: f().title,
        group: 'Cutscenes',
        blurb: f().blurb ?? (f().run ? 'A short film.' : 'A city moment, played again.'),
        facts: [['Kind', kind()] as [string, string]],
        panel: () =>
          h(
            'div',
            { class: 'gx-film' },
            h('span', { class: 'gx-film-ico' }, icon(f().icon)),
            h('span', { class: 'gx-film-kind' }, kind()),
            h('b', {}, f().title),
            h('p', {}, f().blurb ?? ''),
            h(
              'button',
              {
                class: 'gx-play',
                onClick: () => {
                  ctx.services.tryGet('gallery')?.close();
                  replay(id);
                },
              },
              icon('play'),
              'Play',
            ),
            h('p', { class: 'gx-film-note' }, f().earned() ? 'Seen in this city · also in Build → Goals → Replays' : 'Not seen in this city yet'),
          ),
      };
    };
    const replay = (id: string) => {
      const f = films.get(id);
      if (!f) return;
      // Asked for: no breathing room to wait out.
      calmUntil = 0;
      if (f.run) return stage(`replay:${id}`, f.run);
      const spec = f.spec;
      // A ceremony replayed: its own spec, always grand, never deduped against the live queue.
      if (spec) stage(`replay:${id}`, (finish) => ceremony.play({ ...spec(), id: `replay:${id}` }, finish));
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
    // Long-term goals (plan v5, Phase 28).
    const eraSpec = (era: number): MomentSpec => {
      const e = ERAS[era]!;
      const prev = ERAS[era - 1];
      const name = e.name;
      return {
        id: `era:${e.id}`,
        scale: 'grand',
        tone: era >= 3 ? 'gold' : 'bloom',
        emblem: e.icon,
        eyebrow: `A new era · ${prev ? `${prev.name} → ` : ''}${name}`,
        title: `The ${name} era`,
        lines: [e.line, `${e.slots === 8 ? 'Every' : e.slots} ordinance slot${e.slots === 1 ? '' : 's'} on a growing island`, era >= 2 ? 'The Bloom Expo may come calling' : 'The island expects more of you now'],
        sub: 'Crises come a little harder in a greater city. Take up a new charter from Build → Goals.',
        at: heart(ctx),
        sound: 'triumph',
      };
    };
    ctx.bus.on('era:advanced', ({ era }) => {
      if (!ctx.loading && armed()) play(eraSpec(era));
    });
    ERAS.forEach((e, i) => {
      if (i > 0) film({ id: `era:${e.id}`, title: `The ${e.name} era`, icon: e.icon, blurb: e.line, earned: () => city().charters.era >= i, spec: () => eraSpec(i) });
    });
    ctx.bus.on('charter:claimed', ({ id, tier, title, perk }) => {
      if (ctx.loading || tier < 3 || !armed()) return;
      const d = CHARTERS.find((c) => c.id === id);
      play({
        id: `charter:${id}`,
        scale: 'minor',
        tone: 'gold',
        emblem: d?.icon ?? 'star',
        eyebrow: 'Charter · Gold',
        title: title ?? d?.name ?? id,
        lines: [`${d?.name ?? id} complete`, ...(perk ? [perk] : [])],
        sub: 'The title is yours for good, and your legacy grows.',
        sound: 'milestone',
      });
    });
    ctx.bus.on('objective:won', ({ scenario, seconds }) => {
      if (ctx.loading) return;
      play({ id: 'challenge', scale: 'minor', tone: 'gold', emblem: 'star', eyebrow: 'Challenge · won', title: scenario, lines: [`Done in ${Math.round(seconds / 60)} minutes`], sub: 'The city plays on. Take up a charter next.', sound: 'triumph' });
    });
    ctx.bus.on('objective:lost', ({ scenario, reason }) => {
      if (ctx.loading) return;
      play({ id: 'challenge', scale: 'minor', tone: 'storm', emblem: 'st-warn', eyebrow: 'Challenge · lost', title: scenario, lines: [reason], sub: 'The city plays on as free play, or try again from the New Chapter dialog.', sound: 'weathered' });
    });
    /** An unlock project's ceremony (Flora's is the assistant's own). */
    const projectSpec = (id: UnlockId): MomentSpec | null => {
      const p = PROJECTS[id];
      if (id === 'skylanes')
        return {
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
        };
      else if (id === 'aeroline')
        return {
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
        };
      else if (id === 'police')
        return {
          id: 'police',
          scale: 'grand',
          tone: 'sky',
          emblem: 'drone',
          eyebrow: 'Unlock · charter granted',
          title: 'The Aegis Watch',
          lines: ['Island police founded', 'First drone crews certified', 'Aegis Watch Precinct unlocked'],
          sub: p.unlocks,
          at: firstOf(ctx, 'ember-watch') ?? heart(ctx),
          sound: 'triumph',
        };
      else if (id === 'cruise')
        return {
          id: 'cruise',
          scale: 'grand',
          tone: 'sea',
          emblem: 'ferry',
          eyebrow: 'Unlock · maiden voyage',
          title: 'The Tidesong',
          lines: ['The Drift returns: cruise ferry commissioned', 'Tidesong Pier open', 'Voyages to the sea wonders, with a Drift singer aboard'],
          sub: p.unlocks,
          at: ctx.services.tryGet('ferry')?.position ?? heart(ctx),
          sound: 'triumph',
        };
      else if (id === 'skyguard')
        return {
          id: 'skyguard',
          scale: 'grand',
          tone: 'sky',
          emblem: 'jet',
          eyebrow: 'Unlock · wings up',
          title: 'Sky Guard',
          lines: ['Air wing stood up', 'Bloom One cleared for patrol', 'Chase cam, rolls and display smoke'],
          sub: p.unlocks,
          at: firstOf(ctx, 'zephyr-airport') ?? heart(ctx),
          sound: 'triumph',
        };
      return null;
    };
    /** Unlocks with a film of their own (D-185) instead of a ceremony. */
    const projectFilm: Partial<Record<UnlockId, (finish: () => void) => void>> = {
      skylanes: (finish) => playMaidenFlight(ctx, finish),
    };
    ctx.bus.on('project:done', ({ id }) => {
      if (ctx.loading || id === 'flora') return;
      const run = projectFilm[id];
      if (run) return stage(`project:${id}`, run);
      const spec = projectSpec(id);
      if (spec) play(spec);
    });
    for (const id of ['skylanes', 'aeroline', 'police', 'cruise', 'skyguard'] as const) {
      const run = projectFilm[id];
      film({
        id: `project:${id}`,
        title: run ? FILM_TITLES[id] ?? PROJECTS[id].name : PROJECTS[id].name,
        icon: PROJECTS[id].icon,
        blurb: run ? FILM_BLURBS[id] : `The unlock ceremony: ${PROJECTS[id].unlocks}`,
        earned: () => isOpen(city().growth, id),
        ...(run ? { run } : { spec: () => projectSpec(id)! }),
      });
    }

    /** The wonder's ceremony: its emblem and name, and the camera out over the sea to where it stands. */
    const wonderSpec = (id: string, name: string): MomentSpec => {
      const k = id as keyof typeof WONDER_SITES;
      const site = (k === 'whales' ? WONDER_SITES.whales[0] : WONDER_SITES[k]) as readonly [number, number] | undefined;
      const S = city().size;
      return {
        id: `wonder:${id}`,
        scale: 'grand',
        tone: 'sea',
        emblem: 'gem',
        eyebrow: 'Sea wonder · risen · the Choir answers',
        title: name,
        lines: [...(city().growth.progression ? [`${city().growth.wonders.length} sea wonders found`] : []), `Day ${city().day} · ${fmt(city().stats.population)} residents`],
        sub: 'The sea gave it back to a city that keeps the promises. Residents flock to the shore, and harmony rises.',
        // Framed whole: a wonder is far bigger than the buildings ceremonies usually frame.
        ...(site ? { at: { x: site[0] * S, z: site[1] * S, y: 0, height: 30, size: 70 } } : {}),
        camera: true,
        sound: 'wonder',
      };
    };
    /**
     * A wonder rising (D-185, D-187): the film "Something Stirs", then at once its ceremony, which flies the camera
     * to the wonder, so the player sees what rose and where. With moments off, the camera still goes there.
     */
    const wonderFilm = (id: string, name: string) => (finish: () => void) => {
      const after = () => {
        const spec = wonderSpec(id, name);
        if (mode === 'off') {
          if (spec.at) ctx.cameraCtl.locate(spec.at.x, spec.at.z, { size: 70, height: 30 });
        } else queue.unshift({ m: spec, chain: true });
        finish();
      };
      // The colonnade brings the island's oldest story with it (D-192): Halcyon and the Long Tide.
      if (id === 'colonnade') playWhatTheSeaRemembers(ctx, after);
      else playSomethingStirs(ctx, { id, name }, after);
    };
    ctx.bus.on('wonder:discovered', ({ id, name }) => {
      if (!ctx.loading) stage(`wonder:${id}`, wonderFilm(id, name));
    });
    // The two always there never rose before the steward's eyes: nothing to replay.
    for (const w of WONDERS.filter((x) => !x.start))
      film({
        id: `wonder:${w.id}`,
        title: w.id === 'colonnade' ? 'What the Sea Remembers' : `${w.name} rises`,
        icon: w.id === 'colonnade' ? 'ruin' : 'gem',
        blurb:
          w.id === 'colonnade'
            ? 'The Sunken Colonnade rises, and with it the island’s oldest story: Halcyon, Meridian and the Long Tide.'
            : `Something stirs off the coast, and the same old fisher misses it again: ${w.name} rises.`,
        earned: () => city().growth.wonders.includes(w.id),
        run: wonderFilm(w.id, w.name),
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
      stage,
      stageNow: (_id: string, run: (finish: () => void) => void) => runStaged(run),
      reel: (opts: ReelOptions, done: () => void) => openReel(ctx, opts, done),
      clock: reelClock,
      finish: (root: HTMLElement, set: HTMLElement, leak?: string) => finishFilm(root, set, leak),
      leadIn: (root: HTMLElement) => {
        ctx.bus.emit('film:hit', { hit: 'iris' });
        return leadIn(root).then(() => ctx.bus.emit('film:hit', { hit: 'open' }));
      },
      film,
      films: () => [...films.values()].filter((f) => f.earned()),
      replay,
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
        return ceremony.playing || staged;
      },
    });

    // The 3D film stage (D-196), while a film has it on screen: its camera, actors and lights, before the render.
    ctx.systems.add({ id: 'film-stage', phase: 'sync', order: 121, update: (_c, f) => FilmStage.active?.update(f.dt) });

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
