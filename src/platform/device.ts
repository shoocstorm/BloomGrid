/**
 * Phone / touch detection. `compact` means a phone-sized screen: the HUD trims itself to the
 * essentials and side panels become sheets (`body.compact`, see `ui/mobile.css`). `touch` means the
 * primary pointer is a finger: keyboard hints hide and tools ask for a confirming second tap.
 * Both follow the live media queries, so rotating a phone or resizing a window re-evaluates them.
 * `standalone` is the home-screen web app (iOS "Add to Home Screen", an installed PWA): no browser bars, and the
 * status bar is drawn over the page (black-translucent), so the HUD keeps to the safe areas.
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
    document.body.classList.toggle('standalone', isStandalone());
  };
  lockPageZoom();
  sync();
  query(COMPACT_QUERY)?.addEventListener('change', () => {
    sync();
    for (const l of listeners) l(isCompact());
  });
  query(TOUCH_QUERY)?.addEventListener('change', sync);
}

/** Running as a home-screen web app (no browser chrome). */
export function isStandalone(): boolean {
  return (
    query('(display-mode: standalone)')?.matches === true ||
    query('(display-mode: fullscreen)')?.matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Calls `fn` whenever the visible viewport changes size. iOS Safari fires `resize` during a rotation before
 * `innerWidth` / `innerHeight` settle, and its toolbars change the visual viewport without one, so this also follows
 * `orientationchange` and `visualViewport`, and checks again once the rotation animation is over.
 */
export function onViewportChange(fn: () => void): void {
  let w = 0;
  let h = 0;
  let late = 0;
  const check = () => {
    if (innerWidth === w && innerHeight === h) return;
    w = innerWidth;
    h = innerHeight;
    fn();
  };
  const changed = () => {
    check();
    clearTimeout(late);
    late = window.setTimeout(check, 350);
  };
  w = innerWidth;
  h = innerHeight;
  window.addEventListener('resize', changed);
  window.addEventListener('orientationchange', changed);
  window.visualViewport?.addEventListener('resize', changed);
}

/**
 * iOS ignores `user-scalable=no`: a pinch on the HUD would zoom the whole page (and a double-tap could too).
 * Pinches belong to the camera, so the page itself never zooms.
 */
function lockPageZoom(): void {
  const stop = (e: Event) => e.preventDefault();
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend'])
    document.addEventListener(ev, stop, { passive: false });
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}

/** Safe-area insets in CSS pixels (notch, rounded corners, home indicator), for layout done in script. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
const insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
let probe: HTMLElement | null = null;
const readInsets = () => {
  if (!probe) return;
  const cs = getComputedStyle(probe);
  insets.top = parseFloat(cs.paddingTop) || 0;
  insets.right = parseFloat(cs.paddingRight) || 0;
  insets.bottom = parseFloat(cs.paddingBottom) || 0;
  insets.left = parseFloat(cs.paddingLeft) || 0;
};

/** The current safe-area insets (re-read when the viewport changes; zero where there are none). */
export function safeInsets(): Readonly<Insets> {
  if (!probe && typeof document !== 'undefined' && document.body) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.append(probe);
    readInsets();
    onViewportChange(readInsets);
  }
  return insets;
}
