/**
 * Drawings for the charms (D-175): the island's cat and the paper plane, as static inline SVG (markup we wrote,
 * never data, so `innerHTML` is safe here). Colours come from CSS custom properties so one drawing serves every
 * coat; parts carry classes the stylesheet animates (tail swish, blink, sleep).
 */

/** A coat: fur, belly / muzzle, markings. */
export interface Coat {
  id: string;
  fur: string;
  belly: string;
  mark: string;
  /** Eyes: dark on light coats, bright on dark ones (or they vanish). */
  eye?: string;
}

export const COATS: readonly Coat[] = [
  { id: 'ginger', fur: '#f0a14a', belly: '#fde6c4', mark: '#c9702a' },
  { id: 'grey', fur: '#8f9aa3', belly: '#e4e8ea', mark: '#6b757d' },
  { id: 'tux', fur: '#2e2f35', belly: '#f6f4ee', mark: '#2e2f35', eye: '#d4ec6a' },
  { id: 'cream', fur: '#efd9b4', belly: '#fbf3e3', mark: '#d6b98a' },
  { id: 'calico', fur: '#f6efe4', belly: '#fffaf2', mark: '#e08a3c' },
];

export const CAT_NAMES = [
  'Miso',
  'Pip',
  'Tofu',
  'Biscuit',
  'Mochi',
  'Pepper',
  'Nori',
  'Clementine',
  'Dumpling',
  'Juniper',
];

/**
 * A sitting cat, facing the viewer (32 × 32), rigged for the behaviours in `index.ts`: the head (`ct-head`, turns
 * and tilts from the neck), each ear, the right forepaw (grooming), the pupils (`ct-look`, follow the pointer), a
 * yawning mouth and shut eyes.
 */
export const CAT_SVG = `<svg class="ct-front" viewBox="0 0 32 32" aria-hidden="true">
<path class="ct-tail" d="M22 27c6.5 0 8-6 5-10.5" fill="none" stroke-width="3" stroke-linecap="round"/>
<g class="ct-body">
<ellipse class="ct-fur" cx="16" cy="23" rx="8" ry="7"/>
<ellipse class="ct-belly" cx="16" cy="25" rx="4.4" ry="4"/>
<path class="ct-mark" d="M8.4 22.5c1.6.3 2.6 1.4 2.8 3l-1 .2c-.2-1.1-.9-1.9-2-2.1zM23.6 22.5c-1.6.3-2.6 1.4-2.8 3l1 .2c.2-1.1.9-1.9 2-2.1z"/>
<ellipse class="ct-fur" cx="12.6" cy="29.2" rx="2.3" ry="1.4"/>
</g>
<g class="ct-paw"><ellipse class="ct-fur" cx="19.4" cy="29.2" rx="2.3" ry="1.4"/><ellipse class="ct-belly" cx="19.4" cy="29.6" rx="1.2" ry=".6"/></g>
<g class="ct-head">
<g class="ct-earL"><path class="ct-fur" d="M10.4 10.5 9.8 3.4l4.9 4.3z"/><path class="ct-ear" d="M11.2 8.9 11 5.6l2.4 2.1z"/></g>
<g class="ct-earR"><path class="ct-fur" d="M21.6 10.5l.6-7.1-4.9 4.3z"/><path class="ct-ear" d="M20.8 8.9l.2-3.3-2.4 2.1z"/></g>
<circle class="ct-fur" cx="16" cy="13" r="6.6"/>
<path class="ct-mark" d="M14.6 7.1h.9v2.4h-.9zM16.6 7h.9v2.6h-.9zM12.6 7.9l.8-.4.8 2-.8.4z"/>
<ellipse class="ct-belly" cx="16" cy="15.6" rx="3.2" ry="2.3"/>
<g class="ct-eyes"><g class="ct-look"><ellipse cx="13.4" cy="12.6" rx="1.15" ry="1.55"/><ellipse cx="18.6" cy="12.6" rx="1.15" ry="1.55"/><circle class="ct-glint" cx="13.8" cy="12.1" r=".4"/><circle class="ct-glint" cx="19" cy="12.1" r=".4"/></g></g>
<path class="ct-shut" d="M12.2 12.9q1.2 1 2.4 0M17.4 12.9q1.2 1 2.4 0" fill="none" stroke-width=".7" stroke-linecap="round"/>
<path class="ct-nose" d="M15.2 14.9h1.6l-.8.9z"/>
<path class="ct-line ct-smile" d="M16 15.8q-.9 1.2-2 .5M16 15.8q.9 1.2 2 .5" fill="none" stroke-width=".5" stroke-linecap="round"/>
<ellipse class="ct-yawn" cx="16" cy="17.1" rx="1.3" ry="1.5"/>
<path class="ct-line" d="M9.4 14.6l3 .5M9.6 16.6l2.9-.4M22.6 14.6l-3 .5M22.4 16.6l-2.9-.4" fill="none" stroke-width=".5" stroke-linecap="round"/>
</g>
</svg>`;

/**
 * The same cat side on (40 × 28, facing right) for walking, leaping and loafing: four legs that swing from the hip
 * (`ct-leg1…4`), a tail that waves, a head that bobs.
 */
export const CAT_SIDE_SVG = `<svg class="ct-side" viewBox="0 0 40 28" aria-hidden="true">
<path class="ct-stail" d="M10 14c-4-1-6-5-5-10" fill="none" stroke-width="2.6" stroke-linecap="round"/>
<g class="ct-leg ct-leg1"><rect class="ct-fur" x="11" y="15" width="3" height="11" rx="1.5"/></g>
<g class="ct-leg ct-leg3"><rect class="ct-fur" x="23.5" y="15" width="3" height="11" rx="1.5"/></g>
<ellipse class="ct-fur" cx="19" cy="15" rx="10.5" ry="6"/>
<ellipse class="ct-belly" cx="19.5" cy="18.2" rx="6.5" ry="2.6"/>
<path class="ct-mark" d="M15 9.6h1.1v4h-1.1zM18.5 9.1h1.1v4.2h-1.1zM22 9.4h1.1v4h-1.1z"/>
<g class="ct-leg ct-leg2"><rect class="ct-fur" x="14" y="16" width="3" height="10" rx="1.5"/></g>
<g class="ct-leg ct-leg4"><rect class="ct-fur" x="26.5" y="16" width="3" height="10" rx="1.5"/></g>
<g class="ct-shead">
<path class="ct-fur" d="M27.2 6.4 27.6.6l3.6 3.8zM31.6 5l3.4-4.1.4 5.6z"/>
<path class="ct-ear" d="M28.1 5.2l.2-2.6 1.7 1.8zM32.6 4.3l1.7-2 .2 2.7z"/>
<circle class="ct-fur" cx="31" cy="10" r="5.6"/>
<ellipse class="ct-belly" cx="34" cy="12.2" rx="2.4" ry="1.8"/>
<ellipse class="ct-seye" cx="32.6" cy="9.3" rx=".9" ry="1.3"/>
<path class="ct-nose" d="M35.6 10.8l1.1.2-.7.8z"/>
<path class="ct-line" d="M33.4 12.6l4.4-.6M33.4 13.4l4.2.5" fill="none" stroke-width=".45" stroke-linecap="round"/>
</g>
</svg>`;

/** A butterfly for the cat to watch (14 × 12); its wings flap in CSS. */
export const BUTTERFLY_SVG = `<svg viewBox="0 0 14 12" aria-hidden="true">
<g class="bf-wing bf-l"><path d="M7 6C4 0 0 1 1 5c.5 2 3 2 6 1zM7 6c-3 1-5 4-3 5 1.5.7 3-1.5 3-5z"/></g>
<g class="bf-wing bf-r"><path d="M7 6c3-6 7-5 6-1-.5 2-3 2-6 1zM7 6c3 1 5 4 3 5-1.5.7-3-1.5-3-5z"/></g>
<rect x="6.5" y="3.5" width="1" height="6" rx=".5" fill="#3a2d1e"/>
</svg>`;

/** A folded paper plane, nose to the right (40 × 24). */
export const PLANE_SVG = `<svg viewBox="0 0 40 24" aria-hidden="true">
<path d="M1 11 39 2 14 15z" fill="#ffffff"/>
<path d="M14 15 39 2 18 22z" fill="#dfeaf0"/>
<path d="M14 15 16 21 18 22z" fill="#b9cdd8"/>
<path d="M1 11 39 2" stroke="#9fb7c4" stroke-width=".6" fill="none"/>
</svg>`;
