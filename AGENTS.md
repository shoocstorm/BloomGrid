# AGENTS.md — BloomGrid

Guide for AI coding agents (and humans) working on this repo. Read this first, then the docs it points to.
**Keep this file accurate:** if you change a convention, command or workflow described here, update it in the
same change.

## 1. What this project is

BloomGrid is a single-player **solarpunk island city builder and manager** in three.js (WebGPU, falling back to
WebGL2), written in TypeScript with Vite. The player is a _city steward_: they monitor the whole 3D island,
build and modify it, and keep it running well. Neglect can make the city decline or spiral out of control.

| Doc                                                                                          | Purpose                                                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`BloomGrid_Implementation_Requirements-v3.md`](BloomGrid_Implementation_Requirements-v3.md) | **Canonical requirements** (player role, island world, systems, crises, NFRs)              |
| [`BloomGrid_Implementation_Requirements-v2.md`](BloomGrid_Implementation_Requirements-v2.md) | Original aesthetic and content pillars (still valid unless v3 overrides)                   |
| [`docs/progress.md`](docs/progress.md)                                                       | **Handoff snapshot**: branch, last commit, baselines, next up, open decisions. Start here. |
| [`docs/roadmap.md`](docs/roadmap.md)                                                         | Phases, status and checklists. **What to work on next.**                                   |
| [`docs/architecture.md`](docs/architecture.md)                                               | Layers, frame order, data flow, extension points                                           |
| [`docs/decisions.md`](docs/decisions.md)                                                     | Architecture decision log (append-only)                                                    |
| [`README.md`](README.md)                                                                     | Player-facing quickstart and controls                                                      |

## 2. Commands

```bash
bun install
bun run dev            # http://localhost:5173  (?perf ?renderer=webgl ?quality=low|medium|high|ultra ?stress=2000 ?seed=N ?scenario=empty ?difficulty=sandbox|relaxed|steward|hard ?drill=<crisis> ?nodynres)
bun run check          # typecheck + lint + tests + production build (must pass before you finish)
bun run test           # vitest only (NOT `bun test`: that is bun's own runner and skips the Vitest setup)
bun run snap -- --out shots/x.png [--path "/?perf"] [--eval @scripts/scenes/demo-city.js] [--times 400,1500] [--mobile [--size 844x390]]
bun run perf -- [--path "/?gputime"] [--seconds 10] [--idle] [--profile 15]   # power/perf probe (see §8)
bun run optimize-glb -- raw.glb public/assets/x.glb --footprint 3 --height 4 [--ratio 0.5] [--yaw 90] [--tex 1024]
bun run tauri:dev      # desktop shell (Tauri v2) against the dev server; tauri:build packages it (needs Rust)
bun run release [patch|minor|major|X.Y.Z] [--dry-run] [--yes]   # tag + deploy to Firebase (see §10; ask first)
bun run ai-probe -- [--model qwen3-1.7b] [--ask "…"]… [--auto] [--max]   # drive the city assistant with a real model in headless Chrome
bun run test:rust      # Rust unit tests (store, grammars, template); add `-- --ignored llm_qwen3_` for MLX parity (needs the HF cache)
bun run tauri:build:mac-arm64   # Apple Silicon desktop bundle with mlx.metallib (the assistant's native engine)
```

The package manager is **bun** (`bun.lock`; no `package-lock.json`). Use `bun install` / `bun add [-d]` / `bunx`, never
`npm` or `npx`.

`bun run snap` drives headless Chrome against the running dev server, saves screenshots and prints console
warnings and errors plus the app's tagged logs such as `[boot] ms {…}` (it exits 1 on page errors). Use it to _look_ at
your change (`[boot] modules {…}` breaks module init down per module). `shots/` is git-ignored. Scenes in `scripts/scenes/`: `demo-city.js` (small district), `blackout.js` (night power-failure
drill), `drought.js` (water-failure drill; buildings should visibly wilt), `retrofit.js` (channel + Bloom Retrofit
wave), `nightlife.js` (night downtown: glow should follow activity; `window.NEAR = 12` for a close-up) and `season.js`
(mid-Haze; prefix `window.SEASON = 1;` for a Monsoon shower), `mobility.js` (first Pod Dock at rush hour; `window.NIGHT = 1`,
`window.LENS = 1` for the Traffic lens, `window.NEAR = 14`), `inventory.js` (dashboard Inventory tab on the worst object, plus every agent tool; `window.QUERY = 'district:westbrook'`
pre-fills the search), `mobile.js` (with `--mobile`: phone HUD; `window.SHEET = 'info' | 'pulse' | 'advisor' | 'lens' | 'build' | 'dashboard' | 'gesture'`,
the last returns camera distance/yaw before and after a synthetic pinch + twist), `fires.js` (three fires across the island: beacons, screen and edge pins, alert toast; `window.FAR = 1` for the
island view), `flora.js` (Flora's console; `window.VIEW = 'console' | 'profile' | 'tools'`,
`window.OPEN = '<tool>'` expands a tool card, `window.MAX = 1` maximizes; add `--mobile` for the phone console).
Field passes share the pulse (`FIELD_PULSES` = 6, D-020): phase 0 pairing + pollution, 1 ecology + desirability, 2 bloom, 3 Flora-Net,
4 night life, 5 mobility. All six are taken, so a new pass must share a phase or `FIELD_PULSES` must grow. `floranet.js` frames the Drone Hive and dispatches a mist. `weaver.js` weaves bridges, a banyan and reclaims coast. `explore.js` enters an explore mode (`window.MODE`). `landmark.js` frames the Wellspring Spire and its hero district at the island centre: a street grid of 14-tile blocks (`QUARTERS` in `content/scenarios/founding-city.ts`; quarters around `window.CX`/`window.CZ` ≈ 292/222 skyline, 292/286 exchange, 222/284 gardens, 215/220 working hills). To add a hero, append its id to a quarter: it takes the free graded lot nearest the spire (D-035). Bloomtopia, the fenced amusement park, fills the south islet (`window.CX`/`CZ` ≈ 252/440, `window.YAW` = π to face its gate); its suspension bridge is at ≈ 252/404 and the north-east one at ≈ 430/145. The towns (`TOWNS` in the same file) continue the grid: Westbrook ≈ 150/270, Eastgate ≈ 360/250, Hillcrest ≈ 255/160, Bayfront ≈ 270/340, Sunfield ≈ 130/205. Zoned sub-areas (D-049): Westport Works (industry) ≈ 113/285, Meridian Arena (sports, Bloom Stadium ≈ 345/285) ≈ 360/285, Harbour Commons (work) ≈ 300/330, Lumen Promenade (entertainment) ≈ 300/360. Sea wonders (`modules/scenery/sites.ts`): Tidewatch Lighthouse ≈ 471/41, Tide Gates ≈ 72/471,
Lotus Atoll ≈ 230/31, Abyssal Dome ≈ 440/471, Verdant Pillars ≈ 31/123, whale pods ≈ 154/481 and 348/26. Windward Isle (wind farm, 2×2 Breeze Turbines) ≈ 430/102. Aeroline stations: Hillcrest ≈ 256/159, Eastgate ≈ 353/256, Bayfront ≈ 241/368, Westbrook ≈ 144/271 (`services.get('explore').setMode('train')` rides a train); keep pieces in the quarter's render chunk (D-034) (`window.NEAR`, `window.PITCH`, `window.YAW`, `window.NIGHT`). Crises: `--path "/?drill=monsoon"`
(any crisis id, including `earthquake`, `thunderstorm`, `industrial-fire`; `&severity=1.2`), or the inspector's Crisis drills.
To light a fire from a snap eval: `(await import('/src/sim/hazards.ts')).ignite(bloomgrid.city, eid, 'lightning', 0.8)`.

## 3. Hard rules

1. **Sim purity.** `src/sim`, `src/ecs`, `src/core` and `src/content` must not import `three`, `@/render`,
   `@/ui` or `@/world` (ESLint enforces this). Sim randomness only via `Rng` / `hash2`; no `Math.random`, `Date`
   or `performance` in sim code.
2. **All player-driven state changes go through commands** (`ctx.commands.execute`). Each command implements
   `apply` (returns undo data or `null` to reject) and `revert`. Bulk or scripted actions pass `undoable=false`.
3. **Determinism is tested.** Same seed and command log must give the same `city.hash()`. If you add sim state,
   include it in `hash()` and in `sim/save.ts` (bump `SAVE_VERSION` and add a migration when the format changes).
   Sim randomness (including crisis scheduling) uses `city.rng`. Tests' `makeSim` sets `steward.autoCrises = false`
   so balance tests stay stable; crisis tests opt in.
4. **Features are modules.** New gameplay goes in `src/modules/<feature>/index.ts` as a `GameModule`, registered in
   `MODULES` in `src/main.ts`. Core code never imports a feature. Cross-module APIs use `ctx.services`, and
   notifications use `ctx.bus`. Extend `GameServices` / `GameEvents` through declaration merging in the module.
5. **Content is data.** Buildings live in `src/content/buildings/*.ts` (auto-discovered). Recipes only use
   `KitBuilder`; they never touch three.js.
6. **Both renderers must work.** Check your change with WebGPU _and_ `?renderer=webgl`. Write materials in TSL
   (`three/tsl`), never GLSL or `ShaderMaterial`.
7. **Performance budgets** (check with the `?perf` overlay, F3): 60 fps on an M1-class GPU for a typical city;
   **< 300 draw calls**; sim tick < 4 ms; 50k+ plant instances. Render repeated things through
   `ctx.instancer` (kit pieces + shared materials). Don't allocate in per-frame loops (reuse
   vectors/matrices). Throttle DOM updates (~5 Hz) and use `setText`.
8. **Don't break saves silently.** Saves store string ids, not registry indices. Bump `SAVE_VERSION` and add a step to
   `migrateSave` whenever the format changes.
9. **Renderers sync existing state at init.** Startup content is applied in bulk before modules load (D-007), so
   anything that mirrors sim state must render what already exists in its constructor, not only react to events.
10. **Startup content must stay cheap.** Watch the `[boot] ms` log: scenario under 100 ms and modules under 400 ms on
    WebGPU. Recipes are cached per variant (D-008); never run recipes per instance.

## 4. Where things go

| Task                               | Location / API                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New building                       | `src/content/buildings/<id>.ts` → `defineBuilding({...})`; helpers in `src/content/kit.ts`                                                                                 |
| New kit piece / material           | `registerPiece` in `src/assets/kit/pieces.ts`; `define` in `src/render/materials/library.ts`                                                                               |
| Sim system                         | `System` with `phase: 'sim'` inside its module (or `src/sim/systems.ts` for core economy and clock)                                                                        |
| Per-tile data                      | `city.grid.addLayer(name, n => new Float32Array(n))`                                                                                                                       |
| Player tool                        | `ctx.tools.register(tool)`; tools get `hover / down / up / key`, plus `grid` and `dragPan` flags                                                                           |
| HUD panel                          | `src/ui/*` with the `h()` helper and the `.panel` class; the look (instrument theme: tokens, mono numerals, coded section titles) lives in `src/ui/theme.css`, loaded last |
| Global shader input                | `U` in `src/render/uniforms.ts`                                                                                                                                            |
| Saved module state                 | `ctx.services.get('save').addHook({ id, save, load })`                                                                                                                     |
| Boot progress stage                | `await onProgress(label, fraction)` in `src/game/createGame.ts`                                                                                                            |
| Hero GLB model                     | building `recipe: { glb: '/assets/x.glb', fallback(b) {…} }`; raw files in `assets-raw/` (ignored), optimised in `public/assets/`                                          |
| Native / desktop behaviour         | `src/platform/` (`web.ts`, `tauri.ts`); Rust commands in `src-tauri/src/lib.rs`                                                                                            |
| Terrain / island shape             | `src/sim/terrain.ts` (pure height function)                                                                                                                                |
| Starting city content              | `src/content/scenarios/<id>.ts` (`defineScenario`); builder in `src/sim/scenario.ts`                                                                                       |
| Management metric / tier           | `src/sim/pulse.ts` + `src/sim/pulseState.ts`; UI in `src/modules/pulse/`                                                                                                   |
| Data lens / advisor rule           | `registerOverlay` in `src/sim/overlays.ts`; `registerAdvisorRule` in `src/sim/advisor.ts`                                                                                  |
| Crisis / difficulty                | `registerCrisis` in `src/sim/crises.ts`; presets in `src/sim/difficulty.ts`; UI in `src/modules/crises/`                                                                   |
| Bloom, seasons, channels, retrofit | `src/sim/bloom.ts`, `src/sim/seasons.ts`, `src/sim/commands.ts`; visuals in `src/modules/bloom/`                                                                           |
| Night glow / pedestrian activity   | `src/sim/nightlife.ts`; shaders use `activityGlow()` from `render/materials/overlay.ts`                                                                                    |
| Commuting, congestion, pod docks   | `src/sim/mobility.ts` (+ `transit` on a building def); visuals in `src/modules/mobility/`                                                                                  |
| Sky-lane network (hubs, pods)      | `src/sim/skylanes.ts` (`transit.hub` on a def; `pulse.skylanes`); pod flight `modules/mobility/skypath.ts` (shader + CPU mirror for the ride camera: change both), pod model `podModel.ts` (D-051). Aeroline stations are rail links to the nearest hub; pods land at `aeroline.deck` + `RAIL_Y` (D-052). Lanes lift over rooftops (`liftOf`, D-053): check `await bloomgrid.services.get('skylanes').clearance()` reports `clipped: 0` after changing buildings or lanes. The pod is at WebGPU's 8 vertex-buffer limit: no new attributes |
| Soil, mist, drones (Flora-Net)     | `src/sim/floranet.ts` (+ `drones` on a building def, `mist` command); visuals in `src/modules/floranet/`                                                                   |
| Terrain edits, sea rise, seawalls  | `src/sim/coast.ts` (`setCorners` + `terrain:changed`; `defence` on a building def)                                                                                         |
| Sky-bridges, banyan merges         | `src/sim/weaver.ts` (`tower: true` on a building def); visuals in `src/modules/weaver/`, `banyanPieces`                                                                    |
| Building finish / style            | `style` on a building def (`StyleId` in `content/types.ts`); looks in `render/materials/styles.ts` (`STYLES`, district `FAMILIES`). Only neutral tints are restyled |
| Aeroline (maglev loop)             | route and stations: `aerolineRoute` in `content/scenarios/founding-city.ts`; drawing, trains, ride camera: `src/modules/aeroline/`. Keep the two lot rows beside the line low-rise; Bloom Helix towers (boarding) stand on each 6×4 station lot |
| Sky and sea scenery                | `src/modules/scenery/`: one merged mesh per piece (`GeoBuilder` in `render/bake.ts`), shader motion from `U.clock`; wonder sites in `sites.ts` (tested deep sea) |
| Signature bridges (render)         | `src/modules/construction/BridgeRenderer.ts` dresses straight spans from `findBridgeSpans` (`src/sim/bridges.ts`) by length                     |
| Explore modes, photo mode          | `src/modules/explore/` (collider in `collider.ts`); `ctx.tools.suspended` and `cameraCtl.enabled` gate input                                                               |
| Object inventory, readable ids     | `registerInventoryKind` in `src/sim/inventory.ts` (buildings, networks, bridges, sky-bridges, channels, districts built in); UI in `src/modules/dashboard/InventoryView.ts`; districts via `nameArea` in a scenario |
| Agent (LLM) tools                  | `ctx.services.get('agent').register({ name, description, input, effect, run })` (`src/core/AgentTools.ts`); pure-sim read tools in `src/sim/inventoryTools.ts`; try them in the console: `await bloomgrid.services.get('agent').call('inventory_search', { status: 'critical' })` |
| City assistant (local LLM agent)   | engine `src/ai/llm/` (wllama + native MLX), loop `src/ai/agent.ts` (system prompts in `PROMPTS`, shown verbatim in the console's Profile tab; menus via `selectMenu`, routing via `plainIntent`), Profile/Tools tabs `src/modules/assistant/Dossier.ts`, tools `src/sim/{inventory,insight,action}Tools.ts` + game tools in `src/modules/assistant/index.ts`, console `src/modules/assistant/Panel.ts`; Rust `src-tauri/src/{llm,models}/`, `mlx.rs`. Measure agent changes with `bun run ai-probe`, not by argument |
| Phone layout / touch input         | `.compact` rules in `src/ui/mobile.css` (loaded last), `platform/device.ts` (`isCompact`, `isTouchDevice`); foldable panels register with `hud.sheet(el)`; gestures in `input/Input.ts`, tools get `cancel` and `e.touch` (D-045). Check with `bun run snap -- --mobile` |
| Zones (living, work, industry…)    | `ZoneKind` / `ZONES` in `src/content/types.ts`; `nameArea(…, zone)` in a scenario; `District.zone` (saved, hashed); town sub-zones in `founding-city.ts` (`zones` on a `Town`) |
| Hazards (quake, lightning, fire)   | `src/sim/hazards.ts` (crises, fires, ruins, `respond` / `repair`), log via `logIncident` in `sim/crises.ts`; visuals, fire panel and locators (beacons, screen pins, `.` next fire) `src/modules/hazards/`; a `toast` with `at: { x, z }` is a fly-to button; Incidents tab `modules/dashboard/IncidentLog.ts`; Flora tools `sim/hazardTools.ts`; stations: `response` on a def (D-050) |
| Wind turbines                      | building `src/content/buildings/wind-turbine.ts` (plinth + tower); nacelles and spinning rotors `src/modules/wind/` (one prevailing wind, CPU-posed from `U.clock`); founding-city farm placement in `founding-city.ts` (`WIND_TURBINES` cap, D-047) |
| City map (districts)               | `src/modules/citymap/` (canvas painted on open from `city.districts`; labels fit their district); button prepended to `hud.stats`; **Y** |
| HUD layout (desktop)               | telemetry strip lives in City Pulse (`hud.readout`); explore modes are a top-bar dropdown (`explore/index.ts`, styles in `ui/theme.css`); Flora's orb in `hud.dockRow` |
| Seasonal / crisis weather          | `src/modules/crises/Weather.ts` (uniforms + `atmosphere.haze`)                                                                                                             |
| New lit material                   | always via `define()` in `render/materials/library.ts` (gets lens + optional vitality support)                                                                             |

The full layer description is in `docs/architecture.md`.

## 5. Definition of done (every change)

- [ ] `bun run check` passes.
- [ ] New sim logic has Vitest coverage in `tests/` (determinism, undo/redo or save round-trip, as relevant).
- [ ] Visual change verified with `bun run snap` on WebGPU and `?renderer=webgl`; no new console errors.
- [ ] `bun run perf` and `bun run perf -- --idle` still within the §7½ power budget.
- [ ] Perf still within budget with the founding city (default boot) **and** `?stress=1500`: fps and
      `renderer.info.render.drawCalls` at near and full-island zoom, plus the `[boot] ms` log.
- [ ] **Docs updated in the same change** (see §6).

## 6. Keeping docs current

| When you…                                                                   | Update                                                                     |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Deliver or progress a roadmap item                                          | `docs/roadmap.md`: tick the checkbox, set the phase status (✅ 🚧 ⏳ ⬜)   |
| Make a lasting technical choice (dependency, convention, rejected approach) | Append `D-NNN` to `docs/decisions.md`                                      |
| Add or change a layer, extension point or frame-order rule                  | `docs/architecture.md`                                                     |
| Change commands, rules, workflow or gotchas                                 | this `AGENTS.md`                                                           |
| Change controls, URL flags or player-visible features                       | `README.md`                                                                |
| Change scope, player role or game rules                                     | `BloomGrid_Implementation_Requirements-v3.md` (note the change at the top) |

Keep docs short and factual. Prefer tables and checklists over prose. Never leave a doc describing behaviour the
code no longer has.

## 7. Conventions

- TypeScript strict, ES modules, `@/` alias for `src/`. Prettier: single quotes, width 110.
- File-level JSDoc explains _why_ a module exists; comment non-obvious intent, not mechanics.
- Naming: `PascalCase` classes, `camelCase` functions, kebab-case content ids (`canopy-tower`).
- Events are `domain:verb` (`building:added`); service keys are short nouns (`construction`, `world`).
- Units: 1 tile = 1 world unit; sea level y = 0; map `MAP_SIZE`² tiles (512); sim ticks at 10 Hz; `timeOfDay` in [0, 1).

## 7½. Power budget (laptops must stay cool)

`bun run perf` reports main-thread busy %, fps, CPU ms per frame and (with `?gputime`) GPU ms per frame; `--profile`
lists the hottest functions. Reference (headless, 60 Hz, founding city, High): **main thread ≈ 16% active / 14% idle,
GPU ≈ 3.5 ms per frame, GPU uploads < 1 MB/s.** If a change raises these noticeably, fix it or record why in
`docs/decisions.md`. Rules: never set `DynamicDrawUsage` on instance attributes; keep instanced batches ≥ 1040
capacity; never use `backdrop-filter` or animate `box-shadow`/layout properties in the HUD; anything that changes
shadow casters must call `atmosphere.invalidateShadows()`; rendering is paced by `PowerManager`, so don't add your
own `requestAnimationFrame` loops.

## 8. Gotchas (three r186 / tooling)

- Import from `three/webgpu` and `three/tsl`. Post-processing is **`RenderPipeline`** (`PostProcessing` was renamed);
  `PCFSoftShadowMap` is gone (use `PCFShadowMap`).
- TSL `material.positionNode` runs **after** instancing, so `positionLocal` is already instance-transformed.
  Scale-from-pivot effects (growth) go through CPU matrix tweens in `ChunkedInstancer`; sway is an additive world
  offset in the shader.
- Per-instance shader data comes from the `aParams` vec4 attribute (x greenery, y seed (its integer part is the
  building style on slab/glass/timber pieces, D-040), z glow, w = window lighting
  for glass / vitality for plants, see D-013) and `instanceColor`.
- `DynamicDrawUsage` attributes are re-uploaded in full **every frame and pass** by three's WebGPU backend. Use
  static usage + `needsUpdate` + `addUpdateRange`.
- `InstancedMesh` with ≤ 1024 instances stores matrices in a UBO (re-uploaded every frame, capacity baked into the
  shader). `ChunkedInstancer` keeps capacity ≥ 1040 to avoid this.
- Never dispose a geometry whose attributes are shared (WebGPU frees the GPU buffers). Batches clone piece geometry.
- three builds node graphs per render context (keyed by call depth: the bloom pass renders nested, so `compileAsync`
  misses it) and per `InstancedMesh` uuid. `ChunkedInstancer.warmup` adds one instance of every piece and builds every
  batch through `PostFX.compile()` (D-030). Re-check it when adding pieces, materials or render passes.
- ECS component stores (`ecs/components.ts`) are global arrays indexed by entity id, shared by every `City` in the
  page, and ids are reused: when adding a store field, reset it where `City` adds a building, or a second city (new
  game, load, tests) reads the last one's values and breaks determinism.
- bitecs 0.4 API: `addComponent(world, eid, Component)`, `query(world, [A, B])`.
- Tweakpane v4 typings need `@tweakpane/core` (already a dev dependency).
- CSS `background-clip: text` doesn't paint through transformed child spans (bitten us in the boot title).
- **Vitest 5 caches transformed modules in `node_modules/.vitest-cache` and does not invalidate `import.meta.glob`
  when files are added** (new content files go missing in tests). `bun run test` clears it first; do the same if you run
  `vitest` directly.
- Headless screenshots can time out while the main thread is busy generating the world; re-run, or capture later.
- `bun run snap` ignores `--eval` when `--times` is given; use `--after <ms>` with `--eval`. An eval may return a
  Promise (e.g. to sample `renderer.info.render.drawCalls` over a second; it reads 0 between frames).
- Building ids (`LIV-0042`) come from `Building.uid`, a saved serial: build new buildings through `addBuilding` without a
  `uid` (it assigns one), and pass the record's `uid` back when re-adding (undo), or the id changes. New object kinds
  must give each object an id unique among live objects (`tests/inventory.test.ts` checks the founding city).
- Agent tools return plain JSON (no entity ids, typed arrays or DOM): strip HUD handles (`ref`) as `inventoryTools.ts` does.
  Tools that change the city must run commands and declare `effect: 'mutate'`.
- The assistant's tools: a tool that changes the city must be `effect: 'mutate'` and run an undoable command.
  Tool grammars are mirrored in `src-tauri/tests/fixtures/llm/bloomgrid-grammars.json` (the Rust engine compiles
  each); after changing a tool's input run `UPDATE_GRAMMARS=1 bun run test`, then `bun run test:rust`.
- wllama needs the page cross-origin isolated (COOP/COEP in `vite.config.ts` and `firebase.json`): any new
  cross-origin resource needs CORS or `crossorigin`. `bun install` copies its wasm into `public/wllama/`
  (`scripts/copy-wllama.mjs`); keep `@wllama/wllama` and `-compat` on the same pinned version. Import wllama only
  dynamically (it must not load at boot).
- Native MLX: Apple Silicon only (`cfg(mlx)` from `build.rs`); release bundles need `mlx.metallib`
  (`tauri:build:mac-arm64`). The first `cargo` build compiles MLX's C++ (minutes).
- Sim modules that `City.ts` imports must not import `City.ts` values back (only `import type`): a cycle leaves
  constants undefined at load (`DAY_LENGTH` lives in `pulseConst.ts` for this reason).
- Anything derived from terrain heights must refresh in `City.refreshTerrainDerived()` (sim) or on `terrain:changed`
  (render); edit corners only through `setCorners` so saves and the hash see the change.
- Shader animation the CPU must match (follow-cams) uses `U.clock`, not TSL `time` (they drift apart). Ambient motion
  (particles, sway) stays subtle: sway amplitudes are world units, so tiny pieces need tiny amplitudes.
- Explore modes change `camera.near/far` and the sky dome scale; anything depending on them must restore on exit.
- Missing files under `/assets/` get Vite's SPA fallback (HTML), so `GLTFLoader` rejects: always give GLB recipes a
  `fallback`. rtk may rewrite `bunx tauri …`; call `./node_modules/.bin/tauri` directly if it does.
- A snap `--eval` that does `import('/src/render/uniforms.ts')` gets a *second* module instance (Vite serves the app's
  copy with `?t=…`). Import the exact URL from `performance.getEntriesByType('resource')` to reach the app's `U`
  (e.g. to pin `U.clock` while capturing shader-animated scenery).
- Hazard damage goes through `damageBuilding` (books the credits and the log, ruins at zero); don't write
  `Service.condition` down directly for a hazard. A new crisis is logged automatically when it ends; give it
  `c.x / c.z` so the log and the map can place it.
- Building categories feed the toolbar in `CATEGORY_LABELS` order with hotkeys 4–9, 0: add a category at the end
  (it is click-only) and give it a `CATEGORY_CODES` prefix; the id regexes in `ai/agent.ts` and
  `modules/assistant/Panel.ts` list every prefix.
- Founding-city balance is sensitive: after changing a scenario mix, measure settled (≈400 ticks) flow,
  unemployment, power margin and budget on seed 20261024 (`tests/zoning.test.ts` guards them). For traffic, list
  the jammed tiles (`mobilityLayers(city).traffic` > 0.8) per district before adding transit.
- Phones (D-045): a new HUD panel needs a `.compact` rule in `ui/mobile.css` or it will overlap at 390 px; a new tool
  that acts on a single tap should preview first when `e.touch` (no hover on touch), and a drag-drawing tool should
  implement `cancel` (a second finger turns the press into a camera gesture).
- Headless `?gputime` swings 1.7–5 ms between identical runs; compare several runs on and off before blaming a change.

## 9. Picking up work

1. Read `docs/progress.md` (snapshot and next up), then `docs/roadmap.md`, and find the first ⏳ or 🚧 phase.
2. Skim `docs/decisions.md` for constraints.
3. Run `bun run check` and `bun run dev` + `bun run snap` to see the current state.
4. Implement in small, verified steps; update the roadmap checkboxes as you go.
5. Finish with the §5 checklist and a summary of what changed, what you verified, and anything you deferred.

## 10. Releasing and deploying (Firebase Hosting)

A release is a `vX.Y.Z` tag on `main`. Pushing the tag runs `.github/workflows/firebase-hosting-release.yml`: it
checks the tag matches `package.json`, runs `bun run check`, deploys `dist/` to the **live** site (project
`bloomgrid-7ae90`) and creates a GitHub Release with generated notes. There is no PR-preview workflow.

**Deploying is outward-facing: only release when the user asks, and confirm the version with them first.**

| Step                                  | Command                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1. Preview the plan (changes nothing) | `bun run release --dry-run` (or `minor` / `major` / `1.2.0`)                                                           |
| 2. Cut it, after the user confirms    | `bun run release patch --yes`                                                                                          |
| 3. Watch the deploy                   | `gh run watch $(gh run list --workflow=firebase-hosting-release.yml --limit 1 --json databaseId -q '.[0].databaseId')` |
| 4. Report                             | `gh release view vX.Y.Z --web` link, plus the run result                                                               |
| Re-deploy an existing tag             | `gh workflow run firebase-hosting-release.yml -f tag=vX.Y.Z`                                                           |

- `release` refuses unless on `main`, tracked tree clean, not behind `origin/main`, tag unused. It runs `bun run check`
  (`--skip-check` skips it; CI still runs it), bumps the version in `package.json`, `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml` and `Cargo.lock`, commits `Release vX.Y.Z`, tags, and pushes `main` + tag atomically, so
  unpushed commits on `main` ship too.
- Interactive prompt by default; agents pass `--yes` only after the user said go. Pick `patch` unless the user says otherwise.
- A failed run deploys nothing: fix on `main` and release the next patch (don't move or delete published tags).
- CI needs the repo secret `FIREBASE_SERVICE_ACCOUNT_BLOOMGRID_7AE90` (set up by `firebase init hosting:github`).
