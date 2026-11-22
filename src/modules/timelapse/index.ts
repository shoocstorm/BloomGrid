import type { GameModule } from '@/game/context';
import type { City } from '@/sim/City';
import type { UnlockId } from '@/sim/growthState';
import { filmStats, playTimelapse } from './film';
import { TimelapsePromo } from './promo';

/**
 * The time-lapse (plan v6, D-219): "The Island Remembers", a film of the island's whole life replayed over the real
 * city from its history ledger (`sim/history.ts`). It is a replayable film (Build → Goals → Replays, the gallery's
 * Cutscenes hall) as soon as the city has a past to show, and scripts start it with `timelapse.play()`.
 */
export interface TimelapseService {
  /** Plays the film now, in the moments queue; `done` runs when it has faded out. */
  play(done?: () => void): void;
  /** Whether this city has a past worth replaying. */
  earned(): boolean;
  /** True while the film plays: traffic, pods and walkers keep off the veiled island. */
  readonly playing: boolean;
  /** History the player has not watched yet (the featured card's New tag). */
  readonly isNew: boolean;
  /** Earned but never watched in this city (counts on the Goals badge). */
  readonly unseen: boolean;
  /** The featured card for Build → Goals, or null while there is no past to show. */
  card(): HTMLElement | null;
  /**
   * Whether what an unlock project brought (the Aeroline, police drones, the Tidesong, the Sky Guard) shows now: false
   * only while the film plays and that project has not yet completed on its clock (Phase 33). Modules AND it into
   * their own visibility.
   */
  shows(project: UnlockId): boolean;
  /** For scripts: gone buildings standing on the film stage now (and where the latest stands), flares burning. */
  stats(): { ghosts: number; ghostAt: [number, number, number] | null; flares: number };
}

declare module '@/core/Services' {
  interface GameServices {
    timelapse: TimelapseService;
  }
}

/** A city has a past once a day has gone by or anything was built after its founding. */
export const hasHistory = (city: City): boolean => city.day >= 2 || city.history.born.size > 0 || city.history.roads.size > 0;

export const timelapseModule: GameModule = {
  id: 'timelapse',
  deps: ['construction', 'moments'],
  init(ctx) {
    const earned = () => hasHistory(ctx.city);
    let playing = 0;
    const play = () => ctx.services.get('moments').stage('timelapse', (finish) => run(finish));
    const promo = new TimelapsePromo(ctx, earned, play);
    const run = (finish: () => void) => {
      playing++;
      promo.noteWatched();
      playTimelapse(ctx, () => {
        playing--;
        finish();
      });
    };
    ctx.services.get('moments').film({
      id: 'timelapse',
      title: 'The Island Remembers',
      icon: 'calendar',
      blurb: 'Your island from its founding to today: every highway and building rising in the order you built them, with its eras, wonders and storms.',
      earned,
      run,
    });
    ctx.services.provide('timelapse', {
      play: (done) => ctx.services.get('moments').stage('timelapse', (finish) => run(() => (finish(), done?.()))),
      earned,
      get playing() {
        return playing > 0;
      },
      get isNew() {
        return promo.isNew;
      },
      get unseen() {
        return promo.unseen;
      },
      card: () => (earned() ? promo.feature() : null),
      stats: () => ({ ghosts: filmStats.ghosts, ghostAt: filmStats.ghostAt, flares: filmStats.flares }),
      shows: (project) => {
        if (playing <= 0) return true;
        const at = filmStats.gates.get(project);
        return at === undefined || (filmStats.ft >= 0 && filmStats.ft >= at);
      },
    });
    // Flora can play it (registered after her own tools, so her menus keep their letters).
    ctx.services.tryGet('agent')?.register({
      name: 'play_timelapse',
      option: 'Watch the island’s story: a time-lapse from its founding to today',
      description:
        'Plays "The Island Remembers": a short film of the whole island rising again in the order it was built, with its eras, wonders and storms. Changes nothing in the city.',
      keywords: ['time-lapse', 'timelapse', 'history', 'story', 'replay', 'rewind', 'growth', 'film', 'remember'],
      input: { type: 'object', properties: {} },
      effect: 'view',
      run() {
        if (!earned()) return { played: false, reason: 'The island has no history yet: build something or let a day pass.' };
        play();
        return { played: true, film: 'The Island Remembers', seconds: promo.seconds(), day: ctx.city.day };
      },
    });
    // The invitation looks for its moment once a second.
    let t = 0;
    ctx.systems.add({
      id: 'timelapse.promo',
      phase: 'render',
      order: 113,
      update(_c, f) {
        t += f.dt;
        if (t < 1) return;
        t = 0;
        promo.tick();
      },
    });
  },
};
