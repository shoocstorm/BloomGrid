import type { GameModule } from '@/game/context';
import type { CameraView } from '@/input/CityCamera';

/**
 * Camera views for monitoring the island: overview (O), and four bookmarks
 * (Alt+1–4 store, Shift+1–4 recall) saved with the city.
 */
export const viewsModule: GameModule = {
  id: 'views',
  init(ctx) {
    let bookmarks: (CameraView | null)[] = [null, null, null, null];
    ctx.services.get('save').addHook({
      id: 'views',
      save: () => bookmarks,
      load: (_c, data) => {
        bookmarks = Array.isArray(data) ? (data as (CameraView | null)[]) : bookmarks;
      },
    });
    ctx.input.onKey((e) => {
      if (e.code === 'KeyO' && !e.metaKey && !e.ctrlKey) {
        ctx.cameraCtl.overview();
        return true;
      }
      const n = /^Digit([1-4])$/.exec(e.code)?.[1];
      if (!n || e.metaKey || e.ctrlKey) return false;
      const i = Number(n) - 1;
      if (e.altKey) {
        bookmarks[i] = ctx.cameraCtl.getView();
        ctx.bus.emit('toast', { text: `View ${n} saved`, tone: 'ok' });
        return true;
      }
      if (e.shiftKey) {
        const v = bookmarks[i];
        if (v) ctx.cameraCtl.setView(v);
        else ctx.bus.emit('toast', { text: `No view in slot ${n} — Alt+${n} to save one`, tone: 'info' });
        return true;
      }
      return false;
    });
  },
};
