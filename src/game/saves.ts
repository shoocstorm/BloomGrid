import type { KeyValueStorage } from '@/platform/types';

/**
 * Saved islands (D-207): every city has its own slot (`save:<slot>` + `save:<slot>:info`), so several islands can be
 * kept and resumed side by side. This file stays light (no sim, no three): the welcome screen lists saves before
 * the engine boots (D-148).
 */

/** What a slot holds, without reading the whole save (the New Chapter dialog and Settings show it). */
export interface SaveInfo {
  /** Wall-clock time of the save (ms since epoch). */
  at: number;
  name: string;
  day: number;
  residents: number;
  /** Island seed and difficulty (absent in saves from before D-085). */
  seed?: number;
  difficulty?: string;
}

export interface SaveEntry extends SaveInfo {
  slot: string;
}

const SAVE_KEY = /^save:([A-Za-z0-9_-]+)$/;

/** A new slot id for a city never saved before (`isle-<time>`: safe as a desktop file name). */
export function newSlot(): string {
  return `isle-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Every saved island, most recently saved first (saves from before summaries existed list with `at: 0`). */
export async function listSaves(storage: KeyValueStorage): Promise<SaveEntry[]> {
  const keys = await storage.keys();
  const slots = keys.map((k) => SAVE_KEY.exec(k)?.[1]).filter((s): s is string => !!s);
  const out = await Promise.all(
    slots.map(async (slot) => {
      const info = await storage.get<SaveInfo>(`save:${slot}:info`).catch(() => undefined);
      return { slot, ...(info ?? { at: 0, name: '', day: 0, residents: 0 }) };
    }),
  );
  return out.sort((a, b) => b.at - a.at);
}

/** Removes a saved island (the save and its summary). */
export async function deleteSave(storage: KeyValueStorage, slot: string): Promise<void> {
  await storage.delete(`save:${slot}`);
  await storage.delete(`save:${slot}:info`);
}
