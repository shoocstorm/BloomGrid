/** Platform abstraction: web today, Tauri (native FS, windowing) later. */
export interface KeyValueStorage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface Platform {
  name: 'web' | 'tauri';
  storage: KeyValueStorage;
  /** Offer a file download (web) or write into the app's exports folder (Tauri). */
  exportFile(name: string, data: string): Promise<void>;
  /** Native window fullscreen (Tauri only). */
  setFullscreen?(on: boolean): Promise<void>;
}
