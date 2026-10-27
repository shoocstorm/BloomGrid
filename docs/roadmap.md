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
- **Accept:** ✅ `tests/pulse.test.ts`: a blackout drives energy to Collapse and residents leave over tens of seconds (not instantly); reconnecting a producer restores power. Visual drill: `bun run snap -- --eval @scripts/scenes/blackout.js`.

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

## ✅ Phase 5 — Decline, Crises & Control

- [x] Loans and debt: borrow (5k / 15k / 40k, limit ≈ 10 min of income), simple interest by difficulty, amortised repayments, early repay; all undoable commands
- [x] Austerity: a negative treasury pays only 40% of upkeep → building condition decays (reduced capacity, dark windows, moss overruns them) and highways overgrow until they stop carrying power and water; redrawing a highway clears it
- [x] Cascades: brownout → job loss → exodus → revenue; flood → evacuation → damage; pollution → algal blooms; debt → austerity → decay
- [x] Crises with forecasts (`sim/crises.ts`): monsoon flood, king tide, heatwave, algal bloom, grid failure, plant blight; deterministic scheduler (one at a time, calm gap), severity by difficulty; effects only through pulse `Modifiers`
- [x] Crisis visuals: rising water (height-based water shader), rain, storm/heat/algae tints, region rings; banner with countdown, prep advice and "Show"; toasts and log entries; advisor rules
- [x] Fail state: harmony or budget in Collapse for 120 s → "Steward replaced" (load save / continue in sandbox / new city); warning banner with countdown; recovery unwinds the clock twice as fast
- [x] Difficulty presets (Sandbox, Relaxed, Steward, Hard) and a New City dialog (⚙ → Found a new city); save format v3 (+ v2 migration)
- **Accept:** ✅ `tests/crises.test.ts`: neglect reaches Collapse and replacement deterministically; Sandbox never fails; a timely rebuild unwinds the clock; crisis lifecycle and effects; scheduler determinism; save v3 round-trip. Drills: `?drill=<crisis>`, inspector → Crisis drills.
- **Measured:** power budget unchanged (≈17% main thread active, 15% idle); a monsoon with rain adds ~2 ms GPU while active.

## ✅ Phase 6 — Seasonal Bloom Engine

- [x] Seasons (`sim/seasons.ts`): Bloom, Monsoon, Harvest, Haze, each two sim days; they scale bloom, food and water, shift crisis likelihood, and tint flowers and canopies; season chip with progress; toasts
- [x] Pollen and bloom fields (`sim/bloom.ts`): pollen from habitat (Pollinator Sanctuary, parks, lush or retrofitted buildings, wild meadows); bloom = pollen × water × clean air × season × clean-energy share, plus irrigation. Bloom speeds greenery, pollinates farms (food ×0.7–1.2) and lifts harmony; urban Bloom index and clean-energy share in City Pulse; Bloom lens
- [x] Filtration Channels (C): bioswales that irrigate gardens within 4 tiles (they grow even when the network is dry), scrub nearby pollution and lift desirability; reeds; lush channels get lily pads and koi
- [x] Symbiotic pairing: a Bioreactor with a Phyto Garden within 7 tiles emits 25% of its pollution and produces 15% more; inspector shows paired / unpaired; advisor flags unpaired polluters
- [x] District transformation wave: Bloom Retrofit (B) radius brush (40% of building cost) upgrades buildings (eco ×1.5, −20% power, −15% water, −30% pollution, faster growth) and makes channels lush; an expanding ring and pollen burst while flowering façades, ivy fringes and golden sunflower crowns pop in by distance from the click
- [x] Visuals: bloom texture drives flower open/closed state and glow; pollen motes in one draw call (density follows bloom); two new buildings (Phyto Garden, Pollinator Sanctuary); save v4
- **Accept:** ✅ `tests/bloom.test.ts` (seasons, pollinators vs pollution, channels irrigate and scrub, symbiosis cuts pollution, retrofit with undo, save v4). Drill: `bun run snap -- --eval @scripts/scenes/retrofit.js`.
- **Measured:** field passes optimised (point deposits + sliding box blur, staggered across pulses): fields 11 → 4.1 ms, bloom 1.8 ms, average pulse 2.4 ms; power budget unchanged (≈17% active / 15% idle main thread).

## ✅ Phase 7 — Bioluminescence & Atmosphere

- [x] Pedestrian-activity field (`sim/nightlife.ts`): residents, staffed jobs and amenity visitors deposit at their building, box-blurred (D-020), weighted toward highways and parks; blackouts and decay empty streets; pulse phase 4; Night life index in City Pulse; Night life lens (✨)
- [x] Night glow follows activity: flowers, fungi, moss veins, highway guidelines and canopies (luminous teal rim on busy streets) sample it from the field texture's G channel (D-021)
- [x] Fungi paths: glowing fungus clusters on ~20% of highway kerbs facing open ground
- [x] Spores: at night the pollen motes also gather over busy streets
- [x] Seasonal weather: passing drizzle in Monsoon season (fewer drops than a storm), thicker warm haze in Haze season and during heatwaves; eases in and out at season edges; visual only
- [x] Courtyards and waterfalls: retrofitted buildings taller than 1.2 get a façade waterfall (animated `waterfall` material) into a ground-floor basin framed by bushes and fungus lamps
- **Accept:** ✅ `tests/nightlife.test.ts` (built city ≥3× brighter than wild land, new parks light their street, a blackout dims it, pulse recompute, determinism). Drills: `scripts/scenes/nightlife.js` (night downtown + retrofit), `scripts/scenes/season.js` (`window.SEASON = 1` for Monsoon drizzle, default Haze).
- **Measured:** activity pass 1.7 ms on its own pulse phase; 16% / 15.5% main thread active / idle; GPU 1.5 ms; draws 178 near / 208 overview (191 / 234 with `?stress=1500`).

## ✅ Phase 8 — Mobility Layer (core)

- [x] Commuting on flow fields (`sim/mobility.ts`, pulse phase 1): capacity-aware rounds of multi-source BFS from workplaces with free jobs; homes fill the nearest, overflow commutes further; walked tiles accumulate load (D-022)
- [x] Congestion: load / `TILE_CAPACITY` per highway tile; jammed tiles slow trips → flow quality; new **Mobility** health tier, "Traffic" harmony factor (up to −12), Traffic lens (⇶), advisor rule with a one-click Pod Dock
- [x] Green Pod Dock (`content/buildings/pod-dock.ts`): flies up to 420 commuters from homes within 12 tiles off the highways; inspector shows riders; two in the founding city
- [x] Sky-lanes: pods shuttle on arcs from each dock to the busiest job hub it serves, marked by flowing light ribbons
- [x] Hover-commuter agents: up to 8192 instances on straight runs of the flow field, GPU-animated from static data rebuilt every ~5 s; denser and slower and warm white → amber → coral as lanes jam; morning flows to work, evening home, fewer at night
- [ ] Deferred to a later phase: canopy greenways, hyperloop under the hills and to the islets, ferries, player-drawn sky-lanes, vehicle follow-cam
- **Accept:** ✅ `tests/mobility.test.ts` (flow field direction and load, more commuters → lower flow, a Pod Dock relieves the highway and opens a sky-lane, founding city flows ≥ 75%, advisory, determinism). Drill: `scripts/scenes/mobility.js` (`window.NIGHT`, `window.LENS`, `window.NEAR`).
- **Measured:** mobility pass ≈1.2 ms on its own pulse phase; founding city 85% flow (Stable); main thread ≈18% active / 16.5% idle; GPU unchanged within headless noise (1.7–5 ms on and off); draws 186 near / 213 overview (200 / 239 with `?stress=1500`).

## ✅ Phase 9 — Flora-Net AI & Symbiotic Automation

- [x] Soil zones (`sim/floranet.ts`, 8×8 tiles, pulse phase 3): hydration relaxes toward what the water network, channels and wild groundwater sustain, minus season evaporation and heatwaves; Monsoon showers (shared `showerAt`) and storms add rain; nutrients fall with farm draw and return from parks, paired-bioreactor digestate and drone compost (D-023)
- [x] Effects: parched soil slows or reverses greenery and wilts plants visibly; farm yields ×(0.75 + 0.4·nutrients)·(hydration) and +10% under drone care; City Pulse "Soil health"; Soil water ❖ and Nutrients ✿ lenses; advisor rules for parched and depleted zones (one-click Drone Hive)
- [x] Flora-Net responses: pods mist dry zones under their sky-lanes; the steward's Mist tool (M, 120 ◈, 3×3 zones, undoable); mist clouds bloom where it lands
- [x] Hummingbird drones: Flora-Net Drone Hive (radius 16, 12 drones) pollinates, harvests, trims overgrown highways even under austerity and mists dry gardens; drones fly GPU-animated sorties coloured by task (one draw)
- [x] Living workspaces and eco-playgrounds: Living Timber Studio (55 jobs, solar-leaf shutters) and Willow Eco-Playground (willow tunnels, moss pads); founding city gains a hive and a playground
- [x] Save format v5 (soil per zone; v4 migration keeps defaults); soil is part of `City.hash()`
- **Accept:** ✅ `tests/floranet.test.ts` (drying without water / in Haze heatwaves, recovery; parched soil wilts and advises; mist cost and undo; farm depletion and hive recovery; hive trims overgrowth; founding city soil health; save v5 round-trip, v4 migration, hash). Drill: `scripts/scenes/floranet.js`.
- **Measured:** Flora-Net pass 1.3 ms on its own pulse phase; main thread 17.2% active / 16.1% idle; GPU 2.3–3.1 ms; draws 188 near / 213 overview (207 / 246 with `?stress=1500`); boot unchanged.

## ✅ Phase 10 — Green Weaver & Land Reclamation

- [x] Land reclamation (T, `sim/coast.ts`): drag over the shallow shelf (seabed above −4.5) next to the coast; the connected sea tiles become flat land at 1.0; costs by depth; undoable; reservoirs, the river, highways and channels are never filled. Terrain chunks, the water depth texture, wild flora, shore distance, soil zones and networks refresh (`terrain:changed`)
- [x] Sea-level rise: after day 3 the sea rises over ~12 sim days to a difficulty cap (Sandbox 0.15 → Hard 0.5 m); king tides and monsoon floods stack on top; low unprotected buildings are evacuated and decay; toasts every 0.1 m; City Pulse "Sea level"; Flood risk lens 🌊; advisor rule
- [x] Coastal defences: Mangrove Seawall (oyster reef, mangroves, berm) keeps water up to 1.4 m out within 9 tiles
- [x] Green Weaver (V): click a tower then another to weave a flowering sky-bridge (3–18 tiles, ≤3 per tower; harmony and ecology bonus at both ends), or the same tower twice to merge it with a banyan (level 2: ecology ×2, more harmony and pollen; aerial roots, buttresses and a canopy crown). Bridges grow from both towers; demolished ends deactivate a bridge, undo revives it
- [x] Save format v6 (sparse terrain edits, bridges, sea rise; v5 migration)
- **Accept:** ✅ `tests/coast.test.ts` (reclaim, refresh and undo; reservoirs and deep water refused; rise reaches the cap; seawall protects; bridges rules, harmony, demolish/undo; banyan merge and undo; save v6 and migration). Drill: `scripts/scenes/weaver.js` (`window.FOCUS = 'coast'`, `window.NORECLAIM`).
- **Measured:** main thread 18.4% active / 15.9% idle; GPU 1.7–2.5 ms; draws 188 near / 213 overview (214 / 247 with `?stress=1500`); modules boot 375 ms (424 ms with `?stress=1500`).

## ✅ Phase 11 — Explore Modes

- [x] Explore modes (N cycles, Esc back, buttons bottom-right): first-person **Walk** (run, jump, mouse look via pointer lock or drag), third-person **Hoverboard** (momentum, boost, hop, glides over water), free **Drone** flight, and **Ride a pod** (follow-cam on a commuter pod along its sky-lane; Tab next pod)
- [x] Collision without a physics engine (D-025): terrain, bridge decks, water and building solid boxes from the cached recipe bounds, so towers are walls and parks/plazas are walkable (`modules/explore/collider.ts`)
- [x] High detail near the player: the city camera's target and distance follow the player, so shadows (tight frustum), fog, pollen, agents and instancer LOD all focus on them; a street-level near plane with a shorter far plane and a smaller sky dome
- [x] Pods animate from a shared `U.clock` so the CPU follow-cam rides exactly the pod the shader draws
- [x] Photo mode (J): HUD hidden, letterbox, sim paused, P saves a PNG
- [x] Ambient motion calmed (user feedback): pollen motes 2400 → 1100 with slower drift; plant sway amplitudes 5–10× smaller and slower with gusts
- [ ] Deferred: Rapier physics (rejected for now, D-025), individual citizens to follow, depth-of-field in photo mode
- **Accept:** ✅ `tests/explore.test.ts` (towers block, parks walkable, highways open, off-map blocked, water blocks walkers but not boards, bridge decks carry you). Drill: `scripts/scenes/explore.js` (`window.MODE`, `window.PHOTO`, `window.NIGHT`).
- **Measured:** city view main thread 16.4% active / 13.4% idle; GPU ≈1.0 ms; draws 193 (212 with `?stress=1500`); walk mode 112 draws at street level.

## ✅ Phase 12 — Hero Assets & Platform

- [x] Asset pipeline `bun run optimize-glb -- raw.glb public/assets/x.glb --footprint N --height N [--ratio] [--yaw] [--tex]` (`scripts/optimize-glb.mjs`): dedup/prune/weld, meshopt simplify, fit to footprint/height with the pivot at the base centre, textures downscaled and JPEG-encoded with macOS `sips` (normal maps PNG at half size), meshopt compression; prints a stats report
- [x] Three Hyper3D Rodin hero assets (raw files in git-ignored `assets-raw/`): **Supertree Grove** (13.4 MB → 1.5 MB, 17.6k tris; the landmark: a reserved 10×10 plot on the ring road west of downtown, ≈15.6 units tall, about 2.5× the tallest towers, via `--stretch 2`), **Lotus Arts Pavilion** (10 MB → 645 KB, 9k tris), **commuter pod** (9.8 MB → 298 KB, 3.9k tris)
- [x] Runtime: GLB recipes take a procedural `fallback` (bounds, collision, retrofit overlays; drawn if the file is missing); GLB materials become lens- and night-aware node materials; pods swap in the GLB shape/texture when present; both landmarks in the founding city
- [x] Tauri v2 desktop shell (`src-tauri/`): saves as JSON files in the app data dir via Rust commands (atomic write-then-rename, safe key names), exports folder, 1600×1000 window with minimum size, fullscreen toggle (⚙ and F11); `bun run tauri:dev` / `tauri:build`; generated app icon (`scripts/make-icon.mjs`); `src/platform` picks Tauri automatically
- [x] Save migrations: chain test from v1 to v6; unknown future versions are refused
- [x] **Wellspring Spire** (`content/buildings/wellspring-spire.ts`): the island's central landmark, procedural (no GLB), 14×14 tiles and ≈40 units tall (≈2.5× the Supertree Grove): twisting glass shaft on root buttresses, a cantilevered sky-park pouring four waterfalls into a moat, a solar halo and a beacon spire; new `lumen` material and `haloRing` / `spireCone` / `lumenRib` pieces. The founding city levels a terrace at the exact map centre where the river rises (`ScenarioBuilder.level`, saved as terrain edits, D-033), with a plaza loop road and a boulevard into downtown. Drill: `scripts/scenes/landmark.js`
- [x] **Hero quarter** around the spire on one shared terrace, all procedural: **Helix Wind Spire** (double helix of solar vanes, 160 energy), **Hanging Gardens Ziggurat** (six food-forest terraces with cascades and a Tree of Life, 600 food), **Sky Ark Residences** (three towers carrying a forested sky-ark; 700 residents, its own pod port so they don't jam the plaza loop) and **Cloud Forest Domes** (misty mountain and flower biomes). Each slides from its anchor until it fits (the river head moves with the seed). A second link road runs west to the western town. The opening fly-in now ends on the quarter (`game/opening.ts`, `landmark: true` on a building def)
- [x] **Hero avenue** along the boulevard to downtown, on a terrace continuing the quarter's level: **Rain Vortex Market** (glass donut around an indoor rain-fall; supplies 60 water), **Mycelium Research Towers** (three mushroom towers with glowing caps; 200 tech jobs), **Dragonfly Skyport** (four tiers of wing decks; pod hub, 1400 riders within 26 tiles), **Algae Lantern Tower** (spiralling bioreactor tubes; 120 clean energy) and **Vertical Forest Towers** (twin tree-balcony towers; 360 residents). Founding city flow stays ≈80%
- [x] **Hero promenade** along the west road to the western town, on two terraces at the quarter's level, plus one more on the avenue: **Elder Banyan Treehouse Hotel**, **Levitating Gardens** (floating orchard islands, 300 food), **Quartz Data Spire**, **Bamboo Cathedral** (lancet arches of bamboo), **Solar Sail Bazaar**, **Habitat Cascade** (stacked garden homes, 420 residents, 400 food, its own pod berths), **Nautilus Library**, **Starlight Observatory** (armillary rings), **Aeolian Reed Field** (90 clean energy) and **Fog Harp Tower** (hyperboloid lattice, 50 water). New kit helper `beam()` stretches a piece between two points. Founding city flow ≈82–86%; the water sweep now targets 100% (was 102%) so the city still opens water-Strained
- [x] **South Avenue and Garden Lane** (ten more): **Harmony Gate** (leaning twin office towers meeting in a sky-garden keystone, 260 jobs), **Seedpod Labs**, **Bloom Clock Tower** (flower dial), **Zephyr Airship Port** (moored airships; pod hub, 900 riders within 22 tiles), **Heliostat Sunflower Array** (180 clean energy), **Corkscrew Orchard** (spiral orchard ramp, 500 food) down the avenue road to downtown; **Canopy Skywalk**, **Coral Arcology** (branching coral homes, 380 residents, own pods), **Travertine Thermal Baths** and **Moonflower Concert Hall** along a new lane from the plaza to the ring road (a third road out of the district). `haloRing` no longer casts shadows (thin rings; saves a shadow draw per chunk)
- [x] **North Terrace** (ten more, 40 heroes in all), cut into the hill north of the boulevard along a new street climbing from it and a cross street: **Bloom Eye** (observation wheel), **Glass Pine Tower** (stacked glass cones, 220 jobs), **Lotus Pagoda Museum**, **Rice Terrace Hill** (450 food), **Honeycomb Apiary Tower** (pollinators, 150 food), **Breathing Monolith** (moss-clad homes, 300 residents, own pods), **Sunset Amphitheatre**, **Solar Kite Meadow** (110 clean energy), **Wavecrest Gallery** and **Great Noria** (water wheel, 40 water). All in one render chunk that already held hero pieces; `spireCone` no longer casts shadows
- [x] **Hero district grid** (D-035): the 40 heroes rearranged into one planned street grid of 14-tile blocks centred on the spire (9 × 8 blocks), graded into gently stepped terraces so every lot is flat and every street drivable. Five quarters (civic ring, skyline hill, exchange, garden quarter, working hills) follow the render chunks; ≈18–21 empty graded lots are left for future heroes (append an id to `QUARTERS`). Straight avenues link the grid to all four towns; the ring's western leg runs on the grid's south street. Vertical Forest sits across the street from Glass Pine Tower (`[workplace, home]` pairs) so its commuters don't jam.
- [x] **Bloomtopia Wonder Park** (`bloomtopia.ts`, 36 × 16, D-036): a fenced amusement park filling the south islet in place of its small resort town, its gate (two pylons, a neon BLOOMTOPIA sign) facing the bridge from downtown, which now lands at the gate. Comet Loop coaster with a vertical loop, Sky Orbit wheel, Petal Drop tower, dandelion swing ride, Firefly Carousel, Bloom Cups, splash lagoon with a log flume. 40 jobs only: every worker crosses the one bridge, and a longer stream would jam it.
- [x] **Natural night lighting** (D-036): ≈40% of windows lit in the evening, thinning to ≈10% after midnight (`U.lateNight`), each with its own warm or cool tone and brightness; the cyan wash over glass façades, lumen trims, pods, algae and plant glow toned down; bloom strength 0.9 → 0.6.
- [x] **Signature bridges** (D-037): every straight bridge span ≥ 8 tiles is dressed by length: suspension (≥ 45, portal or lotus A-frame towers with petal crowns, lit catenary cables and hangers), cable-stayed (28–44, A-pylon and fan of stays), Helix (twin steel-and-light spirals) or Bloom Arch (twin arches leaning in, hangers, crown) below that. Render-only, so player-built bridges get them too.
- [x] **One planned island** (D-038): the founding city's towns now continue the hero district's grid: **Bayfront** (downtown) on both river banks to the bay, **Eastgate**, **Westbrook** and **Hillcrest**, each block lined with buildings round a green courtyard (denser near the centre, more parks toward the coast, ≈12% park blocks), outer streets running on to the shore, the **Sunfield** solar farm north-west, a Pod Dock per town block. The arterial ring is gone; islet bridges leave from town corners. Workplaces and homes now have an entrance per street side (mobility).
- [ ] Deferred: KTX2 textures (needs `toktx` and the basis transcoder wired into `GLTFLoader`), Windows/Linux packaging checks, code signing
- **Accept:** ✅ `tests/platform.test.ts` (v1 → v6 migration loads the same city; future versions refused; GLB landmarks have fallbacks). Visual: Rodin landmarks and pod on WebGPU and WebGL2 (day and night); desktop window renders the full game (`cargo build`, launched against the dev server).
- **Measured:** main thread 16.3% active / 14.6% idle; GPU 1.9–3.5 ms; draws 195 (229 with `?stress=1500`); boot unchanged (GLBs load asynchronously after boot).

---

## Tech debt / open issues

Keep this list current; remove items when fixed.

- [ ] Remaining CPU is three's per-draw overhead (≈100 visible instanced batches). `BatchedMesh` and shadow cuts were measured and rejected (D-031); next lever if content grows is GPU-driven culling with indirect draws.
- [ ] Draw calls are ~200–225 with ~1700 buildings; ~2× more content would approach the budget. Next steps if content grows: merge far chunks into static impostor meshes, or GPU-driven culling with indirect draws.
- [ ] JS bundle is about 1.25 MB (three.js dominates); the Tweakpane inspector is already a lazy 150 KB chunk. Lazy-load future modules too.
- [ ] Main thread blocks during world generation (terrain + flora, about 0.2 s now); move to a worker when the sim moves.
- [ ] Utility networks are global per highway component (no per-district capacity limits).
- [ ] Field passes run on the main thread on their own tick (D-029: ≤ ≈3 ms p95, pulse tick ≈0.4 ms). If maps or fields grow, move them (and world generation) to a worker.
