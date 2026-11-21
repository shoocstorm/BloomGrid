import { h } from '@/ui/dom';
import './finish.css';

/**
 * The cinematic finish (D-188): what makes a cutscene read as film rather than a web page, laid over any film's root
 * (reels, "First Light", "The Stray"):
 *
 * - **Grade**: a gentle contrast / saturation lift on the set, highlights blooming a little (CSS `filter`).
 * - **Camera drift**: the set slowly pushes in over the film, so no frame is ever a still.
 * - **Vignette**: corners falling off to the letterbox.
 * - **Grain**: a film-grain plate (generated once on a canvas, a `data:` image: CSP allows `img-src data:`) that
 *   jitters a few times a second; a soft light leak warms one edge.
 *
 * Cheap: three overlay elements, a filter and two transform / position animations, for the length of a film only.
 */

let grain: string | null = null;

/** A 256² monochrome noise plate, made once per page. */
function grainPlate(): string {
  if (grain) return grain;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return (grain = '');
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.random() * 145;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  try {
    grain = c.toDataURL('image/png');
  } catch {
    grain = '';
  }
  return grain;
}

/**
 * Finishes a film's root: `set` is the layer that drifts and is graded (the film's art, not its letterbox or card).
 * `warm` tints the light leak (default amber).
 */
export function finishFilm(root: HTMLElement, set: HTMLElement, warm = 'rgba(255, 170, 90, 0.16)'): void {
  set.classList.add('fx-set');
  const plate = grainPlate();
  const grainEl = h('div', { class: 'fx-grain' });
  if (plate) grainEl.style.backgroundImage = `url("${plate}")`;
  const leak = h('div', { class: 'fx-leak' });
  leak.style.setProperty('--leak', warm);
  // Over the art, under the letterbox and the card.
  set.after(h('div', { class: 'fx-vignette' }), leak, grainEl);
  root.classList.add('fx-film');
}
