/**
 * Keyboard-only focus rings. Browsers show `:focus-visible` on a clicked button as soon as any key is
 * pressed (Esc closing a dialog, a game hotkey), so the control the pointer last touched lights up with
 * a ring nobody asked for. Rings are shown only while the player is navigating with Tab: the class
 * `kbd-nav` on <html> turns them on (Tab) and off (any pointer press); the rule lives in `theme.css`.
 */
export function watchFocusRing(): void {
  const root = document.documentElement;
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab') root.classList.add('kbd-nav');
    },
    true,
  );
  window.addEventListener('pointerdown', () => root.classList.remove('kbd-nav'), true);
}
