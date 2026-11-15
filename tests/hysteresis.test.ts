import { describe, expect, it } from 'vitest';
import { within } from '@/render/hysteresis';

/** Distance switches with a band (D-162): no flipping back and forth near a limit. */
describe('within', () => {
  it('turns on below the limit and off only past the band', () => {
    let on = false;
    on = within(on, 101, 100);
    expect(on).toBe(false);
    on = within(on, 99, 100);
    expect(on).toBe(true);
    // A camera easing just past the limit and back keeps it on.
    for (const d of [100.5, 104, 99.5, 107, 101]) {
      on = within(on, d, 100);
      expect(on).toBe(true);
    }
    on = within(on, 109, 100);
    expect(on).toBe(false);
    // And easing back just inside the band keeps it off until the limit itself.
    on = within(on, 104, 100);
    expect(on).toBe(false);
  });
});
