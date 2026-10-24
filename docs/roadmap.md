# BloomGrid Roadmap

Source of truth for delivery phases. Requirements: [`../BloomGrid_Implementation_Requirements-v3.md`](../BloomGrid_Implementation_Requirements-v3.md)
(scope, player role) and `v2` (aesthetic and content pillars).

**Agents: update the status and checklist of a phase in the same change that delivers it.**
Status legend: ✅ done · 🚧 in progress · ⏳ next · ⬜ planned.

Every phase ships a playable build and must pass the verification checklist in [`AGENTS.md`](../AGENTS.md).

---

## ✅ Phase 0 — Foundation

Vite + TS strict; fixed-step `Engine`; `EventBus`, `CommandStack`, `SystemRegistry`, module loader, `Services`;
WebGPU renderer with WebGL2 fallback; quality tiers and dynamic resolution; IndexedDB platform storage; perf
overlay and inspector; Vitest suite (determinism, undo/redo, save/load).

## ✅ Phase 1 — World & City Camera

Chunked terrain, depth-baked water, sky and day/night, wild flora, heightfield picking, orbit city camera.

## ✅ Phase 2 — Build Mode & Biophilic Architecture

Data-driven building registry (7 buildings), procedural kit plus GLB slot, chunked instancing, growth staging,
Living Highways, ghost placement, bulldoze, undo/redo, save/load, HUD.

## ✅ Phase 2.5 — Island World & Presentation

- [x] Singapore-inspired island: main island, central hills and reservoirs, southern bay and river, three islets, ocean
- [x] Futuristic loading sequence with real progress stages and a reveal transition
- [x] `AGENTS.md`, `docs/` (roadmap, architecture, decisions) and the headless snapshot script

## ✅ Phase 2.6 — Scale Foundation

Lots of known content at startup (buildings, highways, bridges) without hurting boot time or frame rate.

- [x] Data-driven **scenarios** (`src/content/scenarios/`) applied in bulk before renderers attach; renderers sync existing state on init
- [x] Founding city: ~680 buildings, ~3300 highway tiles, bridges to all islets, balanced but with water strained
- [x] **Recipe templates**: each building recipe runs once per (definition, variant) and is cached; placement is a matrix multiply per piece
- [x] Matrix-based instancing path and growth tweens; shadow casting culled by distance from the view focus; 64-tile terrain and road chunks
- [x] Bridges: highways over water become decks at `BRIDGE_DECK` with shore ramps, deck slabs and pillars
- [x] Boot timing log (`[boot] ms {…}`)
- **Measured (WebGPU, M-series, headless):** founding city boots in about 1.6 s (scenario 40 ms, world + render sync 230 ms, shader warm-up 1.1 s); 1715 buildings at 60 fps, 216 draws near / 242 at full-island overview

## ✅ Phase 3 — City Pulse (core management sim)

The city is a system that can run well or badly.

- [x] Demand model: homes / work / food demand meters
- [x] Utility networks follow Living Highways (connected components); per-network energy and water supply and demand → brownouts and dry taps
- [x] Water: NEWater Reclamation Works (must touch water, needs power); greenery dies back without water
- [x] Occupancy (homes) and staffing (workplaces) move toward targets driven by services, jobs, food and harmony; producers scale with staffing
- [x] Economy: tax rate (undoable `setTax`), per-building upkeep, income statement
- [x] Health tiers (Thriving … Collapse) for energy, water, food, jobs, ecology, harmony, budget; `pulse:tier` events and toasts
- [x] Stats history ring buffer (40 sim minutes), saved; save format v2 with v1 migration
- [x] City Pulse panel (P): health, demand, budget + tax slider, harmony factors, sparklines; inspector shows power, water, occupancy and problems
- [x] World readability: windows go dark with power; floating markers for no highway / no power / no water / understaffed
- [ ] Loans → moved to Phase 5 (debt mechanics)
- **Accept:** ✅ `tests/pulse.test.ts`: a blackout drives energy to Collapse and residents leave over tens of seconds (not instantly); reconnecting a producer restores power. Visual drill: `npm run snap -- --eval @scripts/scenes/blackout.js`.

## ✅ Phase 4 — Monitoring & Management UX

- [x] Larger island: map 256 → 384 tiles; render chunk size derived from map size (4×4 chunks) so draw calls stay flat
- [x] Spatial fields (`sim/fields.ts`): pollution, ecology, desirability, shore distance; recomputed every 5 pulses; desirability feeds home occupancy
- [x] Overlay framework: sim lens registry (`sim/overlays.ts`) → per-tile texture → every lit material blends via `withOverlay`; lenses for power, water, pollution, ecology, desirability, access (L cycles); legend; auto-contrast for relative fields
- [x] City dashboard (K): headline tiles, six single-series trend charts with hover crosshair, budget and land-use breakdowns, system health with icon + label
- [x] Flora-Net advisor (F): rule registry in the sim (`sim/advisor.ts`), severity-sorted advisories with "Show me" camera jumps and one-click remedies; event log tab
- [x] Network ("district") inspector: click a highway to see its buildings and energy/water balance
- [x] Overview camera (O, ⌖ button) and four bookmarks (Alt+1–4 store, Shift+1–4 recall), saved with the city
- [x] World readability: plants and membranes wilt (straw-brown, glow fades) with low vitality; windows follow power × occupancy
- **Measured (WebGPU, headless):** founding city ~1670 buildings / 22k residents; boot 1.9 s; 60 fps; 223 draws near / 202 at overview, CPU 3.7–7 ms per frame, with or without a lens
- **Accept:** ✅ `tests/monitoring.test.ts` (fields, every lens in range, advisor flags the founding water shortage and a blackout as critical, network stats). Visual drills: `scripts/scenes/drought.js`, `blackout.js`.

## ✅ Interlude — Power & heat (2026-10-24)

- [x] Diagnosed laptop heat with measurements (`scripts/perf.mjs`): uncapped 120 Hz rendering, 318 MB/s of redundant GPU uploads, shadows every frame, backdrop blur
- [x] Frame pacing with power modes (Settings ⚙); static instance buffers + update ranges; batch capacity above the UBO limit; on-demand shadow refresh; HUD without backdrop blur; High pixel ratio 1.5 → 1.25
- **Measured:** main thread 38% → 16% active / 14% idle; uploads 318 → 0.8 MB/s (D-014)

## ⏳ Phase 5 — Decline, Crises & Control

- [ ] Cascades: brownout → job loss → exodus → revenue (basic version live since Phase 3); pollution → wilt → eco collapse; debt → upkeep cuts
- [ ] Loans and debt: borrowing, interest, forced upkeep cuts
- [ ] Neglect overgrowth (nature reclaims unmaintained infrastructure)
- [ ] Event system with forecasts: monsoon flood, king tide, heatwave, algal bloom, grid failure, blight
- [ ] Fail state ("Steward replaced") + sandbox mode + difficulty presets
- **Accept:** a scripted neglect test reaches Collapse deterministically; a scripted response recovers.

## ⬜ Phase 6 — Seasonal Bloom Engine

Plant growth and bloom driven by energy efficiency and water; pollen spread; symbiotic pairing rules;
**district transformation wave** on upgrade (steel → flower walls, sunflower roofs, lily-pad channels with koi).

## ⬜ Phase 7 — Bioluminescence & Atmosphere

Glow intensity from a pedestrian-density field, GPU pollen/spore particles, courtyards and waterfalls,
weather (monsoon rain, haze) tied to Phase 5 events.

## ⬜ Phase 8 — Mobility Layer

Citizen and pod agents on flow fields; sky-lanes with light ribbons; pod docks; canopy greenways; hyperloop
under the central hills and across to the islets; ferries and bridges; congestion overlay.

## ⬜ Phase 9 — Flora-Net AI & Symbiotic Automation

Soil nutrient and hydration per zone; mist dispatch via passing pods; hummingbird drones (instanced boids)
that pollinate, trim and harvest; living workspaces and eco-playgrounds.

## ⬜ Phase 10 — Green Weaver & Land Reclamation

Trace-to-grow branches and sky-bridges; tower–banyan merges; **land reclamation and terraforming** of the
coastline; coastal defences against sea-level rise.

## ⬜ Phase 11 — Explore Modes

Street-level walk / hoverboard / drone-follow modes with Rapier physics and a high-detail LOD near the player;
photo mode.

## ⬜ Phase 12 — Hero Assets & Platform

Hyper3D (Rodin) GLBs for landmarks and vehicles via gltf-transform (meshopt, KTX2); Tauri shell (native saves,
window settings); save migrations.

---

## Tech debt / open issues

Keep this list current; remove items when fixed.

- [ ] **WebGL2 shader warm-up is ~2–10 s in headless Chrome** (grew with the overlay/vitality nodes; WebGPU stays ~1.1 s). Options: reveal the city while compiling far pieces in the background, split overlay into a material variant only compiled on first lens use, `KHR_parallel_shader_compile`.
- [ ] Remaining CPU is three's per-draw overhead (~230 draws incl. shadow pass). Next lever: merge piece types per chunk with `BatchedMesh` (needs per-instance params via a data texture), or GPU-driven culling.
- [ ] Draw calls are ~200–225 with ~1700 buildings; ~2× more content would approach the budget. Next steps if content grows: merge far chunks into static impostor meshes, or GPU-driven culling with indirect draws.
- [ ] JS bundle is about 1.2 MB (single chunk): code-split debug (Tweakpane) and future modules.
- [ ] Main thread blocks during world generation (terrain + flora, about 0.2 s now); move to a worker when the sim moves.
- [ ] Stress spawner fills the map row-major; make it spread across the island.
- [ ] Utility networks are global per highway component (no per-district capacity limits).
- [ ] Field recompute (~every 5 s) runs on the main thread in one go; spread over ticks or move to a worker if maps grow further.
