/**
 * Zoom about a pivot (D-121): when the view distance scales by `ratio`, the target slides toward (ratio < 1)
 * or away from (ratio > 1) the pivot by the same share, so the point under the cursor stays put on screen.
 * Pure for testing; only x / z move (the camera keeps its ground-following height).
 */
export function zoomPivot(
  target: { x: number; z: number },
  pivot: { x: number; z: number },
  ratio: number,
): void {
  const k = 1 - ratio;
  target.x += (pivot.x - target.x) * k;
  target.z += (pivot.z - target.z) * k;
}
