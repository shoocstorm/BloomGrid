/** One pulse per sim second (sim ticks at 10 Hz). Separate module to avoid import cycles. */
export const PULSE_TICKS = 10;
/** Share of residents who work (commute). */
export const LABOUR_SHARE = 0.65;
/** Sim seconds per full day (here, not in City, so seasons can import it without a cycle). */
export const DAY_LENGTH = 360;
