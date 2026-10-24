# BloomGrid

A cozy solarpunk city builder in three.js, where high-tech architecture and living nature grow together.
See `BloomGrid_Implementation_Requirements-v2.md` for the creative brief.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # sim determinism, undo/redo, save/load
npm run typecheck && npm run lint && npm run build
```

URL flags: `?renderer=webgl` (force the WebGL2 fallback), `?quality=low|medium|high|ultra`, `?perf` (perf overlay),
`?stress=2000` (spawn a stress city), `?seed=123`, `?nodynres`.

Controls: WASD/arrows pan · right-drag or Q/E orbit · wheel zoom · R rotate building · G highway · X bulldoze ·
4–9 build categories · Space pause · 1/2/3 speed · ⌘Z/⇧⌘Z undo/redo · ⌘S/⌘L save/load · F3 perf · `` ` `` inspector.

## Architecture

| Layer | Path | Notes |
| --- | --- | --- |
| Core | `src/core` | Engine loop (10 Hz fixed sim + interpolated render), typed `EventBus`, `CommandStack` (undo/redo/replay), `SystemRegistry` (input → sim → sync → render), module loader, `Services`. No three.js. |
| Simulation | `src/sim`, `src/ecs` | Pure TS, deterministic, serializable (`City`, `Grid` with pluggable layers, bitecs components, systems, commands, save format). Lint-enforced: may not import three/render/ui. Ready to move to a Worker or Rust/Tauri. |
| Content | `src/content` | Data-driven definitions. **Drop a file into `content/buildings/` and it is auto-registered.** Recipes compose kit pieces through a renderer-agnostic `KitBuilder`, or point at a GLB. |
| Rendering | `src/render`, `src/assets` | `WebGPURenderer` (auto WebGL2 fallback), ~15 shared TSL materials, `ChunkedInstancer` (64-tile chunks × piece type, swap-remove, single dirty-range uploads, distance LOD, growth tweens), selective emissive bloom, quality tiers + dynamic resolution, shader warm-up. |
| World | `src/world` | Chunked terrain + scenic ring, depth-baked water, sky & day/night, wild flora, heightfield picking. |
| Features | `src/modules/*` | `world`, `construction` (buildings, Living Highways, ghost, tools), with `ui/Hud` and `debug` also loaded as modules. |
| Platform | `src/platform` | `Storage`/`exportFile` interface; IndexedDB web impl (a Tauri impl slots in here). |

### Extending

- **New building:** add `src/content/buildings/my-thing.ts` exporting `defineBuilding({...})`.
- **New kit piece / material:** `registerPiece` in `assets/kit/pieces.ts`, `define` in `render/materials/library.ts`.
- **New gameplay system:** create a `GameModule` in `src/modules/<feature>/` that registers systems, commands, tools,
  services and events (via declaration merging on `GameEvents` / `GameServices`), then add it to `MODULES` in `src/main.ts`.
- **New per-tile sim data:** `city.grid.addLayer('water', (n) => new Float32Array(n))`.
- **Persist module state:** `services.get('save').addHook({ id, save, load })`.

## Roadmap

0 ✅ Foundation · 1 ✅ World & city camera · 2 ✅ Build mode & biophilic architecture ·
3 Grid balance + Seasonal Bloom Engine · 4 Bioluminescence & atmosphere · 5 Mobility (sky-lanes, greenways, hyperloops) ·
6 Flora-Net AI & drones · 7 Green Weaver tool · 8 Walk/hoverboard mode · 9 Hyper3D hero assets & Tauri.
