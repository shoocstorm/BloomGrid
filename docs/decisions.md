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
