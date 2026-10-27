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
**Follow-up (same day):** four more procedural heroes share one terrace around the spire (one `level()` call, so
terraces never fight over corners). The Sky Ark carries `transit` (its own pod port): without it its commuters jammed
the plaza loop and city flow fell from 85% to 42%; with it plus a second road link west, flow is ≈80% (Stable).
The opening fly-in ends on the largest `landmark` building (`openingView`), falling back to the old downtown view.
**Hero avenue:** `level()` now returns its height and never feathers over earlier edits, so the avenue terrace continues
the quarter's level without bending it. The avenue adds a Skyport (pod hub) so its 360 new residents and 420 jobs keep
flow at ≈80%. Draws with `?stress=1500` rise to ≈260–265 (budget 300): the next big content addition should start with
the far-chunk impostors / GPU culling item in the roadmap's tech debt.
**Hero promenade (ten more):** built only from existing pieces and kept in the central render chunks, so they add
instances, not batches: ≈234 draws at the promenade, 275 with `?stress=1500` (budget 300). That is the practical
ceiling for hand-placed heroes; more content needs impostors or GPU culling first. The Habitat Cascade carries
`transit` (it otherwise jammed the one-lane promenade). The new water producers lifted the founding city to
Stable water, so the water sweep targets 100% of demand instead of 102%, which keeps the intended opening shortage
(the advisor test relies on it). Food on the default seed opens between ≈0.92 and 0.97 depending on the moment;
the scenario is deliberately short on food and water.
**South Avenue and Garden Lane (ten more, 30 heroes in all):** placed only in the two 64-tile render chunks that
already held the hero pieces, so they add ≈2 draws. The worst view (over the South Avenue toward downtown) measured
302 draws with `?stress=1500` *before* this batch; `haloRing` stopped casting shadows and it is now 297 (255 without
stress). **The hero district is at the draw-call ceiling: the next content must start with far-chunk impostors or
GPU-driven culling.** Seed 4242 opens with food ≈0.56 and water ≈0.7 with or without the heroes (a small-island seed).

## D-034 — Coarse instancer chunks for large buildings: rejected (2026-10-25)

**Context:** To make room for more heroes, large buildings' pieces were put in 256-tile "coarse" batches (offset so the
island centre falls in one), hoping one draw per piece type would replace one per 64-tile chunk.
**Result:** draws rose by ≈70 in every hero view (e.g. 234 → 308 at the promenade). Common pieces (glass, slab, moss,
trees) still had fine batches for ordinary buildings, so coarse batches were *extra*; and a coarse box nearly always
contains the shadow focus, so they always cast shadows. Reverted.
**Decision:** keep one chunk size. Add hero content inside chunks that already hold its piece types (≈0–2 draws per
building), avoid introducing piece types to new chunks, and drop shadows on thin decorative pieces (`haloRing`,
`spireCone`). The North Terrace was placed this way and normal views went *down* ≈6 draws (South Avenue 255 → 249;
`?stress=1500` worst 298).

## D-035 — The hero district is one street grid with spare lots (2026-10-26)

**Context:** five batches of heroes had been added along separate roads (avenue, promenade, lanes, a terrace), each on
its own levelled strip, so the centre read as scattered buildings in woodland rather than a city, with no room left.
**Decision:** a 9 × 8 grid of 14-tile blocks (streets every 15 tiles) centred on the spire's block. Every block is
levelled to its mean ground pulled into a 0.8-per-block Lipschitz surface (streets refuse tiles steeper than 0.9, so
neighbouring terraces must stay within that). Heroes are listed per quarter in `QUARTERS`; each takes the free block
nearest the spire in its quarter, flush with the street facing the spire, long side along it. Leftover blocks are
graded, road-served empty lots for future heroes. Streets skip water (the lake and river become parks); the north
avenues and two river streets are bridged.
**Draw calls:** quarters match the 128-tile render chunks, and heroes with rare pieces share one (timber → garden
quarter, algae tanks → exchange): batches 91 → 92 total, normal views ≈9 *fewer* draws (worst 244, overview 211),
`?stress=1500` worst 298 as before once `willowArch` stopped casting shadows.
**Commuting:** a home sends all its road commuters to the nearest workplace in one stream, so every tile of that trip
jams; Vertical Forest (182 road commuters) 16 tiles from Glass Pine dropped flow to 0.66. `[workplace, home]` pairs put
both entrances on the same street tile. Flow over six seeds averages 0.86 (was 0.83); the default seed is 0.80.
**Also:** `ScenarioBuilder.level` writes heights at once but commits all edits with one `setCorners` (one shore/soil
refresh), keeping the scenario at ≈0.25 s despite ≈70 terraces; the builder gained `height()` and `footprint()`.

## D-036 — Natural night lighting; Bloomtopia on the south islet (2026-10-26)

**Night lighting:** buildings read as glowing panels at night: 55% of glass windows lit at full strength, a cyan
glow over every glass surface, lumen trims at 1.6× and bloom on every emissive pixel at 0.9. Now ≈40% of windows are
lit in the evening and they go out one by one to ≈10% between 22:00 and 01:30, back before dawn (`U.lateNight`, set
from the time of day in `Atmosphere.applyTime`); each lit window has its own brightness and tone (mostly amber lamps,
some cool screens). The glass wash is 0.05 (was 0.4), lumen 0.6 (was 1.6), pod bands 0.8, algae 0.35, plant and moss
glow halved, bloom strength 0.6. Landmarks meant to glow (the Algae Lantern, neon signs, the Ferris wheel) still do,
just softer.
**Bloomtopia:** the islet is an ellipse ≈54 × 26 tiles, so the park is 36 × 16 (a 40 × 18 rectangle does not fit),
nudged a few tiles if a seed's shore cuts a corner. The bridge from downtown is drawn early (as before, so districts
build round it) and lands at the gate; the forecourt is drawn last so the utility sweeps leave the gate alone. Glass
pieces were dropped from the fence, pylons and kiosks: the glass material draws lit office windows at night. Jobs are
40: a workplace's commuters travel in one stream, and over the long single bridge any load above free flow (≈44)
would jam every tile. Draws: park views ≈245 (≈272 with `?stress=1500`); normal downtown and overview views +≈12.

## D-037 — Signature bridges are render-only dressing of bridge spans (2026-10-26)

**Context:** bridges were flat deck slabs on piers. Making them landmarks as buildings would need placement on water,
saves and footprints along roads. **Decision:** `findBridgeSpans` (pure, `sim/bridges.ts`) finds straight runs of
bridge tiles; `BridgeRenderer` dresses each run ≥ 8 tiles from kit pieces through the instancer, by length:
suspension ≥ 45 (tower style alternates with the 64-tile column so neighbouring straits differ), cable-stayed 28–44,
Helix or Bloom Arch (hashed) 14–27, Bloom Arch below. It rebuilds on `road:changed` only when a bridge tile is added or a
dressed one removed (a full scan ≈1 ms), so saves, undo and player or weaver bridges need nothing new. Crowns use
`solarLeaf`: `sunPetal` (flower material) stays closed and green where the bloom field is empty, as over water.
**Cost:** ≈+6 draws per view (normal worst 260 downtown, `?stress=1500` worst 287) and main thread ≈18.5% active (was
≈16.9%, from the extra batches) / 14.5% idle.

## D-038 — The island is one planned grid; buildings have an entrance per street side (2026-10-26)

**Context:** the towns were small, dense 5–6 tile grids at the map's edges, joined by an arterial ring of huge
L-shaped roads across empty land, with utilities scattered along it. **Decision:** the towns continue the hero
district's 15-tile grid (`TOWNS` in `founding-city.ts`): Bayfront, Eastgate, Westbrook, Hillcrest. A block has no
inner streets, so `fill` lines its perimeter and leaves a green courtyard; density and mix fall with ring distance
from the spire; ≈12% of blocks are parks. Solar goes to the Sunfield (lane rows every 5 tiles), water works to
outer streets run on to the shore. Islet bridges leave from town corners; the ring is gone.
**Commuting:** a home sends its road commuters to the nearest workplace in one stream, and with towns beside the
hero district those streams converged on single entrances (flow fell to 0.55). Two changes: (1) `accessTiles` gives a
building an entrance on every footprint side touching a highway (its middle-most tile), splitting jobs and commuters
evenly (more realistic for big buildings, and corner buildings split their queues); (2) heroes now sit flush with the
side of their block facing *away* from the spire, toward the towns their workers come from; and a Pod Dock stands on
every town block (a checkerboard left one seed at 0.69). Flow over six seeds 0.77–0.88 (was 0.82–0.97 with far
towns; trips are about half as long now, so the same jam weighs more in the ratio). Density tweaks were noise: they
reshuffle which homes feed which streets. Frontage is filled with pocket parks (no commuters) to look lined.
**Also:** the heatwave test compares against the same city without heat after 200 steps; the start value is no
baseline (occupancy keeps settling) and after 400 steps the brownout drives residents out. Opening budget ≈ +11–16/s
(was ≈ +35/s): smaller population (≈25k) and dock upkeep. Seed 4242 no longer opens starved (food 1.04, water 0.92).

## D-039 — Sky and sea scenery are merged, shader-animated meshes (2026-10-27)

**Context:** the sky was an empty gradient and the open sea around the island had nothing in it. **Decision:** a
`scenery` module adds render-only decoration with no sim state (nothing to save or hash). Every piece is baked into
one merged geometry (`GeoBuilder`: per-vertex colour, `aGlow`, extra per-vertex attributes) instead of instanced kit
pieces: kit batches are per piece *per chunk*, so the six wonders in empty sea chunks would have cost ≈40 draws at the
overview. Moving things (64 clouds, 7 lantern balloons, the airship, 5 gull flocks, 2 whale pods) are animated in the
vertex shader from `U.clock` (orbits, drift with wrap-around, wing beats, surfacing) with no per-frame CPU work; their
unlit `MeshBasicNodeMaterial`s shade themselves (`skyShade`) and send glow to the bloom MRT via `mrtNode`. Clouds shrink
away inside a capsule from the camera focus back to the camera, so they frame the view without hiding the city; storms
bring more, greyer clouds. Sea wonders stand in deep water near the map corners (`sites.ts`, tested deep on several
seeds) so they never sit on land or on likely bridge lines; each is its own mesh (culled separately), whale pods get a
hand-set bounding sphere since their geometry is local. **Cost:** +2 draws everywhere (clouds, sky life), +1 per wonder
in view: downtown 217 → 221, overview ≈253, low horizon 291 → 297; `?stress=1500` +4–8. Modules +35 ms at boot; main
thread unchanged within noise. **Known:** the `?stress=1500` near-horizon dusk view (pitch 0.12) was already over budget
before this change (312, now 318).

