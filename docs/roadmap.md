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

## ⏳ Phase 3 — City Pulse (core management sim)

The city becomes a system that can run well or badly.

- [ ] Demand model: housing / work / food demand meters driven by population, jobs, food
- [ ] Energy grid: district capacity, deficits → brownouts (per-building `powered` state)
- [ ] Water: reservoir level, supply vs demand, player-placed filtration lines (grid layer)
- [ ] Economy: taxes / budget sliders, upkeep per building, loans, income statement
- [ ] Health tiers (Thriving … Collapse) per system, computed in sim, emitted as events
- [ ] Stats history ring buffer (for trends), included in saves
- **Accept:** a city with no power plants visibly fails (brownouts, residents leave); fixing it recovers.

## ⬜ Phase 4 — Monitoring & Management UX

- [ ] Overlay framework (sim layer → GPU texture → terrain/building tint) + overlays for energy, water, pollution, eco, harmony, land value
- [ ] City dashboard with KPI sparklines, budget breakdown, demand meters
- [ ] Flora-Net advisor: prioritised alerts, "show me" camera jump, suggested fixes, event log
- [ ] Building and district inspector (inputs/outputs/problems); overview camera, district bookmarks
- [ ] World readability: wilting / dimming / grey-moss shader states driven by building health

## ⬜ Phase 5 — Decline, Crises & Control

- [ ] Cascades: brownout → job loss → exodus → revenue; pollution → wilt → eco collapse; debt → upkeep cuts
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

- [ ] **Draw calls at full-island zoom:** the 1644-building stress city framed whole uses 395 draws (budget 300) at 60 fps on WebGPU. Options: merge far chunks into per-chunk impostor meshes, skip shadow casting for far batches, or `BatchedMesh` for static far LOD.
- [ ] JS bundle is 1.2 MB (single chunk): code-split debug (Tweakpane) and future modules.
- [ ] Main thread blocks for about 1 s during world generation (terrain + flora); move generation to a worker when the sim moves.
- [ ] Stress spawner fills the map row-major and stops at the target count; make it spread across the island.
