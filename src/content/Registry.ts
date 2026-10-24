/** Ordered, id-keyed registry. Registration order defines stable numeric indices for the ECS. */
export class Registry<T extends { id: string }> {
  private byId = new Map<string, T>();
  private list: T[] = [];

  constructor(readonly kind: string) {}

  register(def: T): T {
    if (this.byId.has(def.id)) throw new Error(`${this.kind} "${def.id}" already registered`);
    this.byId.set(def.id, def);
    this.list.push(def);
    return def;
  }

  get(id: string): T {
    const d = this.byId.get(id);
    if (!d) throw new Error(`Unknown ${this.kind} "${id}"`);
    return d;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  indexOf(id: string): number {
    return this.list.indexOf(this.get(id));
  }

  at(index: number): T {
    return this.list[index]!;
  }

  all(): readonly T[] {
    return this.list;
  }
}
