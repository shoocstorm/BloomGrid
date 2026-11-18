import type { GameContext } from '@/game/context';
import { PULSE_TICKS } from '@/sim/pulseConst';

/**
 * Flora's memory of advice (plan v5, Phase 29): which proposals and plan steps the steward accepted or declined, per
 * city. A declined step stays out of her plans and heads-ups for `DECLINE_SECONDS` of sim time (or until the steward
 * accepts it some other way), so she does not repeat herself. Kept per viewer in local storage (it is about how this
 * steward plays, not the city's state: never in the save or the hash), and each decision is noted in the knowledge
 * journal's advice log, so she can read back what was taken up.
 */
export const DECLINE_SECONDS = 1800;
const KEY = 'bloomgrid.flora.memory';
const MAX = 60;

interface Entry {
  city: string;
  key: string;
  /** Sim tick until which it stays declined. */
  until: number;
}

export class FloraMemory {
  private entries: Entry[] = [];

  constructor(private ctx: GameContext) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.entries = (JSON.parse(raw) as Entry[]).filter((e) => typeof e.key === 'string').slice(-MAX);
    } catch {
      /* storage unavailable or corrupt: start empty */
    }
  }

  private get city(): string {
    return `${this.ctx.city.growth.name}#${this.ctx.city.seed}`;
  }

  /** Keys declined recently in this city. */
  declined(): Set<string> {
    const now = this.ctx.city.tick;
    return new Set(this.entries.filter((e) => e.city === this.city && e.until > now).map((e) => e.key));
  }

  decline(keys: readonly string[], label: string): void {
    const until = this.ctx.city.tick + DECLINE_SECONDS * PULSE_TICKS;
    this.entries = this.entries.filter((e) => !(e.city === this.city && keys.includes(e.key)));
    for (const key of keys) this.entries.push({ city: this.city, key, until });
    this.save();
    this.journal(label, false);
  }

  accept(keys: readonly string[], label: string): void {
    this.entries = this.entries.filter((e) => !(e.city === this.city && keys.includes(e.key)));
    this.save();
    this.journal(label, true);
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.entries.slice(-MAX)));
    } catch {
      /* ignore */
    }
  }

  private journal(label: string, accepted: boolean): void {
    const kb = this.ctx.services.tryGet('knowledge')?.base;
    if (!kb) return;
    const t = this.ctx.city.timeOfDay * 24;
    void kb
      .recordAdvice({
        city: this.ctx.city.growth.name,
        clock: `Day ${this.ctx.city.day} ${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`,
        advice: label.slice(0, 120),
        accepted,
      })
      .catch(() => undefined);
  }
}
