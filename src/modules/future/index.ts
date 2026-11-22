import type { GameModule } from '@/game/context';
import type { Projection } from '@/sim/foresee';
import { serializeCity } from '@/sim/save';
import type { ForwardReply, ForwardRequest } from './forward.worker';
import { playFuture } from './film';
import { Postcard, ProgressChip } from './postcard';

/**
 * Postcards from the future (plan v7, D-222): Flora's look ahead. `project(days)` plays a copy of the city on in a
 * worker, "if nothing changes", and resolves with a `Projection` (sim/foresee.ts). One run at a time: a new request
 * or `cancel` terminates the old worker. The last projection stays good while the steward has done nothing (no
 * command since) and the city is within `FRESH_TICKS` of where it started.
 */
export interface FutureService {
  /** Runs the city `days` on (default `DEFAULT_DAYS`); `onProgress` gets 0..1 once per simulated day. */
  project(days?: number, onProgress?: (k: number) => void): Promise<Projection>;
  cancel(): void;
  readonly running: boolean;
  /** The last finished projection, while it still describes this city (no command since, within `FRESH_TICKS`). */
  readonly last: Projection | null;
  /**
   * The whole look ahead (Phase 35): runs the projection (a progress chip with Cancel), plays "If Nothing Changes"
   * over the island, then shows the postcard with Flora's levers. Resolves with the projection (null if cancelled).
   */
  show(days?: number): Promise<Projection | null>;
  /** The postcard alone, for the last projection (or a fresh run without the film). */
  postcard(days?: number): Promise<Projection | null>;
}

declare module '@/core/Services' {
  interface GameServices {
    future: FutureService;
  }
}

/** A look ahead of ten in-game days: ≈20 s on the 2.5k-building showcase in a worker (plan v7, measured). */
export const DEFAULT_DAYS = 10;
/** "Look further" on the postcard. */
export const FAR_DAYS = 30;
/** A projection still stands for a sim minute of a city left alone. */
export const FRESH_TICKS = 600;

export const futureModule: GameModule = {
  id: 'future',
  init(ctx) {
    let worker: Worker | null = null;
    let nextId = 1;
    let pending: { id: number; reject: (e: Error) => void } | null = null;
    let last: { tick: number; days: number; cmds: number; p: Projection } | null = null;
    const fresh = (days?: number) =>
      !!last && (days === undefined || last.days === days) && last.cmds === ctx.commands.log.length && Math.abs(ctx.city.tick - last.tick) <= FRESH_TICKS;

    const cancel = () => {
      worker?.terminate();
      worker = null;
      pending?.reject(new Error('cancelled'));
      pending = null;
    };
    ctx.bus.on('city:reset', () => {
      cancel();
      last = null;
    });

    const project = (days = DEFAULT_DAYS, onProgress?: (k: number) => void): Promise<Projection> => {
      const tick = ctx.city.tick;
      const cmds = ctx.commands.log.length;
      if (fresh(days)) return Promise.resolve(last!.p);
      cancel();
      const id = nextId++;
      const save = serializeCity(ctx.city);
      worker = new Worker(new URL('./forward.worker.ts', import.meta.url), { type: 'module', name: 'bloomgrid-future' });
      const w = worker;
      return new Promise<Projection>((resolve, reject) => {
        pending = { id, reject };
        w.onmessage = (e: MessageEvent<ForwardReply>) => {
          const m = e.data;
          if (m.id !== id) return;
          if ('progress' in m) return onProgress?.(m.progress);
          w.terminate();
          if (worker === w) worker = null;
          pending = null;
          if ('error' in m) return reject(new Error(m.error));
          last = { tick, days, cmds, p: m.projection };
          resolve(m.projection);
        };
        w.onerror = (e) => {
          w.terminate();
          if (worker === w) worker = null;
          pending = null;
          reject(new Error(e.message || 'forward run failed'));
        };
        w.postMessage({ id, save, days } satisfies ForwardRequest);
      });
    };

    const chip = new ProgressChip(ctx, () => cancel());
    /** Runs (or reuses) a projection with the chip up; null when cancelled or failed. */
    const run = async (days: number): Promise<Projection | null> => {
      if (!fresh(days)) chip.show(days);
      try {
        return await project(days, (k) => chip.progress(k));
      } catch (err) {
        if ((err as Error).message !== 'cancelled') ctx.bus.emit('toast', { text: `Flora couldn't look ahead: ${(err as Error).message}`, tone: 'bad' });
        return null;
      } finally {
        chip.hide();
      }
    };
    const film = (p: Projection) =>
      new Promise<void>((resolve) => ctx.services.get('moments').stage('future', (finish) => playFuture(ctx, p, () => (finish(), resolve()))));
    const show = async (days = DEFAULT_DAYS): Promise<Projection | null> => {
      card.hide();
      const p = await run(days);
      if (!p) return null;
      await film(p);
      card.show(p);
      return p;
    };
    const card: Postcard = new Postcard(ctx, {
      watchAgain: () => {
        const p = last?.p;
        card.hide();
        if (p) void film(p).then(() => card.show(p));
      },
      lookFurther: () => void show(FAR_DAYS),
      lookAgain: (days) => {
        card.hide();
        void run(days).then((p) => p && card.show(p));
      },
    });

    // Flora looks ahead when asked (registered after her own tools, so her menus keep their letters).
    ctx.services.tryGet('agent')?.register({
      name: 'look_ahead',
      option: 'Look ahead: where the city is heading if nothing changes',
      description:
        'Runs the city on for 10 in-game days with no changes (crises, ageing and migration included) and shows the steward a postcard of where it lands, with build levers. Returns residents, harmony and credits now and then, buildings lost, crises on the way and whether the council would replace the steward. Changes nothing in the city.',
      keywords: ['future', 'ahead', 'heading', 'predict', 'projection', 'what if', 'will', 'next days', 'forecast', 'postcard'],
      input: { type: 'object', properties: {} },
      effect: 'view',
      async run() {
        const p = await (ctx.services.get('future') as FutureService).postcard(DEFAULT_DAYS);
        if (!p) return { looked: false, reason: 'cancelled' };
        return {
          days: p.days,
          residents: { now: p.start.residents, then: p.end.residents },
          harmony: { now: p.start.harmony, then: p.end.harmony },
          credits: { now: p.start.credits, then: p.end.credits },
          buildingsLost: p.ruined.length + p.removed.length,
          crises: [...new Set(p.incidents.filter((i) => i.kind !== 'fire').map((i) => i.name))],
          fires: p.incidents.filter((i) => i.kind === 'fire').length,
          councilReplacesStewardOnDay: p.replacedDay,
        };
      },
    });

    ctx.services.provide('future', {
      project,
      cancel,
      show,
      postcard: async (days = DEFAULT_DAYS) => {
        const p = await run(days);
        if (p) card.show(p);
        return p;
      },
      get running() {
        return worker !== null;
      },
      get last() {
        return fresh() ? last!.p : null;
      },
    });
  },
};
