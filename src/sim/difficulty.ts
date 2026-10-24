/** Difficulty presets. Chosen at new-city time and saved with the city. */
export type DifficultyId = 'sandbox' | 'relaxed' | 'steward' | 'hard';

export interface Difficulty {
  id: DifficultyId;
  label: string;
  description: string;
  /** Whether the steward can be replaced (fail state). */
  fail: boolean;
  /** Expected crises per sim day (DAY_LENGTH seconds). */
  eventRate: number;
  /** Multiplier on crisis effects. */
  severity: number;
  /** Multiplier on the scenario's starting credits. */
  creditMul: number;
  /** Simple interest per sim-minute on loans. */
  interest: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  sandbox: { id: 'sandbox', label: 'Sandbox', description: 'No fail state, rich treasury, mild crises.', fail: false, eventRate: 1, severity: 0.7, creditMul: 5, interest: 0 },
  relaxed: { id: 'relaxed', label: 'Relaxed', description: 'Rare, gentle crises and cheap loans.', fail: true, eventRate: 1.2, severity: 0.75, creditMul: 1.4, interest: 0.01 },
  steward: { id: 'steward', label: 'Steward', description: 'The intended balance.', fail: true, eventRate: 2.2, severity: 1, creditMul: 1, interest: 0.02 },
  hard: { id: 'hard', label: 'Hard', description: 'Frequent, fierce crises; expensive debt; thin treasury.', fail: true, eventRate: 3.5, severity: 1.3, creditMul: 0.65, interest: 0.035 },
};
