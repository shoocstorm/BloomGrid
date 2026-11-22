import { foresee, type Projection } from '@/sim/foresee';
import type { SaveData } from '@/sim/save';

/**
 * The forward run's worker (plan v7, D-222): its own JS realm, so the copy of the city never shares ECS stores with
 * the live one (AGENTS.md §8). One request at a time; the service terminates the worker to cancel.
 */
export interface ForwardRequest {
  id: number;
  save: SaveData;
  days: number;
}

export type ForwardReply = { id: number; progress: number } | { id: number; projection: Projection } | { id: number; error: string };

self.onmessage = (e: MessageEvent<ForwardRequest>) => {
  const { id, save, days } = e.data;
  const post = (m: ForwardReply) => (self as unknown as Worker).postMessage(m);
  try {
    const t0 = performance.now();
    const projection = foresee(save, { days, onDay: (d, of) => post({ id, progress: d / of }) });
    projection.ms = Math.round(performance.now() - t0);
    post({ id, projection });
  } catch (err) {
    post({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
