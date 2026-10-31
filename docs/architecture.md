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

**Inventory and agent tools (D-042).** `sim/inventory.ts` turns the city into JSON-ready `CityObject` records (readable
`id`, kind, type, district, status, issues, metrics) from registered kinds; `queryInventory` / `summarize` /
`inspectObject` answer every question about them. `modules/inventory` wraps it as service `inventory` (adds `focus` /
`select`), the dashboard's Inventory tab is its UI, and `core/AgentTools.ts` exposes the same queries as named,
schema-checked tools (service `agent`: `specs()` for an LLM request, `call(name, args)` to run one).

**City assistant (D-043).** `src/ai/` is a pure layer (no three, render or ui imports): `llm/engine.ts` (one
`generate` API over wllama in the page or MLX in Rust via `llm/native.ts`), `agent.ts` (the turn loop over any
`ToolHost`, engine-agnostic, so tests script the model), `grammar.ts`, `brief.ts`. `modules/assistant` hosts
it: registers the action tools (`sim/actionTools.ts`), owns the engine, the panel, approvals and the monitor.
Desktop: `src-tauri/src/{llm,models}/`, `mlx.rs` (`llm_*` commands; Apple Silicon only, `cfg(mlx)`).

## Simulation model (City Pulse)

| Piece             | Where                                                        | Notes                                                                                                                          |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Tile grid         | `sim/Grid.ts`                                                | Corner heights, `occupant`, `road` (0 none, 1 highway, 2 bridge), pluggable layers                                             |
| Entities          | `ecs/components.ts`                                          | `Building`, `Greenery`, `Service` (network, power, water, occupancy, problem bits)                                             |
| Networks          | `sim/networks.ts`                                            | Highway connected components; buildings join via footprint perimeter                                                           |
| Pulse             | `sim/pulse.ts`                                               | Once per sim second: utilities per network → service levels → occupancy/staffing → demand → harmony → budget → tiers → history |
| Pulse state       | `sim/pulseState.ts`                                          | Tax rate, tiers, harmony breakdown, history ring buffers (plain data, saved)                                                   |
| Scenarios         | `sim/scenario.ts` + `content/scenarios/*`                    | Bulk, deterministic starting content applied before renderers attach; `level()` flattens land via saved terrain edits (committed in one refresh at the end) |
| Signature bridges | `sim/bridges.ts` + `modules/construction/BridgeRenderer.ts` | Straight bridge spans ≥ 8 tiles get a render-only superstructure by length; rebuilt on `road:changed` touching a bridge |
| Aeroline          | `modules/aeroline/` (`LoopPath`, `Guideway`, `Trains`, `Movers`): maglev loop drawn above the founding city's streets once a station exists; stations are `transit: { rail }` buildings; `aeroline` service gives the ride camera (D-041) |
| Building styles   | `render/materials/styles.ts`: finishes per building (wall pattern, windows, palette) carried in the seed's integer part; picked in `BuildingRenderer` (D-040) |
| Scenery           | `modules/scenery/` (`Clouds`, `SkyLife`, `SeaWonders`, `sites.ts`) | Render-only sky and sea decoration, no sim state: each piece is one merged mesh (`GeoBuilder` bakes primitives with per-vertex colour and glow); clouds, balloons, birds and whales move in the shader from `U.clock`. Clouds part along the camera→focus line; sea wonders use the `scenery` material |
| Commute entrances | `sim/mobility.ts` `accessTiles` | A building is reached from each footprint side touching a highway (that side's middle-most tile); jobs and commuters split evenly between them |
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
| Mobility          | `sim/mobility.ts`                                            | Commute flow field + congestion + pod routes + sky-lane network (`sim/skylanes.ts`, pulse phase 1) → `modules/mobility` GPU-animated agents, pods (`skypath.ts`, shared with the ride camera), sky-lanes, hub rings (D-022, D-051) |
| Finance & upkeep  | `sim/finance.ts`, `sim/upkeep.ts`                            | Loans, austerity funding, building condition, highway overgrowth (D-016)                                                       |
| Stewardship       | `sim/steward.ts`, `sim/difficulty.ts`, `sim/stewardState.ts` | Fail clock, difficulty presets, saved steward state (D-017)                                                                    |

## Frame

1. `input` phase: tools hover/pick, camera update (mouse, keys, and touch: one finger = left button, two = pinch/twist/pan/tilt gesture that cancels the tool's press, D-045).
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
| Animated building part   | draw the static part in the recipe; a module owns an `InstancedMesh` posed from `U.clock` per frame, synced on `building:added/removed`, `city:reset`, `terrain:changed` (see `modules/wind`, D-047); no shadows |
| Build action help        | `ACTION_HELP[toolId]` in `ui/buildHelp.ts` (short label, what, how, cost) for every tool in the Build tab           |
| Central top-bar control  | prepend to `ctx.services.get('hud').stats` (the city map button)                                                  |
| Top-bar control          | append to `ctx.services.get('hud').actions`; a dropdown menu hangs off its parent (the top bar), not the clipped panel |
| Button beside the toolbar | append to `ctx.services.get('hud').dockRow` (Flora's phone orb; hide it on desktop if it is phone-only)        |
| Foldable HUD panel       | toggle a `collapsed` class and register it with `ctx.services.get('hud').sheet(el)`: on phones it becomes an exclusive sheet (D-045) |
| Hazard / disaster        | `registerCrisis` in `sim/hazards.ts` (begin picks a place; per-pulse effects in `updateHazards`); damage via `damageBuilding`, fires via `ignite` |
| Fireworks                | `fireworks: { rate, storage }` on a def; state `city.fireworks`, per-pulse `updateFireworks` (`sim/fireworks.ts`); visuals listen to `fireworks:volley` (`modules/fireworks`, D-068) |
| Zone of an area           | `nameArea(name, x0, z0, x1, z1, zone)` in a scenario; read `city.areaAt(x, z)?.zone`; colours/labels in `ZONES` |
| Phone layout             | `.compact …` rules in `ui/mobile.css` (loaded last); `isCompact()` / `isTouchDevice()` in `platform/device.ts`    |
| Dashboard chart          | `new LineChart({ format, step })` from `modules/dashboard/LineChart.ts` (one series per chart)                    |
| Inventory object kind    | `registerInventoryKind({ kind, label, icon, prefixes, description, list, get?, details? })` in `sim/inventory.ts` (or a module); issue codes via `registerIssue` |
| Agent tool (LLM / script)| `ctx.services.get('agent').register({ name, description, input, effect, run })` (`core/AgentTools.ts`); pure-sim tools go in `sim/*Tools.ts` |
| Agent tool the assistant offers | register with `effect: 'mutate'` for anything that changes the city (asked first, must run a command); `option` (one menu line) and `llmArgs` (the few arguments a model writes) |
