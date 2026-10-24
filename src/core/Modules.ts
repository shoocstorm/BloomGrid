/**
 * Feature modules are the unit of extensibility. The core never imports a feature;
 * `main.ts` hands a list of modules to the loader, which orders them by dependency
 * and initialises each with the shared game context.
 */
export interface GameModule<Ctx> {
  id: string;
  deps?: string[];
  init(ctx: Ctx): void | Promise<void>;
  dispose?(ctx: Ctx): void;
}

export function sortModules<Ctx>(modules: GameModule<Ctx>[]): GameModule<Ctx>[] {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const out: GameModule<Ctx>[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (m: GameModule<Ctx>, path: string[]) => {
    const s = state.get(m.id);
    if (s === 'done') return;
    if (s === 'visiting') throw new Error(`Module dependency cycle: ${[...path, m.id].join(' -> ')}`);
    state.set(m.id, 'visiting');
    for (const dep of m.deps ?? []) {
      const d = byId.get(dep);
      if (!d) throw new Error(`Module "${m.id}" depends on missing module "${dep}"`);
      visit(d, [...path, m.id]);
    }
    state.set(m.id, 'done');
    out.push(m);
  };
  modules.forEach((m) => visit(m, []));
  return out;
}

export async function loadModules<Ctx>(ctx: Ctx, modules: GameModule<Ctx>[]): Promise<GameModule<Ctx>[]> {
  const ordered = sortModules(modules);
  for (const m of ordered) await m.init(ctx);
  return ordered;
}
