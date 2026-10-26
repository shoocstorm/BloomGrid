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

## Simulation model (City Pulse)

| Piece             | Where                                                        | Notes                                                                                                                          |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Tile grid         | `sim/Grid.ts`                                                | Corner heights, `occupant`, `road` (0 none, 1 highway, 2 bridge), pluggable layers                                             |
| Entities          | `ecs/components.ts`                                          | `Building`, `Greenery`, `Service` (network, power, water, occupancy, problem bits)                                             |
| Networks          | `sim/networks.ts`                                            | Highway connected components; buildings join via footprint perimeter                                                           |
| Pulse             | `sim/pulse.ts`                                               | Once per sim second: utilities per network → service levels → occupancy/staffing → demand → harmony → budget → tiers → history |
| Pulse state       | `sim/pulseState.ts`                                          | Tax rate, tiers, harmony breakdown, history ring buffers (plain data, saved)                                                   |
| Scenarios         | `sim/scenario.ts` + `content/scenarios/*`                    | Bulk, deterministic starting content applied before renderers attach; `level()` flattens land via saved terrain edits (committed in one refresh at the end) |
| Fields            | `sim/fields.ts`                                              | Pollution / ecology / desirability / shore layers on the grid, recomputed every `FIELD_PULSES`                                 |
| Lenses            | `sim/overlays.ts`                                            | Registry of per-tile overlays (value + mask) → `modules/overlays` uploads to `overlayTexture`                                  |
| Advisor           | `sim/advisor.ts`                                             | Registry of pure advisory rules → `modules/advisor` renders and logs                                                           |
| Crises            | `sim/crises.ts`                                              | Crisis registry + scheduler → per-pulse `Modifiers` (D-015) → `modules/crises` visuals and HUD                                 |
| Bloom & seasons   | `sim/bloom.ts`, `sim/seasons.ts`, `sim/blur.ts`              | Pollen / bloom / irrigation fields, symbiotic pairing, season from tick (D-018, D-020)                                         |
| Night life        | `sim/nightlife.ts`                                           | Derived pedestrian-activity field (pulse phase 4) → `bloomTexture` G → `activityGlow()` in materials (D-021)                   |
| Flora-Net         | `sim/floranet.ts`                                            | Saved soil zones (hydration, nutrients; pulse phase 3), pod mist, drone sorties, hive trimming → `modules/floranet` (D-023)    |
| Coast & weaver    | `sim/coast.ts`, `sim/weaver.ts`                              | Terrain edits + derived refresh, sea rise, seawalls; sky-bridges and banyan level → `modules/weaver`, world rebuilds (D-024)   |
| Assets & platform | `assets/AssetManager.ts`, `platform/`, `src-tauri/`          | GLB pieces/geometry with node materials and fallbacks; web (IndexedDB) or Tauri (JSON files) storage (D-026)                   |
| Explore (render)  | `modules/explore/`                                           | Walk / board / drone / pod follow-cam and photo mode over `CityCamera` (disabled while exploring), collider (D-025)            |
| Mobility          | `sim/mobility.ts`                                            | Commute flow field + congestion + pod routes (pulse phase 1) → `modules/mobility` GPU-animated agents, pods, sky-lanes (D-022) |
| Finance & upkeep  | `sim/finance.ts`, `sim/upkeep.ts`                            | Loans, austerity funding, building condition, highway overgrowth (D-016)                                                       |
| Stewardship       | `sim/steward.ts`, `sim/difficulty.ts`, `sim/stewardState.ts` | Fail clock, difficulty presets, saved steward state (D-017)                                                                    |

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

| Want to add              | Do this                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Building                 | `src/content/buildings/<id>.ts` with `defineBuilding`                                                             |
| Kit piece / material     | `registerPiece` (`assets/kit/pieces.ts`), `define` (`render/materials/library.ts`)                                |
| Sim system               | `System` with `phase: 'sim'` in the module that owns it; pure TS                                                  |
| Player action            | `commands.register(type, { apply, revert })`                                                                      |
| Tool                     | `ctx.tools.register({ id, hover, down, up, key, grid, dragPan })`                                                 |
| Event / service          | declaration-merge `GameEvents` / `GameServices`, then `bus.emit` / `services.provide`                             |
| Tile data                | `city.grid.addLayer(name, n => new Float32Array(n))`                                                              |
| Saved module state       | `services.get('save').addHook({ id, save, load })`                                                                |
| Global shader input      | add a uniform to `render/uniforms.ts` (`U`)                                                                       |
| Boot stage               | `onProgress(label, fraction)` inside `createGame`                                                                 |
| Starting city            | `src/content/scenarios/<id>.ts` with `defineScenario` (`?scenario=<id>`, `?scenario=empty`)                       |
| Management metric        | compute in `sim/pulse.ts`, store in `CityStats` / `PulseState`, show in `modules/pulse/PulsePanel.ts`             |
| Data lens                | `registerOverlay({ id, label, icon, legend, smooth, compute })` in `sim/overlays.ts` (or a module)                |
| Advisor rule             | `registerAdvisorRule((city) => Advisory \| null)`                                                                 |
| Crisis                   | `registerCrisis({ id, name, icon, description, prep, lead, duration, weight, begin?, apply })` in `sim/crises.ts` |
| Pollinator / clean plant | `pollinators`, `cleanEnergy` on a building definition                                                             |
| Symbiotic pair           | `symbiosis: { partners, radius, pollutionMul, outputMul, label }` on a building definition                        |
| Spatial field            | deposit + `boxBlur` (`sim/blur.ts`), computed on its own pulse phase                                              |
| Right-hand HUD panel     | append to `ctx.services.get('hud').right`                                                                         |
| Dashboard chart          | `new LineChart({ format, step })` from `modules/dashboard/LineChart.ts` (one series per chart)                    |
