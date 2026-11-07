/**
 * Who built a building or a bridge: the steward (player), the city itself (the founding plan, earned wonders,
 * scripted content) or Flora, the city assistant, acting on a request. Saved per object and shown in the
 * inspector and the inventory.
 */
export type Builder = 'player' | 'system' | 'flora';

export const BUILDERS: readonly Builder[] = ['player', 'system', 'flora'];

/** Inspector label per builder. */
export const BUILDER_NAMES: Record<Builder, string> = {
  player: 'You (steward)',
  system: 'City (founding plan)',
  flora: 'Flora AI',
};

/** One-letter save codes (`p` / `s` / `f`). */
export const builderCode = (b: Builder): string => b[0]!;
export const builderFromCode = (c: string | undefined): Builder =>
  c === 'p' ? 'player' : c === 'f' ? 'flora' : 'system';
