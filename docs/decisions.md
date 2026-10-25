# Architecture Decision Log

Short, append-only records. **Agents: add an entry when you make a decision that future work must respect**
(new dependency, changed convention, rejected approach). Newest at the bottom.

Format: `## D-NNN — Title (YYYY-MM-DD)` then **Context / Decision / Consequences** in a few lines each.

## D-001 — WebGPU first, WebGL2 fallback (2026-10-24)

**Context:** We need modern GPU features (compute for particles, TSL node materials) and broad reach.
**Decision:** three.js `WebGPURenderer` from `three/webgpu`; materials written in TSL. `?renderer=webgl` forces the fallback.
**Consequences:** No `ShaderMaterial`/GLSL. Every feature must render on both backends. GPU-compute features need a WebGL2 degradation path.

## D-002 — Renderer-agnostic deterministic sim (2026-10-24)

**Context:** Sim may move to a worker or to Rust under Tauri; tests must be headless.
**Decision:** `src/sim`, `src/ecs`, `src/core`, `src/content` never import three.js, render, ui or world (lint-enforced). Randomness only via `Rng`. All mutations go through commands.
**Consequences:** Renderers mirror sim state through events and per-frame reads, never the other way round.

## D-003 — Chunked instancing with shared materials (2026-10-24)

**Context:** Tens of thousands of plants and building pieces; draw-call budget < 300.
**Decision:** `ChunkedInstancer`: one `InstancedMesh` per (piece, 64-tile chunk); per-instance `aParams` vec4 + `instanceColor`; ~15 shared materials.
**Consequences:** New visuals should be kit pieces or materials, not one-off meshes. TSL `positionNode` runs _after_ instancing, so growth scaling is a CPU matrix tween; wind sway is GPU-side.

## D-004 — Content as auto-discovered data files (2026-10-24)

**Decision:** `import.meta.glob` registers every file in `src/content/buildings/` (sorted by path, for stable indices).
**Consequences:** Renaming a building file can change registry indices; saves store string ids, so they are unaffected.

## D-005 — Vanilla DOM HUD (2026-10-24)

**Decision:** No UI framework; `ui/dom.ts` hyperscript helper; throttled updates (~5 Hz) with `setText` to avoid layout churn.

## D-006 — Singapore-inspired island world (2026-10-24)

**Context:** v3 requirements make the world an island city-state.
**Decision:** `sim/terrain.ts` shapes a main island (warped superellipse) with central hills and reservoirs, a southern bay and river, and three islets, over an ocean floor. Pure function of (x, z, seed, size).
**Consequences:** Buildable land is scarce by design. Land reclamation (Phase 10) will edit corner heights through a command and must rebuild terrain chunks.

## D-007 — Bulk scenarios and render-side init sync (2026-10-24)

**Context:** Startup will include many known buildings, highways and bridges; per-command placement with per-event renderer work is wasteful.
**Decision:** Scenarios (`content/scenarios/*`) run through `sim/scenario.ts` _before_ modules load: roads go straight into the grid with one `road:changed`, and buildings are added with no undo. Renderers (`BuildingRenderer`, `RoadRenderer`, `Flora`) must **sync existing sim state in their constructor**.
**Consequences:** Any new renderer of sim state must handle "state already exists" at init as well as events.

## D-008 — Cached recipe templates (2026-10-24)

**Decision:** A building recipe runs once per (definition, variant) (`def.variants`, default 3; variant = hash of the position). Pieces are stored as local matrices; placement multiplies by a base transform. The terrain plinth is computed per placement.
**Consequences:** Recipes must be deterministic given their `KitBuilder` RNG and must not depend on the location. More visual variety means raising `variants`, not reading the position.

## D-009 — Utility networks follow Living Highways (2026-10-24)

**Decision:** Energy and water conduits run under highways. Connected road tiles form network components (`sim/networks.ts`); a building joins the network of any highway touching its footprint perimeter. Supply and demand are solved per network once per pulse (1 s), as a uniform ratio across the network's consumers.
**Consequences:** Roads have gameplay meaning. Per-district capacity and transmission limits are future work.

## D-010 — Pulse cadence and pacing (2026-10-24)

**Decision:** Management systems run once per sim second (`PULSE_TICKS = 10`). Residents arrive faster than they leave (+1.5% / −0.8% occupancy per second); harmony smooths at 6% per pulse. Per-building problem markers trigger below 80% service; milder deficits appear only as system tiers.
**Consequences:** Crises unfold over minutes, which gives the steward time to respond. Balance constants live at the top of `sim/pulse.ts`.

## D-011 — Data lenses as a per-tile texture sampled by every material (2026-10-24)

**Context:** Monitoring overlays must colour the whole city (terrain, roads, every instanced piece) without new geometry or draw calls.
**Decision:** Lenses are pure sim functions (`sim/overlays.ts`) that fill per-tile value and mask arrays. The overlays module writes them into one `MAP_SIZE²` RGBA8 `DataTexture` (`render/materials/overlay.ts`). Every lit material wraps its colour with `withOverlay`, which samples in world space and is blended by `U.overlay` (0 = off). Instanced materials divide out `instanceColor` so lens colours read true.
**Consequences:** No extra draw calls; a small per-fragment cost is always paid (one texture sample). New materials must go through `define()` to get lens support. Changing `MAP_SIZE` resizes the texture at module load.

## D-012 — Advisor rules live in the sim (2026-10-24)

**Decision:** `sim/advisor.ts` holds a rule registry; each rule is a pure `(city) => Advisory | null` with severity, fix text, optional focus and one-click `build` remedy. The UI module only renders and logs.
**Consequences:** Advisories are unit-testable; feature modules add rules with `registerAdvisorRule`.

## D-013 — `aParams.w` meaning per material family (2026-10-24)

**Decision:** For glass, w = window lighting (power × occupancy). For plants and membranes (`moss`, `canopy`, `bush`, `grass`, `ivy`, `flower`, `fungus`), w = vitality (water service, reduced when homes are abandoned). Every other piece uses w = 1. Wild flora always sets 1.
**Consequences:** `BuildingRenderer` must classify pieces when spawning (`PLANT_PIECES`, glass ids). A new material that wants a per-instance state must pick an unused channel or document a new meaning here.

## D-014 — Power-aware rendering (2026-10-24)

**Context:** Running the game for a few minutes made a MacBook Pro hot (Chrome at 50–70% CPU). Measured causes: uncapped rendering (120 Hz on ProMotion), ~318 MB/s of redundant GPU uploads, the shadow pass every frame, and `backdrop-filter` blur over a moving canvas.
**Decision:**

- `PowerManager` (`render/Power.ts`) caps _rendering_ (the sim is unaffected): Balanced = 60 fps active / 30 idle (6 s without input, camera at rest) / 15 when the window is unfocused; Battery and Max modes in Settings (⚙).
- Instance buffers use **static** usage plus update ranges (three re-uploads `DynamicDrawUsage` attributes in full every frame and pass), and every batch has a capacity of at least 1040 (smaller instance matrices go into a per-frame-uploaded UBO with a capacity-specific shader).
- Sun shadow map: `autoUpdate = false`; refreshed only when the light moves (snapped position / ~0.6° of sun travel) or geometry changes, at most 15 Hz.
- No `backdrop-filter` on HUD panels; HUD animations use transform/opacity only.
- High quality caps the pixel ratio at 1.25 (from 1.5).
  **Consequences:** Measured headless at 60 Hz: main thread 38% → 16% active and 14% idle; uploads 318 → 0.8 MB/s; GPU ~3.5 ms per frame. New per-frame work must justify itself; check it with `npm run perf`.

## D-015 — Crises act only through pulse modifiers (2026-10-24)

**Decision:** A crisis is a `CrisisDef` (data plus pure `weight`, `begin`, `apply`) in `sim/crises.ts`. `updateCrises` runs at the start of each pulse: it advances lifecycles (forecast → active → over), maybe schedules one crisis using `city.rng`, and folds active crises into a `Modifiers` object (supply/demand multipliers, harmony, flood level, offline entity, blight region). The pulse reads only `Modifiers`.
**Consequences:** New crises need no pulse changes unless they introduce a new kind of modifier. Determinism holds (seeded RNG, pulse cadence). Visuals read `city.steward.crises` and `modifiers`; they never drive the sim.

## D-016 — Debt causes austerity, austerity causes decay (2026-10-24)

**Decision:** Below zero credits, only 40% of upkeep is paid (`steward.funding`). Building `Service.condition` decays under austerity, flooding and abandonment, and recovers when funded; condition scales output, occupancy targets and amenities. Highways gain overgrowth under austerity; at 255 they are impassable for networks. Redrawing a highway clears it.
**Consequences:** A city in debt self-corrects slowly but visibly degrades, a real cost without instant failure. Loans are the fast way out.

## D-017 — Fail clock and difficulty (2026-10-24)

**Decision:** While harmony or the budget is in Collapse the fail clock counts up 1/s and unwinds 2/s otherwise; at 120 s the steward is replaced (difficulties with `fail: true`). Difficulty sets crisis rate and severity, loan interest and the starting-credit multiplier; it is chosen at new-city time and saved.
**Consequences:** Tests and drills switch `steward.autoCrises` off for stable balance checks; crisis tests opt in.

## D-018 — Bloom as a field, seasons from the tick (2026-10-24)

**Decision:** Bloom is a per-tile field (`bloom` layer) computed from pollen (point deposits from habitat + wild-land ecology, blurred), global water, clean-energy share and the season, plus channel irrigation; it is sampled per building (`Service.bloom`). The season is a pure function of `city.tick` (no saved state). The bloom index is measured over urban tiles (what the steward manages).
**Consequences:** Visuals read the field through `bloomTexture`; new pollinators only need `def.pollinators`. Changing season length changes the season of existing saves (accepted).

## D-019 — Retrofit is a building level with a cached overlay (2026-10-24)

**Decision:** `Building.level` (0/1) is set by the undoable `retrofit` command over a radius. Effects are in the pulse and fields. Visually `retrofitPieces(template)` builds façade blossoms, ivy fringes and a sunflower crown once per template from its solid-volume bounds; `buildings:level` events carry an origin so renderers stagger pop-in by distance (the transformation wave).
**Consequences:** Future upgrades can add levels; templates expose `bounds` for any façade decoration.

## D-020 — Field passes: point deposits + sliding box blurs, staggered (2026-10-24)

**Context:** Per-building radial splats made the field pass 11 ms plus 5 ms for bloom every 5 pulses (frame hitches).
**Decision:** Sources deposit at a single tile, scaled by `blurPeak`, then multiple O(tiles) sliding-window box blurs (`sim/blur.ts`) approximate a Gaussian. Pairing and fields run on pulse phase 0, bloom on phase 2.
**Consequences:** Field cost is independent of building count and radius; keep new fields on this pattern and on their own pulse phase.

## D-021 — Night life as a derived field in the bloom texture's G channel (2026-10-24)

**Context:** Phase 7 needs night glow to follow where people are, across many materials, without new draw calls or texture bindings.
**Decision:** `sim/nightlife.ts` computes a 0..1 pedestrian-activity layer on pulse phase 4 (D-020 pattern). It is derived (not saved, not in `hash()`). The bloom module uploads it to the G channel of `bloomTexture`; materials multiply their emissive by `activityGlow()` (contrast-stretched, `U.nightlife` = 0 disables it). Seasonal drizzle and haze are visual only, derived from `city.tick` in `Weather`.
**Consequences:** One shared texture now carries bloom (R) and activity (G); further per-tile visual fields can use B/A before adding a texture. Gameplay does not read activity yet (a candidate input for Phase 8 mobility).

## D-022 — Commutes as capacity-aware flow-field rounds; agents animated on the GPU (2026-10-25)

**Context:** Phase 8 needs congestion that responds to where homes and jobs are, cheaply enough for a 384² island, and thousands of visible commuters without per-frame uploads (D-014).
**Decision:** `computeMobility` runs up to 4 rounds of multi-source BFS over highway tiles from workplaces that still hire; each home sends commuters to its nearest such workplace up to its free jobs, the rest retry next round. Trips are stored as tile paths for travel time. No individual agents exist in the sim (derived, not saved, not in `hash()`). Rendering reads the per-tile main direction (`flowNext`) and congestion and builds straight runs into static instance attributes; the shader moves every agent, pod and ribbon from `time`.
**Consequences:** Cost ≈1.2 ms per 5 pulses regardless of commuter count. Agents are an impression of flow, not tracked people: a follow-cam or individual trips would need a separate agent layer (Phase 11 explore modes).

## D-023 — Flora-Net soil as saved per-zone state that relaxes toward a target (2026-10-25)

**Context:** Phase 9 needs soil that changes over time (unlike the derived fields), survives saves cheaply and reacts to seasons, crises and player action without runaway drift.
**Decision:** Hydration and nutrients live on `city.soil` per 8×8-tile zone (48×48 on the 384 map), saved in v5 and included in `hash()`. Each pass relaxes toward a sustainable target (hydration ~1 min, nutrients ~3 min) computed from supply, channels, wild land, season evaporation, heatwaves, farm draw and compost; rain, pod mist, drones and the Mist command add directly. Flux models (evaporation vs inflow) were rejected: they drove the whole island to 0 in Haze. `DAY_LENGTH` moved to `pulseConst` because `City → floranet → seasons → City` was an import cycle that left it undefined.
**Consequences:** Dry zones are the neglected ones (strained water, heatwaves), not the whole island. Soil effects reach gameplay through greenery growth, plant vitality and farm yield only.

## D-024 — Terrain edits as sparse corner overrides; sea rise as a flood baseline (2026-10-25)

**Context:** Phase 10 needs player-edited terrain (reclamation) and a rising sea without rewriting the pure terrain function or saving the whole height field.
**Decision:** `city.terrainEdits` maps corner index → height on top of `generateTerrain`; saves store it sparsely (v6) and loading re-applies it before roads and buildings. Edits go through `setCorners`, which calls `City.refreshTerrainDerived()` (shore BFS, soil land zones, networks, irrigation) and emits `terrain:changed` so renderers rebuild only the touched chunks and water texels. Sea-level rise is `steward.seaRise`, added to every pulse's `floodLevel` (tides stack), so all flood logic, visuals and the water surface follow it; seawalls are a building `defence` checked per flooded building. Caps were halved after measuring: at 0.8 m a Hard king tide flooded 78% of the founding city.
**Consequences:** Reclaimed coastline is blocky by design (an engineered fill). Sea rise is gated by `autoCrises` (off in tests) like the crisis scheduler. Bridges are keyed by tower anchors, so they survive demolish/undo without bookkeeping.

## D-025 — Explore modes use a small kinematic controller, not Rapier (2026-10-25)

**Context:** The roadmap planned Rapier for walk / hoverboard / drone modes. Needs: stand on terrain and bridge decks, stay out of buildings and deep water, hop. No rigid-body interactions.
**Decision:** A ~100-line collider (`modules/explore/collider.ts`) over the grid: bilinear terrain, bridge deck height, water level, and per-building solid boxes from the cached recipe bounds (cached per entity, cleared on building/terrain events). Per-axis sliding, gravity and step-up live in the explore module. The camera's focus (`cameraCtl.target` / `distance`) follows the player so shadows, fog and LOD centre on them. Animations the CPU must reproduce (pod shuttles for the follow-cam) run on `U.clock`, a uniform advanced in the world sync system, instead of TSL `time`.
**Consequences:** No 2 MB WASM, no async physics boot, no collider sync for ~1 700 buildings or terrain edits. Revisit Rapier if gameplay needs dynamic bodies (thrown objects, vehicles colliding). New CPU-mirrored animations must use `U.clock`.

## D-026 — Hero assets: optimise offline, fall back procedurally; Tauri saves as files (2026-10-25)

**Context:** Rodin outputs are 10–13 MB GLBs with 2K PNG textures; the game must still run (and tests pass) without optional assets; the desktop shell needs native saves without new web dependencies.
**Decision:** `scripts/optimize-glb.mjs` (gltf-transform + meshoptimizer) fits and simplifies models and meshopt-compresses them; textures go through macOS `sips` (1024 px JPEG, normal maps 512 px PNG) because `sharp`/`toktx` are not installed (KTX2 deferred). Raw downloads stay in git-ignored `assets-raw/`; optimised GLBs are committed under `public/assets/`. Building GLB recipes carry a procedural `fallback` that also defines bounds/collision; GLB materials are converted to node materials with `withOverlay`/`overlayDim` and a faint night glow. Tauri v2 stores saves via five Rust commands as JSON files (atomic rename; ':' in keys encoded as '~'); `@tauri-apps/api` is imported dynamically so the web bundle doesn't load it.
**Consequences:** ≈2.4 MB of committed hero assets. GLB materials compile lazily on first sight in WebGL2 (not in the warm-up). Re-run the pipeline after regenerating an asset; orientation is fixed with `--yaw` (pods need their length along +X).

## D-027 — "Instrument" HUD theme layered over module styles (2026-10-25)

**Context:** The user asked for a more scientific, futuristic HUD. The old look (light glass pills, Outfit) was spread over ten module stylesheets with hard-coded light colours.
**Decision:** One theme stylesheet (`src/ui/theme.css`), imported last in `main.ts`, defines the tokens and reskins every module: dark translucent panels by day and night, chamfered clip-path frames with corner brackets and a static scan texture, Space Grotesk for labels and JetBrains Mono for numbers, counter-numbered section titles, square LED tiers, segmented meters, and a telemetry readout (POS / HDG / ALT / SIM / FPS). Module stylesheets keep layout; colour and shape come from the theme.
**Consequences:** New panels should use the tokens (`--bg`, `--line`, `--accent`, `--mono`…) rather than literal colours. Still no backdrop-filter or animated shadows; measured style/layout cost is under 1% of the main thread.

## D-028 — Map 384 → 512; founding city keeps its size; fields split across phases (2026-10-25)

**Context:** The user wanted a larger island to fit more. Terrain and the scenario are in normalised coordinates, so the island (land ×1.78) and the founding city both scaled with `MAP_SIZE`.
**Decision:** `MAP_SIZE = 512`. The founding city's districts are shrunk back to their 384-map tile size (`fit` in the scenario), so the extra land is open for the steward; water sweep retuned (1.02×) to stay Strained. Field passes: cache-friendly vertical blur (−25%), row-major loops, pollution and ecology/desirability on separate pulse phases (`FIELD_PULSES = 6`, mobility moved to phase 5). Wild flora populates progressively after the first frame.
**Consequences:** Median pulse ≈3 ms, heaviest phase ≈6 ms; runtime perf unchanged (≈16% main thread, ≈200 draws). Module boot ≈260 ms: the scenic outer terrain ring now samples the height function once per vertex (it sampled three times for slope, 444 → 145 ms), and `[boot] modules` logs per-module init times.

## D-029 — Field passes on their own tick, half a pulse window after the pulse (2026-10-25)

**Context:** The pulse tick ran the base pulse plus one staggered field pass, up to ≈4.4 ms (sim budget 4 ms). The passes are memory-bound box blurs; loop splitting and lookup tables gave no measurable gain.
**Decision:** The pulse system runs the field pass at `tick % PULSE_TICKS === PULSE_TICKS / 2` (`FIELD_TICK`), choosing the phase from the pulse that just ran (`pulse.count`), so there is no new saved state.
**Consequences:** Pulse tick ≈0.4 ms median; field tick ≈2.2 ms median, ≈3 ms p95. Fields lag the pulse by half a second (balance tests unchanged). A test asserts field events fire only on `FIELD_TICK`.

## D-030 — Shader warm-up renders one real frame when bloom is on (2026-10-25)

**Context:** Every boot ended with a ≈0.75 s (WebGPU) to ≈1–3 s (WebGL2) first-frame stall. three keys node builds by render context and by `InstancedMesh` uuid, and the render-context key includes the call depth. The bloom scene pass renders nested inside `RenderPipeline` (depth 1), so `compileAsync` (depth 0, canvas target) built variants frames never use, and only for batches in view.
**Decision:** `ChunkedInstancer.warmup` makes every non-empty batch visible and unculled, then calls `PostFX.compile()`: with bloom it renders one pipeline frame behind the boot screen (builds the scene pass and shadow pass for real); without bloom it uses `compileAsync` (matches the direct render, compiles in parallel).
**Consequences:** No post-boot stall on either renderer; time to an interactive city ≈2.4 s WebGPU (was ≈2.6), ≈2.5–3.0 s WebGL2 (was ≈3.0–3.8). The warm-up frame is one long task during boot. Batches created later (a new piece in a new chunk) still build on first draw (a few ms each).

## D-031 — No BatchedMesh, no further shadow cuts (measured, rejected) (2026-10-25)

**Context:** The backlog listed `BatchedMesh` per chunk and a cheaper overview shadow pass as the next CPU/heat levers.
**Decision:** Keep `ChunkedInstancer` and the current shadows. Measured on the founding city: ≈100 visible instanced batches near and far (128-tile chunks, 4×4); merging per chunk by material (`BatchedMesh` needs one material) would remove only 13–20 draws (≈10%), while merging across chunks needs `BatchedMesh` per-instance CPU culling over ≈250k instances per frame. Shadows on vs `?shadows=0` while panning: same main thread (≈16.5%) and CPU ms/frame (≈2.2), GPU within headless noise; the shadow map already redraws only on demand (≤15 Hz), with small pieces not casting and distant chunks culled.
**Consequences:** Revisit only if content grows enough to approach the 300-draw budget; then prefer GPU-driven culling with indirect draws over `BatchedMesh`.

## D-032 — bun as package manager; releases are tags deployed by GitHub Actions (2026-10-25)

**Context:** The user wanted bun instead of npm and an easy, on-demand way to ship to Firebase Hosting instead of the
generated PR-preview workflow.
**Decision:** `bun.lock` + `"packageManager": "bun@1.3.14"`; scripts run via `bun run` (Vite/Vitest/ESLint still run on
Node; `bun test` is not used because it bypasses Vitest). `scripts/release.mjs` (`bun run release`) bumps the version in
the four files that carry it, commits, tags `vX.Y.Z` and pushes atomically; `firebase-hosting-release.yml` triggers on
those tags (and `workflow_dispatch` to re-deploy), gates on `bun run check`, deploys the live channel and creates a
GitHub Release.
**Consequences:** No PR previews. The tag must match `package.json` or CI fails. Agents release only on request (AGENTS.md §10).

## D-033 — Central landmark on a scenario-levelled terrace (2026-10-25)

**Context:** The user wanted an iconic, huge hero building at the centre of the map. The exact centre is the river's
spring on the hill slopes (no 14×14 plot within ≈20 tiles passes the slope check).
**Decision:** `ScenarioBuilder.level()` flattens a rectangle to its mean height with a smoothstep feather, never
touching water, through `setCorners` (so the edit is saved and hashed like reclaimed land). The Wellspring Spire is
procedural (kit pieces + one new `lumen` material, 3 new pieces) instead of a Rodin GLB: no paid credits, works offline,
and stays on the instanced path. Its loop road and boulevard are drawn after the utility sweeps so they don't crowd the plaza.
**Consequences:** About +5 draws near the spire. A Rodin GLB could replace the look later (keep the recipe as the
`fallback`). Old saves keep their own terrain and city; only new cities get the spire.
