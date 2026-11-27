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

## D-059 — Rounded instrument HUD; frameless Flora orb (2026-10-30)

Supersedes D-027's frame shape: the user found the chamfered, square HUD sharp and uncomfortable. `theme.css` keeps the
dark instrument palette, mono numerals and coded titles, but panels are rounded (`--radius` 16px, with `--r-md` 11px,
`--r-sm` 8px, `--r-xs` 6px and `--pill` tokens for cards, controls and meters) with a faint top sheen and a static drop
shadow instead of clip-path chamfers, corner brackets and the scan texture. LEDs are round and active states are soft
fills rather than hard underlines. Flora's orb (`.ai-fab`) drops its panel plate: the sigil stands alone with heavier
strokes, filled petals and a dark halo so it reads over the scene. New panels should use the radius tokens, not literal radii.

## D-060 — Flora docked right; full-window maximize; phone HUD fixes (2026-10-30)

Flora's console no longer floats mid-screen (`right: 314px`): it docks to the right edge, from under the top bar down
to just above her orb, and the right column (inspector, help) steps left while she is open (hidden under 1100px).
Maximize fills the window (`inset: 10px`, above the HUD). Phones: every panel is fully opaque (`--bg-strong` is a solid
colour under `.compact`) so chips never ghost through open sheets; full-screen surfaces (Flora, dashboard) drop their
radius and frame; the season chip is hidden on portrait (it overflowed the clock pill under the actions pill, and City
Pulse shows the season); landscape sheets keep a readable width (`min(380px, 45vw)`) clear of the centre lens chip.

## D-061 — HUD line icons instead of Unicode glyphs; phones explore with one exit icon (2026-10-30)

Unicode symbols and emoji rendered differently per platform and mixed styles (emoji stats next to text symbols).
The HUD now draws one stroke family from `ui/icons.ts` (`icon(key, glyph)`: 24-unit SVG, `currentColor`, sized
`1.15em` by `.ico` in `ui/theme.css`). Content and sim data keep their glyph strings, since toasts and labels show them
inline; the HUD maps a glyph (or a context key such as `lens:hydration`, `kind:skybridge`, for glyphs that mean two
things) to an icon where it stands alone, and unknown glyphs stay text. Inline glyphs in sentences (toasts, zone and
crisis names, the live `Dispatch · ◈n` labels) are left as text. On phones, explore modes also hide the top bar: only
the touch pad and a round city-view icon (top-left) remain.

## D-062 — wllama runs on the CPU on iOS; stalled warm-ups time out (2026-10-30)

On iPhone, Safari has no JSPI, so wllama uses its Asyncify compat build, and loading a model (even Qwen3 0.6B) with
every layer on WebGPU stayed on "Warming up…" forever. Nothing in wllama times out a load, and a crashed worker's error
is only logged. `LlmEngine.load` now passes `n_gpu_layers: 0` on iPhone, iPod and iPad (an iPadOS Mac user agent
with touch points; Tauri's macOS webview has none). Elsewhere, a load that takes longer than `WARM_MS` (120 s)
frees the worker and retries on the CPU. A CPU load that also takes longer fails with an error instead of spinning.

## D-063 — Holo panels: the welcome card's look shared by every dialog and console (2026-10-31)

The inspector, City Pulse, dashboard, settings, city map, New City and game-over dialogs and the fire panel take the
`.holo` class (`ui/theme.css`): glass gradient, accent glow, corner brackets and a one-shot sheen, with `.crit` for
alerts (game over, fires). Dialog headers use `holoHead()` from `ui/holo.ts` (emblem with a ring pulse, eyebrow with a
LED, gradient title); `rise()` staggers content in. Brackets are background layers (not a pseudo-element) so they stay
put in scrolling panels, and a folded sheet drops them. Every animation is one-shot transform/opacity (the sheen is a
background-position sweep that hides when done), replays when a panel is shown again, waits for `body.booted`, and is
off under `prefers-reduced-motion` (§7½).

## D-064 — Thin lights are anti-aliased by pixel footprint (2026-10-31)

Zoomed out, the highway guidelines (a ~0.07-tile line with running dashes), the Aeroline's lit strips and the sky-lane
and hub-ring dashes were thinner than a pixel. They popped in and out of pixels as the camera moved, and bloom
(threshold 0) turned that into flashing. Shaders now use `fwidth(positionWorld)` (world units per pixel): the road
line is drawn at least ~0.7 px wide and dimmed by the same factor, so its average light stays constant; running
dashes and turf noise fade to their mean once below a pixel. The viaduct uses `glowline` (`scenery` whose glow is
scaled by the strip's share of a pixel). Measured with a still-night pan of 0.05 tiles per frame (only roads and
Aeroline drawn): pixels changing by more than 48/255 between frames dropped from 0.4–0.9% to 0.04–0.09% at every zoom.
Close-ups are unchanged. Hotkeys: the city map moved to **M** and the Flora-Net mist to **Y** (the only free letter).
Follow-up: flowers and sunflower petals (`flower`, `lily`) keep their glow by `pieceCover()` (the piece's own
geometry per pixel), moss blossom specks fade once sub-pixel, solar busbars and dome ribs use `stripes()`, and glass
windows blend their lit/dark pattern, tone and frames toward the average once a window spans a few pixels. Full
scene, same probe: 0.38 / 1.93 / 2.28% → 0.21 / 0.82 / 1.44% at island view / 220 / 120.
Sweep (per piece type, each rendered alone, night and day, three zooms and districts): `moss` veins are AA'd
contour lines and its fine noise fades; `lumen` ribs and the halo torus (`lumenThin`) scale glow by `pieceCover`;
fungus, pollen motes and commuter lights likewise; pool lilies, timber grain and algae bubbles fade once sub-pixel;
slab façade grout/seams/mortar and station glass ribs use `stripes()`; glass frames (colour, roughness, metalness)
average by day too; sky-lane ribbons fade their profile and opacity when edge-on. Full night scene: 0.21 / 0.82 /
1.44% → 0.08 / 0.25 / 0.83%; every piece type is now under ~0.16% alone (the rest is real motion: lanes, pods).

## D-065 — Flora loads a core on demand; core ignition; header close and no orb while open (2026-10-31)

Ask Flora (inspector) opens the console and asks at once, while the core the console starts loading on open is still
idle or loading, so the question was answered with "No model is loaded". `Assistant.turn` now waits for a load in
progress, or loads the last-used (else any) downloaded core and waits; only when nothing is downloaded does it open
the Model core drawer and keep the question (`pending`), sent as soon as a core is online. Downloading stays the
steward's choice. While a core loads, a "core ignition" card (reactor rings, progress arc, Link / Fetch / Verify /
Warm steps, cycling status lines) replaces the drawer, with a one-shot "core online" shockwave; it animates only while
loading (transforms, opacity, stroke offset). The header puts the link status under the name so a round close button
always fits (it was pushed off the 430 px header), Esc closes the console when no tool is active, and the orb hides
while the console is open so it reaches the bottom of the screen.

## D-066 — Slash-command autocomplete; F3 and inspector as holo panels (2026-10-31)

Flora's input completes `/commands` from the agent tool registry (`modules/assistant/Slash.ts`): command names
(prefix matches first), then the command's argument keys (required first, with type or enum hints), then enum or
boolean values; ↑/↓, Tab/Enter, Esc, click. It only edits the text; sending is unchanged. F3 is a telemetry panel
(FPS hero with a 12 s sparkline on a canvas redrawn at 4 Hz, tiles, draw-call meter against the 300 budget, hottest
systems when profiling) and the ` inspector wraps Tweakpane in a holo panel, themed through its `--tp-*` tokens.

## D-067 — Inspector 3D stage: the selected building on a studio turntable (2026-10-31)

The inspector (380 px while a building is selected) opens with a stage: `modules/preview` draws the building alone
(its live instances read back via `BuildingRenderer.snapshot`, at its real position so bloom/lens lookups match) on a
studio dome and floor, turning slowly; drag orbits, wheel zooms, double-click resets. It renders with the main
renderer into a scissored viewport after `core.render` (order 50), under the stage's transparent window; the panel's
glass moves to the details sheet. A second renderer was rejected: a second GPU device and every material compiled
twice. The scissor is the stage clipped by scrolling ancestors (skipping `display: contents`, the phone's right
column) so it never paints over the city; nothing renders while the stage is hidden (≈ one extra draw per piece type
of the selected building). The close button was a float under the content wrapper's stacking layer (clicks missed it);
it is now an absolute button that clears the selection through `selection:changed`, which the select tool follows.

## D-068 — Fireworks: factories, nightly shows, steward launches; particles flown by the shader (2026-10-31)

A Fireworks Factory (`fireworks: { rate, storage }` on a def; industry) makes shells while staffed and powered,
round-robin through five kinds (peony, willow, ring, palm, crackle), paying materials per shell, up to its storage.
State lives on `city.fireworks` (`sim/fireworksState.ts`, saved as `SaveData.fireworks`, save v10, hashed); logic in
`sim/fireworks.ts` runs once per pulse after occupancy (`updateFireworks`). At 21:00 the factories fire a 30-shell
show if stocked (one a night, switchable); the steward launches one any time (`launchFireworks`, undoable: shells and
crew fee come back) from the top-bar button (shift-click: grand, 60 shells), the dashboard's Fireworks tab or Flora
(`fireworks_status`, `launch_fireworks`, `fireworks_nightly`). Effects are a new harmony factor (`harmony.fireworks`:
an afterglow that rises with shells fired, halves every 150 s, times novelty `1 − 0.6 × fatigue`; every show adds
0.4 fatigue, 0.45 fades a day, so a nightly show stays a treat and back-to-back shows turn into noise complaints),
visitor income while a show runs (15% of income × novelty), smoke (`smog`, added to pollution and so to ecology),
and stray sparks that can light a building near the yard (`ignite(…, 'fireworks')`, likelier in Haze and heatwaves,
rare in rain; uses `city.rng`). Visuals: the sim emits `fireworks:volley` per pulse; `modules/fireworks` spreads it
over the next second and writes each rocket, burst spark and trail copy once into a 6 144-slot ring of instance
attributes (origin + start time, velocity + life, drag/gravity/size/crackle) with update ranges; the `firework`
material flies them in closed form from `U.clock` and streaks them along their current velocity. One draw call, and
the mesh is hidden between shows (no idle cost). Spark size grows with camera distance (`U.sparkScale`) so shows
read from the island view. Rejected: CPU-posed particles (thousands of matrices per frame during a finale) and
additive transparent sprites (sorting and overdraw; the emissive MRT already feeds bloom).

## D-069 — Build tab explains itself; building preview; waterfront fireworks factories (2026-10-31)

The Build tab is now: **Actions** (eight icon tiles, short labels under the icon so nothing is cut off; tool
hotkeys kept as corner badges), **Buildings** (category chips, click-only: the 4–0 number keys are gone, a list of
keys was one more thing to learn and 1–3 already set the speed), then the open category's buildings as compact
tiles and an explanation card. For an action the card says what it does, how to use it and what it costs
(`ui/buildHelp.ts`, numbers from the sim's constants so the text follows the rules); for a building, its
description, labelled numbers (price, upkeep, lot, homes, jobs, power, water, food, ecology, harmony, pollution)
and special abilities in sentences, with a Rotate button. Hovering an action or a building previews its card.
The building's 3D preview (`preview.showDef`, from `BuildingRenderer.designParts`: variant 0 fully grown on its
plinth; GLB heroes once loaded) renders in a frameless window floating beside the console: the stage must be a
transparent hole over the canvas, and inside the console the panel glass dimmed it to a silhouette. Phones show a
short card (name, three lines, Rotate) first in the strip, no preview. The founding city now has two Fireworks
Factories on the lots nearest the sea (`byTheSea` in `founding-city.ts`): one on the Westport waterfront west of the
works (its lot named Westport Wharf, an industry area, since the works' blocks sit inland) and one on Foundry Islet.

## D-070 — Flicker probe and fixes; instant Return to nature; group selection (2026-10-31)

**Flicker.** `bun run flicker` (scripts/flicker.mjs) pans the camera ~0.15 px per frame at night with the shader
clock pinned and the sim paused, and reports the share of pixels whose brightness jumps by more than 48/255 between
rendered frames: a well anti-aliased edge changes by ~15% of its contrast, a detail popping in or out of a pixel
jumps fully. It isolates instanced pieces (`--pieces all`), module meshes (`--pieces names`) or a building type's
pieces (`--defs`) on render layers (the instancer rewrites `visible` every frame), waits on `engine.frames` (an
unfocused page renders at 15 fps) and starts the camera's focus on the ground (it eases there otherwise). Earlier
measurements (fixed 0.05-tile steps) counted real edge motion at close zoom; this one doesn't. Fixes: the moss
membrane's moss/plaster edge (a noise contour 0.04 units wide: hairlines on every Canopy Tower) is at least a pixel
soft (moss alone 2.7% → 0.08% at close zoom, old metric); concrete per-tile tones, mosaic, charred grain and knots,
ashlar tones, bamboo weave and fine noise fade to their mean below a pixel or two; `stripes()` starts fading once a
line is ~1 px wide (was ~½ px), which covers façade grout, glass mullions (now stripes, not `step`), dome ribs and
solar busbars; flowers keep full glow from 10 px (was 4), lumen ribs from 8 (was 3), halo rings from 80; pool
ripples fade from afar; sky-lane dashes are tents, not sawtooths (a hard tail swept along every lane), and ribbons
keep a 1-px soft rim when their profile flattens. Whole scene, High, night (distances 70/140/260): downtown
0.200/0.151/0.102% → 0.133/0.113/0.076%; Canopy Tower quarter 0.219/0.145/0.057% → 0.156/0.114/0.044%; Medium (no
MSAA) 0.63/0.83/1.13% → 0.46/0.65/0.95%. What is left is mostly geometric edges of thin pieces (slab plates, halo
tubes), which only MSAA (High and up) or a temporal AA would address.

**Removal.** The inspector's *Return to nature* demolishes at once (undoable) instead of switching to the bulldoze
tool; the inspector fades out. Demolitions animate: pieces swell slightly and shrink away top-down over ~0.8 s
(`ChunkedInstancer.removeAnimated`, out-tweens), and a few wild plants sprout on the lot and fade after ~3 s (render
only). **Group selection:** Ctrl/⌘-drag in Inspect boxes buildings of one type (`selectInRect`: the type under the
first corner, else the commonest; a building counts when its centre is inside), highlighted live with a count; the
group inspector shows totals, member ids and *Return all to nature*; Delete/⌫ removes the selection (single or
group). A group removal is one command (`demolishMany`), so one undo restores every building with its id.

## D-071 — Shaped fireworks and sky messages; the status bar fits its width (2026-10-31)

**Shapes.** Shows mix in shaped bursts: hearts, the five Olympic rings (black drawn silver, as black sparks don't
show at night) and Temple Fay's butterfly curve. The renderer picks them per shell from the show (every fifth shell
in turn; every third when a steward show features a `shape`), so no extra sim state or stock: shapes are a way of
packing the same shells. A shaped burst lays its points in a plane facing the camera at launch, and each spark's
velocity is its target × drag, so it settles on the shape, hangs, and drifts down; a white flash marks the centre.
**Messages.** `launchFireworks` and Flora's `launch_fireworks` take `text` (≤ 18 characters) and `shape`; the show
saves both (hashed, and kept in the show history). `skyText` (content/skyFont.ts) upper-cases, turns `<3` and
heart emoji into ♥ and drops what the 5×7 dot font lacks; each lit dot is a spark (no position jitter: it grows with
distance from the centre and smeared long messages). The message goes up at a quarter of the show and again as the
finale opens, 16 units above the other bursts. Routing: "fireworks that say …" and "heart fireworks" go to
`launch_fireworks`; slash: `/launch_fireworks text="…" shape=heart`.

**Status bar.** Viewport media queries couldn't know how wide the brand, clock and action panels are, so the
stats clipped (the last value was cut off at 1440 px). `Hud.fitStats` now measures: it adds cumulative `fit-N`
classes to the top bar until the stats stop overflowing, on resize (ResizeObserver) and every 2 s as values
grow: 1 labels, meter and the Map label; 2 secondary values and the brand subtitle; 3 tighter spacing and the brand
name; 4 ecology and the fireworks count; 5 water and the fastest speed; 6 redo, overview, load and the season bar;
7 the fast speed and the season chip. Measured: 2200 px full, 1600 px level 1, 1440 px level 2, 1100 px level 5,
960–920 px level 6, nothing clipped. Phones keep their own layout.

## D-072 — Fresh island start: wizard, fishing, unlock projects, earned wonders, billed Flora (2026-10-31)

A plain boot is now a **fresh island** (`content/scenarios/fresh-island.ts`, `progression: true`) behind a **New Game
wizard** (`modules/tutorial`): name the city (default `BloomGrid 001`, numbered per viewer), pick difficulty and
seed, or Continue the saved city, or open the **Showcase city** (the founding city, everything open). A new island
starts a six-step guide whose steps complete on the real action (camera moved, second dock built, highway drawn,
treasury +300, Goals tab opened); skippable, reopened from Settings. Any `?scenario=` skips the wizard (`?wizard`
forces it); the scripts (snap, perf, flicker, trailers, ai-probe) default to `scenario=founding-city`, so every
baseline and scene still measures the showcase.

State lives on `city.growth` (`sim/growthState.ts`; saved as v11, hashed): name, `progression`, unlocked ids,
running projects, discovered wonders, fish stock, Flora's bill. **Progression is opt-in per scenario**: the
showcase city, every existing test and pre-v11 saves have it off (everything open), so their balance and hashes are
unchanged. **Unlock projects** (`sim/projects.ts`): Sky-lane charter (3 000 residents, a Drone Fabricator; ◈4 000, 1
day), Build the Aeroline (6 000 residents, power ≥ 110%, the charter; ◈25 000, 2 days), Wake Flora (a power plant, a
new **Data Spire**, ◈3 000 in the treasury; ◈2 500, ½ day); `startProject` is undoable until done. A def's `requires`
locks it in `City.checkPlacement` (pod hubs, the Nexus, Dragonfly Port, Zephyr Airport; Aeroline stations); homes
with built-in pod docks stay buildable, but the mobility sim ignores pod (and rail) transit until its unlock, so no
lanes fly early. The Aeroline module draws the line when the project completes. **Fishing** (`sim/fishing.ts`): the
free **Fishing Boat Dock** (`fishing`, `limit` 3 + 1 per 600 residents, food 60, 16 jobs) sells its catch: boats ×
staffing × fish stock × clean sea × 0.42 ◈/s; the stock regrows logistically (0.6%/s) and each boat takes 0.04%/s,
so two or three docks fish best and more overfish (tested); coastal pollution and algal blooms spoil the haul.
Fishing counts in net income, the budget tier, the Pulse budget ("Fishing") and the dashboard. Boats sail out on
the longest open-sea heading, circle and return (`modules/fishing`, CPU-posed from `U.clock`). **Wonders**
(`sim/wonders.ts`): the lighthouse and whales at the start; Tide Gates (1 500 residents), Lotus Atoll (bloom ≥ 55%
from day 2), Verdant Pillars (40 buildings, eco > 0), Abyssal Dome (harmony 70+ from day 4); a discovery raises the
wonder out of the sea over 5 s, toasts with a fly-to and adds +0.8 harmony (`harmony.wonders`, max +4); the
inventory lists only discovered ones. **Flora** is asleep until woken (console explains the criteria); each model
turn then costs ◈6 + 0.01 per estimated token (`floraBill`, not undoable; slash commands are free).
**Goals tab** (City Pulse): projects with live criteria, Start and progress, wonders and hints, the fishing fleet.
The console tabs flow into one row however many there are. Deferred: Goals on phones (hidden there for now), the
Aeroline's segment-by-segment construction animation.

## D-073 — Building levels and ageing (2026-10-31)

`Building.tier` (levels 1–3), `Service.age` and `Service.thrive` (saved v12, hashed, reset in `addBuilding`). A home or
workplace thriving (power and water ≥ 85%, occupancy ≥ 85%, condition ≥ 0.7, greenery ≥ 0.5) grows a level after 1.5
then 3 sim days (`sim/levels.ts`); the steward can pay to upgrade (60% / 100% of price) or renovate (resets age and
condition). Size ×1.35 / ×1.75 (capacity, jobs, food, production; mobility and night life follow), use ×1.25 / ×1.55,
upkeep ×1.3 / ×1.7, and age adds 15% upkeep per 10 days (max +90%) plus a little wear. Looks: generic overlays from the
template bounds (level 2 roof terrace, level 3 setback crown, `tierPieces`), animated on change; weathering streaks in
the concrete shader driven by its free `aParams.w` channel, and dull tan glass and silvered timber driven by `aParams.x`
(1 = clean; those materials don't read greenery), so every other user of these materials, which passes 1, stays clean. Inspector shows
level stars, progress and age with Upgrade / Renovate; Flora tools `upgrade_building`, `renovate`. Checked in snaps (crowns, terraces, grime). Deferred: inventory filters for old/upgradable buildings.

## D-074 — Logic and consequences: rules, stocks, the Causes feed (2026-10-31)

`sim/consequences.ts`: 11 rules (bare coast, polluted coast, overfished sea, heat island, bird strikes, neglected
upkeep, smoke in the haze, thin fire cover, a city people love, falling credit rating, a transit city). Each
measures its cause as a target 0..1 every 5 pulses (`measure`: one pass over the buildings for waterfront,
towers, parks, turbines, Ember Watch cover); its intensity ramps toward it (in over ~50 s, out over ~100 s), so
effects build and fade. Intensities set `city.consequences.mods`, which the next pulse reads: harmony
(`harmony.consequences`), crisis odds (`crises.ts` pool), heat fires and fire spread (`hazards.ts`), loan interest
(`finance.ts`), the fishing haul, flood damage, ageing speed, bloom (harmony term), fireworks smoke clearing, Flora's
discount, the insurance premium. Stocks: credit rating (−25%/day in debt, +10%/day out; shown AAA…C), tourism
reputation (builds with harmony 70+, falls with crises and a dirty coast; visitors spend 20% of tax income × the
reputation above 30%), harmony streak. Rules coming into force (≥ 25%) or easing off (< 10%) write the feed (capped 40)
and a toast. State saved as v13 (modifiers recomputed), hashed. UI: dashboard **Causes** tab (stocks, rules in force
with cause, effect and strength, rules being watched, feed), budget rows Visitors and Insurance, harmony factor,
inspector lines for the rules bearing on a building (`rulesFor`); Flora's `why` (optionally by topic) and "why …"
routing. The showcase city settles with bird strikes, a transit city, a bare coast and thin fire cover in force.

## D-075 — Visible damage and switches (2026-10-31)

`Service.scorch` (0..1) and `Service.off` (saved v14, hashed). A burning building chars toward 0.1 + intensity,
lightning leaves 0.45; repair (now also for char alone, priced at 8% of cost × char) and renovation clean it, undo
restores it. Rendering puts char in the top of the weathering channel (0.7..1 = soot, below that age grime), so
concrete, glass (lit windows go dark too) and timber blacken with no new attribute. Ruins collapse: everything
above the ground floor folds away (animated in play, instant on load) and charred rubble lies on the lot;
`building:repaired` rebuilds the building from its template (undoing a repair re-collapses it, `cause: 'undo'`,
no toast). **Switches**: a def's `interact` (labels and help) lets the steward switch it off and on
(`toggleBuilding`, undoable): off, it neither produces nor consumes, its staff go home and it is not flagged
unstaffed; a feathered wind turbine draws lightning at a tenth of the rate; a paused fireworks factory makes no
shells. Wind turbines and fireworks factories have switches. Rotors now integrate a rate that eases toward the
wind (×1 + 1.2 × storm rain) and winds down to a stop when feathered or broken (condition < 0.2). Inspector: the
switch button, "switched off", "broken down" and "charred" lines. Flora: `switch_building` (by id or type).

## D-076 — Tornadoes, tsunamis, risk, prevention and incident trends (2026-10-31)

`sim/disasters.ts`. **Tornado** (Monsoon ×2.5): touches down upwind of a built spot and tracks at ~0.8 tiles/s with a
wobble; buildings within 3 tiles take 0.09 × severity damage a second (+0.2 for a spinning turbine), sometimes catch
fire; parks within 8 tiles shield up to 60%; a Storm Shelter covering the track cuts its harmony loss by 60%.
**Tsunami**: a strong earthquake rolls 30% × severity for one (or rarely on its own); after a warning the surge
(`Modifiers.surge`, 0.9 + 0.6 × severity, ×0.6 with the Tide Gates closed) floods only the waterfront (shore field
< 8 tiles, ground below the surge, no seawall covering it): those buildings are evacuated for the pulse and damaged.
A global flood level was rejected: most of the island sits at 0.5–1 units and the whole city drowned. The sea rises
visually by 0.3 × surge and a foam ring spreads from the offshore origin. **Prevention**: Storm Shelter and Weather
Radar buildings (`shelter`, `radar` on a def; the radar doubles the warning for storms, tornadoes, floods and tsunamis
via `leadFor`), `evacuate` (◈300: 70% fewer residents displaced, half the harmony loss) and `closeTideGates` (◈500,
once the Tide Gates wonder has risen), feathering turbines (D-075); each incident records what prevention did
(`IncidentRecord.prevented`). **Risk**: `sim/risk.ts` scores each hazard from the same inputs (weights, season,
consequence tilts, prevention) with readable factors and advice; shown in the Causes tab, Flora's `risk_status`;
`prepare_hazard` does the emergency moves. Incidents tab: per-kind trends (count, ruined, displaced, cost, times
prevention helped) and CSV export. Visuals in `modules/disasters` (funnel with swirling bands and orbiting debris,
crest ring, a Prepare panel with Evacuate / Close Tide Gates / Feather turbines). Drills: `?drill=tornado|tsunami`,
snap scenes `tornado.js`, `tsunami.js`. Deferred: a Risk map lens.

## D-077 — Synthesised music and sound (2026-10-31)

`src/modules/audio/`, all Web Audio with **no audio files**: nothing to license, download or pay to generate, and the
music never loops audibly. A master bus (through a compressor) feeds music, ambience and effects buses; volumes
and mute live in Settings and persist in localStorage `bloomgrid.audio` (per-viewer); **,** mutes. The
AudioContext is created on the first pointer or key event (autoplay rules), so headless runs and the boot cost
nothing. **Music** is generative: each mood (`music.ts`: dawn, day, dusk, night, crisis; picked by time of day,
with crisis winning while a crisis is active or more than two fires burn) has a chord progression played as a
detuned-saw pad under a low-pass filter, plus a sparse triangle-wave arpeggio from its scale; a 4 Hz lookahead
scheduler queues bars on the audio clock, and a mood change takes effect at the next bar. **Ambience** is a looped
noise buffer through four filters: surf (louder near the coast, with a slow swell), city hum (zoomed in, by night
life), wind (by camera height and `U.storm`), rain (`U.rain`); birdsong chirps in Bloom by day. **Effects** are short
synth voices on bus events (build, Return to nature, levelling, upgrades, lightning with thunder delayed by
distance, quake rumble, fireworks whistle and bang delayed at the speed of sound, crisis forecasts, a worsening
pulse tier, button clicks), capped at 14 voices and silent while a city loads. Measured: idle main thread ≈ 15%
with audio running (budget unchanged); `bun run perf --sound` starts it. Music and effects are render-side, so they
use `Math.random` / their own generator, never `city.rng`. Rejected: streamed stems (licensing, size). Deferred:
a train pass, pod hum and fire crackle near the camera.

## D-078 — Fresh-island pacing, retuned unlocks, Flora knows the goals (2026-10-31)

Phase 22. `tests/pacing.test.ts` plays the fresh island as a steady steward would (docks first, keep power, water
and food ahead, homes or work by demand, parks when homes stand empty, a street grid with extra lanes to the
waterfront when traffic jams, save up once a project's other criteria are met) and times the unlocks. Before
tuning it reached Flora at ~75 sim-minutes and never the Aeroline; plan v4 asks for the first unlock in ~10 and the
Aeroline in ~120 minutes of play (read as game time at the 2–3× speeds players use). Retuned (fresh island only;
the showcase has no docks or Data Spire and everything open): catch value 0.42 → 0.7 ◈ per boat-second (sustained
fishing ≈ 2.8 ◈/s), starting credits 1 500 → 2 000, Data Spire ◈1 800 → 1 000, Wake Flora ◈2 500 → 1 200 with
◈1 500 (was 3 000) in the treasury, Sky-lane charter 3 000 → 2 000 residents and ◈4 000 → 3 000, the Aeroline
6 000 → 5 000 residents and ◈25 000 → 15 000. Measured on three seeds (sim-minutes at 1×): Flora 32–36, sky-lanes
97–101, the Aeroline started at 137–143, the treasury never below ◈89; the test asserts < 45 / 115 / 160 and order.
These supersede the numbers in D-072. Flora: `goals_status` (projects with status, cost and ✓/✗ criteria, fish
stock, wonders found and what reveals the rest) and `start_project` (undoable; a blocked start says what is
missing), routed by `plainIntent`; her brief gains one line on a fresh island (city name, fish stock, each locked
project and the first thing it needs). Polish: no tier toasts or alert sounds in a city's first 8 sim-seconds,
while occupancy and staffing settle from their starting values (a fresh island used to flash "Food fell to
Critical" at boot). The trailer update shipped as D-079.

## D-079 — One feature trailer, recorded against the showcase city (2026-11-01)

`scripts/trailer.mjs` (the ~30s cinematic) is gone: `bun run trailer:feature` is the only trailer. The script now
appends `scenario=founding-city` like snap/perf (before it booted the fresh island), gained a two-shot fireworks
act — heart, butterfly, rings and a "BLOOM ♥" sky message, grand shows launched while the engine runs at speed 3
so each 30-sim-second show spans ~3s of video, with a factory built through the agent if the city lacks one —
closes Flora's console before the dawn shots, scales its timed actions with `--duration`, and encodes at
crf 25 / preset slow so the mp4 stays small enough to commit as `public/assets/feature-trailer.mp4` (GitHub's
pre-receive hook rejects blobs over 100 MB — a 131 MB crf-20 take was refused during the v0.1.6 release; ~70 MB
for 76 s passes with only the over-50 MB warning).

## D-080 — Plan-v4 deferred items: phone Goals, Aeroline construction, age/level filters, Risk lens, nearby sounds (2026-11-01)

- **Goals on phones.** The console shows only the pulse on phones, so the Goals panel's phone home is the top of
  the City Pulse body (`pulse` service `body`), shown only on a fresh island and without card descriptions; it
  refreshes while the sheet is open, and a toast says once when a project becomes ready (no tab badge there).
- **Aeroline construction.** While the project runs the line rises round the loop with its progress. The viaduct is
  one baked mesh (no per-piece order to reveal), so `aeroline/construction.ts` clones the finished materials with a
  vertex stage that sweeps by angle about the loop's centre, from just behind the first station: ahead of the front
  vertices collapse to one point (no triangles), in a 5% band they rise from below the ground with a warm glow.
  The stock materials go back on when it opens, so normal play compiles and pays nothing extra; the clone compiles
  once at the start (a one-off hitch). Shadows are re-cast at most twice a second while the front moves. The module
  now rebuilds from sim state (`sync`) and tears down on `city:reset` / `load:done` and when the start is undone
  (before, a new game kept the old line). `aeroline.deck` is 0 until the line opens (pods don't land on the works).
- **Inventory age / level.** Buildings carry `tags` (`old`: `OLD_DAYS` = 10+ days, upkeep up 15%; `upgradable`:
  `upgradeBlocker` passes now, credits included; `top`), filtered by `is:` / `tag:` in a search or `tag` in a query,
  an age / level menu, Oldest / Level sorts, and an "L2 · 14 d" reading while those are in use. Rejected: an
  `upgradable` that ignored credits (it matched every home and workplace, parks included, since all have jobs).
- **Risk lens.** `buildingExposure` (`sim/risk.ts`) scores each building from the sim's own reach rules: low
  unwalled waterfront 0.4, no working Ember Watch in reach 0.3, towers and turbines 0.1, homes with no Storm
  Shelter in reach 0.15, condition under 60% up to 0.3. The lens paints footprints; the inspector lists the reasons.
- **Nearby sounds.** Three more ambience beds follow the camera: a maglev rush (low-pass noise opening with
  nearness and speed) plus a sine whine rising with speed (`aeroline.nearest`), a band-passed whoosh from the
  nearest sky-lane pod (160 pods sampled per 4 Hz tick, so a large fleet takes a few ticks), and a fire roar with
  crackles (1–6 band-passed noise ticks of 20–70 ms per tick by heat, kept off the last 4 effect voices). Perf with `--sound`
  matched HEAD within noise (headless main thread ≈ 20–22% active on this machine for both).

## D-081 — Top bar view toggles, Save / Load in Settings, explained lenses, Esc, no corner brackets (2026-11-01)

- **Top bar.** The actions panel starts with a group of view toggles (`hud.lead`, ruled off from the rest): City
  Pulse show / hide (lit while open; phones keep its chip and drop the button), the city map and the fireworks
  launcher (shell count as a corner badge, hidden at `fit-4`). Map and fireworks left the stats strip, which gains
  room before it sheds stats. Phones use slimmer action buttons so six fit beside the clock at 390 px.
- **Save / Load in Settings.** Settings is one panel with Game / Sound / Display tabs (last tab remembered).
  Game holds a saved-city card: name, day, residents and how long ago, from a small `save:<slot>:info` record
  written with each save (`SaveManager.info`; older saves without one still count as a save). Load asks once
  ("Replace this city?", 4 s) because it discards the city on screen; ⌘S / ⌘L still work anywhere. Settings closes
  on Esc and on a press outside it (the outside test now ignores non-Node targets, which threw).
- **Lens card.** Every lens spec carries `about` / `read` / `act`. City Pulse → Lenses shows the hovered or active
  lens in the Build tab's card idiom with its colour scale, plus a live reading from the lens's own values (tiles
  shown, share at the good and bad ends). The lens list is two columns in the console so the card stays in view.
  Phones show a short card under the lens buttons while a lens is on.
- **Quitting a lens.** Esc, ✕ on the legend, or Off on the card. Esc used to be swallowed by the tool registry:
  the inspect tool's hotkey is Escape, so pressing it while already inspecting "re-selected" it and consumed the
  key. Tools now let a hotkey through when its tool is already active; the lens defers to an open dashboard, map
  or Settings so Esc closes those first.
- **No corner brackets.** The `.holo` corner brackets (`--hb`), the welcome card's reticle and the inspector
  stage's corners are gone; glass, edge glow and the header carry the look.
- **Rounded 3D previews.** The building preview (Build tab float, inspector stage) draws into a rectangle of the
  main canvas under its HTML frame, so the frame's border-radius never clipped it. HTML bars now hold the rounded
  corners: a name bar on top of each (category icon and name on the float; live tag, name and close button in the
  inspector) and the caption below the float, so the stage only meets straight edges. Rejected: a depth mask in the
  preview scene writing the corner regions (fiddly per corner and backend, and it still looked wrong on a real
  display). Only one stage renders at a time: showing a building in the Build tab closes the inspector, and the
  inspector taking the stage hides the float. `bun run snap -- --dpr 2` renders at Retina density.

## D-082 — Procedural heroes replace the Rodin GLBs; designed level overlays (2026-11-01)

**Context:** The Supertree Grove and Lotus Arts Pavilion were Hyper3D Rodin GLBs (D-026, Phase 12). GLB parts are
instanced with fixed params, so they never weathered with age, lit their windows with power, wilted, or showed a
level: the generic level overlay (roof terrace, setback crown) was built from the fallback's bounds and floated over
the grove's 10×10 open plot and the lotus's petals. `commuter-pod.glb` had been unused since D-051's procedural pod.

**Decision:** Delete all three GLBs from `public/assets/`. Both heroes are plain procedural recipes (the old
fallbacks, rebuilt: tapered steel supertrees with vertical gardens, lit lattice funnels, solar canopies and lit
skywalks; a lotus of three petal whorls over a colonnaded glass hall on a round deck in a lily pond). A new
`levels(b, tier)` on `BuildingDef` supplies designed additions per level, cumulative, run from their own seeded
stream in `buildingTemplate` (so the base pieces never shift) and cached as the template's `tiers`, which
`tierPieces` returns instead of the generic overlay. Grove: level 2 a fourth supertree, skywalks and a Cloud Forest
dome; level 3 a crown walk round the tallest canopy, second halos and spires, a waterfall into the pond. Lotus:
level 2 lily-pad galleries and a lantern arcade over the bridge; level 3 a lantern spire, golden crown and halos.
`retrofit: false` keeps Bloom Retrofit off heroes whose bounds aren't a façade (the GLB recipe kept it off before).

**Consequences:** Heroes weather, light and level like every building, and work offline with no asset fetch. The
GLB path (`AssetManager.loadGlbPieces`, `optimize-glb`) stays for future use but nothing uses it. Piece counts:
grove ≈ 500 instances at level 1 (one per island), lotus ≈ 110. `scripts/scenes/heroes.js` shows a hero at all three
levels side by side.

## D-083 — wllama's build is chosen by compiling Memory64, not by wllama's check (2026-11-01)

Safari 27 (macOS 27, iOS 27) has JSPI (`WebAssembly.Suspending`) and accepts
`new WebAssembly.Memory({ address: 'i64', initial: 1n })`, but can't compile a Memory64 module ("Memory64 is not
enabled"; measured with JavaScriptCore on macOS 27.0.1). wllama's `needCompat()` (unchanged up to 3.8.1) uses exactly
those two checks, so it loaded its default build, logged the compile abort with `console.log`, and the load promise never
settled: the assistant sat on "Warming up…" until `WARM_MS` on iPhones and in the macOS shell. `ai/llm/wasm.ts`
decides with `WebAssembly.validate` on `(module (memory i64 1))` plus JSPI, and `LlmEngine.newWllama` overrides the
instance's `getWorkerResources` to force the compat build otherwise (wllama stays a lazy import). A fatal native log
line (`isFatalLog`: an abort, a worker error) now fails the warm-up at once with that line instead of waiting.
Ported from Andai, where the same fix was checked end to end in WKWebView on macOS 27 (compat build, WebGPU 29/29
layers). D-062's CPU-only rule for iOS stays; whether its stall was this same bug isn't measured yet.

## D-084 — Build mode leaves City Pulse: its own panel, a Build button, easy ways out (2026-11-01)

**Context:** Since D-056 building lived in City Pulse's Build tab. City Pulse is for watching the city, so building
was a tab among monitors, a category click picked up its first building at once, and the only way out was the
Inspect tile or Esc. Phones had a permanent eight-icon toolbar whose categories sat off-screen to the right.

**Decision:** Build mode is its own module (`modules/build`, `build` service: `open(category?)`, `close`,
`toggle`, `isOpen`). Entry: the **Build** button (bottom centre on desktops; beside Flora's orb on phones), **B**,
or any build hotkey (G, C, X, Z, Y, V, T), Flora or the advisor picking up a building, which all open the panel so
there is always a visible way out. The panel has a header with **Done**, the seven actions (Inspect is not one:
leaving is), category chips, the category's buildings and the explanation card (plus the floating 3D preview on
desktops). A category click only lists its buildings; a building is picked up when its card is clicked, and a
second click puts it down. Leaving: **Done**, **B**, **Esc** (first puts down what is in hand, then closes;
dialogs above the city and a tool's own Esc go first), or a right-click without a drag (puts it down; right-drag
still orbits). Desktops: the panel takes City Pulse's column, which folds while building and comes back as it was;
opening City Pulse (P) ends build mode. Phones: a bottom sheet in the dock (Done on top, then action tiles with
labels, category chips and the card + buildings strip, all sideways scrolling); the dock row hides while it is open.
Bloom Retrofit's hotkey moves from B to **Z**. The last category is remembered per browser (`localStorage`).

**Consequences:** `hud.toolbar` / `hud.tray` and the City Pulse Build tab are gone (`hud.dock` is new); the
old bottom-toolbar CSS went with them. A new build action is an entry in `ACTIONS` (`BuildPanel.ts`) plus its
`ACTION_HELP`.

## D-085 — New Chapter dialog: resume first; seed under Advanced; the welcome card becomes Controls (2026-11-01)

**Context:** The boot's New Game wizard led with a form (name, difficulty, seed) and tucked Continue and the
showcase among its buttons, so a returning player had to find Continue. The island seed sat beside the name as if it
mattered: `terrainHeight` keeps the island's layout fixed (main island, three islets, bay, hills, reservoirs) and the
seed only varies coastline wiggles, hill noise and the sim's random stream (crisis timing, scenario placement). The
boot's welcome card (controls list, "Take the helm") was hidden by the wizard on a plain boot and showed only on
script boots.

**Decision:** `modules/tutorial/Chapter.ts`: three path cards (**Resume**, **New island**, **Showcase**), one pane
at a time and one primary button named for the choice (Enter presses it, Esc cancels when not at boot). Resume is
the default whenever a save exists and shows its name, day, residents, difficulty, when it was saved and its island
map (`SaveInfo` now records `seed` and `difficulty`). New island: a generated name with a dice, difficulty as four
tiles, the guide checkbox, and the seed under **Advanced** with a live island map (`islandMap.ts`, ≈15k samples of
the sim's height function, drawn after the dialog opens). Showcase: what it holds, opened on `SHOWCASE_SEED`
(always the tuned island, no longer the seed field). The sim pauses while the dialog is open. The welcome card is
now the **Controls** card: hidden at boot, **H** or Settings → Controls (`hud.showControls`), a fuller key list;
the first guide step points to it. The city counter for "BloomGrid 001" names is gone.

**Consequences:** The three panes share one grid cell (inactive ones hidden, crossfaded), so the dialog keeps the
tallest pane's height and never jumps between paths. Each path's map shows what it holds: Resume draws the saved
city from its save data (highways and lots coloured by category, without loading it); New island the bare island,
or the hamlet on screen at boot; Showcase a snapshot of the real founding city with the Aeroline loop,
`public/assets/showcase-map.webp` (≈ 35 KB), made by `bun run showcase-map` (`snap --eval-out` writes an eval's
data URL to a file); it falls back to the bare island if missing. Regenerate it after changing the founding city. The dev server and scripts moved to port 3000 in the same change.

## D-086 — City Pulse shows and hides as a whole on desktops (2026-11-01)

The top-bar City Pulse button, **P** and a new ✕ in the console's header now hide the whole console on desktops
instead of folding it to its header (`.pulse.console.collapsed` is `display: none`; the telemetry strip goes with
it). The header title no longer toggles on desktops. Phones are unchanged: the header is the sheet's chip and
folds it. `pulse.fold(true)` / `collapsed` keep their names (build mode and F use them) and now mean hidden on
desktops. City Pulse is also hidden while the New Chapter dialog is open (`body.chapter-open`).

## D-087 — Settings: a Controls tab, tabs that never jump; inspector actions that fit; dashboard beside City Pulse (2026-11-01)

- **Settings tabs** share one grid cell (inactive panes invisible, crossfaded), so the panel keeps the tallest
  tab's size; section numbers restart per tab. The panel is 520 px wide.
- **Controls tab** (`modules/settings/controls.ts`): camera, build, time, views and general keys in two columns
  (one on phones, which list touch gestures instead). Build-action keys are read from the registered tools.
  **H** opens it (again closes it); a `settings` service has `open(tab?)`, `close`, `isOpen`. It replaces D-085's
  Controls card (the old welcome card), whose markup and `.help` / `.wc-*` rules are gone (the `wc-*` keyframes
  stay: the inspector uses them).
- **Inspector actions** (`fitActions` in `ui/Hud.ts`): each button's text is a `.l` label (price in `.l-price`)
  and leads its tooltip; a row that overflows first tightens and drops prices (`snug`), then shows icons only
  (`tight`). Every action button has a border so icon-only buttons still read as buttons. Repair / rebuild /
  dispatch keep dark text on orange (the theme's generic `.tool` colour had won).
- **Top bar:** the dashboard button moved into the leading view group, right after City Pulse.

## D-088 — Seedvault: the city knowledge base, with two-level retrieval for Flora (2026-11-01)

**Context:** Players had no in-game manual: how systems work, what causes what, and what to do in a crisis lived
only in tooltips, the README and the guide. Flora could look up the city but not explain how to run it.

**Decision:** A `knowledge` module, **Seedvault** (**?** / F1, the book in the top bar), over three sources with
one format (Markdown with a small front-matter subset, `content/knowledge.ts`):

- **Guides**: `docs/knowledge/<category>/*.md`, bundled raw through `import.meta.glob` (READMEs and `_*` skipped).
  Categories: basics, systems, cause-effect, runbooks, playbooks. Runbooks list the incident kinds they `covers`.
- **Live reference**: generated at runtime from the registries (`sim/knowledgeRefs.ts`: crises, consequence rules,
  lenses, issue codes, difficulty / fail clock / projects / costs / levels, every building by category), so the
  numbers never drift. Guides link to it instead of copying numbers.
- **Journal** on the device (`Platform.knowledge: DocStore`): IndexedDB database `bloomgrid-knowledge` on the web,
  `<app data>/knowledge/<id>.md` in the desktop app (`kb_*` commands; hand-dropped `.md` files are read too). It
  outlives any one city: the steward's and Flora's notes, and **field logs** the city writes itself: one per
  incident kind (from `incident:logged`: outcomes, costs, what prevention did, derived lessons, recent table),
  consequences that came into force, and **recoveries** (a system at Strained or worse back to Stable, with the
  steward's commands in between, summarised from `commands.log`: the fix log). Field logs keep raw entries in a
  trailing `<!-- seedvault:data … -->` comment and regenerate their Markdown on each entry (last 30 kept).

**Retrieval** (`modules/knowledge/search.ts`): BM25 over doc sections with field boosts (title, tags, summary,
heading), a coverage factor, a title-match bonus, a player-words synonym table and a light stemmer. Flora gets two
levels (`modules/knowledge/tools.ts`): `knowledge_catalog` (search → best docs with the matching section and a
snippet; no query → ids by category) and `knowledge_read` (one doc's outline, related ids and one section, by
heading or free words, capped at ~820 characters so it fits an observation). Plus `knowledge_note` (mutate: asks
first) and `knowledge_open` (view). Two generic agent-loop hooks on `AgentTool` make this reliable on a 1.7B
model: `narrow(schema, { request, observed })` (the read's doc id is held to the ids the catalog returned) and
`follow(result)` (after a search the loop reads the top hit's section without a decision: small models answered
from the snippet otherwise). `plainIntent` routes how-to / runbook / procedure questions to the catalog, "remember
that…" to a note, "open the … runbook" to the reader; `knowledge_catalog` is a core menu tool.

**Rendering:** a small Markdown parser to blocks (`markdown.ts`, tested) rendered with DOM calls only (no
`innerHTML`: journal docs are user content). `kb:<id>` and `.md` links navigate inside the dialog.

**Consequences:** Boot cost ≈5 ms (docs parse and reference generation happen at module init). The top-bar
button never gives way when the bar is tight (one icon). Not in the save: the journal is per device, not per city.
`bun run test` checks every shipped doc parses, links resolve, sections stay under 1,400 characters and every
crisis has a runbook. Rejected: embeddings / a vector index (a model download for ~50 docs; lexical search with
synonyms finds the right section in the probe set), storing the journal in the save (lessons should carry over).

## D-089 — Flora proposes builds the steward places with one click; sharper analysis (2026-11-01)

**Context:** Flora diagnosed problems in words, but acting on them meant another request, an approval and then
hunting for the result on the map. A 1.7B model also can't size a fix (how many, which type, where).

**Decision:**
- **Planner in the sim** (`sim/proposals.ts`): `proposeBuilds(city, { focus, district })` turns the advisor's
  advisories (and the *fire cover* rule) into up to 3 plans: for supply shortfalls (energy, water, food, jobs,
  homes) the most cost-effective unlocked, non-landmark type and count (1–3) that covers demand ×1.15 (affordable
  first), trying ranked candidates until one has a valid lot (inside the named district when given); other
  advisories use their `build`. Each plan says why, what it achieves ("+660 water → 99% of demand"), cost and
  affordability. `diagnose` lists the systems below Stable with readings. Pure, deterministic, ≈2–30 ms.
- **Tool** `propose_builds` (read): the diagnosis plus proposals. `advisor_tips` and `why` `follow` into it, so
  every analysis ends in something actionable without another model decision; "what should we build / what does
  the city need / make a plan" route to it; it is a core menu tool.
- **Console cards** (`Panel.proposals`): what, where, why, gain; **Build ◈cost** (disabled when the treasury is
  short) runs the `build` tool at the proposed lot (the steward's own click: no authorization; undoable), **Lot**
  flies to the lot first. Built, the card becomes **Locate** chips per new id plus **Undo**, the camera flies to
  the first (inspector open) and a toast offers ⌖ Show. Any `build` / `build_many` result gets Locate chips too.
- **Proactive**: a tier-drop alert carries cards for that system (no model needed), once Flora is awake.
- **Prompts**: the reply asks for planner-style analysis (answer first, then what is wrong and why with numbers,
  then the one or two best fixes, naming the proposals), up to 4 sentences; the planner is told not to repeat
  lookups and to reply as soon as the facts answer.

**Consequences:** Verified with `bun run ai-probe` (qwen3-1.7b): "what should we build next?" → `propose_builds` →
answer naming the cards; "why is our water strained?" → `why` → `propose_builds` (followed). A one-click build
in a snap built 3 NEWater works and raised water from 90% to 96%. Grammar fixture updated (`propose_builds`).

## D-090 — Locate from above; a selection highlight you can't miss (2026-11-01)

**Context:** "Locate" (inventory, Flora's chips, toasts) glided the target across at the current pitch, so a low
camera often landed with the object behind towers; the only selection cue was the hover footprint cursor.

**Decision:**
- **`CityCamera.locate(x, z, { size, height })`**: a timed glide (1–2.4 s, smootherstep) instead of goal smoothing.
  The target eases across while the distance arcs up with the trip length (less when already high) and the pitch
  tips to nearly top-down mid-flight, settling at `BIRD_PITCH` (1.18 rad, ≈68°) at a distance framed by the
  object's footprint and height (`max(38, size × 2.6, height × 2.4)`). Any key, drag, wheel or gesture cancels it
  where it is. The inventory service (`focus` / `select`, so Flora's Locate chips, `object_select`, the dashboard),
  located toasts and Flora's **Lot** button use it; `flyTo` stays for bookmarks, the overview and the advisor.
- **Selection highlight** (`modules/selection`): on `selection:changed` a building (or highway tile) gets a
  targeting reticle on the ground (inner ring and four arcs that close in on select, then breathe and turn
  slowly), two one-shot ripples, a light beam from the roof for 3.5 s (wide from far away), and a diamond marker
  over the roof that drops in and bobs, drawn over buildings (`beacon-xray`) so it is never hidden. New unlit
  materials `beacon` / `beacon-xray` (vertex colour; glow adds bloom only at night) with dark outlines under bright
  strokes so they read on pale daytime ground. Rings hide beyond distance 170 (sub-pixel shimmer, D-070); the
  marker grows with distance and carries it. Four meshes, CPU-posed only while something is selected; they are
  visible at zero scale for the first frames so their pipelines compile in the boot warm-up.

**Consequences:** +4 draw calls only while something is selected. `tests/locate.test.ts` covers the glide.


## D-091 — Build progress on the lot while a building rises (2026-11-01)

**Context:** a new building rises piece by piece (a piece at local height y starts after y × 0.35 s), a few seconds
for a tall one, with nothing telling the player how big it will be or when it stands.

**Decision:** module `modules/rising` follows the renderer's own timeline (`BuildingRenderer.rising(eid)`: the
recorded build-in length, bounds and base, read on `building:added` when not loading). While a building rises:

- a dim **blueprint** outlines the finished volume from the first frame;
- bright **scaffold posts** at its corners grow with the construction front, and a bright **scan frame** rides
  the front itself (`RISE_PER_UNIT`);
- a **tag** over the roof (progress ring, name, stage: foundations / frame / finishing, seconds left) turns to
  **Ready** when the last piece lands; then the frame fades and the tag follows.

Two instanced meshes on the unlit `beacon` material (posed only while something rises, up to 8 at once; zero-size
for the first frames so they compile in the boot warm-up). Tags live in a HUD layer *under* the panels and are
clamped below the top bar and the phone's folded chips; text updates at 5 Hz with the ring easing in CSS.

**Rejected:** a sim construction phase (buildings working only after a build time): changes balance, pacing and
saves for what is a presentation need.

**Consequences:** +2 draw calls only while something rises. Repairs of ruins (re-added) show it too.

## D-091 — Flora acts on many buildings at once; a new city starts a new conversation (2026-11-01)

**Context:** Stewards asked Flora for things like "turn on all wind turbines" or "renovate all canopy towers in
Westbrook": the existing tools took one id, a whole type with no district (switches), or "the oldest N" (renovate).
Her conversation also carried over when a new city was founded or a save loaded, so its ids and undo hints pointed
at buildings that no longer existed.

**Decision:**
- **`batch` command** built into `CommandStack`: a list of records applied as one action (refused records are
  skipped, `lastBatch` says which applied; refused only when none did). One undo reverts the lot, redo re-applies,
  and replays stay deterministic (the record holds its sub-records).
- **`act_on_buildings`** (`sim/bulkTools.ts`, mutate): picks buildings by type (fuzzy, plural-tolerant in the host's
  narrowing, only types the city has), district (rectangle containment) and/or an inventory query, then applies one
  action: `turn_on` / `turn_off` (switchable buildings), `renovate`, `upgrade`, `repair`, `return_to_nature`. It plans
  every building first (skipping, with counted reasons: already on, like new, upgrade blocked, credits short) and
  spends credits in order. The result leads with the count ("110 of 110 switched off") and lists up to 8 ids, which
  the console shows as Locate chips ("✓ Done").
- **Narrowing for small models** (the tool's `narrow`): the action the request names is the only one offered; a
  district or type is offered only when the request names one; a query only from filter words the request uses
  ("old" → `is:old`, "critical", "worn", "unpowered"). Unnarrowed, qwen3-1.7b added a district from the brief and
  `is:critical` and matched nothing. `plainIntent` routes "verb … all/every/each" requests to it (after the hazard
  routes, before single-building renovate/upgrade).
- **Reply hygiene**: the reply stops at the first repeated sentence (its own abort controller, linked by hand for
  older WebKit) and `tidyAnswer` drops repeats and keeps at most 5 sentences: the 1.7B model looped "The water
  deficit is still present" until its token budget ran out.
- **New city, new conversation**: on `city:reset` (new island, showcase, loaded save) the assistant stops any turn,
  forgets its history, pending request and alert throttles, and the console clears its log, recent actions and
  session counts and says why (nothing is shown for the first city of a session).

**Consequences:** Verified with `bun run ai-probe` (qwen3-1.7b): "turn off all wind turbines" and "start all wind
turbines" each made one correct call (110 turbines), "renovate all canopy towers in Westbrook" one correct call.
Grammar fixture updated. `tests/bulk.test.ts`.


## D-092 — Top-bar indicators explain themselves (2026-11-01)

**Context:** the six top-bar indicators (credits, residents, energy, water, ecology, harmony) were bare numbers
with a one-word tooltip. Players could not tell what moved them, why one turned red, or what to do about it without
reading City Pulse, the dashboard and the Seedvault.

**Decision:** pure guides in `sim/statGuide.ts` (`statGuide(city, id)`), read from the same numbers the pulse uses,
shown by `modules/statinfo`:

- **Hover** (mouse only, 160 ms delay): a card under the stat with the value, tier chip, one gauge (supply ÷ demand,
  homes filled, eco per building, harmony vs its target), the situation in a sentence and the **best move**.
- **Click** (tap on phones, Enter/Space with the keyboard): a pinned panel with the breakdown (signed bars either
  side of zero for sums: cash flow, supply and demand, harmony factors; fill bars for residents' move-in factors,
  the limiting one marked), a 15-minute trend sparkline from `pulse.history`, "What this measures" with tips,
  ranked one-click **levers** and up to two sited, sized **build proposals** (`proposeBuilds`, D-089). Footer:
  City dashboard and Ask Flora (when unlocked). Esc, ✕, a click elsewhere or the same stat close it.
- Levers are data (`LeverAction`: open a build category, put a type in hand, show a lens, set the tax, take a
  loan, open Causes or Incidents) the module turns into commands and services, so all of it undoes. Suggested types
  come from `bestFor` (most of the stat per credit among unlocked types), so a fresh island never sees a locked one.
- Refresh: on `stats:updated`, at most every 500 ms; levers and proposals re-render only when they change (no DOM
  churn under the pointer), proposals re-plan at most every 8 s (`findSites` walks lots).

**Consequences:** the stats' native `title` tooltips are gone (the card replaces them). Phones show the panel as a
bottom sheet (`ui/mobile.css`). `tests/statGuide.test.ts`; scene `scripts/scenes/statinfo.js`.

## D-092 — Waking Flora: a clear dormant state, one-click conditions, a ready call, an awakening ceremony (2026-11-01)

**Context:** On a fresh island Flora is an unlock (D-072), but asleep she looked like any orb: opening her showed
the chat and a model picker, a request answered with a line of text, and her criteria lived only in the Goals tab.
Finishing the project changed nothing visible.

**Decision:**
- **Sim**: `Criterion` gains optional `build` (a type that meets it: the cheapest unlocked power plant, the Data
  Spire, homes, a Drone Fabricator), `progress` (0..1 for numeric targets) and `credits`. `floraWake(city)` (pure)
  gives the phase (`asleep` / `ready` / `waking` / `awake`), criteria, cost, progress and seconds left.
- **Orb**: asleep it is dim with folded petals, a slow breath and a "z" badge; ready it pings and a "Ready to wake"
  callout bobs over it (plus a toast the moment the last condition is met); waking, a progress ring fills round it.
- **Console asleep**: the chat, quick ops, rail and model picker give way to a dormant card: a sleeping sigil with
  drifting z's, what she needs (each unmet condition with **Build …** that picks the building up, or **Budget**; met
  building conditions can be located), and **Wake Flora · ◈cost** (enabled when ready; it starts the project), then
  a progress bar. The header link reads Dormant / Waking %. Requests while asleep open the card with a toast, and
  her alerts stay quiet until she wakes. The Goals tab's criteria got the same Build buttons.
- **Awakening** (`assistant/Awakening.ts`, on `project:done` for `flora`): the camera comes down over the Data
  Spire, a column of light rises from it and two shockwaves race across the island (unlit `beacon`, removed after);
  a full-screen veil, her sigil drawing itself (hex, orbit, six petals one by one, the core flaring with rings and
  slow light rays), F·L·O·R·A letter by letter, boot lines with live numbers (residents, buildings, Seedvault docs,
  tools), a greeting that names the most urgent system; then the sigil flies into her orb, which bursts, and her
  console opens with the usual welcome. ≈6.8 s; click / Enter / Space / Esc skips. `flora:awake` plays a rising chord
  in the audio module. Transform / opacity / stroke-dashoffset only; reduced motion collapses it.

**Consequences:** `tests/flora.test.ts` walks asleep → ready → waking → awake. Snapped on WebGPU and phone.

## D-093 — Waking Flora takes ≈18 s, not 3 minutes (2026-11-01)

The "Wake Flora" project ran half a sim day (180 s at 1×): a long dead wait between the Wake button and the
awakening (D-092). It now takes 0.05 days (≈18 s at 1×, a few seconds at 3× / 8×), long enough to see the progress
ring fill as a build-up. Cost and criteria are unchanged. Short projects show seconds in the Goals tab and the
live reference.

## D-094 — City moments: the awakening's ceremony for every big event (2026-11-01)

**Context:** Flora's awakening (D-092) made her unlock feel like an event; every other milestone (the Aeroline
opening, a sea wonder rising, a population landmark) was still one toast among many.

**Decision:** A `moments` module. `Ceremony` (from `Awakening`, now removed) plays a `MomentSpec`: tone (bloom,
gold, sky, sea, storm → CSS `--ma` / `--mb` and the 3D colours), emblem (Flora's core, or an icon on a plate inside
the same hex / orbit / petals), eyebrow, title (letter by letter, sized to its length), lines, a closing sentence,
an optional place (camera for grand moments, light column and shockwaves there) and a target the emblem flies into
(Flora's orb). Scale `grand` (≈6.8 s) or `minor` (≈4.2 s, timings × 0.62 via `--k`, lighter veil). The `moment`
bus event carries a sound: awake, triumph, wonder, milestone, weathered (synthesised in the audio module).
Triggers: Flora awakens (the assistant calls `play`), the Sky-lane charter and the Aeroline complete, a sea wonder
rises, a golden age (every system Stable+ and six Thriving for 20 s, once per city), population milestones (1k–100k;
10k and up grand), the harmony-streak and transit-city rules come into force, an earthquake / tornado / tsunami of
severity ≥ 0.8 ends (weathered, with its losses and what prevention saved), the first level-3 building.
One at a time (queue, deduped, minor ones dropped when it backs up), never while loading, while the New Chapter
dialog is open, or in the first seconds after a city change (baselines are taken then, so loading a big city
celebrates nothing). Settings → Display → Moments: all, major only, off (per viewer, localStorage).

**Consequences:** No sim state (baselines are re-derived per city). Steward replacement keeps its own modal.
Snapped: sea wonder, Aeroline, a minor milestone, Flora; a save load produced no moment over 9 s.

## D-095 — The first buildings a player sees, rebuilt with real detail; waterside buildings face the water (2026-11-01)

**Context:** A fresh island opens on a fishing hamlet, and its models were the simplest in the game: boxy boats
as long as a house, a dock that was a platform and a box, a near-invisible Work Dome, three plain silos for the
water works, and plain terraced homes. First impressions decide whether a player stays.

**Decision:**
- **Detail vocabulary** in `content/kit.ts` (`gableRoof`, `solarArray`, `louvres`, `planter`, `lamp`, `railing`,
  `awning`, `barrel`, `crate`, `piles`, `door`, `TRIM` colours), composed from existing pieces only: more
  instances, no new piece types, so no new draw calls per chunk.
- **Rebuilt**: Garden Residence (timber-framed glass storeys, front balconies with glass rails and planters, sun
  fins, a door under a canopy, a lamp, then a pitched terracotta / slate / sage roof or a roof garden with a pergola
  and solar array; 6 variants), Fishing Boat Dock (planked quay, a jetty on piles with bollards and a lamp, a net
  shed with a pitched roof and lit doorway, a fish stall under a striped awning, a derrick crane, drying nets and
  floats, barrels, crates, lobster pots), Mycelium Work Dome (a timber-ribbed geodesic dome with a solar-petal
  crown, an entrance vestibule, desks, deck furniture), NEWater Works (sawtooth glass roof, banded membrane tanks
  with a catwalk and ladder, an intake pipe to a pump head, stepped reed beds). Added detail to the Ember Watch
  (fire engine, siren, flag, windows, trims), Sunflower Spire (kiosk, service ring, helical rib) and Bloom Park
  (path, stepping stones, benches, a gazebo, lamps).
- **Boats** (`modules/fishing/boat.ts`): a lofted hull with sheer, chine and V bottom, boot stripe and red bottom;
  a teal trawler and a red longliner (two instanced meshes) at ≈1.3 tiles long, running lights, and a soft foam
  wake scaled by speed.
- **Facing the water** (`sim/orient.ts`): recipes put their sea side at local +z; `seawardScore` counts water ahead
  of a rotation. The scenario fill only takes sea-facing rotations for `nearWater` buildings (valid placements
  first, then scored; scoring every tile cost 2.5 s), `findSites` keeps the sea-facing rotation per lot and prefers
  lots that face the water, and the Build tool turns a waterside building to face the water under the cursor
  until R is pressed.
- `scripts/scenes/showroom.js`: buildings side by side on `?scenario=empty` for close review.

**Consequences:** Founding city ≈255k piece instances (garden residences ×668 ≈138 each, parks ×700 ≈101); boot
scenario ≈365 ms (was ≈280), draw calls 242 downtown / 225 Westbrook / 271 overview (was ~same), the default boot's
perf probe 262 draws (246 before); flicker per building in the range of untouched ones (≈0.05–0.1%). Not done:
the Living Highway's look, other categories' buildings.

## D-096 — Highway levels (raw track → Living Highway → Bloom Boulevard); more buildings detailed; hover-cars (2026-11-01)

**Context:** Highways were one fixed kind of tile, and early roads looked as finished as downtown's. The player
asked for roads that level up from a raw start, and for the rest of the common buildings to match the hamlet (D-095).

**Decision:**
- **Sim** (`sim/roads.ts`): per-tile layers `roadLevel` (0 raw track, 1 Living Highway, 2 Bloom Boulevard) and
  `roadWear` (0..255). Capacity ×0.75 / ×1 / ×1.6 of `TILE_CAPACITY` (mobility divides each tile's load by its
  own). Every 5 pulses a tile carrying enough traffic for its level (≥ 0.08, ≥ 0.5) gains wear (16 / 7 a pass);
  full wear raises the level for free (`road:level`). A newly laid highway is raw (`City.setRoads`); `unroad`'s
  undo restores levels. Command `upgradeRoad` raises tiles one level at ◈8 / ◈18 a tile, in order while credits
  last, undoable. Scenarios set a default (`roadLevel`, 1; the fresh island 0) and rectangles via
  `ScenarioBuilder.roadLevel` (the founding city's hero district: boulevards). Saved (v15: `roadLevels` as
  [tile, level, wear]; older saves migrate to level 1) and hashed. Raw capacity was tuned to 0.75 (0.6 left a new
  hamlet's mobility Strained for 90 s before it paved itself).
- **Look** (`RoadRenderer` `aLevel`, the `road` material): raw tracks are packed earth with two wheel ruts and a
  grass crown, unlit; Living Highways as before (with roadside fungi); boulevards add pale paving kerbs with a
  flower strip, a second guideline, a little more glow, and instanced street trees and lamps alternating on every
  kerb that faces open ground.
- **Player**: the highway inspector shows the clicked stretch's level and the network's mix, and **Upgrade to …**
  raises the 30 connected same-level tiles (`roadStretch`). Flora: `upgrade_roads` (a district, or the stretch near
  an object), routed from "pave / upgrade / widen the roads", "boulevard".
- **Commuters** (`modules/mobility`): the hover-cars are small rounded cars with a glass canopy in five pastel
  colours by day (were white boxes), glowing at night as before.
- **Buildings**: `ivyEdge` strands made finer (they read as flat green planks); detail added to the Canopy Tower
  (lobby, sky-garden rails, fins, solar), Living Studio (doors, porch, terrace), Orchard Stack (grow-light bands,
  loading bay, rooftop greenhouse), Drone Fabricator (sawtooth roof, roller doors, gantry crane, delivery pod,
  sign), Pod Dock (waiting shelter, departures pillar, lift door), Phyto Garden (boardwalk, pump, bench), Data Spire
  (server racks, cooling pipes, entrance, light posts) and Storm Shelter (entrance ramp, sign, supplies).

**Consequences:** Draw calls unchanged (242 / 228 / 271), boot scenario ≈360 ms. `tests/roads.test.ts`.


## D-097 — Street-level detail for the whole catalogue; street-level kit helpers (2026-11-01)

**Context:** After D-095/D-096 the common buildings read as places, but industry and sports were bare boxes and the
landmarks stood on empty slabs: no door, nowhere to sit, nothing lit at street level.

**Decision:**
- **Kit** (`content/kit.ts`): `bench` (facing ±z or ±x), `entrance` (glazed double door, timber canopy on posts, lit
  name strip), `forecourt` (paving, planters, lamps, benches), `lilies`, `railRing` (round balustrade) and
  `footbridge` (railed timber deck). Existing pieces only. All face +z, the street side of a recipe.
- **Industry**: Mycelium Brickworks (shelved curing racks under a striped shade, window band, sign, roller door,
  kiln firing door, chimney bands, pallets, forklift), Fireworks Factory (hazard-striped magazine door, railed
  launch yard, shell-colour sign, sand barrels, shell crates), Circular Reclaimery (conveyor legs and belts, roller
  doors, sign, sorted bales and bins, collection pod), Kelp Refinery (catwalk, ladders, pipe trestles, kelp drying
  lines, door, sign, resin drums), Solar Glass Foundry (furnace door, entrance, window bands, sand silo and chute,
  A-frame pane racks, crates, demo array).
- **Sports**: Bloom Stadium (goals and penalty boxes, big screen, three lit gates with turnstiles, ticket kiosk),
  Climbing Tower (top ropes, crash mats, boulder, roof rail, door), Sports Fields (penalty boxes, bleacher roof,
  team benches, scoreboard, back fence), Aquatic Centre (starting blocks, loungers and parasols, lifeguard chair, a
  coiled slide, glazed entrance porch), Wind Velodrome (racing lines on the banking, spectator steps, entrance
  pavilion, bikes, pennants). Fixed: the velodrome's ridge beam floated 1.5 above its arches, and the ribs were
  0.46-wide white bands (depth scaled like the span); now glulam-toned 0.17 ribs under the ridge.
- **Landmarks** (street level, plus terraces where they exist): Hanging Gardens (two entrances; rails, lamps and
  benches on every terrace), Sky Ark (lobby under each tower, podium rail and benches, rails round the ark deck),
  Cloud Domes (glazed foyer with glass links, lilies, lagoon boardwalk), Helix Spire (lobby, path, lamps, benches,
  bollard ring), Bloom Clock (door, forecourt), Harmony Gate (stepping stones through the gate, lilies, tower
  lobbies), Bloom Eye (boarding entrance, roof sign, kiosks), Moonflower Hall (railed boardwalk to a door in the
  drum, lilies), Solar Sail Bazaar (fountain, lit gateway with string lights, lamps), Sunset Amphitheatre (lighting
  truss, speakers, forecourt, ivy over the bowl's back wall), Glass Pine (vestibule through the lowest cone, benches
  in the winter garden, bollard ring), Elder Banyan (spiral stair up the trunk, lantern gate).

- **Second pass, the rest**: Wellspring Spire (eight railed footbridges over the moat clear of the falls, doors
  between the front roots, plaza lamps, benches; a balustrade and benches on the sky-park), Supertree Grove (lamps
  and benches along both paths, placed clear of trunks, pond and orchard), Lotus Pavilion (bridge rails, lamp),
  Nautilus Library, Starlight Observatory (stepping stones, public telescope, deck balustrade), Quartz Spire
  (footbridge to a visitor gallery, lilies), Mycelium Towers (boardwalk branching to a door per stalk), Lotus Pagoda
  (bridge, stone lanterns), Wavecrest Gallery (bridge, banners, sculpture), Coral Arcology, Vertical Forest, Habitat
  Cascade (promenade), Moss Monolith (doors and bridges either side of the fall, roof rail), Bamboo Cathedral (pews,
  hanging lanterns, path), Travertine Baths (forecourt); utility: Aeroline Station (street side is −z: doors,
  departures pillar, ticket machines, bike rack), Dragonfly Port, Fog Harp, Great Noria (pump house, footbridge,
  viewing rail), Pod Interchange, Rain Vortex, Skylane Nexus, Zephyr Airport (windsock, baggage); energy: Aeolian
  Reeds (boardwalk rails, marker posts), Algae Lantern, Heliostat Array (perimeter fence), Kite Meadow (picnic
  blankets), Breeze Turbine (door); tech: Bioreactor, Seedpod Labs, Weather Radar (ladder, hut); nature and food:
  Canopy Skywalk (a glass lift and bridge up to the ring: a stair there would be a 5.3-high ladder), Eco
  Playground (swings, slide), Honeycomb Apiary (hive boxes), Levitating Gardens (stepping stones to a viewing deck),
  Pollinator Sanctuary (insect hotel), Corkscrew Orchard, Rice Terraces (stone stair); Bloomtopia (promenade and
  gate-path lamps and benches). Left as they are: Flora Hive and Mangrove Seawall (no street level to dress).

**Consequences (second pass):** draw calls 176 / 214 / 277 / 283 (`?stress=1500` 196 / 235 / 310 / 317, unchanged);
the idle probe alternates 265 / 312 between runs exactly as HEAD does (264 / 309: a frame with a shadow refresh);
boot scenario ≈365 ms; flicker 0.035–0.18%.

**Consequences (first pass):** Draw calls +1 (175 / 214 / 273 / 281 downtown / Westbrook / Bloomtopia / overview against 174 /
213 / 273 / 281 at HEAD; `?stress=1500` 196 / 234 / 310 / 317 against 197 / 235 / 310 / 317), boot scenario
≈360 ms (unchanged). Flicker per building 0.035–0.2% against 0.057–0.183% for untouched ones (Hanging Gardens'
terrace rails are the highest at mid zoom). The perf probe reads ≈22.5% main thread while panning on both this
change and HEAD (the reference above is older; not caused here).

## D-098 — Things meet the drawn ground: triangle heights, re-seated buildings, road surface, parting grass (2026-11-01)

**Context:** The player saw buildings sunk into the ground and the explore walker's feet and legs buried. Measured
(every piece of every founding-city building against the drawn terrain): no building is sunk on the ground it was
placed on, since a building stands at its lot's highest corner. Burial came from four other places:
- **Ground edits after placement:** reclaiming land raises shared corners to 1.0, lifting a shoreline lot (fishing
  docks, water works) under a building that was never moved (0.15 into the ground in the probe).
- **Height lookup:** `Grid.heightAt` blended the four corners bilinearly, while the terrain mesh draws two triangles
  per tile split along the (x+1, z)–(x, z+1) diagonal. On a twisted tile the drawn ground is up to a quarter of the
  twist higher (0.1 on the island's hills), against 0.06-long legs.
- **Roads:** highway surfaces sit 0.035 above the terrain, but walkers stood on the terrain under them.
- **Meadow grass:** grass tufts (0.08–0.16 tall) hide the 0.22-tall steward's legs.

**Decision:**
- `heightAt` follows the drawn triangles exactly. No sim code reads it (only rendering, explore, camera, flora), so
  saves and the hash are unaffected.
- `BuildingRenderer` re-seats every building whose lot touches a `terrain:changed` region (remove + add, unanimated)
  when its base or plinth changed.
- Highway tiles add `ROAD_LIFT` (exported from `RoadRenderer`) in the explore collider's `groundAt`.
- Grass and flowers part round the walker: `U.walker` (feet xyz, radius w; set by the explore module, w = 0 outside
  walk mode) folds blade tips inside 0.16 down to ankle height and leans them away (`trampled` in the material
  library).

**Rejected:** grading terrain under every new building (cut and fill via `setCorners`). It would change sim terrain
and the hash, tilt shared road corners, and need undo and scenario re-balancing, to fix lots that the measurement
showed are not sunk. 84 founding-city lots sit below ground rising beyond their edge (up to 0.85, at terrace cuts),
but that ground rises *outward* from corners at or below the base, so nothing intersects.

**Consequences:** `tests/explore.test.ts` (saddle tile heights, road surface). Draw calls and perf unchanged; the
founding city still has no piece more than 0.1 into the ground.

## D-099 — Lot grading: no building in a hollow (2026-11-01)

**Context:** The player asked for buildings to fit the terrain (saves are not a concern: the game is unreleased).
D-098's count of 84 "pit" lots was inflated: it counted corners under neighbouring buildings, which their plinths
hide. Measured properly (ground beside a lot more than one 0.45 ramp step above the building's base, excluding other
lots), the showcase city had 23: 19 beside a street that climbs past them (streets straddling two terrace blocks of
the hero district and the towns, 0.8 across), 4 against rising open ground.

**Decision:** `sim/grading.ts` `gradeLots(city, lots, keep)` returns corner heights for `setCorners`, in four steps:
1. **Pads:** each lot stands at its highest corner, lifted to a street that is more than `KERB` (0.3) higher along its
   edge or within `STREET` (3) tiles (less `BANK` a tile beyond the first), by at most `MAX_FILL` (1.2) and never more
   than `CLIFF` (0.9) above a lower street or water beside it. The lot is levelled to its pad (its plinth covers it),
   except corners a street rests on, and within `CLIFF` of the ground just outside. Repeats until no pad moves.
2. **Banks:** open ground within `RAMP` (6) tiles is cut down to pad + k·`BANK` (0.45); every lot nearby has its say
   and the lowest cap wins.
3. **Seams:** a moved corner is brought within `CLIFF` of every neighbour grading left alone; a bank that would have
   to rise above its cap to do so keeps its height.
4. **Check:** a tile left steeper than `CLIFF` and steeper than it was gets its moved corners back (a queue; only
   reverting, so it settles). Highways can still be laid wherever they could before.
Never moved: other buildings' lots, street corners outside the lot, bridges, channels, water, and corners the caller
keeps (the scenario's levelled terraces, unless a building stands on them). The scenario builder grades every lot
after `def.build`; the `build` command grades the new lot, and undo restores the corners and terrain edits.
`BuildingRenderer` re-seats on `terrain:changed` (D-098).

**Rejected:** embankment fill (raising ground falling away from a lot): a lot several tiles away with a high pad
raised flat ground into spikes and made hollows next to lower neighbours; plinths already handle falling ground.

**Consequences:** showcase hollows 23 → 3 (2 against kept terrace ground, 1 street). Lifting lots to their street
leaves taller plinths on their low side (lots more than 1.2 above the ground beside them: 83 → 106), the intended
look of a building at street level on a slope. Scenario build ≈366 → ≈416 ms. Draw calls unchanged.
`tests/grading.test.ts` (ramp and undo, street lift, no showcase hollows). Balance and pacing tests unchanged.

## D-100 — Designed levels for every building: `b.level` / `b.upTo` in the recipe (2026-11-02)

**Context:** Only three heroes had designed levels (D-082). Every other building, about 75 of them, drew the generic
overlay from `tierPieces`: a roof terrace at level 2 and a glass setback crown at level 3, built from the template's
bounds. So a garden home, a fireworks factory and a stadium all levelled the same way, as "a flat floor on top". The
overlay also ignored the building's finish, window lighting, weathering and wilting.

**Decision:** `KitBuilder` gains `level(n, fn)` (pieces shown from level n, 2 or 3) and `upTo(n, fn)` (pieces shown
only up to level n: a roof or crown a later level replaces). Recipes write their levels inline, so a level reuses the
recipe's own sizes and helpers: a home adds a storey and lifts its pitched roof onto it, a tower adds segments, a
park adds a treehouse, a stadium an upper tier, a kite meadow a lead kite. `runRecipe` tags those pieces with a tier
range (`from` / `to`, 0 = level 1) and keeps them in the template's `ranged` list. Each `level` block draws from the
level's own seeded stream (the D-082 streams), so the level-1 pieces never move; `upTo` blocks stay on the stream they
are in. A def's `levels(b, tier)` hook still works: it runs as `b.level` blocks at the end of the recipe. `tierPieces`
returns the ranged pieces visible at a tier, level 1 included, and falls back to the generic overlay only for a recipe
with none. `setTier` now diffs. Pieces both levels show stay put, dropped ones fold away, new ones grow in from the
roof. All of them spawn through `spawn`, so they take the building's style, lit windows, weathering and vitality.
`heightAt(template, tier)` gives the level's height: sky-lanes clear it (`building:tier` marks rooftops dirty) and
alert markers float over it. The explore collider and roofs use `piecesAt(template, tier)`.

**Consequences:** Each building levels in its own architectural language, and level 3 always shows something level 2
doesn't (`tests/levelLooks.test.ts` guards every building that can level, at every variant). No new pieces,
materials or draw calls. Boot, draw calls and the power probe match the previous commit, measured in a worktree
(scenario ≈440 ms, 304 draws; 320 with all 2,349 founding-city buildings at level 3, the same as before). Upgrading
every founding-city building twice leaves the sky-lanes at `clipped: 0`. `scripts/scenes/heroes.js` now shows any
building's three levels side by side, with one finish (`window.STYLE`) and one variant (`window.VARIANT`).

## D-101 — About dialog, version from package.json, steady side panels, click-only build actions (2026-11-02)

- **About / credits:** clicking the top-left brand opens a holographic credits card (`src/modules/about/`): a
  blooming emblem with orbiting rings and drifting petals, the title, the slogan "Grow a city that grows back.", the
  version, the author (Aldrick Wan), when it was made (November 2026) and the source link
  (github.com/shoocstorm/BloomGrid) with Star and Copy link buttons. Copy link is there because the Tauri shell has
  no opener plugin, so `target="_blank"` links may not leave the app. Animations run only while the card is open and
  move transform and opacity alone (§7½).
- **Version:** `vite.config.ts` reads `package.json` and defines `__APP_VERSION__`, so the brand's sub-line and the
  card show the version `bun run release` just bumped. Nothing hard-codes a version (the brand used to read "v12").
- **Steady panels:** on desktops the Build panel and the City Pulse console have a fixed full height
  (`calc(100vh - 88px)`), and their content scrolls inside. Hovering different buildings or switching tabs used to
  resize them under the pointer. Phones keep their sheets.
- **Build actions have no hotkeys:** Highway, Channel, Remove, Retrofit, Mist, Weaver and Reclaim are picked by
  clicking them in the Build panel (G, C, X, Z, Y, V, T are free again). Advisor tips, lens text, guides and the
  README now say "Build → …". The Controls list reads tool keys from the tools, so it dropped them on its own.

## D-102 — One trailer command again, crossfaded shots, README stills at 2560 (2026-11-02)

`bun run trailer:feature` / `scripts/feature-trailer.mjs` are renamed to `bun run trailer` /
`scripts/trailer.mjs`, and the committed asset to `public/assets/trailer.mp4` (the deployed URL follows). The
recorder gained a street-level walk shot up the hero avenue (explore walk mode entered with the city camera parked
south of the spire: the steward spawns at the nearest road tile and strides away from the camera), caption cards
for the walk, Aeroline, fireworks and Flora shots, and easeInOutCubic camera easing. Each shot's frames now land
in its own `segNN/` directory and the encode chains ffmpeg `xfade` dissolves (0.55 s) between them, so the whole
trailer reads as one continuous move; caption windows are placed in *output* time, where every shot after the first
starts one dissolve earlier. README images moved from 1280×720 to 2560×1440 (captured at 2560×1440 `--dpr 2`
with `?quality=ultra`, downsampled with sips), and the README gained a Signature moments gallery (Aeroline,
fireworks, street walks, rooftop, Flora) — the old 25-line landmark paragraph folded into it and the planned-city
paragraph.

## D-103 — Phones load Flora's web core lighter, and a page iOS killed mid-load is recognised (2026-11-02)

On an iPhone, waking Flora and loading a web core reloaded the whole page: iOS closes a Safari tab past its memory
limit with no error reaching JS, and BloomGrid loaded phones at the catalog's 4,096-token context (Qwen3 1.7B:
1.1 GB of weights plus ~470 MB of KV cache, on top of the 3D city in the same tab). Ported Andai's loader, proven
on the same iPhone (`src/ai/llm/device.ts`): phones start CPU-only at ≤ 2,048 tokens (level 1), then 1,024 (level
2); a caught memory/GPU error or a stalled warm-up steps down a level and remembers it per model
(`bloomgrid.ai.loadLevel`); each warm-up writes `bloomgrid.ai.loadAttempt` until it settles, and a fresh marker at
the next launch means the page died under it: the drawer says so, the next level is saved, and that model is not
autoloaded this session (`LlmEngine.autoloadable`), or every open would crash again. Phones recommend Qwen3 0.6B.
`EngineInfo.context` reports the context that actually loaded. Not measured on a real iPhone here (headless Chrome
with an iPhone user agent confirms the CPU-only plan and the crash path).

## D-103 — New Chapter dialog shows a rendered overview, not a painted map (2026-11-02)

The showcase pane's image is now `public/assets/showcase-overview.webp`, a bird's-eye render of the live founding
city (`canvas.toDataURL('image/webp')` on the renderer canvas — the WebGPU front buffer reads back fine in
Chrome), made by `bun run showcase` (`scripts/scenes/showcase-shot.js`: hides the HUD and Flora's orb, frames the
island overview, pins late-morning light). It replaces `showcase-map.webp`, the 2-D painted district map with its
zone legend — a photo needs no key, so the pane's legend is gone too (`legend()` stays for the saved-city and
new-island canvases, which are still painted). The error fallback (a painted bare island when the asset is
missing) is unchanged.

## D-104 — Waking Flora takes 5 s (2026-11-03)

The "Wake Flora" project ran ≈18 s at 1× (D-093), which still read as a wait. It now takes `5 / DAY_LENGTH` days
(5 s at 1×): just long enough for the progress ring to fill before the awakening. Cost and criteria are unchanged.

## D-105 — The brand stays on phones as a logo-only button (2026-11-03)

The top-left brand (it opens About, D-101) was hidden on `.compact`. It now shows as the logo alone; in portrait
(< 700 px) it leads the stats row, because beside the clock it pushed the speed control under the actions pill.

## D-106 — Phones get the City Pulse console, not three chips (2026-11-03)

Phones showed City Pulse, the lenses and Flora-Net as separate chips and sheets, with Goals pushed to the top of the
pulse sheet, while desktops had one tabbed console (D-056). Phones now use the same console: the same tabs (Pulse,
Lenses, Flora-Net, Goals, with their badges), a sheet under the top bar opened and closed by the top bar's Pulse
button (back on phones, reversing D-081's phone rule), ✕, P, or a tap on the city. `addTab` no longer sends elements
back to a phone home; Flora-Net and the lens bar are no longer HUD sheets, and the lens toggle chip is gone (the lens
legend still sits under the top bar). The top bar's action buttons are slimmer on phones to make room.

## D-107 — One frame for consoles and dialogs (2026-11-03)

The surfaces opened from the top bar each had their own size and place: on desktops the Dashboard (1100 px), City
Map (1180 px, taller, over the top bar) and Seedvault (1180 px); on phones the Dashboard, Map and Seedvault went
full-screen over the top bar while City Pulse, Settings and the view-mode menu each had their own height.

- **Desktops:** the Dashboard, City Map and Seedvault share one centred frame, `--dlg-w` × `--dlg-h` in `ui/theme.css`
  (the map's square fits that height). City Pulse (left column), Settings and the view-mode menu stay anchored panels.
- **Phones:** City Pulse, Dashboard, City Map, Seedvault, Settings and the view-mode menu all open in one sheet frame
  (`--sheet-h` in `ui/mobile.css`): under the top bar, which stays usable, gutter to gutter, down to above the Build
  button. The dialogs' scrims start under the top bar and stay clear. In landscape the narrow ones (Pulse left;
  Settings, view mode right) are `min(380px, 45vw)` wide and the big dialogs full width. Flora's console stays the one
  full-screen surface. A new dialog should use these frames rather than its own size.

## D-108 — Phones run only small web cores, with a lean KV cache (2026-11-03)

D-103 wasn't enough: on an iPhone 18 (iOS 27 Safari) Flora's warm-up still reloaded the page with Qwen3 0.6B Q8_0,
while Andai loads it on the same phone (and crashes on 1.7B). The city takes the difference: in a phone emulation
(headless Chrome, iPhone UA, 390×844 @3×, the compat build, `bun run ai-probe -- --phone`) the showcase city alone
holds ≈ 1.05 GB in the renderer process plus ≈ 450 MB of GPU memory, and the 0.6B Q8_0 worker grew to ≈ 1.8 GB (its
wasm heap peaks at about the weights twice plus the KV cache, and never shrinks).
- **Phones list only `phone` cores** (`availableModels(mlx, mobile)`): Qwen3 0.6B Q4_K_M (`qwen3-0.6b-q4`, 397 MB,
  pinned unsloth commit). `load` refuses a bigger core on a phone and `lastUsed` won't autoload one.
- **CPU plans ask for less** (`loadParams` in `device.ts`): q8_0 K and V cache (needs flash attention, which the CPU
  backend has), one sequence instead of wllama's 4, 256-token batches. KV at 2,048 tokens 224 → 119 MiB, compute
  28 → 14 MiB. The GPU plan keeps wllama's defaults.
- Together: worker ≈ 1.8 GB → ≈ 1.1 GB. Rejected: forcing wllama's heapfs path for the compat build (this llama.cpp
  build doesn't map the file, so it saves nothing). Still to confirm on a real iPhone.

## D-109 — The building inspector reads like a report (2026-11-03)

- **Why**: the inspector showed base stats as tiles and a wall of mono text; players couldn't tell what a building
  takes, what it gives, or what to do about a problem.
- **Live flows**: `sim/pulse.ts` writes what each building actually drew and gave in the last pulse into the `Flow`
  store (`ecs/components.ts`: energy, water signed; food, eco, pollution). Derived each pulse, so neither saved nor
  hashed; reset in `City.addBuilding` (ids are reused). The sums are unchanged bit for bit.
- **Report**: `sim/buildingReport.ts` (`buildingReport`, pure, tested) gives a verdict (Running well / Struggling /
  Not working / On fire / Ruined / Flooded / Offline / Switched off), each problem with its fix, Consumes and
  Produces lines (live value, ceiling, supplied %), and the key facts (level and why growth is paused via
  `growthHold` in `sim/levels.ts`, condition, occupancy or staffing, greenery).
- **Layout** (`ui/Hud.ts` `updateInfo`): status card, four fact bars, two columns Consumes ← | → Produces, notes
  (symbiosis, transit, bloom, city rules, risk). Rebuilt only when what it shows changes (≈ once a pulse). The
  details scroll in `.ix-scroll` (`fillInfo`); the action row stays pinned at the inspector's foot.

## D-110 — The inspector preview keeps its meshes and warms them in the background (2026-11-05)

- **Why**: picking a building stalled the next frame by 90–230 ms in Chrome and up to ≈1 s in the Tauri shell
  (WKWebView compiles shaders more slowly). `Preview.load` cleared its `ChunkedInstancer`, so every pick created fresh
  `InstancedMesh`es; three builds a node graph per mesh uuid, and the stage's own lights make a separate shader
  variant of every material.
- **Change**: `ChunkedInstancer.empty()` drops instances but keeps the batches (empty ones hide). The preview uses it
  and one map-wide chunk (4096), so each piece type has a single stage batch wherever the building stands. Once the
  city runs and the stage is hidden, it builds every piece's stage mesh six at a time through `compileAsync`
  (29 pieces, a few hundred ms in all), then empties the stage.
- **Result** (headless, founding city): no frame over ≈27 ms after a pick on WebGPU or WebGL2, the first pick of a
  type included; main thread unchanged (22.9%).
- **Rule**: an instancer that is refilled often should `empty()`, not `clear()`.

## D-111 — City changes load behind a full-screen loader (2026-11-05)

- **Why**: founding the showcase (≈1.6 s of synchronous work) or loading a save froze the old city on screen, then
  popped the new one in with first-frame shader stalls in view.
- **Loader** (`modules/loader`, `loader` service): `run(subtitle, work, reveal)` puts the boot screen
  (`ui/Boot.ts`, now a `.boot-screen` class with `minShow` and `tip` options) over everything, pauses the sim
  (speed 0), holds keys, runs `work` with a `stage(label, p)` callback, draws a few frames of the new city behind the
  cover, then irises open and calls `reveal` (the opening fly-in). A rotating tip shows under the log (key tips
  skipped on touch screens).
- **Real stages**: `foundCity`'s body is a generator (`foundSteps`); `foundCity` runs it straight through (boot,
  tests), `foundCityStaged` awaits the loader between stages, settling in four 20-tick slices. Same city tick for tick
  (`tests/loader.test.ts`). `SaveManager.load(slot, stage?)` reports read / rebuild / wake.
- **Callers**: New Chapter (new island, showcase, resume), Settings → Load, ⌘L, game over → Load last save, the
  fallback new-city dialog. A new way to replace the city should go through `loader.run`.
- **Fix found on the way**: explore's `setPhoto(false)` on `city:reset` set the speed to 1 even when photo mode was
  off, so every load quietly unpaused the city; it now restores the speed only when leaving photo mode.

## D-112 — Two-control clock and no context menu (2026-11-05)

- **Clock** (`ui/Hud.ts` `buildClock` / `updateClock`, styles in `ui/theme.css` `.cl-*`): the four speed buttons gave
  way to one day button (a dial whose sun or moon circles a sky-coloured ring with the hour, play / pause in its
  centre, the time and day beside it) and one speed chip (speed + three pips; click steps 1× → 3× → 8× → 1×,
  right-click or wheel steps down, any step from a pause plays). Paused: the dial dims, the time breathes amber
  and the day line reads PAUSED in place (no width change). The dial turns with a `transform` from `--t`, written
  at the HUD's 5 Hz. Fit levels: `fit-5` drops the day line, `fit-7` the pips.
- **Context menu**: `blockContextMenu` in `main.ts` prevents it on the whole window (web and the Tauri webview);
  text fields keep theirs for paste. Right-click stays a game gesture (leave build mode, slow the clock).

## D-113 — One name per indicator; Food in the top bar (2026-11-05)

- **Why**: the same number had three names (top bar "Credits", City Pulse "Budget", dashboard "Treasury"; "Energy" /
  "Energy grid" / "Energy supply"; "Eco" / "Ecology"), so players couldn't tell they were looking at one thing.
- **Names** live in `src/sim/indicators.ts` (`INDICATOR_NAMES`, `SYSTEM_LABELS`, `CREDIT_FLOW`): Credits, Residents,
  Energy, Water, Food, Employment, Mobility, Ecology, Harmony, Bloom index. The money balance and its health tier are
  **Credits**; its per-second change is **Credit flow**. The top bar, City Pulse, the dashboard, stat guides,
  advisories, tier toasts, Flora's brief and console read them from there (`tests/indicators.test.ts`). The knowledge
  base keeps "budget" as a topic word; search maps credits / treasury to it.
- **Food** joins the top bar between Water and Ecology: residents fed (%), red below 95%, with its own stat guide
  (grown vs eaten, a food building as the best move when short) and a `food` trend in the pulse history
  (`HISTORY_METRICS`; `SAVE_VERSION` 16 starts it empty). It gives way at `fit-5` with Water.
- **Tests key on data, not labels**: the pacing steward finds the savings goal by `credits: true`, not its text.

## D-114 — One indicator order, a pause panel, settled tier alerts (2026-11-05)

- **Order**: `INDICATOR_ORDER` / `SYSTEM_ORDER` in `sim/indicators.ts` (Credits, Residents, Energy, Water, Food,
  Employment, Mobility, Ecology, Harmony) order the top bar, City Pulse's System health, the dashboard's tiles, trends
  and health list, Flora's console and the all-thriving moment. Display only: the sim keeps iterating `SYSTEMS`.
  The dashboard gained an Ecology tile and trend.
- **Pause panel** (`modules/pause`): the steward's pause opens a centred `.holo` card (Resume orb, credits /
  residents / harmony, every system's tier, the worst system's stat-guide status, key hints). A click on the city,
  a tool, a selection, Esc or Keep planning folds it into a pill under the top bar; the pill resumes. Space resumes
  at the last speed (its key listener outranks the 1× global). Holds that aren't the player's show nothing: `.modal-scrim`
  dialogs, the loader, photo mode, `chapter-open`, the boot. No `backdrop-filter`; rings animate transform / opacity.
- **Settled tier alerts** (`sim/tierGate.ts`): a supply hovering on a threshold flipped its tier, and every
  `pulse:tier` listener (toast, Flora, advisor log, sounds, fix log) fired each time. `pulse:tier` now reports a
  change only once it holds (drop 3 pulses, recovery 8), at most once per 30 pulses per system (a fall to Collapse is
  never held back); changes inside the cooldown merge. `pulse.tiers` stays raw for the sim and the fail clock. The gate
  is notification state, rebuilt on reset or load, neither saved nor hashed (`tests/tierGate.test.ts`).

## D-115 — One credit-flow formula, fireworks included (2026-11-05)

- **Why**: the top bar and the dashboard's Credits tile left loan repayments out of the per-second rate, so a city in
  deficit with loans looked better there than in City Pulse. Flora's brief, console and tools used other subsets
  again. And no display counted the Fireworks Factory's shell purchases, show fees or show visitors, which move
  credits too (≈1.3/s in the showcase).
- **Formula**: `netIncome(city)` in `sim/finance.ts` (taxes + fishing + visitors + fireworks − insurance − upkeep as
  paid − loan repayments) is the only one: the top bar, City Pulse, the dashboard, the Credits guide, the budget
  tier and history, the deficit advisory and Flora's brief and tools call it. Never sum `stats` by hand for it.
- **Fireworks** (`FireworksState.flow`, saved and hashed, default 0; `stats.fireworks`): this pulse's change in
  `revenue − spent`, smoothed over ≈30 pulses because shells are bought one at a time. A "Fireworks" line joins the
  breakdowns. The dashboard's Credit flow column also gained loan repayments, and its upkeep bars show upkeep as paid
  under austerity.
- **Test** (`tests/creditFlow.test.ts`): the shown flow matches how credits actually move, averaged over two sim
  minutes, in a deficit with a loan and in austerity.

## D-116 — Relocating buildings with Shift-drag (2026-11-05)

- **Why**: a misplaced building could only be demolished (half refund) and rebuilt, losing its level, age and
  greenery.
- **Input**: Shift-drag in Inspect carries a building (ghost + validity tooltip, R rotates, Esc cancels). Ctrl/⌘-drag
  stays group selection (D-070), so Ctrl can't also mean move. Mouse only: touch has no modifier keys.
- **Command** (`move`, `sim/relocate.ts`): one undoable step that removes the building and re-adds its record at the
  new lot (same uid, tier, age, level, condition), grades the lot like `build` (D-099) and charges `MOVE_FEE` (10% of
  cost). Burning buildings and ruins refuse (their fire and ruin state follow the uid, but moving them would dodge the
  crisis). Sky-bridges are keyed by tower anchors, so bridges woven to a moved tower come down; undo splices them
  back at their old indexes so the hash round-trips.
- **Placement**: `City.checkPlacement` gained `moving` (its own lot doesn't block, no lock or limit check) and `cost`.

## D-117 — A blocked upgrade says why and offers the fix (2026-11-05)

- **Why**: a blocked Upgrade was a disabled button whose reason lived only in its hover title: nothing on phones, and
  disabled buttons don't explain themselves. It also went stale (built once per selection while credits moved).
- **Sim**: `upgradeAdvice` in `sim/levels.ts` returns `{ reason, fix, act, short }`; `upgradeBlocker` is its
  `reason` (bulk tools, inventory tags unchanged). Flora's `upgrade_building` error carries the fix.
- **Inspector** (`Hud.upgradeNote`, refreshed with the live parts): the button stays pressable but reads locked
  (`.blocked`); pressing it toasts the reason and nudges a warning card under the hazard buttons. The card's one step:
  Renovate (run down), Find credits (opens the Credits guide; shows the shortfall and the time at today's income), or
  the hazard buttons above it (fire, ruin). No card at the top level or for buildings that don't grow.

## D-118 — Juice: milestones, tip bubbles and reward feedback for the first play (2026-11-06)

- **Why**: a fresh island's first hour had long quiet stretches. Income is ≈◈2/s, the first population moment is at
  1,000 residents, and placing a building ended with a "Ready" tag. Nothing rewarded attention between the guide and
  the unlock projects.
- **Milestones** (`sim/milestones.ts`): 18 ordered goals, as data, each with `progress(city)`, a reward and an
  optional `build` hint. They come from the opening's real needs: the fresh island starts with food at ≈76% and power
  margin at ≈20 of 40, so the early goals teach sound play, and two or three finish on their own within ten minutes.
  The player claims them by hand (`claimMilestone`), because the claim is the reward beat. `growth.milestones` is
  saved and hashed (save v17). Progression cities only.
- **Tips** (`sim/tips.ts`): *where* and *when* a bubble floats is cosmetic, chosen in the `juice` module with
  `Math.random` (not sim state). *What it pays* is the sim's (`tipValue`: 15 + 0.9·√population, × Harmony/60 clamped
  0.5–1.5, × combo 1–2), so a replayed command log pays the same. Tips and claims run with `undoable = false`: they are
  receipts, and ⌘Z should still undo the last build. A bubble lasts 32 s of running time, at most three float at once,
  20–35 s apart, in view only.
- **Feedback** (`modules/juice/`): a `building:ready` event from the rising module (the last piece landed) drives a
  petal burst and the building's yields; quick builds step the chime up a pentatonic scale. Coins fly on a two-axis
  arc into `.stat-credits`, which bumps when they land. Sounds hang off a `juice` bus event in the audio module.
  Everything is DOM with transform / opacity keyframes. Anchored effects sit in a positioning wrapper because an
  animated `transform` would override the inline one. Measured: main thread 23.4% active / 16.7% idle (≈ baseline),
  draw calls unchanged.
- **Rejected**: automatic claims (they lose the beat); tips as a sim system with `city.rng` (that would put
  cosmetic spawning into the hash and the balance tests); offline "welcome back" earnings (they would fight the
  steward role, where neglect is meant to matter).


## D-119 — The season chip is the weather's guide (2026-11-07)

- **Why**: the clock's season chip only had a native tooltip, while every top-bar indicator explains itself (D-092).
  The season decides crisis odds, food and water output and soil drying, and the player had no place to read that.
- **How**: `sim/seasonGuide.ts` (pure) gives the season's effects against the rest of the year, its crisis
  multipliers (`Season.crisis`), the weather now (an active or forecast crisis, a Monsoon shower, Haze), the season
  ahead with its preparation, and ranked levers in the stat guides' `GuideLever` shape. A threat leads with the Flood
  or Risk lens; past 60% of a season the next one's levers join in. The statinfo module wires the chip as one more
  `InfoId` (hover card, click panel, Flora's proposals for the season's focus), so levers run through the same code.
- **Card and panel are solid** over City Pulse (`.si-season`), like `.xp-menu`: the panel opens over the console.
- **Rejected**: a separate weather module with its own panel (it would duplicate lever and proposal handling).

## D-120 — A graded, atmospheric look: grade, fog, live reflections, water and shore (2026-11-07)

- **Why**: the city read flat and high-key: raw ACES at a fixed exposure, linear fog, an environment light baked
  once at noon (dusk glass still reflected noon), a flat sea, and nothing grounding buildings and trees.
- **Grade inside the existing output node** (`render/grade.ts`, no extra pass): `renderOutput` then lift / gain per
  channel, saturation, contrast and a vignette from `U`. The atmosphere's time-of-day keys carry the grade and bloom
  strength (warm light and cool shadow at golden hour, a blue lift at night, bloom 0.45 by noon to 0.9 at night);
  weather pushes it (storms desaturate, heat and dust warm). Low quality (no pipeline) stays raw.
- **Fog** is `scene.fogNode`: the old range fog thinned with height and tinted toward the sun when looking at it.
  `atmosphere.fog` keeps its `color / near / far` shape (they are uniforms now), so weather writes it as before.
- **Live reflections without re-baking**: `scene.environmentNode = pmremTexture(noonBake) × U.envTint`, the sky's hue
  against noon. Brightness stays with `environmentIntensity`. The preview scene still copies `scene.environment`.
- **Cloud shadows**: a broad drifting noise darkens lit albedo ≤ 13% by day (every `define()` material and the
  terrain), ~80 tiles per feature so it never flickers; off at night, under lenses and in storms.
- **AO on Ultra (removed again in D-124).** GTAO can't read a multisampled depth buffer (WebGPU has no depth resolve), and a
  depth/normal pre-pass would double draw calls (≈250 → 500). So AO reconstructs normals from the scene pass's own
  depth and runs at half resolution, and only where MSAA is off: Ultra now uses FXAA + GTAO; Medium gets FXAA
  (had no anti-aliasing). Measured on High-equivalent settings: AO + FXAA ≈ MSAA in GPU time and ≈ +1 point main
  thread, but day flicker rose ≈50% (half-res AO noise while panning), so High keeps MSAA. `?ao=1` tries it anywhere.
- **Uniform group**: every `U` uniform is in `renderGroup` (one upload per render, not a per-draw check).
- **Water**: fresnel toward the live horizon/zenith (dusk seas blush), a sun-glitter path into the emissive (blooms,
  faded before sub-pixel), and a foam line washing up and back over the shallows; the terrain has a matching wet-sand
  band that follows floods.
- **Measured** (headless, founding city, High, several runs): main thread ≈ +1 point active and idle (inside the
  baseline's own spread), CPU ms/frame unchanged, GPU within noise, draw calls unchanged; flicker at night unchanged,
  by day ≈ +15% (the extra contrast).
- **Rejected**: a LUT texture (one more sample and an asset for what four uniforms do), re-baking the environment per
  time of day (a hitch and a pop at every swap), AO on High (flicker), an SSR water pass (cost).

## D-121 — Placement says what it will do; zoom to the cursor; a landing (2026-11-07)

- **Why**: placing gave a cyan or red ghost and a chime; coverage, pairing and land value were only visible after.
- **Placement preview** (`sim/placementPreview.ts`, pure): the def's service area (response, drones, shelter, defence,
  transit, pairing), partners it would pair with or complete, and the lot's land value. The Build tool draws the area
  with the brush ring and adds the rest to the tooltip. A valid lot with a warning shows an **amber** ghost.
- **Landing**: when the rise finishes, a ground ripple and a warm dust ring sweep out from the footprint
  (`modules/rising`, additive `land-ring` material, one small instanced draw only while a ring lives). No camera shake
  and no squash (ambient motion stays subtle).
- **Camera**: the wheel zooms toward the ground under the cursor (`input/zoomPivot.ts`, tested), and a released drag
  glides on for ≈0.3 s. The target keeps the map clamp: an island clamp would block the sea wonders near the edges.

## D-122 — People in the streets, critters in the meadows (2026-11-07)

- **Why**: apart from hover-cars the streets were empty; pedestrian activity was only a glow.
- **Walkers** (`modules/walkers/`): like the hover-cars, static instance data (a stretch of pavement, heights, seed,
  pace) rebuilt on `mobility:updated`, walked and bobbed in the shader; density from the activity field, fewer in the
  small hours. They fill a region of ±80 tiles round the camera's focus (re-placed when it drifts 25 tiles; seeds come
  from the tile, so walkers in view don't change) instead of thinly covering the island, which hit the 4,096 cap in
  the northern rows. Hidden beyond 110. (Figures and critters reworked in D-124.)
- **Critters**: one instanced mesh of wing pairs on green, unbuilt tiles round the focus: butterflies by day,
  fireflies (glow, slow twinkle, dimmed to their pixel share) at night. Sparse on purpose.
- Two draw calls, both near-view only.

## D-123 — Happenings: residents' requests and good surprises (2026-11-07)

- **Why**: every random event was a crisis, and a stable city (the founding city above all) had nothing to respond
  to. Happenings give good surprises and small, meaningful asks.
- **Sim** (`sim/happenings.ts`, state `sim/happeningState.ts`, save v18, in `hash()`): one at a time, 4–7 minutes
  apart, never during a crisis or with Harmony Critical; `city.rng` only, and only while `auto` (tests and the trailer
  switch it off). Kinds: a **request** (a neighbourhood asks for a Nature / Food / Sports / Work building it lacks and
  the city can build, within 12 tiles; met when the count there rises over the baseline taken at the start, so it
  survives save/load with no event tracking; claim for credits and a Harmony lift, miss it and Harmony dips; an
  unclaimed met request pays out after its deadline so it never blocks the next), a **festival** (Harmony + visitors,
  a free fireworks show if a factory has shells), a **bumper catch** (fishing ×1.5) and a **cruise visit** (visitors).
- **Effects through the consequence modifiers** (`applyHappenings` inside `updateConsequences`), so visitor credits
  land in `stats.tourism` and `netIncome` (D-115) and fishing reads `mods.fishing` as before.
- **UI** (`modules/happenings/`): a card under the milestone card (Build the cheapest matching building, Locate,
  Claim), a toast that flies to the spot, a minor moment for an answered request; `?happening=<kind>` drills one.
- **Flora**: read-only `happenings_status`; the guide `systems/happenings.md` and the live `reference-happenings`.
- **Dropped**: "newcomers" (a population boost): population growth has no modifier to hook, and a new one isn't
  worth it for one kind.

## D-124 — No AO; detailed walkers and explore-only butterflies (2026-11-07)

- **Why**: players saw "freckles" morphing over close views (walk / drone). The cause was D-120's Ultra-only GTAO:
  half resolution, no temporal filter, normals rebuilt from depth, so every surface near the camera carried a
  shifting stipple (High, without AO, was clean and matched the old build). A denoise or temporal pass would cost
  far more than the effect is worth here, so AO is gone: Ultra is back on MSAA, `?ao=1` and `U.aoAmount` are removed.
  It was not the glass or the environment tint.
- **Walkers** (`modules/walkers/figure.ts`): parts tagged with `aPart` (colour) and `aLimb` (signed swing, pivot);
  one shader swings legs and the opposite arms on the stride, turns the body to its heading (normals too, through
  `transformNormalToView`) and colours each part (shirt, trousers, shoes, skin, hair from per-walker palettes; eyes
  and a smile). A detailed LOD (≈1,000 triangles) shows within distance 45 and in explore modes; a three-part LOD
  further out. Both share the instance data, only one draws. Scale ≈0.3 tiles, ≈0.19 since D-226 (the explore avatar's height; the
  D-122 ×2.1 figure towered over it). Night glow only on the clothes (a glowing body read as a ghost). In explore
  modes the crowd centres on the camera within 50 tiles (80 in the city view).
- **Critters** (`critters.ts`): butterflies with rounded fore and hind wings (species pattern: base colour, dark
  margins, pale spots, faint veins), a body and antennae; wings flap on the body axis and the body faces its flight.
  At night wings rest and a lantern glows (fireflies). Drawn and placed only in explore modes, round the camera.
- **Measured**: city view draws +1 (277 / 284 / 296 near / overview / near-horizon dusk), main thread within noise;
  walk mode 60 fps, +2 draws, +0.68 M triangles, GPU ≈2 ms (headless).

## D-125 — Highways land on both banks: one plan for preview and command (2026-11-07)

- **Why**: dragging a highway across water often left one bank unconnected. A bank tile steeper than a highway allows
  (corners > 0.9 apart) was silently skipped, so the bridge ended a tile short; a drag released over the water
  stopped there; and the L route could turn mid-river. The preview showed every tile, the command laid fewer.
- **How** (`sim/roadPlan.ts`, pure): `planRoad` grades steep bank tiles next to a crossing into abutments (low corners
  raised ≤ 1.6, up to 3 tiles out, never corners touching buildings, channels or other highways), carries a path that
  ends over water on to the next land (≤ 4 tiles, only for drawn paths), and lists every skipped tile with its reason
  and where credits run out. `bestRoute` picks the L route with no wet bend and fewest skips. The `road` command and
  the Build tool use the same plan; undo restores corners and terrain edits exactly (hash-tested).
- **Walkers and cars**: hover-car lanes moved to ±0.13 of the carriageway, walkers to the outer 0.39–0.44 and twice
  as fast (pace 0.2–0.3 tiles/s). Wider roads were not done: the road is one tile on the grid.

## D-126 — Close-up wildlife: fish, rabbits, birds (2026-11-07)

- **What** (`modules/walkers/`, shared helpers `kit.ts`): fish (five patterned species with fins and eyes, swimming
  loops with a tail wave, some leaping in arcs), rabbits (four coats, belly, tail, long ears; hop bouts with stretch
  and ears laid back, then sit, nibble and twitch) and birds (gulls, swallows, finches in flocks circling 7–17 above
  the ground, flapping in bouts and gliding, the wing hand bending further, banking into the turn). One instanced mesh
  per kind, every motion in the shader, homes placed on the CPU round the camera; like the butterflies (D-124) they
  draw only in explore modes.
- **Water**: the water no longer writes depth, and fish draw after it (`renderOrder` 2), tinted toward the sea colour
  by depth, so they show through clear water. Nothing else transparent sits below the surface.
- **Measured** (headless): city view unchanged (277 / 284 / 296 draws); walk 170 draws (+2), drone 174, +0.1 M
  triangles, 60 fps, GPU within noise. No budget needed adjusting.


## D-127 — Tropical greenery; highways reach 3 tiles (2026-11-07)

- **Trees** (`world/Flora.ts`, `content/kit.ts` `tree()` / `TROPIC`, `assets/kit/pieces.ts`): the island grows as a rainy,
  sunny tropical one. Wild tiles pick by setting: shore (coconut palm groves, sea grape), rainforest (emergent rain
  trees on stout trunks, palms, tree ferns, a smaller second tree and banana / heliconia understorey), cloud forest
  above 7 (tree ferns under round crowns), open country (rain trees, flame / frangipani / golden-shower trees as a
  green crown capped with blossom, palms, bamboo stands). Free tiles beside a highway are **verges** (a palm or rain
  tree on about half, broad-leaf beds), beside a building **gardens** (banana, frangipani, the odd palm, flowers);
  `Flora.refreshAround` re-plants the ring round a building or road change when a tile's setting changes. Recipes'
  `tree()` (44 buildings) draws from the same mix.
- **Pieces**: one new piece, `palm` (curved trunk, folded fronds, nuts in one mesh, parts tagged in `uv.x`, its own
  `palm` material: fronds tinted, bark and nuts divide the tint out, only frond tips sway). The `bush` geometry is now a
  broad-leaf clump (double-sided) in the old unit volume, so every planter and verge turned tropical with no new draw
  call. Rejected: separate pieces per species (each costs a draw per visible chunk; the overview sits at ≈290 of 300).
- **Highway reach** (`sim/networks.ts` `ROAD_REACH` = 3): a building joins the nearest highway network within a
  3-tile square ring of its lot (nearest ring first, then lowest id), not only one touching it; `nearRoad` drives the
  placement warning, and `accessTiles` gives a set-back lot one lane to the nearest highway tile. The scenario
  builder still lays lots along streets (`touchesRoad`).
- **Measured** (headless, founding city, vs a HEAD worktree): draws 248→258 downtown, 214→223 Westbrook, 288→292
  overview; flora instances 111k→155k; main thread 25–28% in both (no change); boot unchanged (scenario ≈425 ms,
  modules ≈415 ms); palm flicker 0.008% at 260. `?stress=1500` stays on the loader headless in both builds, so it
  was not measured.

## D-128 — Named bridges, dramatic roadworks, builders and cost to date, closable notices (2026-11-07)

- **Named bridges** (`sim/bridges.ts`, `sim/bridgeReport.ts`): every straight bridge span of 3+ tiles is a record
  (`city.bridges`: key = first deck tile + axis, unique name from a tropical word list, `built` tick, `by`). `setRoads`
  runs `syncBridges` after each change (spans that grow or shrink keep their record by overlap; removed ones drop;
  `unroad` undo restores names). Founding bridges are dated 20–920 days before day 1. A bridge's **level**
  (Standard / Lantern / Grand, capacity ×1 / 1.4 / 1.9, `BRIDGE_CAPACITY` in `roads.ts`) lives in the `roadLevel`
  layer of its deck tiles, so traffic reads it through `roadCapacity` and saves / the hash carry it;
  `upgradeBridge` (undoable) charts 30 / 70 credits per tile. Bridge decks used to carry the highway level; the
  scenario now leaves them at Standard and the v19 migration resets them.
- **Bridge panel** (`Hud.selectBridge`): a click on a deck sends `selection:changed` with `bridge` (and `road`, so
  road listeners still react); name, type, ends, length, traffic, capacity, a level ladder, age, builder, flow,
  peak, Upgrade. It re-reads on `mobility:updated` without replaying its entrance (`.ix-quiet`). Inventory `bridge`
  objects come from the records (metrics: length, level, traffic, capacity, ageDays; `jammed` over 90%).
  `BridgeRenderer.dressLevel` adds rail lamps (Lantern) and planters plus lit gateways (Grand) from existing pieces.
- **Roadworks** (`modules/roadworks/`): `schedule(tiles)` times every newly laid tile of a `road:changed` batch:
  a survey beat, then land tiles in path order (30–80 ms each), bridge runs with piers first and the deck closing
  from both banks; a job fits 7 s. The road material raises each tile from under the ground with a flash
  (`aBorn` per vertex, `RoadRenderer`); deck slabs, piers and the span's signature structure grow in on the same
  timeline (instancer grow delays). Sparks, dust, pier spray, survey stakes and opening confetti reuse the
  `firework` material (written once, flown from `U.clock`); a new bridge gets a minor moment with its name; sounds
  on the `roadworks` cue. Nothing animates while a city loads.
- **Builders and cost to date** (`sim/builders.ts`, `City.builders` / `City.spent` by serial): `build` and `road`
  take `by` (default `player`; Flora's tools pass `flora`; scenario and scripted content is `system`). Every credit
  spent on a building is booked (`addSpend`): its price, then upgrades, renovations, Bloom Retrofit (an even share),
  banyan merges, repairs and moves; undo takes it back. Shown in the inspector and as the inventory metric `cost`
  and tags `by-player` / `by-system` / `by-flora`. Save v19 (builder code and spent per building, named bridges).
- **UI**: City Pulse starts folded. Toasts, crisis cards, the council warning, the fire panel, the tornado /
  tsunami Prepare panel and the happening card each have a ✕ (`ui/closeX.ts`); a closed alert returns only for a
  new incident (a new fire, threat or crisis, or a request that changes state).
- **Measured** (headless, vs a HEAD worktree): main thread 23.7–24.0% vs 24.1–24.4%, draws 277 / 258 downtown
  unchanged, boot unchanged (scenario ≈450 ms, modules ≈415 ms); the roadworks mesh draws only during a job.
- **Known**: `tests/pacing.test.ts` fails with `ROAD_REACH` = 10 (passes at 3): the scripted steward's population
  crashes at ≈45 min and never charters the sky-lanes. Left for the owner of that change.

## D-129 — Buildings join the largest network in reach; forgiving object picking (2026-11-07)

- **Network choice** (`sim/networks.ts` `networkFor`): with `ROAD_REACH` = 10 a lot often has several highway networks
  in reach, and "nearest ring, then lowest id" put buildings on stubs of street cut short by lots (no plant, no
  water works): in the fresh-island pacing run a new street laid round existing lots dropped 1 375 residents to 927
  and the sky-lanes never came. A building now joins the **largest** network in reach (road tiles, `size` from
  `recompute`), then the nearer, then the lower id. Real fragments (a separate district with its own plant) keep
  their buildings; a stray building beside a 3-tile stub joins the trunk.
- **Pacing** (`tests/pacing.test.ts`, unchanged targets) now passes at reach 10: Flora 14 min, sky-lanes 72, Aeroline
  started 107 (was 32–36 / 97–101 / 137–143 at reach 3): the wider reach makes the opening markedly easier.
  `tests/assistant.test.ts` "connects an isolated highway network" picked "the smallest power-short network", which
  is now the main grid itself; it now picks a separate network with buildings and checks it joins the main grid.
- **Picking** (`modules/construction/pick.ts` `pickObject`): the select, bulldoze and weave tools no longer read only
  the ground tile under the cursor. The pointer ray is walked tile by tile (from below the city's tallest structure
  to the ground); buildings (footprint × drawn height, `BuildingRenderer.verticalExtent`, level included) and
  bridges (deck plus towers, arches and cables by type) on each tile and its neighbours are tested as boxes padded by
  ≈6 px of screen (×2 on touch); the nearest along the ray wins. A miss falls back to the ground tile, then the
  nearest building or bridge within the margin, then a highway tile. Hovering highlights the picked building or
  bridge deck. ≈0.01–0.04 ms per pick. `scripts/scenes/pick.js` clicks a tower's upper floors, the ground beside
  it, a bridge's arch and its deck edge.

## D-130 — The build gate: every "can't build it" says what to do next; milestone card in the right column (2026-11-07)

- **Why**: "At most 3 for now: more as the town grows" (fishing docks) and a bare "Locked" stopped players with no
  way forward. `sim/buildGate.ts` (`buildBlock`) explains a block (locked behind a project, at a `limit`, short of
  credits) and lists next steps, each with an action (`place` a building, open a `category`, `start` a ready project,
  open `goals`, open the `credits` guide). The limit maths is `sim/limits.ts` (pure, no imports) so
  `City.checkPlacement` shares it: "3 of 3 built: the 4th opens at 600 residents (134 now)".
- **Surfaces**: Build panel cards show the block ("3/3 · next at 600 pop", "Locked"); a click on a locked or capped card
  pins its explanation card with the steps instead of picking up a building that can't be placed; the steps
  (`ui/gateSteps.ts`) sit first on the card. The placement tooltip and a refused click toast say why and, for a
  block, the first step. The milestone card's Build button turns into the way forward when its building is blocked.
  Lot refusals (steep, occupied, no highway) also say what to do. Planners (`proposals`, `statGuide`,
  `seasonGuide`) skip `unavailable` buildings (locked or capped), so they never suggest a dock past the limit.
- **Services**: `pulse.show(tab)` opens a City Pulse tab; `statinfo.open(id)` opens an indicator guide.
- **Milestone card** (desktop) moved from its own absolute spot (which sat on the inspector) into the head of the
  right column (`hud.right`): the inspector and the advisor stack under it, and while something is inspected it
  shrinks to its pill (clicking the pill closes the inspector and unfolds it). Phones hide the strip while the
  inspector sheet or build mode is open.
- **Build panel steadiness** (same day): hovering across cards swapped the explanation card's height, so the column's
  scrollbar came and went (the panel jumped sideways) and a shorter card clamped the scroll (the list jumped under
  the pointer). `.bd-scroll` reserves its gutter (`scrollbar-gutter: stable`) and the card holds the tallest height
  of a hover sweep until the pointer leaves the panel. The floating 3D preview hides while a building is in hand
  (hovering a card brings it back), leaving the map clear for placing.

## D-131 — Content Security Policy and hardening headers on web and desktop (2026-11-07)

- **Why**: a security scan found the desktop webview ran with `csp: null` (any injected script could call every Rust
  command) and the web build sent only the isolation headers (no CSP, framing allowed, no `nosniff`).
- **Web** (`firebase.json`): CSP `default-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'` (wllama compiles wasm),
  `worker-src 'self' blob:` (wllama starts its workers from blobs), `style-src 'self' 'unsafe-inline'` + Google
  Fonts (SVG markup carries `style` attributes), `connect-src` Hugging Face (`huggingface.co`, `*.huggingface.co`,
  `*.hf.co`: downloads redirect to `us.aws.cdn.hf.co`), `object-src 'none'`, `frame-ancestors 'none'`,
  `upgrade-insecure-requests`; plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that turns off camera, mic,
  geolocation, payment and USB. `vite preview` reads the same header list from `firebase.json`, so a break shows
  locally; the dev server keeps isolation only (HMR).
- **Desktop** (`tauri.conf.json`): the same policy as a `csp` object, with `ipc: http://ipc.localhost` in
  `connect-src` (`devCsp` adds the HMR websocket). `dangerousDisableAssetCspModification: ["style-src"]`: Tauri
  otherwise adds nonces to `style-src`, which makes browsers ignore `'unsafe-inline'`.
- **Verified**: production build under the CSP boots on WebGPU and WebGL, fonts load, a blob worker compiles
  wllama's wasm, and a ranged fetch of a pinned model follows the CDN redirect, with no violations.
- **Rejected**: `'unsafe-eval'` (nothing needs it), `connect-src https:` (too broad).

## D-132 — Hands-on buildings: doors to walk through, lights to switch; the Work Dome as a real workplace (2026-11-07)

- **What**: walking the streets, a card names the building in reach. **E** opens or closes its door when the steward
  stands at one (the Mycelium Work Dome's two glass leaves slide apart into the portal's walls), **L** switches its
  lights (every glowing piece: lamps, screens, signs, light panels; and its lit windows). Doors close by themselves
  once the steward is ~2.4 units away. Sounds on `building:interact` (a hiss for doors, a click for lights).
- **Render-only**: a door or a switch changes how the city looks, never the sim, so no command, no hash, no undo.
  Lights are kept in the save by building uid (module hook `interact`); a new city starts lit. Lit windows return to
  power × occupancy when the lights go back on.
- **Data**: `door` on a recipe piece (slide in its own widths along its local x, signed) marks a leaf; the collider
  skips leaves while the building's door is open and cuts a doorway (`PASSAGE_DEPTH` either side) through hollow
  shells. `glassDome` is the first hollow piece (a `domeClear` skin with only its surface solid), so the dome's floor
  is walkable. `ChunkedInstancer.setMatrix` moves a leaf in place (it stays in its chunk's batch).
- **Plinths are front steps**: a lot standing up to `PLINTH_STEP` (0.4) above the street is climbed, and the body is
  tested from the ground it steps onto (probed a body radius round), or a lot's own floor walled the walker off.
- **Work Dome**: clear glass (its own `domeClear` material, not the frosted shared `dome` used by 31 buildings), the
  trees inside removed, and a workplace: seven desks facing the glass (chair, laptop on the new `screen` piece,
  mycelium desk lamp, a hanging light panel), a shared round table, fungus floor lamps. Two new pieces: a draw
  call each per visible chunk that holds the dome.
- **Front steps**: lots stand on their highest corner, so a door on the low side can be a storey above the street
  (7 of 51 showcase Work Domes: 0.4–1.0). `doorSteps` lays stone treads (rise 0.1, under the walker's step) from the
  lot's edge before the door down to the ground; the renderer draws them and the collider walks on them, from the
  same function. Tested on the showcase dome at (289, 312), whose door stands ~1 unit up.
- **Laptop screens**: a canvas atlas (`render/materials/display.ts`) of four BloomGrid apps (splash with the
  wordmark, City Pulse, code, island map); the `screen` material picks a frame per laptop on its own cycle and draws
  the moving parts in the shader (loading bar, live chart, current line + caret, radar sweep), fading them to the
  atlas once a screen is a few pixels wide. The lid shows a glowing logo. The hanging lights moved to `lumenRib`
  discs so the `screen` material is only screens.
- **Cursors** (`ui/cursor.ts`): a dark-teal arrow with a leaf (default) and a bright teal arrow with a bloom (clickable),
  drawn on a canvas at 1x and 2x and published as `--cur-default` / `--cur-pointer`; every `cursor: pointer` in the
  CSS uses the variable with the system cursor as fallback. PNG, not SVG: SVG cursors are blurry or unsupported in
  some webviews. The arrow silhouette and tip hotspot stay standard so aiming feels the same.
- **Next**: more buildings with a designed door and room (homes, the library, cafés); `interact` switches in the
  inspector for the city view.
- **Rejected**: point lights per room (a pipeline and a shadow cost per light); hinged doors (a sliding leaf needs
  no pivot data and never swings through the steward); saving open doors (they close on their own).

## D-133 — Building signs; residents walk in and out of doors (2026-11-07)

- **Signs** (`src/modules/signs/`): a recipe marks sign surfaces with `sign: 'name' | 'number'` on a piece (the kit's
  `entrance` name strip and `door` panel do this, so ~46 recipes have them for free). `signSpots` finds each
  surface's outward face; a building with none gets a number plate mid-front. Name boards carry the building's name
  (glyphs ~0.065, readable from the closest city view), number plates its readable id (`buildingId`, ~0.04) on the
  door's upper part; a named building without a door plate gets its id under the board. Mint on deep teal / cream
  on charcoal, glowing softly at night.
- **One draw call, no text textures per building**: one instanced quad per sign; text rides in three vec4 attributes
  (three base-96 glyphs per float, 33 characters, count + kind in the last float) and the shader reads glyphs from
  a monospace atlas drawn once. Glyphs fade under ~4 px (no shimmer, D-064); the mesh draws only within 30 of the
  city camera or in explore modes; rebuilt (debounced) on building and ground changes.
- **Door trips** (walkers, D-122): up to a quarter of the crowd walks the pavement, turns at the kerb point before a
  building's door and steps in (or out and away). `doorwayOf` gives the door (door leaves, else number plate, else
  name strip, else front); the walker finds the road out of it, the pavement on its side and the climb (≤ 0.3, or
  ≤ 1.2 with front steps). Encoded in the existing `aSeg` / `aInfo` (trip kind in `info.z`'s integer part): the
  figure is at WebGPU's 8 vertex-buffer limit. Checked: in Westbrook all 211 trips start on pavement and end on
  their building's lot.
- **Rejected**: per-building canvas textures (uploads on every pan, D-077 power budget); HUD-floating labels (the
  ask was signage on the building).

## D-134 — Street detail: kerbs, pavements, markings; four kinds of hover vehicle, fewer of them (2026-11-07)

- **Road geometry** (`RoadRenderer`, `TileBuilder`): a paved tile (Living Highway, Boulevard, bridge deck) facing open
  ground is a 6×6 vertex grid: carriageway in the middle, a pavement band (`PAVE_W` 0.13 / 0.17 by level) raised
  `KERB_H` (0.028) along each open side with a near-vertical kerb face, and a skirt down into the ground under the
  open edge. The kerb drops to the carriageway where the neighbour's pavement doesn't carry on (crossings,
  junctions, a width change). Raw tracks and junction interiors stay one quad. One mesh per chunk as before (no new
  draw calls); `aMask` / `aOvergrowth` / `aLevel` / `aBorn` are packed into one `aRoad` vec4; normals are written,
  not computed. Walkers (`paveRise`), roadside fungi and boulevard trees / lamps stand on the raised pavement;
  boulevard trees moved into a planting strip behind the kerb (0.385 from centre), fungi to the outer edge.
- **Road material**: dark permeable eco-paving with moss joints and a moss gutter at each kerb, white lane-edge lines,
  pale stone flag pavements (boulevards: a flower strip behind the kerb), kerb caps, zebra crossings on the
  approaches to a junction (mask bits 4–7 flag a junction neighbour); the cyan pollen guideline is unchanged.
  Joints and zebras use `stripes()` so they fade to their mean far out: flicker probe identical to before at
  12–260 tiles, day and night.
- **Vehicles** (`mobility/carModel.ts`): compact car, micro bubble-car, delivery van with a planted cargo roof and a
  teal solar shuttle bus, merged into one geometry (`aType`, `aPart`); the shader keeps each car's kind
  (`CAR_MIX` 56 / 22 / 14 / 8 %) and collapses the rest, so the mix costs no draw call (≤ ~200 visible tris per
  car). Cars now face their direction of travel (heading-rotated position and normals), keep to ±0.16 lanes and
  hover 0.03 over the road. Up close: smoked glass with a sky fresnel, solar roofs with busbars, a nose light bar
  and skids in the traffic tint, red tail bars; once a car is under ~10 px it turns into the old single-tint
  swatch (D-064) so the congestion read-out at night survives.
- **Fewer cars**: `AGENTS_PER_TILE` 4 → 1.5, and a run's car count is rolled (`floor(expected + hash)`) instead of
  at least one per run: ≈965 → ≈213 cars island-wide at morning rush in the founding city; busy roads keep traffic,
  side streets are mostly empty.
- **Rejected**: one `InstancedMesh` per vehicle kind (+3 draw calls, near the 300 budget); car shadows (sub-texel
  at the shadow map's resolution, no visible gain for a shadow-pass batch).

## D-135 — The Aurora Gemini: a twin landmark at the island centre; the Wellspring Spire moves out, smaller (2026-11-07)

- **The building** (`content/buildings/aurora-gemini.ts`, 14×14, the founding city's centre block): two identical
  round glass towers (32 storeys of `glassCyl` drums, ~56 tall with spires) on a plaza with a lily canal, living root
  buttresses, round lobbies with sliding doors (E in walk mode) and a lit entrance. Light ribs spiral up the drums;
  round sky-garden lawns cantilever past the shaft every few storeys (green bands from afar). A garden bridge and a
  sky-pool bridge link the towers, and the pool pours a waterfall into the canal. The **Sun Gate** hangs between the
  spires: three Aurora Rings with golden light-rib rays (petals were flat and vanished edge-on; round ribs read from
  any side). Designed levels: a light bridge and ivy (2), a crossed gyroscope ring, taller spires and gold beacons (3).
  Only existing kit pieces, so no new instanced batches.
- **Stats**: mostly homes (600 residents, 240 jobs). As offices (360 jobs) the twins pulled commuters in from the towns
  and the showcase's traffic flow fell under the zoning guard (0.847 < 0.85); homes at the centre bring it to 0.853.
- **Interactions** (`modules/aurora/`, render-only): golden searchlights sweep from both crowns at night; **Light show**
  (42 s: beams fan out, speed up and cycle the spectrum, an aurora curtain ripples over the Sun Gate); **Sky deck**
  (rooftop explore mode on the highest sky-garden); **Postcard** (clears the selection, frames both towers whole,
  photo mode). Beams and curtain are one additive mesh posed in the shader (sweep angle advanced on the CPU so speed
  changes never jump), drawn only at night or during a show. Inspector buttons come through a new generic hook,
  `hud.buildingActions(eid => buttons)`.
- **Camera `aim`**: `CameraView.aim` lifts the orbit point above the ground so a tall landmark fits the frame (the
  Postcard, screenshots); any pan, `lookAt`, `locate` or new view resets it to 0.
- **Wellspring Spire**: the opening landmark until now. It moved to the end of the Working Hills quarter (by the lake)
  and is drawn at 0.7 through `scaled(b, k)` (a builder that scales every piece's position and size) on a 10×10 lot,
  ~29 tall against the twins' ~56, with half its stats. The Quartz Spire keeps its Civic Ring block. One spare hero
  lot fewer (9). The opening camera prefers the larger landmark, then the dearer one.
- **Rejected**: mirrored, counter-twisting towers in two colours (Sol gold, Luna silver): the steward asked for
  identical round twins. A sky-pod port on the twins (`transit`) lowered the flow further. Draw calls at the wide
  views (346 near-horizon, 364 overview) are the same as before this change: over budget already, not made worse.

## D-136 — Sky deck and Postcard for every landmark; a free stroll on rooftops (2026-11-07)

- **Every landmark** (`isLandmark` in `explore/roof.ts`: a hero, a `landmark` def or a big one-of-a-kind at least
  4 tall, not a rail station) gets **Sky deck** and **Postcard** in its inspector, from the explore module (they
  were the Aurora Gemini's only). The twins keep **Light show** (it needs their crowns).
- **Sky deck** stands the steward on that building (`explore.standOn(eid)`), not the nearest landmark. Spawn: the
  flat roof `findRoof` picks if it's clear, else the highest spot the collider finds on top with room to stand (most
  of a ring of neighbours open at about the same height). 13 heroes had no `findRoof` roof; all have a deck now.
- **Free stroll**: rooftop mode moved like walk mode, through the collider (walls, railings, trees and crowns block;
  kerb-height steps climb), instead of being held to `findRoof`'s eroded flat cells. That held the steward to 0.9 m²
  of scattered pockets on the twins' terrace (trees, ribs and rails cut it up), so it barely moved. Two guards keep the
  steward on top: a move never drops more than `LEDGE` (0.45) and never leaves the lot. Probe: every landmark walks
  the full distance of a W/D/S/A key run, except the Fog Harp (about a third: its strings stand close).
- **Postcard** frames any landmark whole: distance from its height and footprint, orbit point (`aim`) at half its
  height, current heading, photo mode; it clears the selection first.

## D-137 — Police drones: a heavy drone on the Harmony Gate, a patrol wing over the bay (2026-11-07)

- **Model** (`modules/police/droneModel.ts`): one quadcopter about a tile across: a white-over-navy teardrop shell
  with a police-blue stripe, a cyan sensor eye under the nose, a headlamp strip, a red/blue light bar, a tail fin,
  four ducted rotors on swept arms, landing skids. Parts in `aPart`; rotor blades carry their hub (`aHub`).
- **Heavy drone**: the same model at 3.6×, parked on a new pad in the Harmony Gate's keystone garden (`DRONE_PAD`:
  a navy deck with blue and white light rings and red/blue corner beacons; the centre tree gave way, and the level-3
  dome and spire moved aside). It turns with the building and idles its rotors.
- **Patrol wing**: seven drones on four loops over the bay (the Bayfront waterfront, round Bloomtopia, the east bay
  and river mouth, the west bay) at 19–24, above the bridge towers (≤ 18), banking into their turns, bobbing, light
  bars double-flashing red then blue on their own beat, and at night a soft searchlight swinging over the water.
  They fly while a Harmony Gate stands (their station); loops are fixed bay coordinates.
- **Cost**: render-only, posed in the shader from static per-instance data and `U.clock` (no per-frame uploads), two
  draw calls (drones; beams only at night), capacity 1040 per batch (AGENTS.md §8).
- **Gotcha found**: the searchlights darkened the bay under them. With multiple render targets, a transparent mesh
  that writes the bloom input (`emissive`) with alpha 1 replaces the water's night glow there, so the bloom drops.
  The fix: write `vec4(rgb, opacity)` so the bloom input blends like the colour. (Additive beams showed it too.)

## D-138 — The Aegis Watch Precinct: a police headquarters hero with dispatchable drones (2026-11-07)

- **Building** (`content/buildings/aegis-precinct.ts`, 10×8, utility, `response: { radius: 36 }` so it fights fires
  like a large Ember Watch): a white-frame, navy-glass hall with lit floor bands, red/blue light strips on the
  roofline and blue corner fins; a glass command drum with blue rings and a red/blue light-bar crown; a comms mast
  with a dish and red beacon; a star badge over a deep entrance canopy with sliding glass doors; flagpoles, planters,
  benches and lamps on the plaza; a railed rooftop drone deck with two pads (`POLICE_PADS`). Levels: an east-wing
  storey with solar panels and a garden on the lookout (2); a taller mast, a third ring and a glass command crown (3).
- **Showcase**: last hero of The Exchange (toward the bay the patrols cover); one spare hero lot fewer (8).
- **Drones**: the police module parks two drones per precinct on its pads. **Dispatch drones** (inspector) sets their
  take-off and landing times (`aSortie`, one ranged upload); the shader grows their loop radius and height from
  the pad over a 5 s ramp, circles the precinct for ~45 s and sets them down again. Pressing it while they fly
  pushes the landing back without a second take-off. Patrol loops now fly while a Harmony Gate or a precinct stands.

## D-139 — Moving parts on heroes: wheels, rides, rotors and a working clock (2026-11-07)

- **Recipe field** `spin` on a piece (`Spin`): turns at `speed` rad/s about `axis` through `at`; `upright` keeps a
  gondola level while it travels round; `lift` runs a lift-and-drop cycle (slow climb, pause, sudden drop, rest);
  `clock: 'hour' | 'minute'` sets the angle from `city.timeOfDay`. Recipes tag only parts whose turn shows (spokes,
  buckets, gondolas, seats, chains); rings and round drums stay static.
- **Animated** (render-only, like doors, D-132): the renderer keeps each building's moving parts and rewrites their
  matrices per frame, generalising the door-leaf path. Only buildings in the view frustum within `MOTION_RANGE`
  (240) are posed; motion eases up and down over ~2 s; clock hands write at 4 Hz. Removed handles (level changes)
  are pruned. Perf at the default view is unchanged (≈24% active, 290 draws); near Bloomtopia ≈130 matrices a frame.
- **Heroes**: Great Noria (wheel), Bloom Eye (wheel, level gondolas), Bloomtopia (Sky Orbit, Firefly Carousel,
  Dandelion swings, Bloom Cups, Petal Drop, level-2 balloon ride), Helix Spire (crown rotor), Bloom Clock (hands show
  the city's time). The Bloom Clock's hands were redrawn at twelve so the angle is the time.
- **Action**: `motion` on a def labels a Stop / Start button in the inspector (interact module), with a motor sound;
  stopped buildings are saved by uid in the interact save hook. Everything runs by default.
- **Not done**: the Comet Loop's train along its track (needs a path, not a pivot); colliders use the rest pose.

## D-140 — Solid ground in explore modes: camera clearance, stone embankments, seated flora (2026-11-08)

- **Problem**: walking on a slope with a low camera, the third-person camera sank into the hill behind the steward
  (its floor was sampled at last frame's camera spot, and the smoothing trailed into the slope) or sat 0–2 cm above
  it, so the near plane (0.02) cut through the ground: the single-sided terrain turned see-through and buildings
  showed their undersides. A probe over six steep spots measured the camera up to 5 cm under the ground.
- **Fix** (`chase` in `modules/explore/index.ts`): the floor is `floorAt` at the camera's destination and again where
  it lands after smoothing: the walkable ground there (`groundAt` near the target's height), the terrain over a ring
  `CAM_RING` wide (the near plane's reach) and the sea, plus `CAM_CLEAR` (0.1). A hill between camera and target
  pulls the camera in like a wall (`terrainReach`). Walk, roof, board, drone and balloon all use it.
- **Embankments** (`world/Terrain.ts`): terraces are levelled up to the edge of water that stays (reservoirs, river,
  sea), so the ground drops 3–4 units inside one tile there. Smoothed vertex normals lit those faces like level grass
  and their colour blended sand into grass: from the water they read as a pale, see-through sheet with trees floating
  on top. Faces steeper than ≈65° (true face normal from screen derivatives) are now drawn as a stone embankment:
  courses along the grid axis the wall faces (`normalGeometry`), lit by `normalFlat`, mossy and stained at the
  waterline. Guard every normalisation in that branch: a NaN there blackens all terrain even at zero weight.
- **Flora** (`world/Flora.ts`): plants stand on the lowest ground under their foot (`FOOT`), skip spots where it falls
  more than `MAX_DROP` (no bush stuck to a wall, no trunk hanging over an edge), and crowns hang from their trunk's
  base instead of the ground under each crown blob (a crown over a drop used to sink with it).
- **Rejected**: double-sided terrain (hides the symptom with the hill's back faces; still wrong framing); softening
  the terraces' banks in the sim (changes the founding city's lots, roads and balance; worth doing separately).

## D-141 — Cruise ferry *Tidesong* and the BloomGrid Sky Guard jet; free-standing objects in the inspector (2026-11-08)

- **Ferry** (`src/modules/ferry/`): a 22-tile solar-sail cruise ferry (`ferryModel.ts`: lofted hull, four deck houses,
  sun deck with pool, slide and dome, sky garden, spinning sky wheel, helideck, wing-sails, lifeboats, tourists, name
  boards from a canvas texture) on a timetable: board 30 s → astern off the berth → turn in the basin → sail to one
  risen sea wonder, a sightseeing loop round it, home. One wonder per voyage in `SITES` order; a charter replaces the
  next. Render-only like the police drones (D-137): no sim state, nothing saved, not in the hash; a reload restarts the
  timetable. Posed by its object matrix each frame (no buffer uploads); wheel spin and tourists in the shader.
- **Routing** (`ferry/route.ts`, tested in `tests/ferryRoute.test.ts`): A* on 4-tile cells that are deeper than the
  draught everywhere, keeping 2 cells of clearance (narrow water costs more), string-pulled, then Chaikin-smoothed
  after splitting legs into 6-tile pieces (a cut on a long leg swung the course over the headland it was pulled round).
  Bridge tiles and the Aeroline's pylons (`aeroline.pylons`) close cells: the pylons, 11 tiles apart, fence the bay,
  so courses never thread the viaduct. The pier (`findPier`) is the shore point nearest `PREFER` (the Bloomtopia
  islet's east shore, outside the Aeroline's loop) with a clear deep strip straight out; it is placed again if the
  Aeroline rises or falls later.
- **Requests**: Depart now, Full ahead (×2 to the end of the voyage), Charter, Deck show (`show` uniform: lamps,
  waterline and wheel run a rainbow), Horn (`ferry:horn` sound), Ride aboard (explore mode `ferry`), Locate.
- **Jet** (`src/modules/skyguard/`): a delta lifting body with a raised spine, gold canopy, canted twin fins and three
  engines; the wing top, belly (mirrored mapping, so it reads from below) and fins read one 1024² livery atlas drawn
  on a canvas (`liveryTexture`: emblem, BLOOMGRID / SKY GUARD). The patrol is a pure function of a phase
  (`flight.ts`, CPU and TSL): a figure-eight with harmonics for sharp ends and height changes; the CPU integrates the
  phase (afterburner speeds it), banks from the curve's lateral acceleration and rolls at each centre crossing; the
  contrails evaluate the same curve at earlier phases in the shader (no uploads). Requests: Chase cam (explore mode
  `jet`), Victory roll, Afterburner, Display smoke. `skyguard:pass` sounds a roar when it passes the camera.
- **Inspector for free-standing objects**: `hud.objectInspector(key, read)` registers a sheet (`ObjectSheet`: title,
  vitals, body, rows, actions) that `selection:changed` with `object: key` opens and the HUD re-reads twice a second.
  Clicks reach it through `registerPickable` in `construction/pick.ts` (the ray tested in the object's own frame against
  a local box, padded for the fast jet).
- **Cost**: ferry 2–3 draws (ship incl. name boards, wake under way, pier), jet 2; all frustum-culled (the trail's
  bounds follow the jet), so views without them add none; ≈+5 at the full-island overview. `ferry.sail` and
  `skyguard.fly` ≈0.006 ms a frame each.
- **Rejected**: sim-side ferry state (tourist income, saved voyages): scenery has no gameplay stake and the cruise
  happening (D-123) already covers visitors; instanced shader-posed ferry (one ship gains nothing and the ride camera
  needs the CPU pose anyway); a pier in the bay inside the Aeroline loop (the viaduct crosses the berth).

## D-142 — Dynamic resolution judges the median frame, after a boot hold (2026-11-08)

- **Problem**: on Ultra the picture went soft. `DynamicResolution` judged each 1.5 s window by its mean fps, so boot
  (uploads, the 6 s fly-in, buildings growing in) and one-off hitches cut the scale by 0.1 a window, down to 0.6;
  it climbs back only 0.05 a window and only while fps ≥ 97% of the cap, which a real display that jitters round
  57–59 fps may never reach. Measured headless on Ultra at DPR 2: scale 0.6 at boot, 0.85 still after 12 s.
- **Choice**: judge by the window's **median** frame time (a GPU that can't keep up is slow on every frame, a hitch is
  one frame), and `hold(seconds)` skips judging after boot (4 s at engine start, 8 s from the fly-in) and after a
  loader city change (5 s), resetting to full scale. After: 1.00 (pixel ratio 2) from the first sample.
  Frame times go into a preallocated buffer (no per-frame allocation). Tested in `tests/dynamicResolution.test.ts`.
- **Rejected**: turning dynamic resolution off on Ultra (a slower GPU still needs it to hold its frame rate);
  a lower recovery threshold (it would oscillate between scales on a GPU that is really borderline).

## D-143 — Moving solids in the explore collider; the ferry's closed stern (2026-11-08)

- **Problem**: the Tidesong's transom fan stopped at the hull's U and left the strip under the deck edge open, so the
  stern gaped; and the collider only knew buildings, trees and terrain, so a swimmer, board, drone or chase camera
  slipped straight into the hull and deck houses.
- **Decision**: the transom gets its closing triangle and the bow a stem plate. `collider.addMover({ world, boxes,
  radius })` adds a solid posed live by a matrix (null while hidden): `hits` tests its boxes in its own frame, and
  `groundAt` stands walkers on its box tops. The ferry registers `ferrySolids()` (`ferryModel.ts`: hull slices along
  the taper and sheer, deck houses, wheelhouse, dome, sky wheel, helideck) posed by `vessel.matrix` (updated in
  `sail`). A new moving thing that people can reach in explore modes should register boxes the same way.
- **Rejected**: per-triangle collision against the merged mesh (thousands of triangles tested per query, many queries
  per frame); a single box round the ship (walls off the open decks and the bow's taper).

## D-144 — Police drones, the cruise ferry and the Sky Guard jet are unlock projects (2026-11-08)

- **Problem**: on a fresh island the Tidesong sailed from the first minute (the lighthouse is a start wonder), the
  Sky Guard jet always flew, and the Aegis Watch Precinct could be built at once: the late-game spectacle needed no
  progress.
- **Decision**: three projects in `PROJECTS` (`sim/projects.ts`), shown on the Goals tab, in Flora's goal tools and in
  the build gate like the others:
  - `police` (Aegis Watch charter, ◈5,000, 1 day): 3,000 residents, an Ember Watch Station, harmony 60. The precinct
    `requires` it; the police module draws no gate drone or bay patrols before it.
  - `cruise` (Tidesong cruise line, ◈8,000, 1.5 days): 4,000 residents, a sea wonder beyond the start ones, a Weather
    Radar. The ferry module shows ship and pier only once it is open.
  - `skyguard` (Sky Guard air wing, ◈18,000, 2 days): 8,000 residents, the Aegis Watch charter, a Zephyr Airship
    Port, a Weather Radar. The jet and its trails are hidden and the chase cam refused before it.
  Each gets a grand ceremony on `project:done`. Without progression (showcase, tests) all three are open.
- Each project needs a building the pacing test's scripted steward never builds, so the early timeline it guards is
  unchanged. Saves are unaffected (unlocks are string ids); a fresh island saved before this keeps a built precinct
  but must earn the patrols, the ferry and the jet.

## D-145 — City tour: an automatic flight round the island (2026-11-08)

- **Problem**: the island holds dozens of landmarks, wonders and moving spectacles, but seeing them meant flying the
  camera by hand or riding one mode at a time; there was no way to sit back and admire the whole achievement.
- **Decision**: a **City tour** view mode (`'tour'` in `ExploreMode`, second in the view menu, also Flora's
  `explore_mode`). `modules/explore/tour.ts`: `planTour` picks stops (opening overview, up to 7 landmarks spaced
  26 tiles apart by height, up to 4 largest districts with buildings, visible sea wonders, and the Aeroline / Tidesong /
  Sky Guard as moving stops, then a closing overview) and orders them downtown-first (nearest neighbour from the stop
  nearest the centre), then outward by bearing with a 2-opt pass. `TourDirector` flies an orbit pose between stops
  on high arcs (smootherstep, lift with distance, looking down mid-flight), arriving from the side it came from and
  circling each stop with an eased-in spin; moving stops swing round behind their heading. `tourView.ts` draws the
  letterbox, captions, progress and a pause / next / end strip (Space, Tab/→, Esc).
- The tour drives the **city** camera through a new `CityCamera.cinematic` flag (input and locate ignored, pose written
  by the explore system) instead of disabling it like the street-level modes: many modules read
  `cameraCtl.enabled === false` as "explore" (walker LODs, critters, signs, weather), and a flyover wants the city
  view's. Near/far and the sky dome stay as in the city view. The camera keeps 2.5 above the highest top round it
  (`collider.groundAt`).
- **Clear views are chosen before the flight, not fixed after it**: when a leg sets off, `TourDirector.frame` tries
  arrival bearings (0, ±0.45 … ±2.1, π off the travel side) and extra tilts (0 … +0.55) until the whole circle (four
  points along the hold) sees the stop (`collider.reach`) with room above the roofs. A first version tipped the
  camera up reactively once a tower hid the stop; in the dense centre (Dragonfly Skyport, Bloom Eye) that kicked it
  ≈20 units back up just after it had landed and left it hovering, which read as the camera sticking.
- **The city holds still while the tour flies**: the tour saves `engine.speed`, sets 0 and restores it at the end
  (like photo mode); the pause card treats `#hud.touring` as a hold that isn't the player's. `U.clock` runs on, so
  trains, the ferry, the jet, rides and water keep moving.
- Render-only: nothing saved or hashed. Measured (headless, founding city): 60 fps with no frame over 16.7 ms
  through the tour. Wide frames reach 300–400 draw calls (the jet chase and district views at altitude), the same as
  the city camera at the same pose (checked pose for pose): the cost of how much island is in view, not of the tour.
- Rejected: a fixed hand-authored path (the trailer's approach) — it can't follow what the player built, and a
  fresh island has none of the showcase's landmarks.

## D-146 — Detailed sea wonders, a `wonder` material and tinted shapes (2026-11-08)

- **Problem**: the five sea wonders were a handful of primitives each in one matte finish (a striped tube on a grey
  blob, bare white hoops, flat pads, a saucer, sandy cylinders with ball trees): weak as the City tour's and the
  cruise ferry's destinations.
- **Decision**: rebuilt in `modules/scenery/wonderModels.ts`, still one merged mesh (one draw call) each and inside
  the ferry's loop radii:
  - *Tidewatch Lighthouse*: octagonal stone plinth with door and steps, banded tower with trim rings and a spiral of
    lit windows, corbelled gallery and railing, lantern room with a lens, verdigris dome, ventilator and vane; a
    gabled keeper's cottage (solar roof, chimney, lit windows, flower boxes), palms, flowers, a jetty with a lamp
    and a lifebuoy, a moored sailboat. The beam turns at `LANTERN_Y`.
  - *Tide Gates*: pearl rings with bronze inlay, a lumen inner ring, glowing runes, a crown jewel in a brass
    setting, pearl shell fins, stepped stone plinths, branching and brain coral, sea fans, red/green channel buoys.
  - *Lotus Atoll*: four whorls of cupped petals pale at the base, seed pods with glowing stamens, pads with rims,
    veins and water beads, closed buds, raised leaves on stalks, floating lanterns, a tea pavilion.
  - *Abyssal Dome*: raking legs, pearl hull and timber deck with railing and lamps, ribbed and banded glass dome,
    observatory cupola with telescope, dish and beacon spire, brass-framed solar petals, a pier with a yellow
    submarine, a kelp farm.
  - *Verdant Pillars*: karst stacks (`pillar`: tapering, ribbed, wave-cut notch, wet foot), fallen blocks, jungle
    crowns (palms, broad-leaf trees, ferns, flowers), flowering vines, a waterfall with mist, plank rope bridges with
    lanterns, a treehouse and a sea arch.
- **Material**: `wonder` (`render/materials/wonder.ts`) reads `aSurf` = (roughness, metalness, kind): stone mottling,
  strata and a darker wet band at the water; pearl iridescence at grazing angles; glass with a sky rim; leaf, sand and
  wood variation; falling water bands. Every pattern fades to its mean by `fwidth` (flicker probe: 0.02% on the
  gates at night). `scenery` is unchanged (eight other modules use it).
- **Tinted shapes**: `GeoBuilder.add` folds a source shape's per-vertex `tint` (> 0 toward white, < 0 darker) into the
  colour, so a petal is pale at its base and a pillar dark at its foot within one part.
- **Cost**: ≈260k vertices for all five (≈14.5 MB; a first pass was 581k: surf flecks became flat hexagons, beads
  octahedra, thin rods capless five-sided tubes, thin rings fewer segments, canopy lobes detail 1). Scenery module
  init ≈47 ms (was ≈31). Draw calls unchanged; 60 fps with no frame over 16.7 ms framing each wonder.

## D-147 — Detailed sky pods, sky gates, Aeroline trains and viaduct (2026-11-08)

- **Problem**: pods were plain white teardrops whose dark oval windows read as holes; lanes were faint ribbons; the
  Aeroline's cars were plain white capsules on a plain grey girder with plain white columns.
- **Pods** (`mobility/podModel.ts`): a livery sweep over the lower flanks, a panoramic canopy with frames, a window
  band with mullions, stub wings carrying glowing ducted fans with red / green navigation lights, livery fin tips, a
  headlight bar. The pod is at WebGPU's eight vertex buffers, so no attribute was added: `aGlow` −2 marks the livery
  and the shader picks its colour from the pod's seed (`fract(aRouteInfo.z)`: teal, rose, blue, violet), gold for
  express trunk pods (speed 1.5). 4,104 vertices, fewer than before (4,392; its comment said ≈1.3k), guarded by
  `tests/transitModels.test.ts`.
- **Sky gates** (`mobility.laneGates`): one new instanced draw sharing the lanes' route attributes: three hoops per
  lane on the lane's arc (place in `uv.x`, oriented along the arc's tangent), sized to let a pod through (grand on
  express trunks), coloured like their lane, a pulse running gate to gate, faded by on-screen size; none on lanes
  under `GATE_MIN` (a dock's hop to its hub), which crowded the centre at night. Softer by day.
- **Trains** (`aeroline/Trains.ts`): built with the sea wonders' `Kit` in the `wonder` material: glossy body, glass
  window band with mullions, teal and coral livery lines, doors with lit lintels, solar roof in a frame with aero
  domes, maglev skirts with a levitation glow, gangway bellows between cars, LED light bars, red marker lights and a
  bloom emblem on the nose.
- **Viaduct** (`aeroline/Guideway.ts`): a planted strip along each fairing in the swept section, precast segment
  ribs down the girder every 3.6 units, deck lamps every 8 on alternate parapets, fluted pylons with a collar of
  glowing petals under the capital.
- **Cost**: +1 draw call (gates). Flicker probe at night: gates ≤ 0.022%, pods ≤ 0.054%, viaduct ≤ 0.069%. Perf
  against a worktree at the previous commit, three runs each: main thread 24.7–25.8% both, 60 fps both, GPU time
  inside the usual headless noise (4.2–8.5 ms both).


## D-148 — Welcome screen before the engine; boot only the chosen city (2026-11-08)

**Context.** A plain boot created the renderer, founded a fresh island, loaded every module and compiled shaders
(≈ 1.4–3.5 s plus the boot screen) before the New Chapter dialog appeared; choosing Resume or the showcase then
threw that city away and built another behind the loader.

**Decision.**
- `main.ts` is a light entry (≈ 48 kB JS): CSS, boot screen and `ui/welcome`. The game (three.js, content, modules,
  `MODULES`) is the dynamic chunk `game/boot.ts`. URL scenarios (`?scenario=` without `?wizard`, or `?nowizard`)
  boot straight in as before.
- The welcome dialog (`openChapter`, now independent of `GameContext`) reads only the save summary from platform
  storage and resolves a `GameStart` (`game/start.ts`): scenario + seed + difficulty (+ name, guide) or a save.
  `createGame(…, start)` builds only that city. A save is deserialized before modules load (like a scenario) and
  `SaveManager.restoreModules` runs the hooks after, then `load:done`; a save that fails to load falls back to a
  fresh island with a toast.
- While the player chooses, the chunk is fetched and `prepareCore` creates the GPU device and kit (memoized; the
  boot reuses it), so the boot after the choice starts at the scenario.
- Backdrop: `ui/welcome/Hologram.ts`, a 2D-canvas light-point island from `terrainHeight` (≈ 5k points, batched by
  colour into ≈ 10 fills, 30 fps cap, DPR ≤ 1.5, still under reduced motion). It morphs to the island each choice
  would open (sinks and rises on a seed change) and grows a city of light lines: the saved city's lots (registry
  loaded lazily via `tutorial/cityMap.ts`) or a procedural skyline for the showcase. The welcome is the boot screen
  held idle (`welcome` option of `createBootScreen`), so choosing flows into the boot readout on the same backdrop,
  and the usual iris opens onto the city. It stops once the game is in view.
- CSS cascade: module stylesheets would load after `theme.css` once modules became a dynamic chunk. `ui/cssOrder.ts`
  imports base → boot → every module CSS (eager glob, `ui/moduleStyles.ts`) → theme → mobile, so the entry CSS keeps
  the old order and the game chunk adds none.
- After the choice the island glides to the centre as a CSS transform on the canvas (`Hologram.glide`, own compositor
  layer, drawing snaps to the new place the frame the transform drops), and the heavy boot work waits the glide's
  0.8 s (`settled`): a canvas-drawn ease only got the odd frame once `createGame` held the main thread. The spin-up
  is eased too. Measured: 48 frames in the 0.8 s glide, longest gap 17 ms.
- The guide on a new island waits for the opening fly-in to settle, so "Look around" is not completed by the camera.

**Rejected.** A pre-rendered video or WebGL scene as the backdrop (needs the GPU device or a large download before
the dialog); keeping the boot city and replacing it (the waste this removes).

**Result.** Welcome dialog visible ≈ 0.08 s after navigation on a warm dev load (was ≈ 3–5 s); `core` lap ≈ 15 ms
after the choice (the prefetch made the device).

## D-149: Game over is a chronicle, and "try again" founds a fresh island

**Context.** The game-over screen showed two numbers and its "Found a new city" button founded the `founding-city`
scenario (the showcase), not a new starting island.

**Decision.**
- `sim/legacy.ts` (`stewardLegacy`, pure, tested in `tests/legacy.test.ts`) scores the tenure (peak residents, days,
  hand-built buildings, crises, milestones, risen wonders, unlocks) into one of five steward ranks, names the cause
  (Harmony, debt or both) and picks lessons for it; numbers like `FAIL_SECONDS` come from code.
- `modules/crises/GameOver.ts` draws it: stars stamp in, the record counts up, proud moments and tips, a personal
  best kept in `localStorage` (`bloomgrid:legacy-best`, a per-device convenience, not saved state).
- The primary button founds a fresh island at once through `wizard.island(name, difficulty)` (new seed, no guide),
  named after the fallen city ("Coralhaven" → "Coralhaven II", `nextName`); **More choices** opens the New Chapter
  dialog. The screen closes on `city:reset` / `load:done`, so every path out of it (load, chapter dialog) clears it.
  The plain fallback dialog founds `fresh-island` too.

## D-150: Keep laptops cool in long sessions (pacing, shadow refreshes, far greenery)

**Context.** After a while in the showcase city a MacBook's fan ran hard. Nothing leaked: a scripted session
(inspector, dashboard, map, build mode, every explore mode, the tour, fireworks) left CPU, draw calls, triangles,
objects and heap where they started. The heat was the steady load, and three things kept it higher than it needed
to be:

1. **Hover held the full frame rate.** `pointermove` counted as activity, so with the cursor over the city (most of
   a session) the game rendered at 60 fps nonstop; the 30 fps idle rate only came when the hand left the mouse.
   60 fps costs ≈ 75% of a core across the page and GPU processes, against ≈ 45% at 30.
2. **Shadows re-rendered ≈ 12 times a second, idle or not.** The "light moved" test compared the light's position,
   which sits 250 units out along the sun direction, so the sun's slow turn passed it every frame and bypassed the
   0.6° `turned` gate; and `instancer.animating` invalidated shadows on every frame while greenery sprouted (ivy and
   flowers, which cast no shadow, pop in almost constantly in a blooming city).
3. **Wild greenery was most of each frame's triangles**: palms (332 triangles), broad-leaf bushes (168) and canopy
   (80) at full detail up to their cull distance, ≈ 12.5M of 20.7M triangles in a downtown view.

**Decision.**
- `Input.lastActivity` is presses, drags, the wheel and keys; plain cursor moves are `lastHover`. `PowerManager`
  renders at the mode's cap while the camera moves, for 3 s after deliberate input (was 6 s), and for hover only
  while a placement tool (`grid`) previews under the cursor. Hover highlights look the same at the idle rate.
- `Atmosphere.follow` compares the snapped light target, not its position; the instancer reports
  `takeShadowChange()` once when a tween on a shadow-casting batch ends, instead of `animating` every frame.
  Shadow refreshes: ≈ 12/s → ≈ 2/s.
- Pieces may declare `far: { geometry, at }`: each batch gets a second InstancedMesh over the same instance
  attributes (one upload feeds both) and draws one of the two per frame, so draw calls do not change. Palm (≈ 50
  triangles), bush (28) and canopy (20) have far models from the same generators. Triangles in the reference
  downtown view: 20.7M → 13.7M; overview 9.9M → 6.5M.

**Measured** (headless, founding city, High): pacing 30 fps while hovering, 60 for 3 s after a click, 60 while
dragging or hovering with a build tool; `bun run perf` 24.9% active, 17.4% idle (unchanged reference). macOS
`ioreg` "Device Utilization" did not track the game's frame rate (≈ 70% at 20, 30 and 60 fps), so it is not a
usable GPU measure; headless `?gputime` stays too noisy to see these changes.

**Rejected.** Lowering the active cap below 60 (camera motion should stay smooth); dropping more greenery
(it is the island's look).

## D-151: One tap builds on phones; the preview is pinned to a suggested lot

**Context.** Touch has no hover, so the Build tool previewed on the first tap and built on a second tap on the
preview. Players found placing every building with two taps slow.

**Decision.** On touch devices (`isTouchDevice`), a tap on a free lot builds there at once. The preview doesn't follow a
pointer; it is pinned to `spot` (`modules/construction/tools.ts`). When a building is picked up, `spot` is the free lot nearest the view's
centre, so its size and service ring show before the first tap. After a build it moves to the next free lot
beside it, and after a refused tap it shows the refused lot in red with the reason. A tap on the pinned preview
builds exactly there. Remove, retrofit and mist keep tap-to-preview, tap-again-to-confirm (they destroy or
spend on a spot the steward should see first). Undo stays the safety net for a mis-tap.

**Rejected.** A floating confirm button (still two taps); dragging the ghost (conflicts with one-finger pan).

## D-152: iPhone full-screen web app

**Context.** On an iPhone the game should open from the home screen as a full-screen app, with the top bar and
the bottom controls clear of the notch / Dynamic Island, the home indicator and, in landscape, the side insets.

**Decision.**
- Shell: `viewport-fit=cover`, `apple-mobile-web-app-capable` + black-translucent status bar, `apple-mobile-web-app-title`,
  `format-detection` off, `public/manifest.webmanifest` (standalone, `display_override` fullscreen for Android,
  any orientation) and opaque full-bleed icons rendered from `public/icons/icon.svg` by `scripts/app-icons.mjs`.
- Page: `body` fixed to the viewport, no overscroll, no text inflation on rotation, no tap flash or long-press
  callout; iOS ignores `user-scalable=no`, so `gesture*` and multi-touch `touchmove` are cancelled on the document
  (pinches belong to the camera, which reads pointer events).
- Safe areas: phone rules use `--top` / `--bot` / `--gut-l` / `--gut-r`; script layout reads `safeInsets()` (a probe
  element's computed `env()` padding). The renderer resizes on `onViewportChange` (resize, `orientationchange`,
  `visualViewport`, and a check 350 ms later, because iOS reports sizes mid-rotation).
- Home-screen mode (`body.standalone`) shades the strip under the status bar so its white text reads over the island.
- Landscape top bar on phones: when the one-row bar clips (a notch's insets take ≈ 120 px), `Hud.fitStats` hides the
  season chip (`cfit-1`), then gives the stats their own row (`cfit-2`, `--chips` follows), and the chip comes back.

**Rejected.** The Fullscreen API (iPhone Safari has none for pages); hiding stats to fit (phones keep all six).

## D-153: Build panel lists what can be built first, marks heroes, and holds Goals

**Context.** The Build panel listed a category's buildings in file order: affordable homes sat between locked
and too-dear ones, and heroes looked like everyday buildings. Goals (unlock projects, milestones) lived in City
Pulse, a monitoring console, though nearly every goal is met by building.

**Decision.**
- Cards sort into groups (Ready to build, Saving up, At the limit, Locked), cheapest first, with a small label
  per group when there is more than one. The order is re-read at 5 Hz but held while the pointer is on the list,
  so a card never moves away from a click. Category chips show a ready-to-build count.
- `buildStates` (`sim/buildGate.ts`) gives every building's kind and short line in one pass (one building count,
  one status per project, no steps); `buildBlock` stays for the explanation card. A test holds the two equal.
- Hero buildings (`isHero` in `content/heroes.ts`: the hero district's `HERO_IDS`, landmarks, Aurora Gemini,
  Bloomtopia, Bloom Stadium) get a small gold star and gold edge on their card and a Hero chip on the explanation
  card. `explore/roof.ts` reads the same list.
- Goals is the Build panel's second tab (`build.addTab`, `build.show('goals')`); its badge also shows on the Build
  launcher. Goal links (gate steps, tutorial, Flora's hints) open it there. The tab rebuilds only when its content
  changes and never while the pointer is on one of its buttons. Leaving the Build tab puts down what is in hand.

**Rejected.** Re-sorting on every refresh (cards jumped under the pointer); a separate Goals dialog (one more
panel for the same job).

## D-154: Buildings stand on their pad: never below the ground beside them

**Context.** A building stood at its lot's highest corner. Where the ground one step outside the lot was higher
(a neighbour's levelled lot up to CLIFF above, a bank left at BANK above, a kept terrace, a reverted cut), its
ground floor was buried: pod docks at 294/174 in the showcase stood in a pit below the lawn next door, and the
player read it as the building melting into the hill.

**Decision.**
- One pad rule in the sim: `Grid.padOver(x, z, w, d)` is the lot's highest corner or the highest corner of the ring
  one step outside it, whichever is higher. `placeBuilding` seats the base there (the plinth still fills from the
  lot's lowest corner), and every other base-height reader uses it (wind-turbine heads, deck spawn, the build
  ghost's cursor and ring, lightning strikes). The renderer re-seats a building when corners within one step of
  its lot change, not only its own.
- Grading (`gradeLots`) makes the pad and the lot agree wherever it can: a lot lifts to meet a higher neighbouring
  lot or kept terrace touching it (the same MAX_FILL and low-side CLIFF caps as a street, measured from the lot's
  natural top so chains stay bounded, settled over up to 12 passes), and open ground one tile out is cut flush
  with the pad before the BANK ramp starts (RAMP 7). What is left stands on a plinth of at most CLIFF, drawn as a
  terrace step, and `tests/grading.test.ts` holds the showcase to that.

**Rejected.** Lifting the lot to any higher open ground (fills a hillside lot instead of cutting a cheap bank);
capping the plinth (a capped plinth is a buried ground floor again); re-grading on load (old saves keep their
ground and get the plinth instead).

## D-155: The founding city has grown from its centre

**Context.** Every one of the showcase's 2,390 buildings stood at level 1 and its towns were filled at 65–75%
with a third of the lots pocket parks, so the core read as the suburbs: gap-toothed frontages and a flat sea of
2×2 houses right up to the hero district. The designed levels (D-100) never showed in the city the game opens on.

**Decision.**
- `ScenarioBuilder.tier(x0, z0, x1, z1, tier, chance)` raises the buildings whose north-west tile lies in a rect to a
  level (those that can level), each with a chance, and moves the builder's totals by the levels' size and use
  multipliers so the balance sweeps size power, jobs and food for the grown city. The founding city applies it
  before its sweeps: the hero district and the town blocks within ring 5 at level 3, ring 6 half level 3 and half
  level 2, ring 7 level 2, ring 8 half level 2, the edge and the outlying works at level 1.
- Home mixes by ring: inner blocks towers with corner studios and few parks at 92% density, the middle rings towers
  and houses at 82%, the edge houses and gardens at 68%; downtown is a tower skyline. Pocket parks 721 → 534.
- Mobility for a city of ≈53k: docks stand mid-side (a dock reaches 12 tiles: every side of the inner blocks, north
  and south in the middle rings and on every hero block, north at the edge), a dock's riders scale with its level
  (`size(eid)` in `computeMobility`: more berths), every hero quarter gets an interchange, and the inner towns'
  streets are Bloom Boulevards. The Aeroline's low rows fill only inside the blocks: a row of houses out in the
  country was beyond every dock's reach and walked to work as one stream that jammed a shore street (flow 0.55).
  Sunfield is two block rows deep for the solar sweep. Settled on seed 20261024: flow 1.0, no jammed tiles,
  unemployment 0, power 17.1k / 15.8k, books positive.
- Tests that pick a founding-city home pick one still at level 1; the credit-flow tolerance scales with the flows
  in play (0.3% of income + upkeep). Draw calls: +7 at the full-island view (322 vs 315 at HEAD with the same
  script), near views unchanged within noise. `bun run showcase` redrew the overview.

**Rejected.** Two or three docks per block placed by the fill (they cluster at the block's north-west corner and
the far homes still walk); a lower share of road commuters in the sim (a rule change for every city to fix one
layout); levelling the islets and Sunfield (works stay works).

## D-156: The page is an in-flow 100dvh box, not fixed layers (iPhone home bar)

**Context.** As a home-screen app on iPhone, BloomGrid showed a strip of page background (light blue, then dark)
over the home indicator, while Andai (same phone, same setup) runs truly full screen. With `black-translucent` and
`position: fixed` full-screen layers, iOS lays the fixed boxes, `100%` and `innerHeight` out short of the home bar.

**Decision.** Follow Andai: no `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-capable` or
`theme-color` (manifest `theme_color` too); `color-scheme: dark` keeps the status bar's clock white. `body` is
`position: relative; height: 100dvh` in the page flow, and `#game`, `#hud` and the boot screen are `position: absolute;
inset: 0` inside it. The renderer sizes from the canvas's client size, not `innerWidth` / `innerHeight`. The page
background is the night sea, so any gap is dark, never a bright band.

**Rejected.** Keeping the layers fixed and giving them `height: 100dvh` (tried: still short of the home bar on device).

## D-157: Foresight: forecasts from the pulse history, proactive Flora (plan v5, Phase 24)

**Context.** The city reported its state but never looked ahead. The advisor and Flora reacted only to thresholds
already crossed, and the 240-sample `pulse.history` fed charts and nothing else. Plan v5 (`docs/plan-v5.md`)
starts with foresight so that later phases (policies, the director) have forecasts to act on.

**Decision.**
- **Forecast engine.** `sim/forecast.ts` fits a Theil–Sen trend over the last 30 samples (5 sim minutes) of energy
  balance, water balance, food ratio, harmony and population. Credits use the exact `netIncome` instead of a fit.
  - It projects 10 sim minutes ahead and reports when the next tier threshold is crossed: runs short (Strained),
    then Critical.
  - A season change inside the horizon is added as a step from its `waterMul` / `foodMul`, and named when it is
    the cause.
  - Confidence is 1 − MAD(residuals) / MAD(values), scaled down for short histories. Below 0.35, nothing is
    projected.
  - Pure, cached per pulse; it adds no saved or hashed state.
- **Consumers.**
  - **Advisor:** a `forecast-<metric>` rule for systems not yet flagged.
  - **Proposals:** `planFor` sizes the build to the gap projected at the horizon.
  - **Flora:** a proactive review every 30 pulses (15 on Eager) posts a heads-up with proposal cards. Each forecast
    gets one notice per 180 sim s, and none during a city's first 60 pulses. Settings → Display → Flora's
    heads-ups offers Quiet / Normal / Eager.
  - **Stat cards:** a Forecast line, plus a dashed projection and threshold on the trend chart.
  - **City Pulse:** a Coming up strip with forecasts, forecast crises and the next season.
  - **Tools:** `whats_coming`.
- **Menu order.** `whats_coming` is registered after every other tool (`foresightTools`). Menus keep registry
  order on a tie, so a request that isn't about the future keeps its long-standing tools and letters. Registered
  among the insight tools, it pushed Demolish off a 15-tool menu.

**Rejected.**
- **A least-squares fit:** one big build or crisis spike swung it.
- **Forecasting tier ratios directly:** ratios are not in the history, and adding them would have meant a save
  migration. Balances with thresholds scaled by today's demand give the same crossing.

## D-158: Policies: ordinances, sector budgets and a business tax (plan v5, Phase 25)

**Context.** The steward's only economic lever was one linear tax slider, and upkeep funding was automatic: 100%,
or 40% in debt. Forecasts (D-157) showed trouble ahead but offered only buildings as an answer.

**Decision.**
- **Ordinances.** Eight are data in `sim/policies.ts` (`POLICIES`): car-free core, night-sky, fishing quota,
  green roofs, four-day week, tourist levy, rainwater code, free sky-pods. Each has an upside, a downside, an
  enact fee and a running cost.
  - Effects go through the consequence modifiers: `applyPolicies` runs in `updateConsequences`, with new mod keys
    `trafficLoad`, `workerTax`, `energyDemand`, `waterSupply`, `nightGlow`, `tourismMul`, `fishEffort`,
    `reputationDrift` and `natureEco`. Every reader picks them up on the next pulse.
  - The running cost is `stats.policyCost` and is part of `netIncome` (D-115).
  - `setPolicy` is undoable and refunds the fee. There is a 60 s cooldown per ordinance. On a fresh island
    ordinances open at 500 residents.
- **Sector budgets.** Upkeep is summed per sector in pulse pass 1 (`sectorOf`): defs with `response` →
  response, `nature` → ecology, everything else → maintenance. `updateFinance` pays each sector at its budget
  (50–125%) × austerity.
  - `steward.funding` stays as the maintenance share, so condition, road overgrowth, the neglect rule and the
    advisor keep reading it.
  - Funding above 1 mends faster.
  - The response budget scales `fireSpread`. The ecology budget scales `bloomLoss` and nature buildings' eco
    output.
- **Business tax.** `policies.businessRate` taxes the worker share of income (`taxSplit` in `finance.ts`, shared by
  the pulse, dashboard and Flora). Above 15% it squeezes commercial and industry staffing. v19 saves migrate with
  the business rate equal to the old single rate.
- **Resident tax harmony** (`taxHarmony`): unchanged up to 16%, steeper above. A happy streak softens only the
  steep part, so the founding city's balance (12%) is untouched.
- **Surfaces:**
  - **City Pulse → Policies** (`modules/policies/`): switches, cooldowns and reasons, budget and business-tax
    sliders.
  - **Causes tab:** ordinances in force.
  - **Stat-card levers** (`{ kind: 'policy' }`).
  - **Advisor:** a `policy-<id>` suggestion when a forecast has an answering ordinance.
  - **Flora tools:** `policies_status` / `set_policy` / `set_budget`, registered last.
  - **Knowledge:** `reference-policies` and `systems-policies`.
- Save v20. State is hashed through `policyHash`.

**Rejected or deferred.**
- **Green roofs as a build-cost multiplier:** build cost is read in about 20 places (proposals, gates, tools,
  refunds). The mandate costs ◈0.002/s per building instead.
- **"Open data" and "Emergency reserve" ordinances:** deferred, as they need hooks that don't exist yet.
- **A night-sky dim on the activity field itself:** the field also places daytime walkers. It dims the night-life
  reading only.

## D-159: Living demand and districts: approval, migration, job types, district voices (plan v5, Phase 26)

**Context.** Residents were one global mood. `demandHomes/Work`, `avgCommute` and the districts themselves drove
nothing, commuters took the nearest job of any kind, and resident requests were the only voice a place had.

**Decision.**
- **District approval** (`sim/approval.ts`, state `approvalState.ts`, saved v21, hashed): each named district and
  the outskirts (key `''`) keeps an approval 0–100 that drifts toward a target like harmony.
  - Target = the city-wide harmony target + local terms: power and water at its homes and its amenities (each
    against the resident-weighted city mean, so they shift districts apart without moving the city), smog at its
    homes, commute length, job match, and a passing mood (petitions, praise, protests).
  - **City harmony is the resident-weighted mean** of district targets; the difference from the old sum shows as the
    Neighbourhoods term (`harmony.districts`).
  - A tile → district grid (painted from the rectangles, most specific wins, rebuilt when the list changes) makes
    the per-building lookup one array read.
- **Growth answers it.** Homes fill toward their district's approval (not the city's), arrive up to 1.2× faster and
  leave up to 1.6× faster (`migrationRates`), and too many homes for the jobs (`demandHomes < 0`) lowers every home's
  target. Moves are tallied per district as "+N moved in / −N left a minute". A home grows a level only while local
  home demand (`demandHomes + (approval − 60)/100`) is above 0, a workplace while work demand is
  (`demandWork + 0.2 + (approval − 60)/200`); paid upgrades are unaffected. Levels take the rule as a `wanted`
  predicate so `levels.ts` keeps no import of the pulse.
- **Commute and job types** (`sim/mobility.ts`): workplaces offer service (commercial, utility), industry (industry,
  energy), creative (tech, sports) or ecology (nature, food) work; workers want 35 / 20 / 25 / 20%. Before the
  untyped rounds, each type gets its own flood and a home sends its share to the matching job when it is at most
  `MATCH_DETOUR` (3) steps past the nearest job of any kind. Per home, the mean trip *length* (pods count as 8) and
  matched share go into grid layers (`homeLayers`). Jams already cost harmony through the traffic term, so the
  commute term reads length, not congested time. The job-match expectation ramps with population (full at 8 000).
- **District voices** (new happening kinds): a **petition** (approval < 58: lift it 6 points or enact the ordinance
  that answers the complaint), a **protest** (< 35 for 60 s: the district's workplaces staff 60% and city harmony −1
  until it reaches 45; skips the calm gap and crisis check), **praise** (75+ for 180 s: a gift ready to claim).
  Answered / ignored / festered set the district mood (+5 / −4 / −3 for 240 s).
- **Surfaces:** City map → **Approval** (red to green, lowest first, each district's complaint); the inspector's
  district card (approval, band, drift, movement, this home's commute and job match, complaint and fix); a Residents
  card migration line and lever; the Neighbourhoods harmony term; the Traffic lens's mean commute; inventory
  districts gain `approval` and the issues `unhappy` / `protesting`; tip bubbles say who speaks ("— a Westbrook
  baker") and react to the last ordinance, tax change, crisis, forecast and the district's complaint or pride.
- **Flora:** `district_report` (read, a verdict sentence first) and an intent route for approval, protest, petition
  and "who is leaving" questions ahead of `why`. With qwen3-1.7b both "which district is unhappy?" and "why are people
  leaving Westbrook?" go straight to it; before the route and the verdict the model answered from an unrelated
  `inventory_search` and named a district with no residents.

**Measured.** Founding city (seed 20261024): 53 111 residents and harmony 73.2 at 400 ticks, flow 1.00, Neighbourhoods
term 0 (unchanged); `zoning.test.ts` passes. Fresh-island pacing: the Aeroline starts at 6 670 s (6 710 before), never
broke; growth is path-dependent (the scripted steward's timeline jams around 75 min with or without this change).
`computeMobility` on the settled founding city: 7.6 ms vs 6.6 ms in Node (+5 floods; floods with no hiring workplace of
that type are skipped). `bun run perf`: main thread 23.9–27.0% vs 23.3–23.9% before (noisy, ≈ +1.5%); idle 16.4% vs
16.8%; draws unchanged (302 at the default view, as before).

**Rejected.**
- **Commute as congested travel time:** it double-counted jams already in the traffic term: on the fresh island
  harmony took −12 and −8 for the same jam and growth stalled.
- **Unbounded matched commuting** (and a 24-step reach): workers crossed the island for a matching job, mean road
  trips went from 6 to 26 tiles and fresh-island flow fell from 0.89 to 0.5–0.7.
- **Per-district policy effects** (car-free core helping only the core): ordinances still act city-wide through the
  consequence modifiers; every district shares them.
- **`ECS` store fields for commute and match:** the global component arrays are shared between cities; grid layers
  are per city and need no reset.

## D-160: Photographic surfaces: rooms behind glass, procedural relief, rebalanced light, clustered crowns, roof detail

**Context.** Close up and at the default city zoom the city read as flat-shaded toys: an ambient fill as strong as the
sun (hemisphere 1.0 plus the sky environment at 1.0) washed out form and shadow; glass was a half-metal mirror with a
flat pane; walls, timber and plinths were printed patterns with no relief; the ground was one green; tree crowns were
single faceted balls; plain flat roofs were bare lids.

**Decision.**
- **Relief without textures** (`render/materials/surface.ts`): `bumped(height, fade)` bends the shading normal from a
  procedural height in world units (Mikkelsen's surface gradient with analytic `dFdx/dFdy` of the height; three's
  `bumpMap` needs a texture). Recessed grout, mortar and board gaps, standing seams, basket weave, raised mullions,
  dressed plinth courses, moss cushions, leaf dapple and turf clumps. Every relief fades with `reliefFade(size)` /
  the pattern's own pixel fade (D-064/D-070). Smooth-noise relief above ~1 mm reads as hammered metal: plaster,
  render and earth stay nearly flat.
- **Rooms behind glass** (`roomInterior`): interior mapping per window cell (the façade's pattern coordinates: one
  unit per column along `u = x + z` and per 0.32 storey, 0.3 deep): the view ray hits the back wall (furniture band,
  a picture), floor, ceiling or a side wall (a plant), with per-room paint, corner occlusion and blinds on a third of
  windows; at night the lit windows show the lamp-lit room (ceiling fixture, pool of light) instead of a flat glow.
  Rooms read while a window is ≥ ~20 px and fade into a reflective tinted pane by ~7 px (a whole façade of few-pixel
  rooms turned glass towers into perforated grey blocks); classic glass keeps its teal through the rooms. Glass is a
  dielectric (Fresnel) with a light per-building coating (metalness 0.12–0.42) instead of metalness 0.45; mirror-sharp
  only close up.
- **Light:** day hemisphere 0.55–0.72 (was 0.7–1.0), sun 1.8–3.3 (1.6–3.0), environment 0.24 + 0.48·day (0.25 +
  0.75·day). The sun now models the form; the grade and keys are otherwise unchanged.
- **Ground:** natural grass tones (less saturated), broad dry/lush drifts, clumps and a blade speckle near the camera,
  each fading to its mean by pixel size; light turf relief.
- **Crowns** (`crownGeometry` in `assets/kit/pieces.ts`): five jittered lobes (one subdivided) in the old unit ball,
  normals bent 65 % toward the crown centre (it shades as one volume), baked occlusion in `uv.y` (darker heart and
  underside, faded to its mean under ~14 px); ≈160 triangles near, 40 far (was 80 / 20).
- **Roof detail** (`modules/construction/roofDetail.ts`): after a recipe runs, each bare flat roof (slab, glass or
  timber block nothing stands on) gets a parapet and plant (condensers with fan grilles, vent stacks, a hatch, a water
  tank on legs) from existing pieces. Judged per level: a roof a level builds on is dressed below that level only
  (joined to `ranged`), a generic-level building's main-roof plant shows at level 1 only (`roofPlant`, the level-2
  terrace covers it). Heroes and nature are skipped. Today 4 of 80 types have bare roofs (the catalogue's designed
  roofs are already dressed); it covers plain recipes added later.

**Measured** (headless, founding city, High). Draws unchanged (302). Triangles 27.4 M vs 25.1 M per frame (+9 %, the
crowns). `bun run perf`: GPU ms per frame 5.9–11.8 vs 5.0–9.5 before (noisy, ≈ +1–2 ms: room tracing and relief);
main thread 26–28 % vs 24–26 %; idle 19 % vs 18 %. `bun run flicker` (whole scene, 70 / 140 / 260): night 0.125 /
0.160 / 0.129 (unchanged); day 0.43 / 0.49 / 0.61 vs 0.27 / 0.27 / 0.32. Pieces alone are level or better (moss,
glass, plinth, canopy all lower); the rest is the stronger sun-to-fill contrast, which raises every existing small
edge over the threshold: with the old light the same materials measured 0.36 / 0.45 / 0.65. Accepted as the cost of
the deeper light; the first try (hemisphere 0.45–0.55, environment 0.22 + 0.38) measured 0.56 / 0.77 / 1.08.

**Rejected.**
- **Moss mounds faded to the hollow tone** far away: far living walls darkened and their moss edge crawled (+0.3 %
  day flicker at 260); they fade to their mean now.
- **Rooms at every window size:** dark specks across mid-distance façades; replaced by the 20 → 7 px fade.
- **A per-building roof check that counted level pieces at every level:** almost every recipe designs levels, so no
  roof was ever bare.
- **Bevels from screen-space edge distance:** pixel-wide lines crawl in motion (D-070); not attempted in geometry,
  where non-uniform instance scale would stretch a unit-box bevel.

## D-161: Temporal anti-aliasing, calmer dynamic resolution, light-space shadow snapping

**Context.** Moving the camera, the horizontal and vertical lines of buildings (floor plates, mullions, fins,
railings, window bands) flashed: each pans across pixels at a sub-pixel width, so it appears, vanishes and reappears
frame to frame. MSAA (4× on High / Ultra) smooths a triangle's edge within one frame but not a line thinner than a
pixel; the shader fades (D-064/D-070) only cover lines drawn by materials. Two things made it worse: dynamic
resolution stepped 10 % down while the camera moved and 5 % back up every 1.5 s once it stopped (each step
re-rasterises the whole frame), and shadow refreshes while panning snapped the focus in world x / z, which moved the
shadow map's angled texel grid by a fraction of a texel each time.

**Decision.**
- **TRAA** (`three/examples/jsm/tsl/display/TRAANode.js`) on Medium, High and Ultra (`taa` in `QualitySettings`,
  `?taa=0` for the old path), replacing MSAA / FXAA there, applied to the HDR scene colour before bloom and tone
  mapping. Velocity is the camera's alone, from a full-screen pass (`PostFX.cameraVelocity`: depth → world →
  this and last frame's unjittered view-projection): three's per-object `velocity` MRT adds a previous instance
  matrix vertex buffer to every batch (the pod mesh is at WebGPU's limit of 8) and copies every batch's matrices each
  frame. Shader-animated movers (pods, cars, walkers, fireworks) get camera velocity only; variance clipping keeps
  their trails to a frame or two.
- **Dynamic resolution** changes rarely and in bigger steps: down 0.15 after two missed 1.5 s windows in a row; up
  0.15 only after three comfortable windows in a row *at the active cap* (meeting the idle cap proves nothing) and
  20 s after the last change.
- **Shadow focus** snapped to whole texels in the light's own axes (`Atmosphere.follow`).

**Measured** (headless, founding city, High, `bun run flicker`, % of pixels jumping > 48/255 per frame at distances
20 / 35 / 70 / 140 / 260). Day: 0.030 / 0.043 / 0.017 / 0.013 / 0.006 with TAA vs 0.449 / 0.517 / 0.423 / 0.482 /
0.608 with MSAA 4×. Night: ≤ 0.003 vs 0.035–0.160. Mid-pan screenshots are as sharp as MSAA with no visible smear.
GPU ms per frame 2.0 / 8.1 vs 15.2 / 10.3 with MSAA (noisy; MSAA 4× over three MRT targets cost more than the TAA
resolve). Draws +2 (velocity and resolve passes); idle main thread 18 % (unchanged).

**Rejected.**
- **three's `velocity` MRT:** vertex-buffer limit on the pod mesh, per-frame matrix copies of every batch.
- **More shader fades for each pattern:** they cannot reach geometry thinner than a pixel, which was most of it.
- **Keeping MSAA under TAA:** TRAA requires it off; doing both costs the MSAA without improving the result.

## D-162: No switch flips near its limit: LOD dissolve, hysteresis bands, shadow extent levels

**Context.** After TAA (D-161) a search for the same class of problem (something visibly changing while the camera
moves) found discrete switches with no band: the instancer culled a whole chunk of grass, flowers, trees or bushes
at its `lod` and swapped the far model at `far.at`, and per-chunk shadow casting toggled at `shadowRadius`; walkers
(detail figure at 45, shown within 110), hover-cars (240), Drone Hive drones (200) and building signs switched on bare
`d < N` tests; the world module halved the shadow caster radius at a zoom of 180; and the shadow frustum followed the
zoom in 4-unit steps, re-rasterising every shadow some twenty times from street to island view.

**Decision.**
- **Dissolve before the cull:** materials of pieces with a finite `lod` (`fade: true` in `define`: canopy, bush,
  palm, grass, ivy, bark, flower, lily, koi, fungus, screen, pod, waterfall, lumen) discard fragments over the last
  18 % before it with an interleaved-gradient dither keyed to `U.frame` (TAA averages it into a smooth fade). The
  distance is per object (`uniform().onObjectUpdate` reading `userData.fadeAt`, which the instancer sets per batch) and
  measured like the cull (from `U.eye`, height halved; fragments are never nearer than their chunk's nearest point),
  so a chunk is invisible when it is dropped. Shadows dissolve with it (`maskNode` applies to the shadow pass; `U.eye`
  because the shadow pass's camera is the sun). The inspector preview swaps `U.eye` for its camera while it draws.
- **Bands:** `within(prev, d, limit, 0.08)` (`render/hysteresis.ts`) for walkers, cars, drones, signs and the
  overview shadow radius; far-model swap back at 94 % of `far.at`; shadow casting off at 110 % of the radius.
- **Shadow extent levels:** 25 / 34 / 46 / 62 / 84 / 110, up as soon as the view needs more, down only below 60 %.

- **Found on the way (Low quality):** nine materials set `mrtNode = mrt({ emissive })` for their share of the bloom
  target (sky-lanes, gates, hub rings, aurora, police beams, ferry wake, jet trails, whales, sky life). Low renders
  without the bloom pipeline, through three's framebuffer target, whose texture is not named `output`: no MRT output
  matched an attachment, WGSL got an empty output struct, and those objects were never drawn on Low (9 pipeline
  errors at boot since they were added). They register through `bloomMRT` now; `PostFX.configure` attaches the MRTs
  only while bloom runs. Low boots with no errors.

**Measured** (headless, High). Flicker (whole scene, 20 / 35 / 70 / 140 / 260): day 0.036 / 0.040 / 0.013 / 0.012 /
0.005, night ≤ 0.003 (as after D-161). GPU ms per frame with the dissolve 4.9–6.7 vs 4.9–10.0 without (noise); draws
304 (unchanged).

**Rejected.**
- **Shrinking pieces to their base instead of discarding:** the instance pivot isn't available in the shader after
  instancing, and a per-instance attribute would breach the pod mesh's vertex-buffer limit.
- **A cross-fade between the near and far models:** both would draw in the band (more draws and vertices); the
  bands keep the swap to one change per approach.

## D-163 — The trailer is the demo: renamed, 4K 60 fps by default, frames cleaned after the encode (2026-11-16)

`bun run trailer` / `scripts/trailer.mjs` are renamed to `bun run demo` / `scripts/demo.mjs` (output
`shots/demo.mp4`, Chrome profile `bloomgrid-demo-profile` — the first `--ai` run re-downloads the model once;
D-079/D-102 record the earlier names). The output is 3840×2160 at 60 fps by default (`--width/--height/--fps`
override; was 1920×1080 at 30). Once the ffmpeg encode finishes, the intermediate segment frames and card PNGs
are removed (gigabytes at 4K); `--keep-frames` keeps them for inspection.

## D-164 — A living sea: breaching whales, dolphins, three more wonders, wonder stories (2026-11-16)

- **Problem:** the whales were ellipsoid blobs bobbing on a circle; the sea was otherwise still. A raised lotus leaf
  stood in front of a flower; overlapping lily pads shared one height. Clicking a sea wonder did nothing, and the
  explore-mode birds flew perfect circles at a fixed bank.
- **Decision:**
  - *Sea life* (`modules/scenery/SeaLife.ts`): lofted humpbacks (pale belly and grooves, long pale pectorals,
    notched flukes, tubercles, lumen spots) and dolphins, one mesh per pod, posed per vertex from `U.clock`. Each
    whale runs a cycle (deep → breach on ~58% of cycles → surface and blow → arch and fluke-up dive), the tail beating
    up and down; dolphins porpoise in arcs, schools run deep for spells. Splashes, spouts and a surface slick are
    parts of the same mesh scaled by envelopes. `whalesNow` / `dolphinsLeaping` mirror the cycle on the CPU for the
    inspector. Two pods (the last whale a calf on its mother's cycle) and two schools (`WONDER_SITES.dolphins`).
  - *Three wonders* (`laterWonders.ts`): Turtle Isle (eco 60+ from day 5), Sunken Colonnade (3,000 residents from
    day 6), Prism Geode (harmony 75+ with 5,000 residents). Each is a ferry destination; `wonderObstacles` keeps
    every voyage clear of every standing wonder.
  - *Stories and inspector*: `lore.ts` holds each wonder's tale, things to look for, facts and a keeper's line;
    clicking a wonder (pickable boxes; pods by their area) or selecting it in the inventory (`ref.object`) opens
    `hud.objectInspector` with Locate and Charter ferry. Knowledge guide `basics/sea-wonders.md`.
  - *Lotus fix*: raised leaves are placed only clear of every flower, bud and the pavilion; pads are staggered
    3.5 cm per pad; petals 6×3.
  - *Birds* (`walkers/birds.ts`): three-panel cambered wings, a forked tail (long on swallows); wandering loops that
    swoop, pitched by the climb and banked by the turn (both from the path), and per species flight: gulls glide on
    M-wings, swallows dart, finches bound with folded wings.
- **Measured** (headless, High, founding city): draws +5 near the new wonders, unchanged at island zoom; panning
  main thread 25–29% / GPU 4.4–5.0 ms vs the HEAD baseline's 25–28% / 4.4–4.8 ms; idle 17.5% vs 18.9%. Boot
  modules ≈575 ms vs ≈546 ms. Vertices: whales 49k, dolphins 35k, turtle 28k, colonnade 64k, geode 33k.

## D-165 — A calmer showcase: half the pod docks, spaced solar spires, fewer pods and walkers (2026-11-16)

- **Problem:** the founding city felt crowded: 300 pod docks (in the Civic Ring 24 of 36 buildings, in The Exchange
  18 of 29), 424 sky pods on 384 lane ribbons, ≈1 900 walkers in a close view, and the Sunfield's 214 solar
  spires shoulder to shoulder (every one touching neighbours on two sides, 104 on three).
- **Decision:**
  - *Docks* (`founding-city.ts`): two per block in the inner rings (was four), one elsewhere (was two in the middle
    rings), one per built hero block (was two). Docks 300 → 165; pod riders unchanged (≈26k), flow 0.98.
    One per block on alternate outer blocks was tried and rejected: flow fell to 0.94 for 14 fewer docks.
  - *Sunfield*: service lanes every 6 tiles (was 5) and spires placed only with a free tile all round
    (`spaced`, using the builder's new `noBuilding(rect)`), two rows per strip. The ≈2 300 power that cost comes
    from more sea-breeze turbines along the shore roads (`WIND_TURBINES` 110 → 170, already a rotor gap apart).
  - *Pods per route* (`modules/mobility`): a dock's own lane `riders / 100`, at most 4 (was / 60, 6); through a
    hub `/ 110`, at most 3 (was / 70, 4). Pods 424 → 262, lanes 384 → 240.
  - *Walkers*: `PER_TILE` 0.85 (was 1.4); ≈1 900 → ≈1 300 in the same view.
- **Measured** (seed 20261024, settled 400 ticks): mobility tier 0, flow 0.957 (was 1.0), unemployment 0, power
  16 922 / 15 487 (margin +1 435, was +1 254), net budget +64/s. 2 472 buildings (was 2 528), 150 spires, 170
  turbines.
- `tests/explore.test.ts`'s front-steps case now picks a Work Dome whose door faces a street (the first match had
  become one facing a neighbour).

## D-166 — Sky lanes reimagined: the network only, weaving low between towers, no hoops (2026-11-16)

- **Problem:** 240 lane ribbons, 170 of them a dock's short hop to its hub; each lane was a straight arc whose
  crest grew with its length (`1.5 + 0.06 × len`) and was then lifted whole over every rooftop beneath, so lanes
  over the downtown towers rose 60–108 tiles (crests averaged 15–23 above the ground; 115 of 240 lifted). Glowing
  hoops (sky gates, D-147) hung along every long lane.
- **Decision:**
  - *Only the network is drawn:* trunks between hubs, hub → job centre, hub → Aeroline platform, and the lane of a
    dock with no hub. Pods still fly the dock → hub hop as their first leg, planned like a lane. 240 → 70 ribbons.
  - *Weave, don't climb:* a leg's ground track may bow sideways (`legXZ`: up to `BOW_MAX` = 0.35 of its length at
    the middle, 8 steps either way). `legOf` tries every bow and keeps the one with the least lift, a bend costing
    `BOW_COST` = 10 tiles of lift per unit of bow, so lanes curve only where it saves height. The bow and the lift
    pack into one whole number per leg (`legCode`): the pod's two legs ride the integer parts of its info vec4 as
    the lifts did (the pod mesh stays at 8 vertex buffers), the lane's in `info.z`; pod shader, lane shader and the
    ride camera's CPU mirror decode it alike.
  - *Flatter arch:* crest `0.8 + 0.025 × len`.
  - *No sky gates:* the hoop mesh and `GATES` / `GATE_MIN` are gone.
  - The planner samples each track at twice the clearance check's density (more on long bows), so every sample
    the check makes is one the planner made.
- **Measured** (founding city): 70 lanes, 41 bowed, 22 lifted; `clearance()` clipped 0, clipped near an end 3 (was
  17). Mean crest above ground (max): trunks 15.6 (31.8), hub → job centre 11.3 (22.8), dock lanes 10.8 (28.4),
  platform links 10.1 (11.2); before 22.8 (62.7), 19.2 (108.4), 21.4 (57.0), 12.3 (15.3).

## D-167 — The director: neglect escalates, crises chain, the challenge adapts (2026-11-18)

Plan v5, Phase 27. Before it, crises were a dice roll against the difficulty's `eventRate`; the eleven consequence
rules tilted the odds but never caused anything, and the founding city ran itself once water was fixed.

- **Escalation** (`escalate` on a `ConsequenceRule`: `at`, `crisis`, `measure`, `lever`): when a rule's intensity
  reaches `at` it queues its crisis and logs an `escalate` feed entry (toast); it re-arms only once the intensity
  falls `REARM` (0.3) below (`RuleState.fired`, hashed). Polluted coast 0.7 → algal bloom, heat island 0.8 →
  heatwave, long debt 0.6 → **workers' strike** (new crisis: workplace `staffing` modifier, half as hard once the
  city is out of debt), new rule **Strained grid** (power margin under ≈8%, 30+ buildings) 0.8 → grid failure.
  Low approval → protest was already causal in Phase 26's happenings, so it stays there (and counts in tension).
- **Chains** (`followUps` on a `CrisisDef`, rolled when it ends, only while `autoCrises`): monsoon → **landslide**
  (new crisis; needs bare slopes: lot + 3-tile ring spanning ≥ 3 height units with ecology < 0.55, `sim/slopes.ts`;
  2.5× in Monsoon), heatwave → industrial fire, earthquake → grid failure. The quake → tsunami roll stays in
  `disasters.ts` (it fires at the quake's start, not its end).
- **One queue** (`steward.director.queue`, ≤ 3, one per crisis, 10-min expiry): escalations wait `MIN_GAP` (75 s) of
  calm, chain links `CHAIN_GAP` (15 s) and jump the queue. The scheduler forecasts the queue head before it rolls the
  odds, so "one crisis at a time" holds; the forecast carries a `cause` (toast, Flora's notice, incident log).
- **Director** (`updateDirector`, end of the pulse): tension = systems Strained+ (≤ 0.6) + crisis / fires + forecast
  warnings + unhappy residents + fail clock, smoothed (EWMA 0.05/s); mastery = EWMA of how fast each spell of
  trouble (Critical tier, active crisis, fire) clears (≤ 30 s → 1, ≥ 270 s → 0). Band per difficulty (Relaxed
  0.10–0.30, Steward 0.18–0.42, Hard 0.28–0.55, Sandbox none), shifted by up to ±0.06 with mastery. Below: pace
  (crisis odds; happening gaps divide by it) climbs to 1.8, drift builds over 30 min. Above: pace falls to 0.5, the
  calm gap stretches to 2.5× `MIN_GAP` (never below it), drift clears in 5 min. In band: dials ease back to 1.
- **Drift** (the showcase's pressure): up to +25% power and +20% water demand on consumers and 1.5× ageing, ×1.5 in
  the Haze. Measured on the founding city (seed 20261024): the producers' level-ups outgrow +12% / +10%, so the
  first numbers were too gentle to matter.
- **Off** in tests (`makeSim`), the trailer and Sandbox (`steward.autoDirector`, saved, default on). Save v22.
- **Not done:** request size by pace, a Settings toggle, a tension readout in City Pulse (Flora's `whats_coming`
  reports it: `pressure`, `risks`).
- **Import cycle:** `crises.ts` → `director.ts` → `forecast.ts` → `consequences.ts` → … → `hazards.ts` called
  `registerCrisis` before `crises.ts` finished. What the scheduler and the rules need lives in `directorCore.ts`.

## D-168 — Charters, eras, a live legacy and challenge scenarios (2026-11-18)

Plan v5, Phase 28. The fresh island ran out of goals at the last milestone and unlock; the showcase had none.

- **Charters** (`sim/charters.ts`, data like `MILESTONES`): seven civic goals with Bronze / Silver / Gold tiers
  (Carbon-zero, Ten Thousand Voices, Resilient Isle, Ocean Steward, Transit City, Night Bloom, Debt-free Decade).
  Up to `MAX_ACTIVE` (3) under way; only those make progress, and dropping one resets its running measure (`acc`), so
  the choice matters. Measures are a streak (seconds a condition holds), an event count (crises with no ruins,
  festivals and shows, read from the incident / happening logs and the fireworks counter by id, `seen`) or a share
  smoothed over a minute. A reached tier is **sticky** (`reached`): a broken streak keeps what it earned, and is
  claimed by hand (`claimCharter`, undoable = false, juice coins). Bronze pays credits; Silver a perk; Gold a perk
  and a title, and frees its slot. Perks write consequence mods (`applyCharters` after `applyPolicies`); one unlocks
  the **Emergency reserve** ordinance (the Phase 25 deferral) through a new `damage` mod read by `damageBuilding`.
  `setCharter` is an undoable command (a choice).
- **Eras** (`sim/eras.ts`): Seedling → Grove (1k residents, 1 tier) → Canopy (10k, 4) → Bloom (30k, 8 incl. a Gold),
  never back; a grand moment each. Each raises the director's band (+0.02 per era) and sets ordinance slots (2 / 3 /
  4 / all) **on a growing island only**: Phase 25 promised the showcase every ordinance, so slots don't bind there.
  Canopy brings the **Bloom Expo** happening (a landmark; visitors 6 + 20% of income per second, +1 harmony).
- **Live legacy**: `stewardLegacy` adds charter tiers (300) and eras (500) and shows in Goals → Era and legacy with
  its stars and the latest title.
- **Challenges**: `ScenarioDef.challenge` is data (content can't import sim): `setup` (`remove` a share of a
  resource's producers, spread by uid; an inherited `loan`) and `objectives` (`reach-tier` with a deadline,
  `clear-debt`, `keep-tiers`), checked each pulse in `sim/objectives.ts`. A goal must hold 20 s to win; a breach must
  last 15 s to lose (a moment's dip is not a loss). Losing doesn't end the game. Both challenge scenarios call
  `founding.build`, so they never drift from the showcase. **Water Crisis Rescue** removes 30% of water producers
  (50% collapsed water, food and jobs and drained ◈15k in a minute; 30% leaves water Critical and about five minutes
  of credits). **Debt Island**: ◈1,500 and a ◈30,000 loan at ◈12/s; the unattended city nets ≈ +70/s, so the danger
  is crises pushing water (Strained at start) to Critical. The New Chapter dialog's Showcase path picks free play or
  a challenge (`CHALLENGES` in `Chapter.ts`, a static list so the welcome chunk stays light, D-148).
- **State** `city.charters` (`charterState.ts`): active, reached, claimed, acc, seen, era, challenge. Save v23; hashed.
- **Flora**: `goals_status` now reports era, next era, legacy, charters and challenge objectives (in every city).
- **Not done**: cosmetic rewards (wonder variants, building looks), only one new happening kind (the Expo).

## D-169 — Resident stories, one-approval plans, Flora remembers (2026-11-18)

Plan v5, Phase 29, the last of the plan.

- **Stories** (`sim/stories.ts`, data in `ARCS`): three arcs (a fisher, a start-up founder, a flooded family), each
  two beats about a resident named from `city.rng` and tied to a home by its serial. A beat triggers from the city's
  state (fish stock, population, sea rise / a bare coast / a recent flood) and offers two choices: pay now (credits),
  or a **goal** (an ordinance, or a kind of building within N tiles of the home) with a deadline, measured as a count
  that must rise above where it stood when chosen. Endings pay a reward, leave a mood for three minutes and some a
  **lasting outcome** (`LASTING`: a mod for good). A missed goal, "not now" or five minutes unanswered lets the
  resident down; a demolished home ends it ("moved away"). One story at a time, 6–10 min apart, never in a crisis;
  `stories.auto` off in tests and the trailer. `storyChoice` runs with undoable = false (a decision made in front of
  someone, like claims). State `city.stories` (`storyState.ts`), save v24, hashed (in `City`, since `stories.ts`
  imports widely). Card `modules/stories` (milestone-card frame, choices with costs, Visit opens the home, Walk there
  explores the street on foot: residents are not individual agents, so "follow" is the street, not the person).
- **Plans** (`sim/plans.ts`): `proposePlan(city, goal, avoid)` for `fix`, `carbon-zero`, `harmony`, `budget`: ordered
  steps (build, policy, budget, tax, switch, charter), each with why, cost and its command records; kept within the
  treasury (the rest listed as left out). Builds take non-overlapping lots (`lotsFor`: one tile of air) so a batch
  never refuses its own second build. The console's plan card runs every record as **one `batch`**, so one undo
  reverts the plan. Tool `propose_plan` (registered last) returns a readable summary for the model and the plan as
  a **non-enumerable `card`** property: `observe` (JSON) skips it, the console reads it. Flora's forecast heads-up
  attaches a plan (2+ steps) when a supply is heading for Critical; `assistant.plan(goal)` posts one without a model.
- **Memory** (`modules/assistant/memory.ts`): **Not now** on a plan or a build proposal declines its step keys for
  30 sim minutes in that city (per viewer, local storage: how this steward plays is not city state, so not saved or
  hashed); approving clears them. Plans and proactive proposals leave declined steps out. Each decision is logged to
  the journal's **Field log · Advice** (`recordAdvice`).
- **Found on the way:** on desktops the milestone card lives in the right column (D-130), so the happenings card's
  `#hud > .jc-m` lookup never found it and the two overlapped on fresh islands; both cards now stack by screen
  rectangles.
- **Flora**: `happenings_status` reports the running story (choices, goal, time left, lasting outcomes).
- **Not measured:** `ai-probe` ("make the city carbon-zero" → `propose_plan`) needs a downloaded model.

## D-170 — Aeroline line levels (2026-11-18)

The Aeroline levels up to 3 like a building, but **as one line**: every train and every station deck together.

- **Sim** `src/sim/aeroline.ts`: `AEROLINE_LEVELS` as data (name, blurb, cost 0 / 9,000 / 20,000, rail riders ×1 /
  ×1.35 / ×1.75, km/h for the inspector, render `vmax`), level in `city.growth.aerolineLevel` (saved v25 with a
  migration to 1, hashed in `growthHash`); command `upgradeAeroline` (undoable: level and credits back), blocked by
  `aerolineBlock` (top level, line not built, no station, credits short); event `aeroline:level`. Mobility multiplies
  a rail dock's capacity by `aerolineRiders`.
- **Why one level for the line** rather than per station: the trains run the whole loop, so a per-station level would
  have no train to show it; stations (buildings) keep their own street-level levels (D-100) as before.
- **Look**, each level in the line's own language: trains (`Trains.ts`) 5 / 6 / 7 cars (`CARS_AT`): Bloomline
  (pearl, teal livery, solar roof), Zephyr (panoramic glass roof with ribs, waist light, faired skirts, glass doors
  framed in light, longer visor nose and dorsal fin), Aurora Halo (chrome and gold, taller glazing with gold ribs, a
  dorsal light fin, end fins, a needle nose through a glowing halo ring with gold canards). Stations (`Guideway`)
  lengthen (30 / 32 / 34 design units) for the longer sets; level 2 adds butterfly solar sails over the vault, glass
  platform screen doors and a wider halo; level 3 adds a halo spire (three rings, gold prism), gold-lit vault ribs and
  hanging gardens; Bloom Helix crowns gain a lit mast, then a floating halo. A level change rebuilds the baked line
  and swaps the train meshes (no new draw calls).
- **UI**: trains are clickable (six invisible pick proxies follow the sets) and open `hud.objectInspector('aeroline')`
  (level chips, speed, sets, riders, next level, Upgrade line / Ride / Locate); a station's inspector gets Upgrade
  line and Line. Service `aeroline.level` / `upgrade()`.
- **Deferred**: no Flora tool for the upgrade yet; no ceremony beyond a toast.

## D-171 — Model gallery (2026-11-18)

A full-screen showroom for every model in the game (**G**, the top bar's gallery button, or **Gallery** in a
building's inspector), one at a time on a lit studio stage: 80 building types (each designed level, rides and rotors
turning), the Aeroline's three rolling stocks, hover traffic, sky pods, the patrol drone, the Sky Guard jet, the
*Tidesong*, the eight sea wonders, whales and dolphins (96 exhibits).

- **Drawn in place of the city, not over it.** The studio has its own scene and its own `PostFX` (bloom, TRAA, grade)
  and is set as `render.stage`, which `core.render` draws instead of the city's pipeline. A scissored second draw over
  the city (the inspector preview's way, D-067) would pay for the whole city every frame under a full-screen view.
  The city keeps its state; the clock holds (as dialogs do: `gallery-open` counts as a hold in the pause module), its
  tools and camera rest, and the HUD hides.
- **The city's own materials and pieces**, so a model looks exactly as it does on the island. The shared `U`
  uniforms (night, sun, sky, grade, lenses, weather, `eye`) are set to the studio's lighting (day / dusk / night)
  for its draw and put back after.
- **Modules own their exhibits**: `gallery.add` in each module's `init` (the gallery registers early in `MODULES`);
  `dress(defId, fn)` adds parts a module draws onto a building type (turbine nacelle and rotor). Jet and ferry share
  their live materials (they pose only in their own frame). The drone, car and pod shaders posed the model in the
  world inside one block, so their surfaces moved into `droneSurface` / `carSurface` / `podSurface` in the model
  files, used by both the city and the gallery (no change in the city's look).
- **Building pieces** come from `designPieces(def, tier)` (base + designed level pieces, or the generic overlay; the
  Build preview now shows a level-1 roof plant it used to omit) and moving parts from `spinPose`, both shared with the
  city's renderer.
- **Not done**: the lighthouse beam, Aurora searchlights and parked police drones (module effects on top of models)
  are not on stage; no thumbnails in the list (each would need a render); no screenshot button (photo mode has one).


## D-172 — Juice that pulls: golden tips, showers, a combo meter, "almost there" (2026-11-18)

- **Why**: D-118's tips were all the same, and combos almost never happened (bubbles float 20–35 s apart, the combo
  window is 7 s), so the combo was a mechanic players never found. Nothing marked the last stretch of a milestone.
- **Golden tips**: once 3 tips were popped, each bubble has a 1-in-10 chance to be golden (rolled cosmetically in
  the module, like where bubbles float). `collectTip` takes `golden`, and the sim pays `GOLDEN_TIP` (×4) on top of
  combo and Harmony, so a replayed log pays the same; no new saved state. A golden bubble lasts 18 s instead of 32
  (a reason to look now, not a timer to dread), has a breathing halo (opacity on a pseudo-element) and a quiet
  `shimmer` cue on appearing; popping it plays `golden`.
- **Showers**: after 2 tips, a spawn has a 1-in-5 chance to fill up to `MAX_BUBBLES`, the extra bubbles rising
  0.35 s apart (CSS `--in` delay; their age starts negative to match), so a combo is actually reachable.
- **Combo meter**: a chip under the top bar (under the chips on phones) after a pop while another bubble floats:
  the combo, the next pop's value (from `tipValue`), and a bar draining over `COMBO_WINDOW` (one CSS animation,
  restarted per pop). Hidden when the window closes or nothing is left to pop.
- **Almost there**: the milestone card gets `.near` at ≥ 80% of a counted goal: a highlight sweeps the bar, the
  count reads "· almost there", the pill "Almost: …".
- **Rejected**: daily login streaks and loss-framed timers (they fight the steward role and the "bonus, not income"
  rule of D-118); golden odds in `city.rng` (cosmetic spawning stays out of the hash).
- Measured: DOM only, a few extra elements at most; draw calls unchanged.

## D-173 — Early-game juice: catches, move-ins, Firsts, the Day recap (2026-11-20)

- **Why**: a fresh island's first hour still had stretches where growth happened out of sight: fishing (the first
  income) paid continuously with no moment, homes filled silently, and milestone counts moved without a beat.
  Players had no map of what the island holds beyond the next milestone.
- **Catch chips**: `modules/fishing` emits `fishing:landed` when a boat's trip phase wraps home (never on a clock
  jump: the step must be < 1 s); the amount is that boat's trip at today's stock, staffing and sea (`CATCH_VALUE`,
  `cleanSea`, the fishing mods × `TRIP`), cosmetic since the sim pays continuously. In view only, with a splash ring
  and a soft `catch` cue.
- **Move-ins**: at 1 Hz, homes whose whole residents (`stats.population × size × occupancy`) rose float "+N", at
  most 3 per scan, spaced on screen, while the city is a progression one or under 2,500 residents.
- **Firsts** (`juice/firsts.ts`): 16 discoveries as data, event-earned or `check`ed at 1 Hz; progression cities
  only. Saved per city through the juice module's save hook (not sim state: no hash, no `SAVE_VERSION` bump;
  unknown ids are dropped on load). After a city change the first check marks what is already true quietly, so a
  loaded city doesn't fire a burst; event Firsts always badge. One badge at a time in the stack under the top bar,
  listed in Build → Goals (earned in gold, the rest dimmed as a teaser).
- **Day recap**: when `city.day` advances by one on a progression city, a closable card (14 s) sums up the day from
  a snapshot taken at its start (residents, treasury, finished buildings, tips, catch, Firsts) and marks a best day
  for growth (kept in the save hook). Records start after the first day, so day 1 is never a "record".
- **Milestone ticks**: a counted goal (`unit` count, need ≤ 100) that moves shows "+N" off the count with a tick.
- **Rejected**: rewards for Firsts or the recap (D-118: bonus, not income; the Firsts are a map, not a payout);
  login or daily streaks; recaps on the showcase (it has no early game).
- Measured: DOM only; the 1 Hz scan touches residential buildings once (cheap on the showcase too).

## D-174 — One placement, then out (2026-11-20)

- **Why**: after placing a building the tool stayed in hand, so the next click on the city (to inspect, to pop a
  tip) placed a second building or showed a red refusal, and the steward had to press Done, Esc or right-click
  every time. Most placements are one building for a purpose (a milestone's Build button, a shortage, Flora).
- **How**: the Build tool emits `build:placed` (`def`, lot, `shift`, `touch`) after a successful placement; the
  build module closes build mode unless Shift was held or **Keep placing** is on (a switch on the Build panel's
  title line, per viewer in `localStorage`, off by default). While staying, it still closes once `buildBlock` says
  another can't be placed (credits, limit, lock), with a toast giving the reason. After closing on its own it
  offers **Another …** (name and price) above the launcher for 8 s (in the dock row beside it on phones, where the
  milestone strip sits above), which picks the same building up again.
- **Scope**: buildings only. Highways, channels and the other drag actions stay in hand (they are drawn in
  strokes). Flora's and scripts' builds run commands and are untouched.
- **Rejected**: closing only for buildings that are "usually one" (heroes, utilities): the rule would be invisible
  and wrong for half the cases; the explicit Shift / switch is learnable and shown in the placing tooltip.

## D-175 — Little charms: the island's cat, paper planes, sleepy homes (2026-11-20)

- **Why**: the juice rewards attention with credits and progress; nothing on the island was simply delightful to
  find. A few small, harmless surprises give curious clicks a smile and the island a personality.
- **The cat**: one per island, its name and coat picked from `city.seed` (so a player's island keeps its cat across
  sessions). It sits on a small home's roof in view (roof height ≤ 18), drawn as inline SVG (static markup in
  `charm/art.ts`) anchored to the roof and scaled by distance, hidden beyond 260 units. Clicking: hearts, a meow,
  often a hop to another roof; every 5th pet a purr; every 10th a gift that is a resident's tip through
  `collectTip` (so credits stay the sim's and replay). It wanders every 40–75 s of running time (always back into
  view when off screen) and sleeps at night (eyes shut, dimmed). Pets per viewer and island in `localStorage`.
- **Paper planes**: one at a time, first after 75 s of running time, then every 150–260 s; a 13 s glide across the
  screen. Caught: a paper note (`charm/notes.ts`, signed with a resident's voice from `voiceFor`), a third of them
  with a tip folded inside (again `collectTip`). Missed: nothing lost.
- **Sleepy homes**: at night, every 6–10 s a home in view floats "z z Z" (at most two at once).
- Two Firsts (Cat person, Fan mail) through a new `juice.earn(id)`. Sounds `meow`, `purr`, `paper` on the `juice`
  event. Settings → Display → Little charms turns it all off. Also fixed "a Old Harbour …" in residents' voices.
- **Rejected**: a 3D cat (a few pixels tall at city zoom; a screen-sized sticker reads and costs nothing on the GPU);
  charms as sim state (they are cosmetic; only the credits they pay go through commands).

## D-176 — A lively cat (2026-11-20)

- **Why**: D-175's cat sat still apart from a tail swish and a blink, and moved roofs by fading; it read as a sticker.
- **How** (`charm/cat.ts`): a rigged front drawing (head turning from the neck, each ear, a grooming paw, pupils, a
  yawning mouth) and a side-on drawing (four legs swinging in pairs, a waving tail, a bobbing head) in `art.ts`.
  Awake, the cat picks an act every 0.4–2.6 s after the last one ends, by weight (`AWAKE`): sit, look about, ear
  flicks, groom, yawn, stretch, walk along the roof (side on, the offset written per frame as the inner span's
  `translate`, in half-widths of the roof as it looks on screen), loaf (paws tucked, eyes half shut), watch a
  butterfly then pounce, or leap. A leap is an arc in world space (height 2.5 + 0.22·distance) to a home roof within
  40 units in view, side on with legs stretched, landing with a squash; farther moves still hop off and drop in.
  Asleep (`ASLEEP`): ear twitches, tail flicks, a stir. Its pupils and head follow the pointer within 280 px; hovered,
  the ears perk and the tail quickens; nothing new is started while hovered, so a click lands.
- Acts are CSS classes on the SVG parts (transform keyframes only); per frame, one element's transform and
  translate are written, plus two projections for the roof's width. `charm.act(name)` runs one for scenes.
- **Rejected**: sprite-sheet animation (an asset pipeline for one cat); a 3D cat (too small at city zoom, D-175).

## D-177 — The cat as a pet: following and talking (2026-11-20)

- **Why**: the cat lived on whatever roof it landed on and only "spoke" in short floating chips when petted. A pet
  keeps you company and notices things with you.
- **Following**: every 0.8 s (0.25 s while chasing) the cat checks its screen position. Off screen (0.6 s awake,
  4 s asleep) it drops in near the middle of the view; awake and farther than 30 % of the short screen side from
  the middle, it leaps to a roof within 40 units that is closer to the middle (`homeSpot` `toward`, weighted to the
  closest). It perches on any non-landmark building up to 18 high, not only homes, so it can keep up anywhere.
  Hovered, petted or zoomed out past its draw distance, it stays.
- **Talking**: one bubble above the cat (name, line, an optional button), riding with it, shifted to stay on
  screen; clicking dismisses it, hovering holds it. Out of sight when it has something to say, it comes into view
  first. Lines are data (`charm/talk.ts`); occasions in `index.ts`: hello / welcome back (per viewer and island),
  morning (on waking) and evening, milestones, new buildings and homes, level-ups, golden tips and combos, spotted
  golden bubbles and paper planes, fireworks, crises (it wakes), fires (with **Show me**), projects, bridges,
  wonders, eras, a system turning Critical, and chatter every 70–130 s of running time (an unclaimed milestone after
  20 s, the worst strained supply, a thriving city, or an idle thought). Rate limits by weight: 5 s for moments,
  16 s for small things, 45 s for chatter; moments meow.
- **Bond**: Shy / Friend (3 pets) / Buddy (12) / Best friend (30), announced in a bubble and shown in its title.
- **Rejected**: speech through toasts (they say nothing of who is talking); a cat that follows the pointer (it
  would chase every cursor move; the view is where the steward is looking).

## D-178 — Befriend the stray: the cat is earned, with a film (2026-11-20)

- **Why**: a companion handed over at the start is easy to ignore. Earned, with a moment of its own, players value
  it (as with Flora and the Aeroline).
- **The gate** (`sim/projects.ts`, new `UnlockId` `cat`): *Befriend the stray*, the first and cheapest project:
  two Fishing Boat Docks ("fresh fish"), a park or garden ("sunny naps"), 250 residents, ◈250 and 8 s of work.
  Its criteria overlap the early milestones (Second catch, A busy harbour), so it lands in the first stretch of
  play. Listed first in `PROJECTS` (Goals shows it first); the pacing test still holds. No save change: `unlocked`
  is a list of ids, so older fresh-island saves meet the stray too; non-progression cities have the cat from the start.
- **The stray**: until then the cat is a silhouette with lamp-yellow eyes and no name ("???"); it never follows or
  talks, turns up now and then in view, flattens its ears when hovered, and darts off when clicked with a hint and
  a **See how** button (Build → Goals). Paper-plane notes call it "the stray cat".
- **The film** (`charm/cutscene.ts`, `cutscene.css`): ~20 s in its own illustrated night over the paused city
  (letterbox, stars, a moon that becomes the rising sun, a skyline with a turning turbine, a roof ledge with a
  chimney). The star is the city's rig drawn large (the same `ch-cat` classes and SVG), so it looks like the cat
  players will meet. Beats: eyes blink in the dark; a fish drops on a string; the creep with two comic freezes
  ("!", "!!", tiptoe); a pounce with a star puff; munch munch *hic*; dawn and the coat colours tweening in
  (registered `@property` colours) with a flash and sparkles; a slow blink and a heart; the name dropping in letter
  by letter ("has decided to adopt you. (You thought it was the other way round.)"); a collar and bell; paw-print
  confetti; a card with **Welcome home, {name}**. Skip button and Esc; it owns the keyboard while it runs. Ten
  synthesised `cs-*` cues score it.
- **Integration**: `moments.stage(id, run)` queues a custom sequence in the ceremonies' line (ahead of waiting
  ones, `playing` true while it runs, so juice and charms wait); the pause card treats `cutscene-on` as a hold
  that isn't the player's. On finishing, the cat takes its colours and name, drops in near the view and says hello.
- **Rejected**: a pre-rendered video file (size, a codec in both shells, and it could not show the player's own
  cat); playing it in the 3D city (the cat is a few pixels tall there, D-175).
- **Fix (same day)**: founding a new island showed a ready-made pet. `City.reset` emits `city:reset` before the
  scenario turns progression on, and a city without progression has everything open, so reading adoption once at
  the reset adopted the cat. The charms module now checks `isOpen(growth, 'cat')` every frame (`unfriend` /
  `befriend`; held as a stray while the film is queued or playing). The stray no longer waits on a roof from the
  start either: it first visits 50–80 s after founding, stays 25–40 s, and comes back every 90–160 s.

## D-179 — City moments drop the light column (2026-11-21)

- **What**: a city moment (D-094) no longer raises a column of light over where it happened; the camera move and the
  two shockwave rings stay.
- **Why**: the column read as a huge white pole standing in the city (crisis warnings, sea wonder discoveries) rather
  than a glow.

## D-180 — The Goals tab shows what is within reach (2026-11-21)

- **What**: unlock projects list only those under way, ready, or locked but within reach: their prerequisite
  (`after` on a `ProjectDef`) done and their resident gate (`residents`) at most `REACH` (3) × the population; the
  nearest locked one always shows (`projectsInView` in `sim/projects.ts`, tested in `tests/goalsView.test.ts`).
  Finished projects fold into one "Done" line, the rest into "N more open up as the island grows (the next at X
  residents)". Charters not taken up are one-line rows, three in view and the rest folded; sea wonders show the
  found ones plus the next two hints.
- **Why**: a 200-resident hamlet saw every project up to the 8,000-resident Sky Guard, seven charter cards and every
  wonder: a long scroll before the milestones that matter early.

## D-181 — Ready call-outs, project verbs and replayable films (2026-11-21)

- **Ready call-out**: when an unlock project turns ready, `ReadyCall` (`modules/goals/ready.ts`) drops a glowing card
  under the top bar with one button that starts it, plays the `claimable` chime, and pulses the Build launcher
  (`body.project-ready`) until it is started; **Later** hides it until the project next becomes ready. It emits
  `project:ready`, on which the stray asks to be adopted with an **Adopt me** button in its bubble. Projects ready at a
  load show the card after the city settles, without the chime. It replaces the phone-only "ready" toast.
- **Verbs**: each `ProjectDef` has a `verb` (`Adopt {cat}`, `Wake Flora`, `Open the skies`, `Raise the Aeroline`,
  `Found the Watch`, `Launch the Tidesong`, `Wings up`) and a `readyLine`; the Goals tab and the call-out use them
  instead of "Start".
- **Films**: the moments service keeps a registry of replayable films (`film`, `films`, `replay`): a cutscene `run`
  (which must not change the city on a replay) or a ceremony `spec`. The stray's adoption, Flora's awakening, the
  unlock ceremonies, risen sea wonders (not the two always there) and new eras are registered; Build → Goals →
  Replays lists the earned ones. Replays play whatever the Settings moments mode, through `stage`. Any future
  cutscene registers a film so it is replayable from the start.
- **Note**: `bun run snap` screenshots don't show the ceremony layer (`.fa-stage` on `body`) though it is on screen
  (DOM check: opacity 1, z-index 1000); the cat's film, in the HUD layer, does show.

## D-182 — Instant projects: Adopt plays the film on the click (2026-11-21)

- **What**: a project with `days: 0` finishes inside `startProject` (unlocked and `project:done` emitted in the
  command), instead of at the next pulse. "Befriend the stray" is one: **Adopt** stages the film on the next frame
  (measured 8 ms from click to film, clock paused). Undo takes the unlock back and refunds it (the cat is a stray
  again).
- **Why**: the stray took 8 s of sim time plus up to a pulse after the click, a dead pause between pressing Adopt and
  the film.

## D-183 — "First Light", the founding film; 2D exhibits in the gallery (2026-11-21)

- **Film**: founding a fresh island (welcome screen, New Chapter, "try again") plays "First Light"
  (`modules/tutorial/founding.ts`, ~20 s, DOM / SVG / CSS like "The Stray"): night sea and a lantern boat, dawn
  and the island's real silhouette (per column, the highest ground across it, from `grid.heightAt`), a seed of light
  that greens the land, the founding hamlet (one shape per real building at its own ground height), a hologram of the
  island's real map (`drawIsland` + `mapOfCity`), then the city's name and **Begin**. Staged through
  `moments.stage`; the opening fly-in, the founding toast and the guide wait for it. Skip / Esc; a film (D-181), so
  it replays from Goals → Replays and the gallery. Class prefix `ftl-`: `fd-` was already Flora's dormant card
  (a second clash after `.ch-note`; check a new prefix with grep across `src/**/*.css` first).
- **Gallery**: a `GalleryEntry` may give `panel(level)` instead of `build` (a 2D exhibit: a DOM panel over the
  empty stage, lighting / turntable / clean view hidden). The island cat is one (the city's rig large, cycling its
  acts, coats as levels, a click mews); every film registered with `moments.film` hangs in a **Cutscenes** hall
  with a poster and Play (all films, seen or not: the gallery is the archive). Wonder films are titled "… rises" so
  they don't read as the wonder models.

## D-184 — The founding film opens before any city frame; refinements (2026-11-21)

- **Order**: "First Light" starts the moment a fresh island exists, on top of whatever loading screen is up: in the
  city loader's `work` (New Chapter, "try again") and, for a city chosen on the welcome screen, from `bootGame` just
  before the boot screen lifts (`wizard.premiere()`). `moments.stageNow` starts it at once (not at the next frame's
  turn); the film opens `instant` on black at z 1001 (above the boot screen and the loader). The loader sees a film
  playing and leaves it the clock and the reveal; the camera's fly-in starts as the film fades (`leaving`), then the
  toast and the guide. Measured frame by frame: loader → film and boot screen → film, with no city frame between.
- **Details**: a crescent moon that sets at dawn and a shooting star; the boat (now visible: the island's
  `.ftl-island svg` rule also hid the boat's SVG, scoped to `> svg`) sails to the water in front of the hamlet with
  a wake and its lantern's light on the water, and the seed leaves from that lantern; the sun's glitter path on the
  sea; the green spreads as a circle from the seed with the trees popping as the wave reaches them; the hamlet
  rises in golden morning light (windows lit), full day comes with the hologram (lights off, lantern out); fishing
  docks draw as a jetty with a dinghy, solar spires as a mast under three solar petals; a "you are here" ring on the
  hologram map; long names wrap between words and shrink to fit; on phones the island box centres on the hamlet.
  The film's clock can be held (`filmClock`) so scenes capture exact frames (headless screenshots land seconds late).

## D-185 — A film kit, and three story films (2026-11-21)

- **Kit**: `modules/moments/reel.ts` (`openReel`, also `moments.reel`) holds what every cutscene needs: a full-screen
  stage above the boot screen and the loader (z 1001, in the body box), letterbox, caption, Skip / Esc, the paused
  clock (restored on the way out), a holdable film clock (`reelClock`), stage classes, cues and a shared end card
  (kicker, title dropped letter by letter, sub, lines, button, confetti; focused with `preventScroll`). Stage names
  are prefixed `s-` on the root: a stage called `card` matched the HUD's global `.card` and shoved the whole film
  aside (the third class clash, after `.ch-note` and `fd-`).
- **Films** (each replaces a ceremony; each a replayable film, D-181):
  - "Hello, World" (Flora's awakening, `assistant/hello.ts`): a boot log ("Loading civic empathy… 87%… 87%"),
    petals and an eye, counting the real population twice, the steward's cat on the ledge ("Classification:
    …supervisor") or a gull ("Threat level: snacks"), her first words; the card adds the city's top problem.
  - "Maiden Flight" (the Sky-lane charter, `moments/films/flight.ts`): a test pilot's checklist ("Courage…
    loading"), a countdown, a loop-de-loop on a drawn sky lane, a gull that lands on the roof (its approach computed
    to meet the pod: the lane is flown at an even pace with SVG `animateMotion`), a cheering crowd, a stolen cap.
  - "Something Stirs" (every sea wonder, `moments/films/stirs.ts`): an old fisher catches a boot and dozes on
    while the wonder rises behind him (one silhouette per wonder in `SHAPES`, its tagline and keeper's quote from
    `scenery/lore.ts` on the card), then turns round and loses his hat.
- **Checking**: `scripts/scenes/film.js` plays any film and freezes it at `window.AT` (the reel clock, CSS
  animations and SVG animations), so a capture shows that exact frame.
- **Not yet**: "First Light" and "The Stray" keep their own chrome; moving them onto the kit is a cleanup.

## D-186 — Moments keep their distance from films (2026-11-21)

- **What**: the moments queue leaves 3 s (`GAP`) after any film or ceremony before starting the next, and a ceremony
  that waited behind a film (queued while it played, or starting within a few seconds of its end) plays with
  `camera: false`. A replay the player asks for skips the gap.
- **Why**: a wonder that rose on the same pulse as another moment (a population milestone, an era) had that moment's
  ceremony start the instant "Something Stirs" ended, so the film seemed to run on into the old ceremony, and a
  grand ceremony then flew the camera away. Measured on the real discovery path: before, film → ceremony with no
  gap; after, film → 3 s of the city → ceremony, camera where it was.

## D-187 — A wonder's film flows into its ceremony and the camera goes there (2026-11-21)

- **What**: "Something Stirs" ends straight into the wonder's ceremony (emblem, name, "Sea wonder · risen"), and that
  ceremony flies the camera out to the wonder, framed whole (`at.size` on a moment, 70 for wonders; buildings keep
  30). It is queued as the film's `chain`: no `GAP` before it, and the D-186 camera hold does not apply to it. Other
  moments still wait the gap after it and keep the camera on the wonder. With moments off, the camera still goes
  there. Replays do the same.
- **Why**: the film alone left the player where they were, not knowing where the wonder had risen; the film and its
  ceremony read as one beat, the story and then the place. Measured on the real discovery path: film → ceremony at
  once → camera from the hamlet to the Tide Gates → (3 s) the next moment, camera unmoved.

## D-188 — Films finished like film; richer art (2026-11-21)

- **Finish** (`modules/moments/finish.ts`, `moments.finish(root, set, leak)`): every film (reels, "First Light",
  "The Stray") gets a colour grade (contrast / saturation on its art layer), a slow push-in camera drift over the
  film, a vignette, a light leak breathing at one edge, film grain (a 256² noise plate drawn once on a canvas, a
  `data:` image: both CSPs allow `img-src data:`) and letterbox bars feathered into the picture. The art layer is one
  element per film (`reel-set`, `.ftl-set`, `.cs-set`) so the letterbox, captions and cards stay sharp and still.
- **Art** (`modules/moments/films/art.ts`): `skyline()` draws solarpunk towers by depth (lit face and shaded side,
  window grids with some lit, stepped tops, spires, glass domes, solar petals, roof gardens, terraces with planters),
  `cloud()` draws cumulus with lit tops and shaded bases, `seeded()` keeps a city's films the same on replay.
  - "Maiden Flight": sun with turning rays and a lens flare, two drifting cloud decks, a skyline in three depths
    with haze, a park, platforms with railings and a landing ring, a shaded pod (gradients, glass reflection, fins,
    navigation lights), a glowing lane, a crowd with skin tones, hats and flags, a distant flock.
  - "Something Stirs": golden-hour sky with sun rays and lit clouds, a far island with the lighthouse blinking,
    a sea with depth, the sun's glitter path and drifting swells, god rays behind the rising wonder, foam at its
    foot and its reflection; a planked, shaded boat with an oar, bucket and lantern, ripples round the float.
  - "Hello, World": server racks with blinking lights, cables, a dusk light shaft with dust, her glow on the floor,
    and a detailed dusk city in the window.
- **Gotchas**: in SVG a CSS `fill` beats a `fill` attribute, so a film's stylesheet must not fill what its markup
  shades with a gradient; and SVG classes count as classes (a `<circle class="reel">` matched the kit's `.reel`,
  renamed `spool`).

## D-189 Selection sound signatures

- **Why**: picking a building or object only clicked; the player wanted every selection to answer with a sound
  that matches the thing, to keep play lively and amusing.
- **What**: `modules/audio/cues.ts` (pure, tested in `tests/selectionCues.test.ts`) maps a selection to a cue (a
  list of tone / noise voices). Each building category has a family timbre (doorbell homes, zapping energy, water
  bloops, chiptune tech, marimba shops, clanking industry, whistle sports, birdsong nature, wooden food), transposed
  per type by a hash of its id; ~70 types and every free-standing object (ferry, Aeroline, jet, each sea wonder,
  whales, dolphins) have hand-written signatures (gull + ship bell at the fishing dock, siren whoop at Ember Watch,
  radar ping, Westminster chime at the Bloom Clock, carnival run at Bloomtopia…). Roads tap, bridges twang, group
  selections sweep up a note per building. State is heard: levels add sparkle, heroes a bell, and trouble muffles
  the signature through one low-pass and adds a tail (problem: sour second; off: power-down; fire: crackle + alarm;
  ruin: falling minor). New buildings play their signature after the build chime (max one per 0.4 s); ruins
  crumble and repairs hammer and chime.
- **Rules**: a cue starts at most `MAX_CUE_VOICES` (9) voices and `Sound.play` skips it when fewer than 4 effect
  voices are free, so it never starves alerts. Repeat picks of the same thing and picks under 0.12 s apart are
  silent. A new building type gets a family sound for free; add a `SIGNATURES` entry for a memorable one, and an
  `OBJECTS` entry for a new pickable object key.

## D-190 Flora's entry points and the stray wait for their unlocks

- **Ask Flora** buttons (building / object inspector, the stat cards, the Seedvault reader) and Settings →
  Flora's heads-ups show only once Flora is awake (`floraLocked`, D-092). Asleep she cannot answer, so offering
  her was a dead end. Her orb stays: it opens the dormant card that says how to wake her.
- **The stray** (D-178) visits only once "Befriend the stray" is no longer Locked (`projectStatus` ≠ `blocked`,
  checked once a second). Once seen unlocked on a city it keeps visiting, even if credits dip. While locked,
  `Cat.away` keeps it off the roofs (`come()` refuses too, so a talk or a call can't fetch it).

## D-191 The Tidesong waits for the Grove era

- The `cruise` project (D-144) gains an era criterion: the island must have reached `CRUISE_ERA` (`grove`,
  `src/sim/projects.ts`) before the Tidesong cruise line can start, on top of 4,000 residents, a risen sea
  wonder, a Weather Radar and the credits. Grove (1,000 residents + one charter tier) fits the existing
  resident bar; Canopy (10,000 + four tiers) would have pushed the ferry past the Sky Guard jet.
- Showcase and tests are unchanged: without progression every project is already open.

## D-192 The Tide Remembers: a canon, and the Chronicle that tells it

- **One canon.** The island's background story lives in `docs/lore/bible.md` (team only, not bundled): Halcyon
  the drowned marble republic and its planning mind Meridian, the Drowning and the Long Tide, the Seedvault and
  Flora as Meridian's "cutting", the Tidekin and their Three Promises, the Deep Choir (why sea wonders rise), the
  mainland powers (Concord, Drift, Lantern Orders), First Light and the Island Compact. Existing lore (wonder
  tales, films, hero descriptions, era lines) was aligned to it, not replaced. Player-facing text follows its
  style guide; the open questions (does the Choir want cities? was Meridian a monster or a martyr?) stay open.
- **The Chronicle is a sim system**, not per-viewer UI state: pages are data (`PAGES` in `sim/chronicle.ts`) with
  triggers read from the city, found every 5 pulses, saved (v26) and hashed, so a save carries its history and
  determinism holds. Without progression every page counts as found and nothing is recorded (like wonders,
  D-072). The last page asks one question (`chronicleEnding`, undoable = false like story choices); its answer is
  a page, never a rule change.
- **Seedvault gating.** Lore guides (`docs/knowledge/lore/`, category `lore`) carry `unlock: [page ids]` and show
  (to the reader and to Flora's search) once any is found; `KnowledgeBase.setGate` / `refresh`. Flora reads found
  pages through `chronicle_status` (hints only for the rest), so she never tells a story the city hasn't earned.
- **Film.** "What the Sea Remembers" (`moments/films/remembers.ts`, CSS prefix `hal-`) plays in place of
  "Something Stirs" when the Sunken Colonnade rises, then the wonder's ceremony as before (D-187). Every other
  cutscene carries canon too (First Light: Ama Reyes's lighthouse, Halcyon's columns, the Seedvault door; Something
  Stirs: the Choir's light; Hello, World: Flora's sealed origin; the cat's folklore; wonder and Tidesong
  ceremonies), listed in the bible's "The story in the films" so films and canon change together.
- **Arcs.** Three resident stories carry the plot into play: the Diver, the Concord's offer, the Lantern
  archivist; their endings write Chronicle pages.
- Rejected: storing found pages per viewer in `localStorage` (a save would lose its history and the hash would
  miss it); hiding lore in the guides behind a spoiler toggle (Flora would read spoilers).

## D-193: "Something Stirs" is a serial, shot like film

- **Why.** It plays for six of the seven sea wonders (the colonnade has its own film, D-192), so players saw the same
  17 seconds six times. It is now a six-episode serial with one recurring character: the city's old fisher (one name
  per city from the seed) misses each wonder in a new way, and in the sixth he finally sees one. Episodes follow
  the order this city found its wonders (`episodeOf`; the showcase uses `WONDERS` order).
- **Look per wonder.** Each wonder has its hour (`LOOKS`: sky, sea, sun or moon, clouds, a mood layer: rain that
  clears into a rainbow, mist that parts, night with stars and glowing plankton, an aurora), passed to CSS as custom
  properties, so one stylesheet draws all six.
- **Shots.** The camera is one wrapper (`.sw-cam`) whose `data-shot` selects a CSS animation: a new shot is a hard
  cut and the animation is that shot's move (wide push-in, close-up on the fisher with the horizon out of focus, a
  low tilt-up with shake for the rise, a two-shot, a pull-out). The underwater shot (`su-` prefix) follows what went
  over the side down to the reef, where the Choir's light gathers and something vast stirs (canon, bible Part IV).
- Rejected: picking a gag at random (a replay would differ from the first viewing, and two wonders could repeat a
  gag); a separate film per wonder (six films to keep in step for one premise).

## D-194: Films lead in with an iris, not a cut

- **Why.** A wonder's film or the cat's adoption started mid-game straight over the city: the reel faded in for
  0.8 s and its timeline ran from the first frame, so it felt like it came out of nowhere.
- **How.** `leadIn(root)` (`moments/finish.ts`): the city freezes, the letterbox slides in and an iris closes on
  the live view to black (`--fx-iris`, a registered custom property, so the gradient animates); at the black point
  (`LEAD_BLACK`, 1.1 s) the film's set is shown (`fx-lit`) and the iris opens on it. Until then the set is hidden
  and its CSS animations are paused, and the reel's `wait` holds its clock, so a film's own timing starts where the
  player can see it. Films with their own root (the cat's) await `moments.leadIn`. Endings fade back over 0.9 s
  with the letterbox leaving first. `instant` reels (the founding film over the loading screen) skip it.
- Rejected: a longer cross-fade (still a dissolve of two unrelated pictures); a pre-roll title card (one more thing
  to click past on the sixth wonder).

## D-195: The films are scored

- **Why.** The films had only short UI-style cues; nothing carried the drama (a wonder breaking the surface sounded
  like a chime).
- **How.** A film speaks a small vocabulary on the bus (`moments/score.ts`): `film:state` (on/off and a key),
  `film:bed` (sea, wind, rain, deep, drone, choir, hum: continuous layers it fades) and `film:hit` (the lead-in's
  iris, risers, booms, splashes, plunges, bubbles, heartbeats, thunder, swells, a choir, shimmer, dolphins, gulls,
  a reel ratchet, a sneeze, a shutter, a crowd, the end card's resolve). `audio/film.ts` synthesises them like the
  rest of the game's sound (D-077): beds are noise and oscillators under filters and slow LFOs, built on first use
  and freed after the film; hits are envelopes on a film bus at the effects level with their own voice budget. While
  a film plays the city's music and ambience duck to a tenth. Something Stirs plays each wonder's episode in its own
  key. Films stay free of audio imports: they only emit events.
- Rejected: audio files (licensing, download size, and the game has none); scoring inside each film with Web Audio
  directly (every film would need the audio context and the levels).

## D-196: Films can be shot in 3D on the game's own models

- **Why.** Every film so far was DOM / SVG / CSS over the paused city, so none could use the hundreds of 3D models
  the game already has. The gallery's studio (D-171) proved a side scene can borrow the city's kit and materials
  and draw full screen in place of the city frame. The first test is the stray's adoption film ("The Stray (3D)").
- **How.** `moments/FilmStage.ts` is a second `render.stage`: its own scene, camera and `PostFX`, real buildings by
  type (`addBuilding` → `designPieces`, one `ChunkedInstancer` chunk), module meshes (`add`), a gradient sky with
  additive stars and a moon, and a key light refreshed at 30 Hz. The camera is data: shots on the film clock
  (`moments/shots.ts`, `shotAt`, tested; `rel` shots track an anchor), and `project` pins DOM to a 3D point. The shared
  uniforms a stage holds for its draw moved from the studio to `render/stageUniforms.ts` (`withStageLook`, `LOOKS`,
  `mixLook` for a night-to-dawn grade), and both stages use them. A 3D film is still a reel: the letterbox, captions,
  Skip, lead-in iris, score and end card stay DOM over the canvas, so films can mix 2D and 3D. The stage goes on
  screen at the iris's black point and hands back to the city in the reel's `leaving`, so the fade-out shows the
  city. Its clock holds with `reelClock`, which the moments service now hands out (`moments.clock`; `film.js` used
  to find it through the resource list, which fills up during boot). `PowerManager.animating` keeps it at the active
  frame cap.
- **The cat** (`charm/cat3d.ts`) is procedural: about 30 smooth primitive meshes on a small CPU-posed rig (hips,
  neck, head, four legs, five tail segments, eyes with blinks and pupils), poses as eased targets, and a coat as four
  shared materials (repainting changes colours only). Lamp eyes are emissive, so they bloom.
- **Rollout.** It plays alongside the 2D film while the two are compared: replay "The Stray (3D)" (Build → Goals →
  Replays), or `?film3d=1` for the adoption itself. The 2D film stays the default.
- Measured: 113 draw calls in the film (the city, 128); WebGPU and WebGL.
- Rejected: shooting in the live city (its state, time and weather differ per island, and the city camera is
  everyone's); a 2D cat billboarded in a 3D set (it only reads side-on); a GLB cat (GLB parts don't light or weather
  like the kit, and the game has no asset pipeline for characters).

## D-197: Every film moves to 3D

- **Done.** The Stray, Maiden Flight, Hello World, What the Sea Remembers and all six Something Stirs episodes play
  on the 3D film stage (D-196); their 2D sets and CSS are gone (DOM stays for captions, checklists, logs, labels and
  end cards). Film actors (`moments/actors/`: Person3D, Gull3D, Flora3D, Cat3D) are reviewed in the gallery's Film
  cast hall. The stage gained location shooting (`openLocation`, render-only `world.timeOverride`), a sea, fog
  (set up before the stage opens), rain, clouds, tinted buildings, a sky toggle, handheld drift, and a look `env`
  factor that dims reflections and image light (`scene.environmentIntensity` for the film's own materials).
- **First Light** is shot on location over the player's own island (`openLocation`): the real terrain, sea,
  Tidewatch Lighthouse and hamlet, the hour animated for the film only. Ama's boat comes in over open water (a
  course with sea all the way out, not a lagoon); the seed lands on the highest ground near the hamlet. A founding
  holds the reel (`.hold`) on an opening beat, a brass lantern lit on a dark horizon (spark, flame, bloom, rings,
  rays, embers, its light on the water, "Lighting the lantern" under "The founding of <name>"; at least `LANTERN_MIN_MS`
  so a fast load never flashes), then opens as an iris out of the lantern's burst (`--ftl-iris`), until its first shot
  has compiled and drawn (~0.4 s), then hides the loading screen still finishing under it (`body.film-covers`) instead of waiting
  for its fade (~2 s); the boot screen never leaves the page (`bt-gone`), which once made the hold run to its 12 s cap.
  The stage closes in `leaving` before the fly-in.
  The 2D drawing helpers (`moments/films/art.ts`) are gone.
- **Draw calls.** Actors merge each joint's parts by material (`compact` in `actors/rig.ts`; face parts stay separate
  and cast no shadow) and crowds cast no shadows. Peak draws per film (WebGPU and WebGL alike): The Stray 108, Hello
  204, Remembers 225, Something Stirs 216, Maiden Flight 317, First Light 367. First Light's peaks are the city's own
  shadow refresh while the sun moves or the camera travels (the city at an overview draws ~100, the film ~110–250
  between them); Maiden Flight's are its crowd and skyline.

## D-198: Every 3D film opens with a loading beat

- **Why.** After the lead-in's iris (D-194) a 3D film switches the stage in and its first frames compile shaders:
  on a slower GPU that read as a black or frozen screen.
- **How.** `FilmStage.ready(reel, intro)`, called right after `open` / `openLocation`, shows a themed beat over the
  reel (`moments/loading.ts`, `INTROS`: the stray's lamp eyes, a pod on its lane, Flora's bloom with a scan line,
  Meridian's seal, a pearl in the swell) while the first shot compiles (`compileAsync`) and draws a few frames, at
  least `INTRO_MIN_MS` (1.3 s) so it never flashes, then opens as an iris out of the emblem's burst. The shots set
  before it are pushed back by the time it took. Transform and opacity only (plus the iris mask), so it keeps moving
  during a compile stall. "First Light" keeps its own lantern beat (it plays over the loading screen).
- Hello World's window lost its stone sill: a thin slab under the window flickered as the camera moved.
- Film people have idle life (`Person3D.idle`: drifting glances, nods, weight and shoulders shifting, a quick look
  aside now and then), `talk` (the mouth moves with a line) and `jig` (a rod's bob and twitch); Something Stirs gives
  the fisher each gag's business (sips, binocular sweeps, fussing with the camera, chatting to the fish or his
  granddaughter). The rowboat's floorboards are cut to the hull's cross-section above the waterline (`BOAT_FLOAT`),
  so the sea never shows inside it.
- Something Stirs talks: speech bubbles pinned over the speakers (`LINES` per episode and beat: the fisher, the
  granddaughter, the gull, the fish), the caption bar keeps the narration. The granddaughter stands in the bow, the
  boot comes up slowly to dangle beside his face (filmed in profile), the sunk item settles on the wonder asleep below
  (a cut: it sleeps under the splash, then rises at its own site) where the Choir's light flares, and during the rise
  he grabs the gunwales with the wonder looming behind him. His sou'wester sits back with the brim up, clear of the
  eyes.

## D-199: Shorter nights: the clock runs faster in the dark

Players spent half of every cycle at night and wanted more daylight. `sim/dayClock.ts` gives the sim clock a pace:
`clockRate(timeOfDay)` ramps to `NIGHT_BOOST` (3.5×) once the sun is more than ~5° below the horizon and is
normalised so a cycle still takes `DAY_LENGTH` (360 s). Night is now ~26% of the cycle (was 50%); daylight is
~265 s (was 180 s), and dusk and dawn keep the day pace. `timeOfDay` stays the sun's position, so lights, fireworks
(21:00) and night thresholds still match the sky. Rejected: warping only the render (sim night checks would disagree
with the sky) and shortening the whole cycle (it would shift every per-day rate). Code that turns a past tick into a
clock time goes through `phaseOf` / `timeAtPhase`, never `tick / DAY_LENGTH` (fireworks' `timeAt`, Cause & effect).

## D-200: Fewer natural disasters

Players found crises too frequent. Every difficulty's `eventRate` is 25% lower (Sandbox 0.75, Relaxed 0.9, Steward
1.65, Hard 2.6) and the calm gap `MIN_GAP` is 90 s (was 75). On Steward that is about one crisis every ~310 s of calm
play instead of ~240 s. Escalations and chains are unchanged (they come from neglect or follow a crisis).

## D-201: Notifications fold or close when left untouched

Cards piled up over the city when the player didn't answer them. `ui/idle.ts` gives a notification an idle timer
(`IDLE_SECONDS`) that waits while the pointer is on it (or focus is inside while Tab-navigating) and restarts after a
tap. Untouched: the **milestone card** folds to its pill after 12 s (not remembered as the player's own fold, so a new
or reached milestone opens it again); the **request / happening** and **story** cards shrink to their header strip
(`.mini`, time left still showing; a click opens them, the next change opens them again) after 12 s; the **Day
recap** closes after 9 s (was 14, now paused while hovered); the **Ready to unlock** call-out is put away like "Later"
after 20 s (the Goals tab and the pulsing Build keep it). Crisis warnings and fire alerts are not auto-closed: they are
the ones that must be seen. A new notification card should use `idleTimer` / `autoCollapse`.

## D-202: Smarter highways, a mode banner, the inspector steps aside

Laying roads took precision (an end one tile short of a road left it disconnected, a building in the way left a gap)
and players lost track of being in a build or remove mode.

- **Smart routing** (`smartRoute` in `sim/roadPlan.ts`, shared by preview and command): a drag end within `SNAP` (3)
  tiles of a highway snaps onto it, unless snapping keeps less than 60% of the drawn tiles (a road drawn beside
  another stays on its own line). When the L route would skip tiles for a building, channel or cliff, an A*
  (`routeRoad`: highway cheap to follow, water dearer and never bent, turns cost a little; bounded box) routes round
  them. A click without a drag links that spot to the nearest highway within `LINK_REACH` (24) tiles; phones tap twice
  (preview, then lay). The tooltip says when a stretch joins the network, or warns when it would not.
- **Mode banner** (`modules/mode`): every non-select tool shows a bottom-centre bar in its tone (green build, red
  remove, amber shaping) with the mode's name, how it works and an Exit button, and a matching static frame on the
  screen edge. Phones: one row under the top bars, the how-to left to the dock hint.
- **Inspector**: picking up any tool emits `selection:changed { eid: null }`, so a building clicked by accident while
  building doesn't stay open over the work.

## D-203: A bright, moonlit night

Players couldn't see the city well enough at night to keep playing. The night keys in `world/Atmosphere.ts` now
light it like a bright moonlit scene: moonlight 0.35 → 0.75, sky fill 0.35 → 0.6 (twilight 0.2 / 0.45 → 0.55 /
0.62, so dusk no longer dips darker than midnight), a lighter navy sky and fog, shadows lifted and highlights raised
in the grade, reflections `environmentIntensity` 0.24 → 0.36 at night, and unlit scenery (`skyShade` in
`render/bake.ts`) dims to 0.6 instead of 0.35. Night keeps its blue cast and its glow (window light, roads, bloom).
A first try (moon 1.05) read as a washed-out day and was pulled back. Night flicker at 140 units rose from 0.005% to
~0.01% (brighter edges move more visibly), still far under the day figure (≤ 0.04%).

## D-204: The picture stays sharp over time

Players saw the city go soft and fuzzy the longer they played. Two causes:

- **Dynamic resolution cut the scale for slow frames it couldn't fix, and rarely gave it back.** As a city grows the
  frame time is often the sim or the main thread, not the GPU; the scale fell (to 0.5) and stayed there, because a
  recovery needed three good windows in a row at the active cap and every idle spell (cap 60 → 30, 3 s after input)
  reset the streak. Now (`render/Quality.ts`): a drop is on trial for two windows and undone unless the frame rate
  rose 8% (or meets the target), with no drop tried for 5 min after a failed one; idle windows no longer reset the
  recovery streak; the floor is 0.7; every change logs `[dynres] …`.
- **Weather haze was heavy.** In the Haze season (0.75), heatwaves (0.6) and rain (0.35) the fog came in to ~45 tiles
  and the horizon turned milky over the whole city. Now haze is 0.4 / 0.35 / 0.2, it pulls the fog in less
  (`near × (1 − 0.6 h)`, `far = near + 700 (1 − 0.7 h)`), and tints the horizon less: the season reads as a warm, dusty
  distance, not a blur over the city.

## D-205: Auto-collect tips (the tip jar)

Players wanted to build without watching for bubbles. Once a city's treasury has held ◈1,000 (`AUTO_TIPS_AT`; a
fresh island starts at ◈2,000, so it is open from the start, as asked) the tip jar opens for that city for good
(`tipJar` in the juice module's save hook, cosmetic like Firsts: not sim state, not hashed). Each bubble then pops
itself `AUTO_AFTER` (3 s; golden 4.5 s) of running time after it appears through the same `pop` as a click (burst,
resident's words, coins into the counter, `collectTip` with the combo), so showers (bubbles a beat apart) still chain a
combo and a player can always pop sooner. A ring (`.jc-ring`, stroke-dashoffset only) fills round the bubble and holds
while the clock does. The first self-collecting bubble in a city explains it once in a toast. Per viewer it can be
switched off (Settings → Display → Auto-collect tips, `bloomgrid.tips.auto`). Rejected: unlocking on ◈1,000 of tips
earned (offered; the player chose the treasury rule).

## D-206: Full view while laying highways

Highways are drawn across the map, and the build panel, the right-hand cards and the consoles covered much of it.
With the highway tool in hand (`FULL_VIEW` in `modules/mode`), `body.view-max` fades out the build panel and its
floating preview, the right column (milestone card, inspector), the request / story / ready cards, the advisor, City
Pulse, the dock row and the juice stack. Only opacity and visibility change, so everything returns exactly where it
was the moment the tool is put down (Exit on the banner, Esc, right-click, or another tool). The top bar, the mode
banner (the way out), the tooltip and toasts stay. Other tools keep the panels: they are single clicks near what the
player is looking at.

## D-207: One save slot per island

There was one slot (`slot1`): founding a new island and saving overwrote the last city. Now each city gets its own slot
(`isle-<time>`, safe as a desktop file name), made on its first save; `SaveManager.slot` follows the running city (a
load or resume sets it, `city:reset` from founding clears it), so **⌘S** only ever updates the island on screen. The
New Chapter dialog's Resume pane lists every saved island newest first (day, residents, difficulty, when; the running
one marked *On screen*) with its map, and deletes one with a bin button pressed twice within 4 s (Esc disarms).
**⌘L** and Settings → Game → Islands open that list instead of loading a fixed slot. The listing lives in
`src/game/saves.ts`, import-light so the welcome screen reads it before boot (D-148). No migration: an old `slot1`
save lists as one more island. Rejected: a fixed number of numbered slots (players think in islands, not slots) and a
separate save browser (the dialog already shows maps and is where a city is chosen).


## D-208: A quiet pause, rarer natural disasters, one notice per event

- **Pause:** while the pause card is open (`body.city-paused`), the city dims behind a darker veil and every other
  HUD layer (`#hud` children, the juice and charm top layers, the interact card, the mode bar) fades out by
  opacity / visibility; *Keep planning* (a fold) brings them back. The pause module emits `pause:state`, and the audio
  module fades the master bus to silence, starts no new voices and schedules no music bars until Resume.
- **Natural disasters** (`NATURAL_CRISES` in `sim/crises.ts`: monsoon, king tide, heatwave, tornado, tsunami,
  landslide, earthquake, thunderstorm) roll at `NATURAL_ODDS` (0.5) of their weight, both in the scheduler and as
  chain links. The removed share becomes a roll where nothing comes, so man-made crises don't fill the gap.
  Escalations from neglect are unchanged (the steward can prevent those).
- **One notice per event:** a crisis card is its forecast (no toast on top); a start toasts only when its card was
  closed; tornadoes and tsunamis show only the Prepare panel (no crisis card, no second forecast toast); Flora no
  longer posts a notice when a crisis begins; a residents' request opens its card without a toast on desktops
  (phones, where the card sits folded, keep the toast).

## D-209: A city-view zoom floor, and the way back after a ceremony

- **Zoom floor:** the city camera stops at `minDistance` 18 (was 6) and never looks flatter than `pitchFloor(distance,
  aim)`: the eye stays `MIN_EYE` (12) above the orbit point, so zooming in tips the view down instead of toward the
  horizon, and the camera keeps `GROUND_CLEAR` (5) above the terrain under it. Far views and aimed landmark postcards
  are unaffected; explore modes, the tour and films drive the camera themselves. Street level is what walk mode is for.
- **Way back:** a ceremony that flies the camera off (`Ceremony.takeFrom`: the view before `locate`) ends with a card
  under the top bar (`moments/returnCard.ts`): where the place is (compass from the island centre, tiles from the old
  view) and **Back to where you were** (`setView` of the old view), then a toast with ⌖ Show to the place. Shown only
  when the camera moved ≥ 45 tiles; Esc / × / Stay here / the call-out idle time put it away; the ready call-out hides
  while it is up. The wonder ceremony also names the coast it rose off.

## D-210: Full view for every tool in hand

D-206 gave only the highway tool the whole screen. Players wanted the same for everything picked from the Build
panel: placing a building, removing, channels, retrofit, mist, reclaiming and the Green Weaver. Now any tool with a
`MODES` entry sets `body.view-max`, so the panel and cards fade out the moment an item or action is chosen and come
back when the tool is put down (Exit, Esc, right-click). The building's ghost on the map is the preview; the mode
banner names what is being placed and keeps the way out. Supersedes D-206's "other tools keep the panels".

## D-211: Buying fireworks shells

Players wanted fireworks without (or on top of) a Fireworks Factory. `buyFireworks { shells }` (undoable: what of
the crate is still racked goes back, refunded pro rata) delivers a crate at once, spread over the kinds scarcest
first, at `BUY_MARKUP` (2.5×) the factory's material cost, so a factory stays the cheap way. Racks hold
`rackSize` = max(factory storage, `BUY_RACK` = one grand show). A city with no factory launches from `bargeSite`:
the sea tile nearest its buildings' centre with open water three tiles round, so stray sparks fall on water (the
launch rises from the water surface, not the seabed). `fireworks.bought` is saved (v27) and hashed. Dashboard →
Fireworks has Buy 30 / Buy 60; Flora has `buy_fireworks`.

## D-212: Highway and Remove up front

Highway and Remove are by far the most used build actions; Channel, Retrofit, Mist, Weaver and Reclaim are rare.
They no longer share one grid of equal tiles. In the Build panel `PRIMARY` (`road`, `bulldoze`) are two large tiles
(icon in a tinted square, label, a how-to line from `ACTION_HELP[id].line`; Remove in the crit red), and the rest
sit in a compact row of five under them. Outside build mode the launcher is a row, `build-launch`: **Highway** ·
**Build** · **Remove**, so either tool is one click from the city view (picking a tool opens build mode as before,
and D-210's full view takes over). Phones show the two as icon buttons beside Build in the dock row. Still no
hotkeys (D-101). Putting either down (Exit, Esc, right-click) leaves build mode instead of bringing the panel back
(`QUICK` in `modules/build/index.ts`); the other actions still return to the panel.

### D-212 addendum: H / R keys, touch moving, Upgrade all

- **Keys:** Highway is **H** and Remove **R** (the rest stay click-only, D-101). R still rotates while placing or
  carrying (the tool's own key handler runs first). Pressing a tool's key while it is in hand puts it down; tool
  keys ignore Shift / Alt. Settings → Controls moved from H to **Shift+H**.
- **Moving on phones:** the new `move` tool. A long press (450 ms, finger still) on a building in Inspect picks it
  up under the finger: drag, lift on a green lot to move it (on a red one it stays in hand with the reason). Every
  inspector has **Move** (`construction.startMove`), on any device: a mouse carries it, a tap aims and a second tap
  on the same spot moves it, a press on the preview drags it again, one finger elsewhere pans. The banner names
  it, with Rotate and Exit. It is not build mode, so the Build panel stays closed. Desktop Shift-drag is unchanged.
- **Upgrade all:** highway mode's banner has **Upgrade all ◈N**: every highway tile one level, raw tracks first
  (`upgradeAllPlan`), one `upgradeRoad` command (one undo). Disabled while the treasury is short, hidden when every
  highway is a boulevard.

## D-213 — No inspector 3D stage on phones or tablets

Selecting a building on a touch tablet waited on the inspector's 3D stage (reading the building's pieces back,
compiling the stage's shader variants, a second scissored render each frame). Phones already skipped it
(`isCompact`); tablets are wider than the compact query, so they didn't. `isHandheld()` (`platform/device.ts`:
compact **or** a coarse primary pointer) now gates the stage in `Hud.stageFor` and `selectGroup`: on phones and
tablets the inspector opens straight to its details. Touch-screen laptops keep a fine primary pointer and the stage. Without the stage the inspector would fall back to the 360 px column and wrap its four fact cards, so on tablets
(`body.touch:not(.compact)`) it keeps the staged 450 px width.
The Build panel's floating preview is unchanged (still desktop and tablet). The preview module's background
warm-up is skipped while compact, since phones never open a stage.

## D-214 — Build mode hides the building inspector

Opening build mode clears the selection, so an open inspector closes, and `body.building .rightcol > .info` keeps
it hidden while build mode stays open (a building clicked meanwhile shows nothing until Done). Building wants the
whole map; the inspector covered the right side of it. Picking up a tool already cleared it (D-206).

## D-215 — Move-in chips gather, one at a time

Move-in chips (D-173) floated up to three "+1"s every second in a growing town. Now each home gathers its new
residents for `MOVE_IN_HOLD` scans (≈6 s) and only one chip floats per `MOVE_IN_GAP` scans (≈3 s): the biggest
gathered gain in view, as "+N". Gains that wait out of view for four holds are dropped (`modules/juice`).

## D-216 — Films hide every layer over the picture

A film's 3D is drawn on the city canvas, under the HUD, and the reel's middle is clear, so an open Build panel,
inspector, card or dialog sat over the picture. While `body.cutscene-on` (set by every reel) each body child but the
reel, `#game`, the boot screen and the city loader is hidden (`opacity` + `visibility`, rule in
`moments/reel.css`), and comes back as it was when the film ends. Hidden, not closed: no panel state to restore.

## D-217 — The boot bar creeps through long stages on the compositor (2026-11-22)

**Context:** On phones, founding a city sat at 75% ("Compiling luminous materials") for many seconds with nothing
moving. Measured with a 6× CPU throttle (phone-like) on a fresh island: the warm-up (`ChunkedInstancer.warmup`, D-030)
is ≈3.8 s of one frame, nearly all of it three's node builds on the main thread (pipeline creation ≈8 ms in total);
most of it is the city's own first frame (terrain, sea, greenery, module meshes, post passes), not the kit's
temporary instances. While it runs the page can't paint, so the bar and the % sat still.
**Rejected:** splitting the warm-up into frames so the bar could step: each extra frame cost ≈0.4 s at 6× (≈+10%; 15
frames +80%), even with everything but the group hidden: three's node builds are much cheaper in one frame. Deferring
unused kit pieces on handhelds: a fresh island already shows all but ≈5 of them (≈0.1 s). Warming only what the
opening view shows: the founding film and fly-in see the rest, so it only moved the stall into them.
**Decision:** `BootScreen.stage(label, progress, creep?)`: a stage that blocks for long starts a slow ease-out
`transform` transition of the bar towards `creep.to` over `creep.ms`, plus a sheen running along the fill
(`.bt-busy`), both compositor-only, so they keep moving while the main thread is busy; the % fades meanwhile (text
needs the main thread). The next stage settles the bar from wherever it got to. `createGame` passes creeps for
founding / restoring, seeding (modules) and the warm-up; boot time is unchanged.
**Consequences:** Verified with a Chrome screencast at 6×: compositor frames keep coming at 60 Hz through the warm-up and
the bar moves 75% → ≈88%. Headless screenshots wait for the main thread, so they can't show this. Real cuts to the
warm-up need fewer node builds (fewer meshes or materials in the first frame), not more frames.
The city loader (`LoadStage`) takes creeps too: an in-game founding's "Raising the island" (the reset rebuilds terrain and
greenery, ≈1.1 s at 4×), the scenario stage (`FoundStage.creep` in `game/newCity.ts`), a save's "Rebuilding streets and
towers" (`SaveManager.load`) and the loader's settle frames.

## D-218 — Films prepare their first shot with real frames when bloom is on (2026-11-22)

**Context:** The founding film's lantern hold ("First Light", D-184) and every 3D film's loading beat (`FilmStage.ready`,
D-198) waited on `renderer.compileAsync(scene, camera)` before drawing a few frames. With bloom (Medium and up, phones
included) that builds depth-0 variants no frame uses (D-030), so the first real frames then built everything again.
Founding through the welcome dialog at 6× CPU throttle: hold 5.1–5.7 s.
**Decision:** `PostFX.precompile()`: `compileAsync` only on the direct path (no bloom: Low), where it matches what frames
draw; with bloom nothing, and the frames the hold already waits for build the shot. The founding film uses the city's
`postfx`, `FilmStage.ready` the city's on location and its own (configured first, `syncFx`) on a set.
**Consequences:** Hold 2.3 s at 6× (of which `LANTERN_MIN_MS` 1.7 s is the floor); Low unchanged. Later shots build on
first draw as before (the old pass never covered them with bloom either).

## D-219 — The time-lapse replays a history ledger, render only (2026-11-22)

**Context:** Plan v6 ("The Island Remembers"): a film of the player's island from its founding to today. The command
log (`CommandStack.log`) is deterministic, but it is not saved, and crises, the director, happenings, stories and
module save hooks feed the city too. Re-simulating hours of play (72k ticks plus field passes for two hours) would
take minutes and diverge on any missing input.
**Decision:** The sim keeps a compact **history ledger** (`city.history`, `sim/history.ts`): birth tick per building
serial, gone records (a move or an undone demolition gets its birth back by serial and type; an undone build is
forgotten through `releaseUid`), birth tick per highway tile, tier changes, marks (era, wonder, project) and samples
(day, residents, credits, harmony, buildings; one per 30 pulses, halving past 400). Nothing is recorded at tick 0,
so the scenario and every pre-v28 save count as founding content. Saved v28 (empty ledger on migration) and hashed.
The film is **render only, on location**. `BuildingRenderer.veil` takes a building's pieces off the map with its own
`remove`, and `unveil` re-adds them with the normal rise. `RoadRenderer` keeps a hidden-tile mask (chunks, decks
and verges are drawn without veiled tiles; `reveal` sets the build-in time), `BridgeRenderer` skips spans with a
veiled deck, wind rotors follow `building:veiled`, and mobility and walkers hide while `timelapse.playing`.
`timeline.ts` (pure, tested) orders the reveals: a founding act from the heart (2.5–6 s), then the years (20–54 s)
on a warp of 35% clock and 65% event rank, so quiet stretches compress. Captions are spaced 2.4 s apart (era >
wonder > crisis > project). One day arc runs over the whole film, never a flicker of days, and the camera orbits
the risen bounds with an aspect-aware fit.
**Consequences:** Measured on the showcase with a fake 12-day past (`scripts/scenes/timelapse.js`, `FAKE`), headless WebGPU:
56 fps at the busiest stretch (≈1.5k buildings and 4.9k road tiles rising), 179–209 draw calls; at the full-island
end frame 277 (WebGPU) and 307 (WebGL2), in line with the known full-island maximum (≈322). Skip lifts the whole veil
(0 veiled, 2,472/2,472 standing). Cities have a past only from this version on. Ghosts of demolished buildings,
levels through time, incident flares and other attachments (signs, Aeroline, pods) are Phase 33.

## D-220 — The time-lapse is promoted, not one chip among the Replays (2026-11-22)

**Context:** "The Island Remembers" (D-219) is the one film that grows with the player's own city. As a chip among the
Replays, below the charters, nobody would find it.
**Decision:** A featured card goes first in Build → Goals, in the film's own colours (dawn blue, gold button): dial,
"Day 1 → day N", running time, and a **New** tag once `NEW_DAYS` of history are unwatched. The time-lapse leaves the
chip list, and an unwatched film counts on the Goals badge (and so on the Build launcher). An invitation call-out
uses the ready call-out's slot under the top bar. It shows the first time the island has a story (from day 2),
after each new era, and after `GROWN_DAYS` of growth since it was last watched or offered. It steps aside for films,
ceremonies, dialogs, the pause card and the ready call-out (which keeps its stronger claim), and idles away
(D-201). Watched / offered days are module state (save hook `timelapse`), not sim state: they never touch the hash.
**Consequences:** At most one invitation per `GROWN_DAYS` plus one per era. The running time on both is computed from the
timeline once per day (it reads every building and highway tile).

## D-221 — The time-lapse's later reach: ghosts, levels, gates, map scrub, packed births (2026-11-22)

**Context:** Plan v6 Phase 33. The film replayed only what stands now, at today's level. Things that unlock projects
brought (the Aeroline, drones, ferry, jet) stood from the first frame, and the ledger's birth pairs would grow past
100 KB on a big island.
**Decision:**
- **Ghosts:** gone records that stood at least `MIN_LIFE` are placed on the film stage, which shoots on location,
  with `placeBuilding`'s lot matrix and a faint memory tint. They fold away at their end tick.
- **Levels:** a building rises at its level of the time (`tier0`: 0 for a build, one below its first recorded change
  for founding content) and changes on `tier` events. Every building is synced back to its own level at the end and
  on every exit.
- **Flares:** crises with a place get an additive ring and pillar, sized to the camera distance.
- **Gates:** `timelapse.shows(project)` is false only while the film plays and before that project's mark on its
  clock. The Aeroline, police, ferry and Sky Guard modules AND it into their visibility. Aurora searchlights stay off
  over veiled towers.
- **Entry points:** a game-over button, Flora's `play_timelapse` (registered from the module, after her own tools, so
  her menus keep their letters; no grammar change, no input), and the City map History slider. The slider repaints
  only the pixels at a tick, coalesced to ~16 Hz.
- **Packed births:** saved v29 groups births by tick and delta-codes the ids (`packTimes`); v28 is migrated.
**Consequences:** A fully dated founding city's ledger is ≈33 KB (≈150 KB as pairs). The ghosts' pieces live in the film
stage's instancer and go with `stage.close`. Things without a project mark (the showcase opens everything) show from
the first frame as before.

## D-222 — Flora's look ahead runs a copy of the city in a worker (2026-11-22)

**Context:** Plan v7 ("Postcards from the future"). `forecast.ts` (D-157) extrapolates trends, but crises, the
director, ageing, migration and sea rise only show by running the sim. Measured in node: one in-game day takes ≈2.1 s
on the founding city and ≈0.7 s on a fresh island, too slow for the main thread.
**Decision:** `foresee(save, { days })` (`sim/foresee.ts`, pure) deserializes a copy, runs `simSystems` with no
commands ("if nothing changes"; crises and the director as the save has them, from its own rng state, so it is
deterministic), and returns a JSON `Projection`: start / end snapshots (after one settling pulse), samples about once
a sim minute, level changes, ruins, removals, incidents with places, marks, sea rise, and the council day. It runs
only in `modules/future/forward.worker.ts`, because ECS component stores are global per JS realm: a second `City` in
the page would write over the live one. Tests run it on a save. The service `future` serializes the city, runs one
worker at a time (a new request or `cancel` terminates the old), posts progress per day, and keeps the last
projection while the city is left alone (same command count, within `FRESH_TICKS` = 600). Horizon `DEFAULT_DAYS` = 10.
**Consequences:** In Chrome, the showcase projects at ≈1.45 s per in-game day with the page at 60 fps. The worker is its
own ≈470 KB chunk (sim + content, no three.js; sim purity keeps it so). One projection is one possible future (one
crisis roll); a range is Phase 36.

## D-223 — "If Nothing Changes" plays the projection forwards, render only, then a postcard (2026-11-22)

**Context:** Plan v7 Phase 35. A projection (D-222) is numbers. The steward should *see* where the city is heading,
and be one click from doing something about it.
**Decision:**
- **Order:** `future.show(days)` runs the worker first, behind a progress chip with Cancel (the run takes seconds on
  a big city), then stages the film through the moments queue, then shows the postcard.
- **The film:** shot on location, today to the horizon in 24 s on a linear clock. Projected level changes use
  `replayTier`, ruins `BuildingRenderer.replayRuin` (the real collapse look), and removals the veil. Crises flare
  where they strike, with a "Day N · name · district" caption, and the camera leans toward them for a few seconds.
  Counters show residents and harmony with their deltas. Every touched building is `rebuild`-ed from the sim on any
  exit, so nothing projected stays on screen.
- **Postcard:** a HUD card (z 40, over call-outs and alerts). Rows for residents, harmony and credits, a verdict (the
  council's day; slipping; or growing but losing buildings), what happened on the way, and up to three of Flora's
  levers from `proposeBuilds` (plus fire cover when the run saw fires). Levers build through the agent's `build`
  tool, like her console's proposal cards. Also *Watch again* (same projection) and *Look further* (30 days).
- **Flares** are shared with the time-lapse (`timelapse/flare.ts`), with a shorter pillar (1.3× the ring's base
  size): from a high camera the old one slanted off the frame.
**Consequences:** The levers answer the city's problems now, not ones the run only finds later; Phase 36's what-if loop
shows what a lever changes.

## D-224 — Look-ahead entry points and the what-if loop (2026-11-22)

**Context:** Plan v7 Phase 36. The look ahead (D-222/D-223) is only useful if the steward finds it at the moment of
doubt, and only convincing if a change visibly changes the answer.
**Decision:**
- **Entry points:** a button under City Pulse's *Coming up* (where forecasts already live), one in an indicator's
  click panel under its forecast line, and Flora's `look_ahead`. Her tool is registered from the future module after
  her own tools, so her menus keep their letters; it takes no input, shows the postcard and returns a compact
  summary she can talk about.
- **What-if:** the postcard keeps the last projection it showed. A new one at the same horizon, starting no earlier,
  adds *vs last* chips (the end values against the last look's), plus a line when losses or the council's verdict
  changed. A built lever offers *See the difference*: a fresh run, postcard only, so the comparison takes seconds,
  not a film.
- **Three futures deferred:** three seeds would give a range but triple the run (≈45 s on the showcase). The
  postcard says it is one possible future, and the guide tells players to judge trends across looks.
**Consequences:** The *vs last* numbers also include whatever the city did meanwhile (it keeps playing between looks).
That is honest, since it is the city's real course, but it is not a controlled experiment.

## D-226 — People and wildlife to the island's scale (2026-11-23)

- **Why**: players saw a walker taller than a car and butterflies the size of a head. The scales were set by eye
  (D-122, D-124) against nothing. The reference is 1 tile ≈ 11 m: a storey 0.32, a door 0.24, a hover-car 0.32 long
  and 0.13 high, and the explore steward ≈ 0.2.
- **Walkers** `FIG` 1.4 → 0.9 (≈ 0.29 → 0.19 tiles tall, the steward's height). `PACE` 0.13 tiles/s (was 0.18–0.3)
  and stride 26 → 40, so the smaller figures stroll and their feet don't slide.
- **Wildlife** (explore modes): butterflies 0.15 → 0.04 wingspan, flying at head height (0.16, was 0.45); rabbits
  0.16 → 0.05 long, hop lift scaled; fish 0.34 → 0.1 long, leap 0.42 → 0.15; birds 0.43–0.8 → 0.12–0.24 wingspan,
  fold dip 0.35 → 0.12. Still a little larger than life so they read on screen.

## D-225 — The Archipelago: neighbouring islands, trade agreements and envoys in the sim (2026-11-23)

Plan v8, Phase 37. Four neighbouring islands (`NEIGHBOURS` in `sim/archipelago.ts`: the Drift's Brightwater Flotilla,
the Concord's Bastion Halden, the Lantern Orders' Vellum Holm, the free Kestrel Cay), state `city.archipelago`
(`archipelagoState.ts`: relation, prosperity, their crisis and director, agreements, the envoy, a dealings log;
saved v30, hashed).

- **Trade through the main grid.** Energy and water balance per network, so agreements attach to the network that
  produces most of each (a harbour interconnect) in `pulse.ts` pass 1; food joins the food total. A shipment really
  moves supply tiers. Credits land in `stats.trade` and `netIncome` (D-115).
- **Exports never cause a shortage:** they ship only what is spare above `EXPORT_MARGIN` (5%) of home use. Imports
  deliver only what the partner can spare (their crisis cuts it). Sizes are shares of the city's use at signing, so
  one rule fits a hamlet and the showcase. Prices from a base per good × the buyer's need × relation.
- **Envoys (dispatches) are their own one-at-a-time card**, not happenings: they come from someone, carry relation
  consequences and can arrive during a crisis (a friend's offer of help). Answers are final (`answerDispatch`,
  undoable = false), like story choices; an envoy left waiting counts as a refusal.
- **Rng only while `auto`** (off in `makeSim` and the demo): their fortunes, crises and envoys. Contact (by era) and
  relation drift are deterministic and run regardless.
- **Their storms reach the island only through the director's queue** (`queueCrisis`, kind `chain`, the cause names the
  neighbour), with auto crises and a director band: it respects the director's gaps and Sandbox has none.
- **Perks through existing mod keys** (`tourismMul`, `interest`, `floraDiscount`, `damage`): no new reader. A Hostile
  neighbour ends its agreements (embargo).
- `archipelagoHash` lives in the import-free state module: `City.ts` importing `archipelago.ts` closed a cycle
  (→ levels → hazards) that left `registerCrisis` undefined in some test import orders.

## D-227 — The Archipelago's chart, envoy card, horizon islands and Flora's tools (2026-11-23)

Plan v8, Phases 38–40.

- **Chart dialog** `modules/archipelago/` (compass in `hud.lead`, **T**, the dashboard's `--dlg-w` frame; phones the
  `--sheet-h` sheet): SVG sea, HTML labels anchored on their dot and running toward the centre (never off the edge on
  a phone). Repainted at 2 Hz while open, the chart's marks only when contact, tiers, crises or trades change.
- **Envoy card** reuses the story card's frame and stacks with the `.jc-m` cards; first contact is a minor moment,
  silent on a city's first pulses (the showcase, an old save) so loading never plays four.
- **On the horizon:** one merged `Kit` mesh per island in the sea wonders' `wonder` material, ~330 tiles offshore (read
  through the fog at overview zoom), no shadows; a squall mesh over a struck neighbour; up to six cargo boats as plain
  meshes posed on the CPU from `U.clock` (≤ 6 matrices a frame). Measured: +5 draw calls at full-island zoom, ~67k
  vertices for the four islands, 9 ms module init.
- **Flora:** `neighbour_islands` (read) and `set_trade` (mutate, undoable). Not `archipelago_status`: every `*_status`
  name scores the word "status" in `selectMenu` and pushed *Headline state* off a plain "status" menu. Flora does not
  answer envoys (answers are not undoable; the steward answers on the card).

## D-228 — The demo films on video time: the reels' clock and CSS animations are stepped per frame (2026-11-23)

The demo (`scripts/demo.mjs`) was re-cut for the features since D-163: the time-lapse "The Island Remembers", whales
breaching, the Aurora Gemini light show, "If Nothing Changes" and its postcard, and the Archipelago chart (21 shots,
~2 min). Filming the 3D reels frame by frame needed two more clocks on video time besides the engine and `U.clock`:

- **`reelClock.virtual`** (`modules/moments/reel.ts`): when a number, `reel.wait` counts it (ms) instead of wall time.
  A captured frame takes far longer than 1/fps, so wall-time waits ended films seconds into the shot. The demo
  advances it with every frame (by `rate`× for a film shot that plays faster); `null` (play) is unchanged.
- **CSS animations and transitions** (`document.getAnimations()`): each is slowed to a rate of 1e-4 when first seen
  and its `currentTime` stepped by the frame's dt, so captions, letterboxes, cards and panels ease in on the video's
  clock rather than popping; `animationend` / `transitionend` still fire when the stepped time passes the end.

Films start off camera (uncaptured frames until the reel has the `s-play` class) and are skipped at the cut. The sim
tick is pinned at 61203 (bloom season, two seasonal cycles in) so the made-up 16-day past the time-lapse replays on
the showcase (as `scripts/scenes/timelapse.js` `FAKE`) lies before "now". `--only 2,9` renders single shots to their
own clips for a quick look. The page is laid out at 1920 CSS px and drawn at 2 device pixels each (`--css-width`):
laid out at 3840 CSS px, as before, the HUD, Flora's console, the postcard and the chart were a quarter of the
frame and unreadable. Ultra caps the renderer at pixel ratio 2, so the 3D still fills the 4K frame.

**Rejected.** A chase of a cargo boat out to the Brightwater Flotilla: the boats and horizon islands are built as
silhouettes read through fog at overview zoom (D-227) and look like blocks up close. The police drone sortie: too
small to read at a framing that shows the precinct.

## D-229 — Release builds find mlx.metallib where mlx-sys 0.6.0 actually puts it (2026-11-26)

The aarch64 release job failed at `beforeBundleCommand`: `scripts/mlx-metallib.mjs` looked for
`mlx.metallib` under `src-tauri/target/**/release/build/mlx-sys-*/out/build/lib`, the layout of the
mlx-sys version Flora was first ported from. mlx-sys 0.6.0 (pinned in Cargo.toml) instead writes it
to `$MLX_RS_METAL_PATH/mlx.metallib`, defaulting to `~/.mlx/lib/<mlx-c-key>/mlx.metallib`; its build
script only warns if that file is missing. The script now searches the explicit path, the `~/.mlx`
default and the legacy OUT_DIR layout, and copies the newest file to `src-tauri/resources/`.

Release CI sets `MLX_RS_METAL_PATH` to `src-tauri/target/mlx-metal` (inside rust-cache's target tree)
so a restored cargo cache also restores the metallib — otherwise a cache hit skips the build script
and `~/.mlx` is empty on the fresh runner (the reason the MLX array test is ignored). Changing the
variable re-runs mlx-sys through its `cargo:rerun-if-env-changed`. Local `tauri:build:mac-arm64` builds
need no env: they use the `~/.mlx` default.

## D-230 — Look and feel pass: quiet arrivals, night water, beaches, close-up halos, a shaped day (2026-11-26)

A review of the showcase from five views found three things that cheapened the look; each has a rule now.

| Problem | Fix | Rule |
| --- | --- | --- |
| A city that had just loaded played a 50,000-residents ceremony and toasted "A transit city" and "Credits recovered" in its first seconds (its homes fill from 47k to 57k over ≈20 s); a ceremony also drew over the pause card | `settleClock(ctx)` in `src/game/settle.ts`: `SETTLE_TICKS` (300) sim ticks after boot, `city:reset` or `load:done` in which population milestones only raise their baseline, consequence starts and tier recoveries stay silent; the moments queue waits while `body.city-paused` or a `.modal-scrim` is up | A notice about a change of state asks `settling()` first: arrival is not news. Ceremonies never stack on another card that owns the screen |
| Night water was the brightest thing in a night frame (pale shallows under the bright moonlight of D-203) | `Water.ts` darkens and blues the base by `U.night`, dims its cyan glow and foam; highway lines glow at 0.75× activity instead of 1.2× | Windows and lamps outshine the sea after dark |
| Grass ran straight into the sea: the coast rises past the old 0.35-unit sand band within a tile | `Terrain.ts` bakes a chamfer distance to the sea per corner (`coastDistance`, also for the outer ring) and blends a ragged beach about 3 tiles wide onto low land (h < 1.9); rebuilds refresh it and repaint 4 tiles round an edit. Greens a little less lime, dry drifts stronger | Shore looks come from distance to water, not height |
| From the overview, the `haloRing` torus (on 68 building types) was the loudest detail | `haloRing` gets `lod: 120` and `lumenThin` the dithered fade | Thin decorative loops are a close-up detail |
| Day looked like one long noon under a milky horizon | New keys at sun elevation 0.2 (warm light, warm horizon) and 0.42 (more contrast, less fill); noon has a bluer sky and less saturation | Noon keeps its fill (0.72) and contrast (1.04): more of either raised the day flicker probe at 20 units from ≈0.031 % to ≈0.044 % (thin spokes against deeper shade). Measured after: 0.032–0.035 % (20), 0.037–0.041 % (35) |

## D-231 — Roaming whale pods, a better humpback and its waves; shadows fade instead of switching (2026-11-27)

**Whales.** The pods circled one fixed spot each for ever. They now roam a ring of eleven feeding grounds round the
island (`modules/scenery/whaleRoute.ts`: `GROUNDS`, 150 s at each, eased legs at a mean 1 unit/s, a lap ≈ 1 h; pods
start at their old homes). It is pure maths on `U.clock`, so the shader, the inspector (*Journey* line), the inventory,
the ferry, the discovery toast and the demo agree; `tests/whaleRoute.test.ts` keeps every ground and leg in deep sea
on several seeds and clear of the standing wonders. The scenery module moves each pod's mesh and hands the shader its
velocity (`route` uniform, one material per roaming pod): under way the pod closes up to a third of its circle and
heads along its course. The humpback is rebuilt: a 52 × 28 lofted body with the hump and tail-stock knuckles,
tubercles on the rostrum and chin, the jutting lower jaw, a dark mouth line, throat grooves as ridges and soft pale
scars that differ per whale; real flukes (swept, pointed, scalloped trailing edge, notch, a black-and-white underside
in four patterns) and long knobbly flippers built as closed cambered blades; a hooked dorsal fin; chin barnacles.
The old ring of white hexagon flecks is gone. Water effects are a transparent child mesh (`whales.waves`, one draw
per pod): a thin Kelvin V, a churned trail, a bow wave and the glassy footprint behind a whale at the surface; rings
and broken foam (smooth value noise) spreading from the last breach, surfacing or dive, placed where the whale was
when it happened. Every line widens to at least ~1.5 px and fades by `fwidth`; spray and spouts grow from nothing
nearer than ~500 units and lumen spots fade out by ~300, so nothing twinkles from the island view. Night foam is dim
(D-230) with a faint plankton glow.

**Flashing in the island view.** Probes found the O view itself calm (still or slowly panned, ≤ 0.013 %); what
blinked was shadows. Chunks are 128 units, casting was picked by ground distance at 0.45 of the shadow map, and every
switch while panning dropped or added a whole block of shadows (6 bursts of 12–14 batches in 200 frames of a gentle
pan). Now received shadows fade toward the map's edge in the map's own space (a wrapped PCF `filterNode` on the sun,
`U.shadowFade` in map half-sizes: 0.78→0.97 close, 0.40→0.65 far out, eased by zoom), and casters are chosen in the
same light-space axes beyond the fade (`Instancer.shadowDistance`: the chunk's box up to 60 units, projected), round
the centre of the map as last drawn, so the set changes only with a refresh and never where a shadow shows. Fading by
ground distance was tried first and rejected: under a low sun the map's footprint is a long strip, and a ground circle
either drops most visible shadows or misses casters whose shadows land inside it. Cost: shadow-refresh frames (≤ 15 Hz,
only while the view or sun moves) draw ≈ 35–45 more batches into the shadow map (overview 304 → 351, street
330 → 365); `bun run perf` panning: 300 draws, GPU 5.1 ms (baseline 298, 5.4 ms; headless GPU time is noisy).

New probes: `bun run blink` (blinkers on a held view with everything live, Retina DPR, heat map), `bun run flyprobe`
(the O glide frame by frame), `flicker --overview` / `--still`.

## D-232 — Painted pitches, flowers shade to green, a moving flicker probe; the ferry's route chart (2026-11-27)

**Flashing at the stadium and the sports fields.** The pitches were drawn with geometry: white `slab` strips 0.04–0.06
units wide (touchlines, halfway line, penalty boxes), a glowing `haloRing` centre circle and 0.04 white goal frames on
dark turf. Under a pixel from mid zoom, white on green popped in and out of pixels as the camera moved. They are now
one `pitch` piece (`render/materials/library.ts`): turf with mowing stripes and the markings as distance-field lines
in uv (length along the piece's x), at least a pixel soft and faded to the field's mean once thinner than one; goals
stand 0.07 thick in off-white. The gardens round them sparkled too: `flower` pieces are a tenth of a unit, so their
petals shade to their leafy green below ~4 px (`pieceCover(4)`, the mean of a bed from afar) and they stop at 80
units (was 110). Measured (slow pan, day): the pitch piece ≤ 0.010 %, flowers 0.52 → 0.29 % isolated (on black; on
grass the contrast is now green on green), the arena district 0.032 / 0.024 / 0.024 / 0.005 → 0.038 / 0.018 / 0.017 /
0.007 % at 35 / 70 / 140 / 260. Rule: markings, lines and lettering on a surface are a material pattern, never
geometry thinner than ~0.1 unit.

`bun run flicker -- --speed <px>` pans at a real speed and compares each moving frame with a still, converged render of
the same pose, counting jumps of that error from frame to frame: the slow-pan probe (0.15 px/frame) keeps temporal AA
in its converged state and misses flashing that only shows while the history is rejected. Its numbers are not yet
motion-invariant (an isolated edge drags its lag along), so use it to rank pieces, not as an absolute budget.

**Ferry route chart.** The inspector listed the stops as text chips. It now draws them (`modules/ferry/routeChart.ts`):
a small sea chart (land and shallows painted once from the terrain on a 128² canvas, an SVG over it) with every stop
numbered in timetable order (this voyage gold and named, the next teal and named, risen, not yet risen dashed; tap
or Enter to charter), the voyage's course with the sailed stretch lit, the sightseeing loop dashed, the pier and the
ship (gliding on a CSS transform transition between the inspector's twice-a-second reads, no animation loop), and a
pier → loop → home bar. The whale pods roam (D-231), so their course is planned afresh at each departure and stays
fixed for the voyage.

## D-233 — Pilot the Sky Guard (2026-11-27)

The jet could only be watched or chased. Explore mode `pilot` (view menu *Pilot the jet*, the jet's **Pilot** button)
hands the player the controls: an arcade flight model (`modules/skyguard/pilot.ts`, `JetPilot`) with heading, pitch
and bank, a throttle and an afterburner; banking turns, pulling while banked tightens the turn, dives gain speed.
Assists, not a simulator: the wings level when the stick is centred, the jet pulls itself up over ground, roofs and
sea (looking ahead by its speed) with PULL UP, holds a ceiling, and banks itself home past the archipelago's edge.
No crash. Keys: W/S climb · dive (up is up, not a flight stick), A/D bank, E/Q throttle, Shift afterburner, Space
roll, X smoke, V cockpit / chase; the phone pad's joystick writes the same keys (rim = afterburner). The chase camera
leans 45 % into the bank (all of it was dizzying); the cockpit rolls fully, and only there does the HUD draw its
pitch ladder (where it truly sits on the horizon). The HUD (`pilotHud.ts`) is a body-level layer (the city HUD hides
its panels in explore modes): ladder, bank pointer, heading tape and a heading-up radar move by `transform` each
frame, numbers at 10 Hz. While piloted the patrol's shader contrails (which follow the patrol curve) are hidden and a
CPU ribbon of the jet's last positions trails it (≈3 KB a frame, only while piloted). Leaving finds the nearest patrol
phase and glides the jet onto it over 3 s (position lerp, attitude slerp).

## D-234 — The sky-lane rosette (2026-11-27)

From above the showcase's sky-lanes were a tangle: interchanges every third town block, five crowded round the
centre, joined by a minimum spanning tree and a star from the Nexus. Two changes. **Topology** (`sim/skylanes.ts`):
round a central hub, the other hubs of its network fall into rings by distance (a jump of 30 % and 12 tiles starts the
next; a ring of one or two joins the one outside it); the Nexus links to the inner ring, each ring links round itself
(neighbours within 110°), and each outer hub links to the inner hub in line with it (within 12°) or to the two either
side, a petal. Ring links bow by their arc's sagitta (`tan(Δθ/4)/2`, away from the centre) and petal edges bulge 0.12
away from the petal's axis: `SkyLink.bow`, which the mobility module's `legOf` honours for the lane and every pod on
it (lifted to clear, never bent elsewhere). Hubs the rings leave out still join by the tree's edges, so networks and
their rider bonuses are unchanged. **Placement** (`founding-city.ts`): the Pod Interchanges are two rings round the
Nexus, an inner circle through the Dragonfly Skyport (its angle and distance) and an outer ellipse like the island
(150 × 104 tiles), half a step turned so every other outer hub is a petal tip; each on the nearest open lot, with an
access road to the nearest street once the countryside's roads are laid (two outer hubs stand in open country, 50
tiles from a street, and a hub off the road network never opens). 19 hubs (17 before), 43 trunks, `clearance()`
clipped 0; zoning, grading and mobility guards pass. `tests/rosette.test.ts` holds it on two seeds.

## D-235 — HUD polish: opaque quick buttons, a wider season card, the way-back card times out like the rest (2026-11-27)

The Highway / Remove quick buttons' hover background was a translucent tint, so the map showed through: the tint now
sits over an opaque base. The season and weather card is 340 px with its headline kept on one line ("Day 1 of 2 ·
3% through · 12 min left" wrapped at 268). The "Back to where you were" card closed after 20 s (the call-out time) with
no sign it would: it now takes the cards' 12 s, with a hairline draining along its foot (transform only; paused on
hover, restarted when the pointer leaves, as the countdown is).
