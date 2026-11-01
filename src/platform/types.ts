/** Platform abstraction: web today, Tauri (native FS, windowing) later. */
export interface KeyValueStorage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/**
 * Text documents kept on the device (Seedvault's journal, D-088): IndexedDB on the web, Markdown files in the
 * app's `knowledge` folder on the desktop (files dropped in there by hand are read too).
 */
export interface DocStore {
  /** Where the docs live, for display ("this browser", a folder path). */
  readonly where: string;
  list(): Promise<{ id: string; text: string }[]>;
  put(id: string, text: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface Platform {
  name: 'web' | 'tauri';
  storage: KeyValueStorage;
  knowledge: DocStore;
  /** Offer a file download (web) or write into the app's exports folder (Tauri). */
  exportFile(name: string, data: string): Promise<void>;
  /** Native window fullscreen (Tauri only). */
  setFullscreen?(on: boolean): Promise<void>;
}
