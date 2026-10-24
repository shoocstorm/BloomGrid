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

## ⏳ Phase 4 — Monitoring & Management UX

- [ ] Overlay framework (sim layer → GPU texture → terrain/building tint) + overlays for energy, water, pollution, eco, harmony, land value
- [ ] City dashboard with KPI sparklines, budget breakdown, demand meters
- [ ] Flora-Net advisor: prioritised alerts, "show me" camera jump, suggested fixes, event log
- [ ] Building and district inspector (inputs/outputs/problems); overview camera, district bookmarks
- [ ] World readability: wilting / dimming / grey-moss shader states driven by building health

## ⬜ Phase 5 — Decline, Crises & Control

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

- [ ] **WebGL2 shader warm-up is about 6 s** in headless Chrome (WebGPU about 1.1 s). Investigate `KHR_parallel_shader_compile`, fewer material variants, or warming only near-camera pieces first.
- [ ] Draw calls approach the budget at full-island zoom with ~1700 buildings (242). Next steps if content grows: merge far chunks into static impostor meshes, or GPU-driven culling with indirect draws.
- [ ] JS bundle is about 1.2 MB (single chunk): code-split debug (Tweakpane) and future modules.
- [ ] Main thread blocks during world generation (terrain + flora, about 0.2 s now); move to a worker when the sim moves.
- [ ] Stress spawner fills the map row-major; make it spread across the island.
- [ ] Utility networks are global per highway component (no per-district capacity limits yet); revisit with overlays in Phase 4.
