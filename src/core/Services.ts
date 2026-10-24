/**
 * Typed service locator for cross-module APIs. Modules augment `GameServices`:
 *
 *   declare module '@/core/Services' { interface GameServices { flora: Flora } }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GameServices {}

export class Services {
  private map = new Map<keyof GameServices, unknown>();

  provide<K extends keyof GameServices>(key: K, value: GameServices[K]): GameServices[K] {
    if (this.map.has(key)) throw new Error(`Service "${String(key)}" already provided`);
    this.map.set(key, value);
    return value;
  }

  get<K extends keyof GameServices>(key: K): GameServices[K] {
    if (!this.map.has(key)) throw new Error(`Service "${String(key)}" not provided`);
    return this.map.get(key) as GameServices[K];
  }

  tryGet<K extends keyof GameServices>(key: K): GameServices[K] | undefined {
    return this.map.get(key) as GameServices[K] | undefined;
  }
}
