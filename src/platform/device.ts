/**
 * Phone / touch detection. `compact` means a phone-sized screen: the HUD trims itself to the
 * essentials and side panels become sheets (`body.compact`, see `ui/mobile.css`). `touch` means the
 * primary pointer is a finger: keyboard hints hide and tools ask for a confirming second tap.
 * Both follow the live media queries, so rotating a phone or resizing a window re-evaluates them.
 */
const COMPACT_QUERY = '(max-width: 760px), (max-height: 520px) and (pointer: coarse)';
const TOUCH_QUERY = '(pointer: coarse)';

const query = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : null);

export function isCompact(): boolean {
  return query(COMPACT_QUERY)?.matches ?? false;
}

export function isTouchDevice(): boolean {
  return query(TOUCH_QUERY)?.matches ?? false;
}

const listeners: ((compact: boolean) => void)[] = [];

/** Called when the layout switches between phone and desktop (rotation, window resize). */
export function onCompactChange(l: (compact: boolean) => void): void {
  listeners.push(l);
}

/** Keeps `body.compact` / `body.touch` in sync with the media queries. Call once at boot. */
export function watchDevice(): void {
  const sync = () => {
    document.body.classList.toggle('compact', isCompact());
    document.body.classList.toggle('touch', isTouchDevice());
  };
  sync();
  query(COMPACT_QUERY)?.addEventListener('change', () => {
    sync();
    for (const l of listeners) l(isCompact());
  });
  query(TOUCH_QUERY)?.addEventListener('change', sync);
}
