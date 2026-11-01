import type { CommandRecord } from '@/core/Commands';
import { buildings } from '@/content';

/** Friendly verbs for the steward's commands, for the Recoveries field log (D-088). */
const VERBS: Record<string, string> = {
  build: 'built',
  road: 'laid highways',
  unroad: 'removed highways',
  channel: 'dug channels',
  setTax: 'changed taxes',
  takeLoan: 'took a loan',
  repayLoan: 'repaid a loan',
  retrofit: 'Bloom Retrofit',
  respond: 'sent fire crews',
  repair: 'repaired ruins',
  mist: 'misted soil',
  demolish: 'demolished',
  demolishMany: 'demolished',
  upgradeBuilding: 'upgraded',
  renovate: 'renovated',
  toggleBuilding: 'switched buildings',
  reclaim: 'reclaimed land',
  weave: 'wove sky-bridges',
  evacuate: 'sounded the siren',
  closeTideGates: 'closed the Tide Gates',
  startProject: 'started a project',
};
const QUIET = new Set(['floraBill', 'nameCity', 'launchFireworks', 'setFireworksAuto']);

/** "built ×2 (Fog Harp Tower, Bloom Park), changed taxes": what the steward did, in a line. */
export function describeActions(records: readonly CommandRecord[]): string {
  const by = new Map<string, { n: number; what: Set<string> }>();
  for (const r of records) {
    if (QUIET.has(r.type)) continue;
    const verb = VERBS[r.type] ?? r.type;
    const e = by.get(verb) ?? { n: 0, what: new Set<string>() };
    e.n++;
    const def = (r.payload as { def?: unknown } | null)?.def;
    if (typeof def === 'string' && buildings.has(def)) e.what.add(buildings.get(def).name);
    by.set(verb, e);
  }
  if (!by.size) return 'nothing (it recovered on its own)';
  return [...by]
    .map(
      ([v, e]) =>
        `${v}${e.n > 1 ? ` ×${e.n}` : ''}${e.what.size ? ` (${[...e.what].slice(0, 3).join(', ')})` : ''}`,
    )
    .join(', ');
}
