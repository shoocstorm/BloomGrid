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

/**
 * Initialises modules in dependency order. Pass a clock (e.g. `performance.now`) to get each
 * module's init time in ms; the core itself stays clock-free.
 */
export async function loadModules<Ctx>(ctx: Ctx, modules: GameModule<Ctx>[], now?: () => number): Promise<Record<string, number>> {
  const times: Record<string, number> = {};
  for (const m of sortModules(modules)) {
    const t = now?.() ?? 0;
    await m.init(ctx);
    if (now) times[m.id] = Math.round(now() - t);
  }
  return times;
}
