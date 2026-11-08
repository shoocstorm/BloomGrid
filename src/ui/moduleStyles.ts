/*
 * Every feature module's stylesheet, eagerly, so they sit in the entry's CSS (D-148). Modules still import their own
 * CSS; this only fixes the cascade: the game chunk loads after the welcome screen, and without this its CSS would
 * land after `theme.css` and override it. Imported by `ui/cssOrder.ts` between the base styles and the theme.
 */
import.meta.glob('../modules/**/*.css', { eager: true });
