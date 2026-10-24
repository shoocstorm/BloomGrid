/**
 * Data-driven command system. Every player action is a serializable `{ type, payload }`.
 * Handlers return undo data on success (or `null` to reject), which enables undo/redo,
 * replays and deterministic tests.
 */
export interface CommandRecord<P = unknown> {
  type: string;
  payload: P;
}

export interface CommandHandler<Ctx, P, U> {
  apply(ctx: Ctx, payload: P): U | null;
  revert(ctx: Ctx, payload: P, undo: U): void;
}

interface Entry {
  record: CommandRecord;
  undo: unknown;
}

export class CommandStack<Ctx> {
  private handlers = new Map<string, CommandHandler<Ctx, unknown, unknown>>();
  private done: Entry[] = [];
  private undone: Entry[] = [];
  /** Every successfully applied record, in order (for replays / determinism tests). */
  readonly log: CommandRecord[] = [];
  onChange: (() => void) | null = null;

  constructor(
    private ctx: Ctx,
    private limit = 200,
  ) {}

  register<P, U>(type: string, handler: CommandHandler<Ctx, P, U>): void {
    if (this.handlers.has(type)) throw new Error(`Command "${type}" already registered`);
    this.handlers.set(type, handler as CommandHandler<Ctx, unknown, unknown>);
  }

  /** Executes a command. `undoable=false` is used for scripted/bulk actions (stress tests, loads). */
  execute<P>(type: string, payload: P, undoable = true): boolean {
    const handler = this.handlers.get(type);
    if (!handler) throw new Error(`Unknown command "${type}"`);
    const undo = handler.apply(this.ctx, payload);
    if (undo === null) return false;
    const record = { type, payload };
    this.log.push(record);
    if (undoable) {
      this.done.push({ record, undo });
      if (this.done.length > this.limit) this.done.shift();
      this.undone.length = 0;
    }
    this.onChange?.();
    return true;
  }

  undo(): boolean {
    const e = this.done.pop();
    if (!e) return false;
    this.handlers.get(e.record.type)!.revert(this.ctx, e.record.payload, e.undo);
    this.undone.push(e);
    this.onChange?.();
    return true;
  }

  redo(): boolean {
    const e = this.undone.pop();
    if (!e) return false;
    const undo = this.handlers.get(e.record.type)!.apply(this.ctx, e.record.payload);
    if (undo === null) return false;
    this.done.push({ record: e.record, undo });
    this.onChange?.();
    return true;
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  clearHistory(): void {
    this.done.length = 0;
    this.undone.length = 0;
    this.log.length = 0;
    this.onChange?.();
  }
}
