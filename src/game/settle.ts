import type { GameContext } from './context';

/**
 * A city that has just appeared (boot, a new island, a load) spends its first sim seconds filling homes and
 * settling occupancy, staffing and the consequence rules from their starting values. Everything that changes in
 * that window is the city arriving where it already was, not news: milestones crossed, rules coming into force,
 * systems "recovering". Notices ask `settling()` and stay quiet until it is false (measured in sim ticks, so a
 * paused or fast city settles at its own pace).
 */
export const SETTLE_TICKS = 300;

export function settleClock(ctx: GameContext, ticks = SETTLE_TICKS): () => boolean {
  let base = ctx.city.tick;
  const rebase = () => (base = ctx.city.tick);
  ctx.bus.on('city:reset', rebase);
  ctx.bus.on('load:done', rebase);
  return () => {
    if (ctx.city.tick < base) rebase(); // a city swapped in without an event: count from where it is
    return ctx.loading || ctx.city.tick - base < ticks;
  };
}
