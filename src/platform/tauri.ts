import type { KeyValueStorage, Platform } from './types';

/** Lazily loaded so the web build never pulls in the Tauri bridge. */
const invoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => (await import('@tauri-apps/api/core')).invoke<T>(cmd, args);

/** Save keys contain ':' (e.g. `save:autosave`), which isn't a portable file name; '~' is. */
const toFile = (key: string) => key.replace(/:/g, '~');
const fromFile = (name: string) => name.replace(/~/g, ':');

/** Saves as JSON files in the app data directory (Rust commands in src-tauri/src/lib.rs). */
class TauriStorage implements KeyValueStorage {
  async get<T>(key: string): Promise<T | undefined> {
    const json = await invoke<string | null>('save_get', { key: toFile(key) });
    return json == null ? undefined : (JSON.parse(json) as T);
  }
  async set<T>(key: string, value: T): Promise<void> {
    await invoke('save_set', { key: toFile(key), json: JSON.stringify(value) });
  }
  async delete(key: string): Promise<void> {
    await invoke('save_delete', { key: toFile(key) });
  }
  async keys(): Promise<string[]> {
    return (await invoke<string[]>('save_keys')).map(fromFile);
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function createTauriPlatform(): Platform {
  return {
    name: 'tauri',
    storage: new TauriStorage(),
    async exportFile(name, data) {
      const path = await invoke<string>('export_file', { name, data });
      console.info('[platform] exported', path);
    },
    async setFullscreen(on: boolean) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setFullscreen(on);
    },
  };
}
