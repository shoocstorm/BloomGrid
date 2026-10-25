import type { Platform } from './types';
import { createWebPlatform } from './web';
import { createTauriPlatform, isTauri } from './tauri';

export type { Platform, KeyValueStorage } from './types';

/** Picks the platform implementation: the Tauri desktop shell when running inside it, else web. */
export function createPlatform(): Platform {
  return isTauri() ? createTauriPlatform() : createWebPlatform();
}
