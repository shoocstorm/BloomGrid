/**
 * Distance switches with a band (D-162). A thing shown "within `limit`" of the camera flipped on and off every frame
 * while the camera rested or eased near the limit, and the city blinked. `within(prev, d, limit)` turns on below
 * `limit` and only turns off again beyond `limit · (1 + band)`.
 */
export function within(prev: boolean, d: number, limit: number, band = 0.08): boolean {
  return prev ? d < limit * (1 + band) : d < limit;
}
