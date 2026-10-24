import type { Platform } from './types';
import { createWebPlatform } from './web';

export type { Platform, KeyValueStorage } from './types';

/** Picks the platform implementation. A Tauri implementation will be selected here later. */
export function createPlatform(): Platform {
  return createWebPlatform();
}
