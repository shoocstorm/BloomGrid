import { describe, expect, it } from 'vitest';
import { MOODS, makeRandom, midiHz, pickMood } from '@/modules/audio/music';

describe('generative music', () => {
  it('picks the mood from the time of day, and a crisis wins', () => {
    expect(pickMood(0.25, false)).toBe('dawn');
    expect(pickMood(0.5, false)).toBe('day');
    expect(pickMood(0.75, false)).toBe('dusk');
    expect(pickMood(0.9, false)).toBe('night');
    expect(pickMood(0.05, false)).toBe('night');
    expect(pickMood(0.5, true)).toBe('crisis');
  });

  it('every mood has playable chords and a scale', () => {
    for (const m of Object.values(MOODS)) {
      expect(m.bar).toBeGreaterThan(2);
      expect(m.chords.length).toBeGreaterThan(1);
      for (const c of m.chords) for (const n of c) expect(midiHz(n)).toBeGreaterThan(50);
      expect(m.scale.length).toBeGreaterThan(3);
    }
    expect(midiHz(69)).toBeCloseTo(440);
  });

  it('the arpeggio generator is repeatable and in [0, 1)', () => {
    const a = makeRandom(5);
    const b = makeRandom(5);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
