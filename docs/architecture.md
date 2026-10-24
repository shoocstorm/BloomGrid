# Architecture

## Runtime layers

```
main.ts ── createGame()  core runtime: renderer, sim, input, tools, save, systems
   └── MODULES (dependency-ordered GameModules)
        world ─ construction ─ hud ─ debug ─ (future: pulse, overlays, crises, bloom, mobility, …)
```

| Layer     | Path                                   | Rules                                                                                                                                                              |
| --------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core      | `src/core`                             | `Engine` (10 Hz fixed sim, interpolated render), `EventBus`, `CommandStack`, `SystemRegistry`, `Modules`, `Services`. No three.js.                                 |
| Sim       | `src/sim`, `src/ecs`                   | Deterministic and serializable. `City` owns `Grid` (corner heights + typed-array tile layers), the bitecs world, clock, credits and stats.                         |
| Content   | `src/content`                          | Pure data plus recipe functions; `KitBuilder` is renderer-agnostic.                                                                                                |
| Render    | `src/render`, `src/assets`             | Renderer factory, TSL material library, `ChunkedInstancer`, PostFX (selective bloom over the emissive MRT channel), quality tiers, kit pieces, GLB `AssetManager`. |
| World     | `src/world`                            | Terrain chunks, scenic ring and skirt, water, atmosphere, flora, picking.                                                                                          |
| Game glue | `src/game`                             | `GameContext`, `ToolManager`, `SaveManager`, `createGame`.                                                                                                         |
| Modules   | `src/modules/*`, `src/ui`, `src/debug` | Features. Each registers systems, commands, tools, services and events.                                                                                            |
| Platform  | `src/platform`                         | Storage and file export; web (IndexedDB) now, Tauri later.                                                                                                         |

## Frame

1. `input` phase: tools hover/pick, camera update.
2. `sim` phase: 0..N fixed ticks (`clock → greenery → economy …`). **Only this phase mutates sim state**, besides commands.
3. `sync` phase: renderers mirror sim (building growth staging, atmosphere, instancer flush/LOD).
4. `render` phase: PostFX render, HUD, debug overlays.

## Data flow

```
Player input → Tool → commands.execute(type, payload) → City mutation → bus.emit('building:added' …)
                                                                     → renderers / flora / HUD react
Sim systems (tick) → stats / ECS values → read each frame by sync systems
```

## Extension points

| Want to add          | Do this                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| Building             | `src/content/buildings/<id>.ts` with `defineBuilding`                                 |
| Kit piece / material | `registerPiece` (`assets/kit/pieces.ts`), `define` (`render/materials/library.ts`)    |
| Sim system           | `System` with `phase: 'sim'` in the module that owns it; pure TS                      |
| Player action        | `commands.register(type, { apply, revert })`                                          |
| Tool                 | `ctx.tools.register({ id, hover, down, up, key, grid, dragPan })`                     |
| Event / service      | declaration-merge `GameEvents` / `GameServices`, then `bus.emit` / `services.provide` |
| Tile data            | `city.grid.addLayer(name, n => new Float32Array(n))`                                  |
| Saved module state   | `services.get('save').addHook({ id, save, load })`                                    |
| Global shader input  | add a uniform to `render/uniforms.ts` (`U`)                                           |
| Boot stage           | `onProgress(label, fraction)` inside `createGame`                                     |
