/**
 * Typed, synchronous event bus. Feature modules extend `GameEvents` via declaration merging:
 *
 *   declare module '@/core/EventBus' { interface GameEvents { 'weaver:grown': { id: number } } }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GameEvents {}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = GameEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  once<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    const off = this.on(type, (p) => {
      off();
      handler(p);
    });
    return off;
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of set) (h as Handler<E[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
