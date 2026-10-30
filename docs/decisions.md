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


## D-040 — Building styles: per-building finishes inside the shared materials (2026-10-27)

Almost every building drew the same cream `concrete` and teal `glass`, so the city read as one material. Twelve
architectural **styles** (`render/materials/styles.ts`: classic, terracotta, whitewash, rammed earth, verdigris copper,
glazed mosaic, charred timber, limestone, bamboo, rose, sage, indigo) each set a wall colour and surface pattern (tile
courses, earth strata, lime plaster, standing seams, mosaic, charred boards, ashlar, basket weave), a window pattern
(grid, ribbon, tall slots, arches, diagrid, louvres), frame and glazing colours, timber tone, roughness and metalness.
**Mechanism:** a building's style index rides in the integer part of the instance seed (`aParams.y`) of its slab,
glass and timber pieces; `concrete` and `glass` split it off (`floor(seed)`) and read per-style data from
`uniformArray`s, evaluating every pattern and picking with `is()`. Rejected: new pieces or materials per finish,
since kit batches are per piece per chunk and a dozen finishes would add tens of draws. The CPU recolours only *neutral*
recipe tints (light concrete, pale glass, plain timber) into the style, so designers' accent colours survive.
**Choice:** heroes keep `classic` unless their def sets `style` (23 do); everyday buildings take a style per lot from
their district's family (36-tile cells, 6 families of 4 related styles, 1 in 8 lots picks any style), so streets read
as places rather than noise. Render-only: no sim state, saves or hash change. Classic is pixel-identical to before.
**Cost:** draw calls unchanged; GPU and main thread within headless noise (GPU 3.5–5.5 ms vs 4.6–4.8 ms before).

## D-041 — The Aeroline: an elevated maglev loop, render-side, with stations as transit buildings (2026-10-27)

A futurist rail line for the founding city. **Route:** a closed loop on the grid's street lines one to three blocks
round the hero district (`aerolineRoute` in `content/scenarios/founding-city.ts`), through Hillcrest, Eastgate,
Bayfront (out over the bay toward Bloomtopia) and Westbrook, corners rounded to radius 26; `modules/aeroline/path.ts`
parametrises it exactly by arc length (≈795 tiles), so baked geometry, trains and the ride camera agree. **Gameplay:**
the four stations are ordinary `aeroline-station` buildings with `transit: { rail: true }`: the mobility sim counts
their riders like a Pod Dock's (radius 26, 2 200 riders) but they draw no pod sky-lanes. No new sim state, save change
or hash change. The line is drawn once a station exists, so `?scenario=empty` has none. **Relayout:** the two lot rows
either side of the line in each town are filled first with low buildings (garden homes, pocket parks, work domes), so
nothing rises into the viaduct; the deck sits a constant 4.6 above the highest ground on the loop. **Scale:** shapes
are designed at full size and built at K = 0.55, since 1 tile ≈ 10 m (the first build at full size was a 120 m viaduct
that dwarfed the towns). **Look:** box-girder viaduct with a grey track bed, white guide beams with glowing power
rails, a moss median and lines of light; bloom pylons (V capitals, light collars, planted bases, pile caps at sea);
stations with lit platform edges, an elliptical glass vault, and a halo crown. **Boarding:** each station's
concourse (a 6×4 building on the loop's inner side) carries two Bloom Helix towers that climb to the platform: a
planted, lit spiral walkway wound round a glass lift core, ending at platform level in a gate bridge onto the
platform, crowned with opening petals. Lift cabins rise and fall in the cores and commuters walk the spirals (up
the inner lane, down the outer), both pure functions of `U.clock` in `Movers.ts` (two more instanced meshes, no
shadows). Lift shafts alone, rising under the deck, read as pylons rather than a way up. Six five-car trains (three per track, opposite directions) accelerate to 22 u/s, bank into curves and dwell
7 s at each station; placed on the CPU each frame as 30 instance matrices. A chase camera rides them (explore mode,
Tab for the next train). **Cost:** one merged guideway mesh, one glass mesh and two instanced train meshes. Chunking
the guideway for culling cost more than it saved, since each chunk also casts into every shadow cascade (four chunks:
+12–18 draws; one mesh: +4–10). Trains cast no shadows (the shadow map is cached). Overview 257 → 269 at worst,
near-horizon views ≤ 289; `?stress=1500` +6 (its near-horizon base already swings 293–314 between runs). Modules +33 ms
at boot (with the towers); main thread ≈ 18.4% active / ≈ 17% idle, within noise of before.

## D-042 — City inventory: readable ids, pluggable kinds and agent tools (2026-10-27)

The steward needs to find, count and inspect everything the city holds, and a future LLM agent needs the same
through function calls, so both use one pure-sim API. **Ids:** buildings get a serial (`Building.uid`, `City.nextUid`,
saved in v7, in the hash) shown behind a category code (`LIV-0042`; the code is cosmetic, lookup uses the number).
Entity ids were rejected (bitecs reuses them) and positions too (a rebuilt lot would inherit the id). Undo of the
newest build hands its serial back (`releaseUid`) so redo restores the same id; demolish/undo keeps it through the
record. Tile infrastructure has no stored identity, so it is named by an anchor tile (`HWY-x.z` = first tile in
row-major order; it changes only if that tile is removed), sky-bridges by their towers' serials. **Districts** are
named tile rectangles the scenario lays down (`ScenarioBuilder.nameArea`), saved, most specific first; old saves have
none (everything reads "Outskirts"). **Kinds** register like overlays (`registerInventoryKind`: `list`, optional `get`
and `details`); modules can add render-side objects (the scenery module adds the sea wonders). Records are rebuilt on
demand (no cached index to keep in sync); the UI snapshots every 2 s and filters the snapshot. **Agent tools** live
in core (`AgentToolRegistry`, generic over the context, provided as service `agent`): lower-snake names, JSON-schema
input, an `effect` of `read` / `view` / `mutate` so a host can gate state changes, and `call()` validates and
returns `{ ok, result | error }` instead of throwing, which is what a model needs to read back. Read tools are pure
sim (`sim/inventoryTools.ts`), so tests and headless agents run them without a renderer.

## D-043 — The city assistant runs a local LLM, ported from Andai (2026-10-27)

**Engines.** Ported Andai's two-engine design rather than calling a cloud API: the game is local-first and
the steward's city never leaves the machine. Browser: wllama 3.6.1 (`@wllama/wllama` + `-compat`, pinned and
kept on the same version), GGUF models from a pinned Hugging Face commit, cached in OPFS and sha256-verified
before every first load (`ai/llm/integrity.ts`). Multi-threading needs cross-origin isolation, so Vite and
Firebase Hosting now send COOP `same-origin` / COEP `require-corp` (the Google Fonts stylesheet loads with
`crossorigin`). Desktop on Apple Silicon: Andai's Rust Qwen3 port on mlx-rs 0.32 (`llm/`, one MLX thread in
`mlx.rs`), a closed catalog with every file's size and sha256, downloads streamed by the webview in 8 MiB
chunks and kept only when all hashes match (`models/store.rs`); no HTTP client in Rust. Andai's custom models
and Laya were left out. Release bundles need `mlx.metallib` (`bun run tauri:build:mac-arm64`, overlay
`tauri.mlx.conf.json`).
**Agent.** Small local models can't write free-form tool calls, so (as in Andai) the model picks a letter
(GBNF choice) and writes only arguments, held to a grammar of the tool's schema. Measured with
`bun run ai-probe` on the founding city, each of these fixed a failure seen with Qwen3 0.6B/1.7B:
redundant first options removed (they picked option A); the worst objects and their ids put in the brief;
`id` arguments narrowed to ids the turn has seen and `near` only to ids it named (otherwise it built "near"
an id from the brief instead of in the requested district); district and building type pinned when the
request names them; a short model-facing argument list per tool (`llmArgs`; they filled every optional
field with junk); plain commands routed straight to their tool (`plainIntent`) and questions never offered
actions; one successful action ends the turn (they kept "fixing" what they had just built); a `fix_issue`
macro (they replied with promises instead of choosing the right primitive). Every `mutate` tool asks first
unless the steward allows it; all actions are ordinary undoable commands.
**Cost.** Nothing runs per frame; the panel renders on events; wllama and the model listing load on first open.

## D-044 — Flora: more tools, a menu per request, and a maximizable console (2026-10-27)

**Tools.** 29 agent tools now (insight, action and game tools). A decision menu holds at most 15 tools (one
letter each), so `selectMenu` offers the core lookups and remedies (`CORE_TOOLS`) plus the tools sharing the
most words with the request (name, option, description, optional `keywords`), **in registry order** so a tool
keeps its letter (Andai: a reshuffled menu moves a small model's other choices). Plain commands and read-only
questions about budget, crises, trends, building types and advice route straight to their tool
(`plainIntent`). Game tools (`set_speed`, `show_lens`, camera, dashboard, explore, save) live in the assistant
module because they need the game context; `save_game` is `mutate` (it overwrites the slot) so it asks first.
Measured with Qwen3 1.7B in the browser (`bun run ai-probe --max`): budget, best building for food,
"build three vertical farms in Bayfront", pause and crises each picked the right tool first time. The reply
prompt was cut to three sentences with no promises and a 220-token budget, after 1.7B padded answers with
"I'll monitor…" and made-up states.
**Console.** The panel is a holographic instrument: static layered gradients (grid, scanlines, corner
brackets, glow), chamfered mono controls, a mission log (timestamped process lines per tool call,
authorization cards with argument rows, clickable ids, tool results as telemetry rows). Maximized, it spans
from the City Pulse to the right edge, hides the right column, and adds a telemetry rail refreshed at 2 Hz
(the inventory roll-up every 4 s) only while maximized and open. Motion only while Flora works (sigil orbit,
scan line; transform only). Main thread unchanged (20.8% active).

## D-045 — Phones: a compact HUD and touch gestures (2026-10-28)

**Layout.** `platform/device.ts` sets `body.compact` (width ≤ 760 px, or a short coarse-pointer screen) and
`body.touch` (coarse pointer) from live media queries; `ui/mobile.css` loads after `theme.css` and restyles the
existing DOM rather than building a second HUD. Phones keep: clock and speed, five key stats (no rates or
capacity), undo / dashboard / save / settings, the toolbar (icons, scrolls sideways) and build tray (with a ⟳ Rotate
card, shown on desktop too). City Pulse, Flora-Net and lenses become chips that open one full-width sheet at a time
(`hud.sheet(el)`: folded at start, opening one folds the others, a tap on the city folds all); the inspector is a
bottom sheet (a side sheet in landscape). Dropped on phones: brand, telemetry readout, explore bar, redo, load,
overview (pinch out instead) and the Flora launcher (a local LLM is impractical on a phone; **✿ Ask** still opens
her full-screen). The tool hint moves into the dock because there is no cursor to follow.
**Input.** One finger is the left button. A second finger turns the press into a camera gesture (pinch zoom,
twist rotate, two-finger pan; a parallel vertical drag tilts when one finger already pans): tools get
`cancel` instead of `up`, and nothing reaches them until every finger lifts. One finger pans with any tool that
doesn't draw by dragging (`touchPan` = `dragPan` or no `down`); highway, channel, bulldoze and reclaim keep it for
drawing. With no hover, build, retrofit, mist and single-building demolish preview on the first tap and act on a
second tap on the preview. Touch slop is 12 px (6 for a mouse).
**Quality.** Touch devices default to Medium (pixel ratio 1, no MSAA); Settings can raise it. Rejected: a
separate mobile HUD (two UIs to keep in sync with every module).

## D-046 — Flora's dossier: Profile and Tools tabs, and Flora on phones (2026-10-28)

**Tabs.** The console has Console · Profile · Tools tabs (`modules/assistant/Dossier.ts`). Profile shows
identity and model core, session tiles, the **directive stack** (the three system prompts of a turn, read from
`PROMPTS` in `ai/agent.ts` so the view can never drift from what the model is sent), the live context feed
(`cityBrief`, resampled on demand) and the loop's protocols. Tools lists every registered agent tool as a card
(effect: Sense / Guide / Act, default policy, core, parameters with enums and "manual" for non-`llmArgs` fields,
trigger keywords, calls this session); filter by effect, search, and Run (`/name`) or Compose (`/name key=` in
the input) from a card. Both views are rebuilt when their tab opens, never per frame, and read the registry then.
**Look.** One-shot boot sequence on first open, message entrance, a header waveform while Flora works,
glowing sigil; the profile's large sigil turns only while that tab is visible. Opacity/transform only (§7½).
**Phones.** Supersedes D-045's hidden launcher: Flora gets an orb beside the toolbar (`hud.dockRow`), and the
console is full-screen without the telemetry rail or maximize, the HUD beneath hidden (`body.flora-open`), the
model list capped, no auto-focus (it would raise the keyboard), 16 px input (iOS zooms smaller inputs).

## D-047 — Desktop HUD merges, and wind power for the founding city (2026-10-28)

**HUD.** Fewer floating pieces on desktop: the telemetry strip (SIM / POS / HDG / ALT / FPS) sits under the City
Pulse header (`hud.readout`, adopted by the pulse panel, so it stays visible when the panel folds); the explore
bar became a **view-mode dropdown** at the end of the top bar's actions (the top bar is the one HUD part kept while
exploring; the menu hangs off the top bar because the actions panel's chamfer clip-path would clip it). Flora's
launcher moved from the top bar to the orb beside the build toolbar on every screen size (`hud.dockRow`), with the
unread badge. Below 1700 px the dropdown shows only its glyph, and below 1600 px the harmony meter hides, so the
stats row isn't clipped.
**Wind.** New `wind-turbine` (Breeze Turbine, 2×2, 55 energy, cost 700, upkeep 0.07/s: the cheapest power to run
per unit, to steer players to it). The recipe draws plinth and tower; `modules/wind` mounts a nacelle on every
turbine facing one prevailing wind (not the lot's rotation) and spins the rotors on the CPU from `U.clock` (two
instanced meshes, ≈1 matrix per turbine per frame, no shadows since the shadow map is cached). The founding city
gets Windward Isle (the north-east islet: three road spines off the bridge landing) and sea-breeze rows along the
longest waterfront streets, capped at 90 turbines (≈half the city's power, staggered 9 tiles so rotors never
cross; every turbine touches a highway). The Foundry Islet now pairs its bioreactors with Phyto Gardens. Default
seed: clean energy 74% → 99%, power margin unchanged (≈9%), budget unchanged (income 178 / upkeep 153 per s);
unpaired polluters 36 → 1. Draw calls: +0 at overview, 156 near the farm. `?stress=1500` overview measures 302
with or without the farm (pre-existing).

## D-048 — City map of districts (2026-10-28)

A ⌗ MAP button at the start of the top bar's stats (and **Y**) opens a holographic plan of the island
(`modules/citymap`). It is painted from the live city into a 2D canvas when opened, one pass over the tiles:
height relief, water depth, highways, building footprints, each named district (`city.districts`, most specific
first) tinted and outlined in its own colour. Names are HTML labels at each district's tile centroid, sized to fit
the district's on-screen width and wrapping rather than running into neighbours; narrow districts drop their
counts (buildings, residents), which the legend keeps. The view is cropped to the land. A marker shows the camera's
focus and heading (5 Hz while open). Clicking a label, legend row or any spot flies the camera there. Nothing runs
while the map is closed; 2D canvas only, so both renderers behave the same.

## D-049 — A zoned founding city, industry and sports buildings, and transit for it (2026-10-28)

**Zones.** Named areas carry a `zone` (`ZoneKind` in `content/types.ts`: living, work, industry, leisure
(entertainment), sports, utility, civic, parks) via `nameArea(…, zone)`; saved (SAVE_VERSION 8: a sixth district
tuple field, v7 saves load with no zones) and hashed. The founding city is planned: Hillcrest, Westbrook, Eastgate,
Bayfront's west half and Skyline Hill are living; Harbour Commons and The Exchange are work; Westport Works (by the
islet bridge) and the Foundry Islet are industry; Lumen Promenade and Bloomtopia are entertainment; Meridian Arena
is sports; Sunfield, Windward Isle and Working Hills are utility; Civic Ring civic; Garden Quarter parkland. A town
keeps its name (tests, the assistant and players use them); its sub-zones are named first so they win. Living
zones hold homes, parks and a few vertical farms; job and food top-ups sweep only work, entertainment and
industry lots. The city map colours by zone (toggle: per district) with the legend grouped by zone; the
inspector shows a zone chip; inventory districts carry the zone in their group.
**Buildings.** Two categories, Industry (IND) and Sports (SPT), last in the toolbar so the older categories keep
keys 4–9, 0. Industry: Mycelium Brickworks, Kelp Bioplastic Refinery (both pair with Phyto Gardens), Solar Glass
Foundry, Circular Reclaimery (cleans the air), Drone Fabricator. Sports: Bloom Stadium (12×12), Lagoon Aquatic
Centre, Wind Velodrome, Canopy Climbing Tower, Meadow Sports Fields. Factories and sports fields carry explicit
upkeep below the 0.03%-of-cost default (businesses whose staff pay tax; cheap turf). Existing kit pieces only.
**Transit and roads.** Zoning sends commuters further, so: a new **Pod Interchange** (radius 22, 1 600 riders,
upkeep 0.2) every third block of the living towns; a second pod dock on blocks within ring 6; docks and an
interchange for Skyline Hill, whose towers had none and caused most of the jams (found by listing jammed tiles per
district: 23 of 41 were there); mid-block service lanes through work, industry and entertainment blocks (four
factory-sized lots each, more entrances). Default seed, settled: flow 0.94 (Thriving, was 0.84), unemployment
0% (was 8%), residents 29.9k (29.5k), food/jobs Thriving, power +8%, clean 100%, budget +17/s (was +25: the city
now pays for a stadium, factories and transit; the early dip while residents move in lasts ≈15 s longer).
Rejected: two docks on every living block (homes lost, flow fell to 0.83); docks only (flow swings 0.77–0.91
with layout). Draw calls 256 overview / 270 at the arena (`?stress=1500`: 329 at the arena, overview 304 as before).

## D-050 — Hazards: earthquakes, lightning and fires, emergency response and an incident log (2026-10-28)

**Hazards** (`sim/hazards.ts`), on top of the slow crises: three new crises in the same scheduler and drills
(`?drill=earthquake|thunderstorm|industrial-fire`). *Earthquake*: 8 s of tremor warning, a main shock damaging
buildings by distance from a random built-up epicentre (towers more), aftershocks, camera shake, and fires where
damage is heavy. *Thunderstorm*: a storm cell whose lightning favours towers, turbines and big landmarks (damage,
often fire); its rain helps put fires out. *Industrial fire*: a factory catches fire. Heatwaves also start fires,
mostly in factories. **Fires** grow, burn their building's condition and leap to a neighbour when fierce (at most
twice each; measured: uncapped spread at 0.07/s ran a quake's fires away to 40+ at once). They die to dispatched
crews (`respond`, ◈150 a fire), to an **Ember Watch Station** in reach (new utility building, `response` on a def;
founding city: about every fourth town block, the islets beyond uncovered), or to rain. A building brought to zero
becomes a **ruin** (evacuated, out of service, smoke) until rebuilt (`repair`: half its price; damage is repaired in
proportion). Damage costs 18% of the building's price in credits (30% let one downtown quake take ~7 000).
**State and saves.** `steward.fires`, `ruins` (building serials), `history` (≤ 80 records: kind, time, place,
duration, damage events, ruins, fires, displaced residents, credits lost, outcome, worst-hit ids), saved (v9) and
hashed; burning and ruined buildings flow into the pulse through `Modifiers.down` and get `Problem.ON_FIRE` /
`RUINED` (problems widened to 16 bits). Every crisis, old and new, is logged when it ends; a fire's burn damage is
its own entry's, a crisis counts its direct hits and the fires it started, so the log's totals add up.
**Response.** Fire panel under the crisis banners (dispatch one or all, fly to, open the log); inspector buttons
(dispatch, rebuild, repair); dashboard **Incidents** tab (tiles, now, filterable log with details); Flora tools
`incident_status`, `respond_incident`, `repair_damage` (in the Rust grammar fixture), plain-request routing, and
monitor notices for fires, ruins and quakes. Visuals (`modules/hazards`): flame tongues and smoke on burning roofs,
ruin plumes, a lightning bolt and flash, quake shake (sync phase, so it lands in the frame); no shadows; two
instanced meshes posed only while something burns or smoulders.


## D-051 — The sky-lane network: hubs, spokes, trunks and a new commuter pod (2026-10-29)

**Network.** A transit building with `transit.hub` (`reach`, ring height and radius, `central`) is a sky-lane hub:
Pod Interchanges (reach 45), the Dragonfly Skyport (60) and the new **Skylane Nexus** (central, reach 110; 6×6,
placed in the Civic Ring beside the spire). `sim/skylanes.ts` builds the network on every mobility pass from the
operating docks alone: each Pod Dock links by a **spoke** to the nearest hub whose reach covers it; hubs link by
**trunks**, a minimum spanning tree over hubs within 150 tiles (a link to a central hub costs half, so the Nexus
becomes the backbone) plus a star from each central hub to the hubs in its reach. Deterministic (entity order, ties to
the lower index), derived, never saved (`pulse.skylanes`, like `podRoutes`). **Gameplay:** a linked dock or hub
carries +20% riders on a network of two or more hubs, +15% more when it has a central hub (applied before riders
are taken). Founding city: 13 hubs in one network, 164 docks linked; flow unchanged within noise (≈0.95).
**Pods route.** A networked dock's pods fly up its spoke into the hub, circle the transfer ring and leave on another
lane: to the dock's job centre (an egress lane), to another dock on the hub, or along a trunk to the next hub;
express pods run the trunks. A turn round the ring shorter than 0.8 rad loops the whole ring instead (it reads as
routing). One path function (`modules/mobility/skypath.ts`) poses pods in the vertex shader from three static vec4s
(route, via, info) and mirrors on the CPU for the ride camera; legs are the lanes' own arcs, so pods ride their
ribbons. The ease never stops (min 20% speed), so the heading from finite differences stays defined. Rejected:
per-frame CPU posing (uploads every frame, AGENTS §7½).
**Look.** Lane ribbons by kind (dock lane teal → pink, spokes cyan → blue, trunks broad gold ↔ violet with a centre
line and edge rails); saturated colours by day, neon at night; lanes and rings thicken with camera distance. Each hub
wears three counter-rotating dashed rings (six for a central hub, gold) and a light shaft; normal blending for the
rings (additive vanished against the sunlit city). +2 draw calls (rings, shafts).
**Pod model.** The optional `commuter-pod.glb` is no longer loaded: a procedural pod (`podModel.ts`, ≈1.3k vertices
since the shader evaluates the path per vertex) with a smoked-glass canopy split by frames, three cabin windows a
side, a waist light line, a ring thruster, swept fins and a hover pad. Glass is marked by `aGlow = −1` (an `aGlass`
attribute took the pod to nine vertex buffers; WebGPU allows eight) and shaded with a Fresnel sky reflection, a sun
glint and a warm cabin at night. Normals turn with the body, lit by `skyShade`. Kit `pod` pieces (berthed in
buildings) are unchanged.
**Measured** (headless, founding city, High): draws 242/288 → 245/291 on the same perf path; main thread ≈21–22%
both; GPU 2.7–3.8 ms → 2.9–4.2 ms (within the noted headless noise); boot unchanged (WebGL warm-up ≈2.5 s both).
**Scenario note:** the Nexus's jobs shift the job sweep, so one more factory reaches the Foundry Islet's east edge;
the islet's name now covers the overhang of lots on its edge (`zoning.test.ts` caught the factory outside its zone).

## D-052 — Pod ↔ Aeroline transfers; wild trees at street scale (2026-10-29)

**Transfers.** Aeroline stations (`transit.rail`) join the sky-lane network (D-051) as transfer points: each links by
a **rail** link to the nearest hub within the hub's reach + `RAIL_REACH` (20), so riders fly in by pod and change
to the trains. Gameplay: a linked station carries +25% riders (`RAIL_FEED`: pods bring them from beyond its walking
radius), and every dock and hub on a network that reaches a station +10% more (`RAIL_BONUS`, on top of the network
and central bonuses). Founding city: all four stations link to their town's Pod Interchange; tests still pass the
zoning balance unchanged. Inspector lines for hubs (transfers count) and stations (linked hub or how to link).
**Render.** A rose → amber transfer lane from the hub ring to the station, two shuttle pods on it, a quarter of
each networked dock's pods routed dock → hub ring → station, and two rose landing rings over the station. Pods set
down `RAIL_Y` (1.6) above the platform deck; the deck height comes from the Aeroline service (`aeroline.deck`).
The Aeroline module initialises after mobility, so the lanes re-land once the deck is known (checked per frame
against the height they were built with; an estimate until then).
**Trees.** Wild trees (`world/Flora.ts`) were up to ≈4 units tall with canopies 2.2 tiles wide: 11–12 floors
(FLOOR 0.32) beside 3–6-floor homes. Now size 0.42–0.82 (was 0.7–1.5) and round canopies 0.85–1.15× size (was
1.0–1.45×): about 4–7 floors, under a tile wide. Dense forest (field > 0.35) packs a second, smaller tree into 60%
of its tiles so woods still close at the new scale: flora instances 103k → 111k (+8%). Draws unchanged (245/291 on
the perf path); headless GPU time swung 2.6–11 ms between identical runs, too noisy to compare. Recipe trees
(`kit.tree`) were left alone: they are sized per building already.

## D-053 — Sky-lanes clear the buildings beneath them (2026-10-29)

Lane arcs were sized by length alone, so many ran straight through towers (and pods with them). Now each lane is
**lifted** by whole tiles until it keeps 1.2 of air over every rooftop between its ends (sampled every half tile;
the buildings under either end, a dock or hub, don't count; the first and last 7% are the approach). Rooftops come
from a per-tile map of each building's placed base + template height (`modules/mobility`, rebuilt when buildings or
terrain change). Lanes that set down at a job centre land on the tallest rooftop beside their final approach
(a rooftop pad) instead of squeezing down to the street between towers. The arc profile changed from a parabola to
climb–cruise–descend (`1 − (2t − 1)⁴`): it reaches 59% of its crest 10% along (a parabola 36%), so a tower near an
end needs a modest lift rather than a towering loop. Cap 90 (the Wellspring Spire). Pods use the same lifts: one per
leg, packed into the integer parts of the info vec4 (seed + lift1, speed + 4 × lift2; `podInfo`), since the pod is
at WebGPU's eight vertex buffers. `skylanes.clearance()` reports lanes, lifted and still clipping (founding city:
221 lanes, 60 lifted, 0 clipping; was 16 clipping at an end and 3 mid-span before rooftop landings and the new
profile). Tests: `tests/skypath.test.ts` (arc symmetry, lift, packing, a pod on its lifted lane).

## D-054 — Explore avatars, a balloon and landmark rooftops (2026-10-29)

**Avatars** (`modules/explore/avatars.ts`): a chibi steward (big head, sprout, backpack; limbs pivot for a walk
cycle and a riding crouch), a jet hoverboard (pearl deck, glow strips, twin nozzles with additive flames that
lengthen with speed and boost; the steward rides it side-on), a quadcopter (canopy, gimbal camera, nav lights,
spinning rotors with blur discs; pitches into speed, rolls into strafes) and a hot-air balloon (16 gores in cream,
sage, coral and gold, a solar-fabric belt, wicker basket with lanterns, burner flame). Merged `GeoBuilder` meshes on
the shared `scenery` material; moving parts are their own meshes; one rig visible at a time (≈ 6–10 draws, explore
modes only); no shadows (cached shadow map). Walk, rooftop, board and drone are now third-person chase views
(V gives first person on foot, the basket view in the balloon); walk speed dropped to 0.65 / 1.7 tiles/s to suit a
0.2-tall steward.
**Balloon**: WASD drifts (with a light prevailing wind), E/Space burns to rise, Q vents to sink; the envelope keeps
1.5 above the rooftops round it, ≤ 95. **Rooftop** (`roof.ts`): landmarks are the hero district, the landmark and
other single-variant buildings ≥ 6 tiles. Their flat solid pieces are projected onto a 0.08 grid; the roof is the
highest level whose connected flat area (after removing cells with anything else at body height: cones, petals,
trunks) erodes to ≥ 0.6 sq units, at least 1.2 above the base (lower is a plaza). Movement is held to those cells per
axis, so the steward slides along the parapet; Tab steps to the next landmark by distance. Founding city: 30 of 44
landmarks have a roof (≈ 10 ms each, solved on arrival). Rejected: raycasting the instanced scene (hundreds of
thousands of instances).

## D-055 — Explore physics: piece-level colliders, flying bodies and cameras that respect them (2026-10-29)

The explore collider was one inset box per building (domes, spires, wings, petals and trees were air, and some
plazas were walls), and only walkers used it: the drone flew through towers, the balloon only checked a floor, and
every chase camera passed through walls. Now (`modules/explore/collider.ts`) each building's colliders are its recipe
pieces in world space, cached per building: boxes, upright cylinders (drums, trunks, ribs, cones) and ellipsoids
(domes, canopies, pods), plus the terrain plinth; ground cover, flowers, ivy and hollow rings stay passable. Queries
look through the buildings within 5 tiles (pieces overhang their lots). Wild trees come from the flora (trunk
cylinder + crown sphere per tree, recorded per tile in `world/Flora.ts`). API: `hits(x, y, z, r)` (a ball touches
something), `groundAt` (highest piece top within a step), `blocked` (one ball just above the step height covers the
0.22-tall steward), `reach(from, to, r)` (how far a ball sweeps before touching).
**Bodies.** Walker and board: walls stop them, heads bump ceilings on a jump. Drone: a 0.15 ball moved axis by
axis, so it slides along walls and settles on roofs. Balloon: two balls (envelope 1.15 at 2.1 up, basket 0.22),
same sliding; neutral buoyancy when idle (it used to sink toward a floor 1.5 over the rooftops). A body that starts
inside something rises out instead of freezing. **Cameras.** Every chase view and the pod ride camera sweep from the
avatar out to their spot and stop short of the first wall (snap in, ease out). Pods already clear rooftops on their
lanes (D-053). Cost: ≈ 0.02 ms for a frame's queries downtown; ≈ 6 ms to build a downtown block's colliders on first
touch. Tests: `tests/explore.test.ts` (walls, parks, decks, flying balls, camera sweep, trees). Tests that build
colliders call `initPieces()` first (the collider reads piece geometry).

## D-056 — One steward's console: City Pulse with Build, Lenses and Flora-Net tabs (2026-10-29)

Desktops had four HUD blocks over the city: City Pulse (left), the lens bar (top centre), Flora-Net (right) and the
build toolbar with its card tray (bottom centre). They are now one full-height console on the left (`PulsePanel`,
304 px) with tabs **Pulse · Build · Lenses · Flora-Net**; the top bar, the inspector, toasts and the Welcome help
stay where they were, and Flora's orb moves to the bottom-right. Extension point: `services.get('pulse').addTab(id,
label, glyph, ...els)` moves existing elements into a tab and returns a handle (`select`, `setBadge`, `selected`);
`fold()` folds the console. Elements keep their phone home: on `.compact` they go back where they were appended and
the console shows the pulse alone, so phone sheets and chips are unchanged (D-045). Behaviour: opening a building
category (click or 4–0) brings the Build tab forward; L still cycles lenses, and the lens legend (now with the lens
name) stays at the top while one is on; F brings Flora-Net forward (again folds the console); P folds it; the urgent
count shows on the Flora-Net tab. The last tab is remembered per browser (`localStorage`, per-viewer convenience).
Build lays tools and categories in two columns and the open category's cards as a list. Adopted panels drop their
own frame inside the console. Measured: draws unchanged (245); main thread ≈ 21.8% active / 16.5% idle; style and
layout 0.8%.

## D-057 — Explore modes on phones: the switcher and a touch pad (2026-10-29)

Phones hid the view-mode switcher (D-045 treated explore modes as desktop-only), so a phone had no way into them,
and a session that entered one (keyboard `N`, a tablet with a keyboard) had no touch way back. The switcher now shows
on `.compact` as its glyph in the top bar's actions, with a full-width menu under it (keyboard hints dropped). While
exploring on a touch device a pad appears (`modules/explore`): a joystick bottom-left that holds W/A/S/D (eight
directions; pushed to the rim adds Shift for run / boost), held ▲ (Space: jump, rise, burn) and ▼ (Q: sink, vent)
buttons, taps for ⇥ (Tab: next landmark, pod or train) and ◉ (V: first person / basket), each shown only in the modes
that use it, and a **◇ City view** button top-left under the top bar. The pad writes `input.keys`, so the modes'
controls are unchanged; one-finger drag on the canvas already looks around. Pointer capture is guarded (it throws if
the pointer has already ended). Desktop unchanged (the pad is touch/compact only).

## D-058 — macOS installers on every release (2026-10-30)

The release workflow's `macos` job (after the web release passes `bun run check`) builds two DMGs on `macos-15` and
attaches them to the GitHub Release: **aarch64** natively with `tauri:build:mac-arm64` (MLX + `mlx.metallib`, so the
native assistant works) and **x64** cross-compiled with `--target x86_64-apple-darwin` (no MLX; the assistant runs in
wllama). No universal binary: MLX is arm64-only, and a lipo'd app would need the Intel half to skip it anyway. Builds
are ad-hoc signed (`APPLE_SIGNING_IDENTITY=-`) unless the repo secrets `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` (and for notarization `APPLE_ID`, `APPLE_PASSWORD`,
`APPLE_TEAM_ID`) exist; ad-hoc apps need **Open Anyway** in Privacy & Security on first launch, which the release
notes explain. Unsigned (not even ad-hoc) bundles are rejected as "damaged" on Apple Silicon, hence the ad-hoc default.
