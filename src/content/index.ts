import { Registry } from './Registry';
import type { BuildingDef } from './types';

export const buildings = new Registry<BuildingDef>('building');

// Auto-discover content: drop a file into ./buildings and it is registered.
// Sorted by path so registry indices are deterministic.
const modules = import.meta.glob<{ default: BuildingDef }>('./buildings/*.ts', { eager: true });
for (const path of Object.keys(modules).sort()) buildings.register(modules[path]!.default);
