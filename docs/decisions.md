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
