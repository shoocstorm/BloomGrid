/**
 * Idle timers for notifications (D-201): a card the player doesn't touch folds or closes on its own after a while,
 * so milestone, request, story and recap cards don't pile up over the city. The countdown waits while the pointer is
 * over the card or focus is inside it, and starts again from the top after any press there.
 */

/** Seconds an untouched notification stays open before it folds or closes. */
export const IDLE_SECONDS = { card: 12, recap: 9, callout: 20 } as const;

export interface IdleTimer {
  /** (Re)starts the countdown; `onIdle` runs once when it runs out. */
  arm(): void;
  /** Stops the countdown (the card was closed, folded or acted on). */
  disarm(): void;
  readonly armed: boolean;
}

export function idleTimer(el: HTMLElement, seconds: number, onIdle: () => void): IdleTimer {
  let armed = false;
  let timer = 0;
  const clear = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };
  // Focus holds it only while Tab-navigating: a clicked button keeps focus after the pointer has left.
  const held = () =>
    el.matches(':hover') ||
    (document.documentElement.classList.contains('kbd-nav') && el.contains(document.activeElement));
  const start = () => {
    clear();
    if (!armed || held()) return;
    timer = window.setTimeout(() => {
      timer = 0;
      if (!armed || held()) return;
      armed = false;
      onIdle();
    }, seconds * 1000);
  };
  el.addEventListener('pointerenter', clear);
  el.addEventListener('focusin', clear);
  el.addEventListener('pointerleave', start);
  el.addEventListener('focusout', () => window.setTimeout(start, 0));
  // Touch has no hover: a tap on the card restarts the countdown.
  el.addEventListener('pointerdown', (e) => e.pointerType !== 'mouse' && start());
  return {
    arm() {
      armed = true;
      start();
    },
    disarm() {
      armed = false;
      clear();
    },
    get armed() {
      return armed;
    },
  };
}

/**
 * A card that shrinks to its header strip when left untouched (`.mini`, D-201): the header keeps the kicker and the
 * time left, and a click on it opens the card again. `wake` opens it and restarts the countdown (call it when the
 * card has news).
 */
export function autoCollapse(card: HTMLElement, head: HTMLElement, seconds = IDLE_SECONDS.card) {
  const idle = idleTimer(card, seconds, () => {
    card.classList.add('mini');
    head.title = 'Show the card';
  });
  const wake = () => {
    card.classList.remove('mini');
    head.removeAttribute('title');
    idle.arm();
  };
  head.addEventListener('click', () => card.classList.contains('mini') && wake());
  return { wake, stop: () => idle.disarm() };
}
