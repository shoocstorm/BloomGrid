# AGENTS.md — BloomGrid

Guide for AI coding agents (and humans) working on this repo. Read this first, then the docs it points to.
**Keep this file accurate:** if you change a convention, command or workflow described here, update it in the
same change.

## 1. What this project is

BloomGrid is a single-player **solarpunk island city builder and manager** in three.js (WebGPU, falling back to
WebGL2), written in TypeScript with Vite. The player is a _city steward_: they monitor the whole 3D island,
build and modify it, and keep it running well. Neglect can make the city decline or spiral out of control.

| Doc                                                                                          | Purpose                                                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`BloomGrid_Implementation_Requirements-v3.md`](BloomGrid_Implementation_Requirements-v3.md) | **Canonical requirements** (player role, island world, systems, crises, NFRs)              |
| [`BloomGrid_Implementation_Requirements-v2.md`](BloomGrid_Implementation_Requirements-v2.md) | Original aesthetic and content pillars (still valid unless v3 overrides)                   |
| [`docs/progress.md`](docs/progress.md)                                                       | **Handoff snapshot**: branch, last commit, baselines, next up, open decisions. Start here. |
| [`docs/roadmap.md`](docs/roadmap.md)                                                         | Phases, status and checklists. **What to work on next.**                                   |
| [`docs/plan-v4.md`](docs/plan-v4.md)                                                         | Next feature plan (Phases 16–22): fresh start, sound, levels/ageing, consequences, hazards |
| [`docs/architecture.md`](docs/architecture.md)                                               | Layers, frame order, data flow, extension points                                           |
| [`docs/decisions.md`](docs/decisions.md)                                                     | Architecture decision log (append-only)                                                    |
| [`README.md`](README.md)                                                                     | Player-facing quickstart and controls                                                      |

## 2. Commands

```bash
bun install
bun run dev            # http://localhost:3000: a fresh island behind the New Chapter dialog (resume / new island / showcase); ?scenario=founding-city = the showcase (scripts default to it), ?wizard / ?nowizard  (?perf ?renderer=webgl ?quality=low|medium|high|ultra ?stress=2000 ?seed=N ?scenario=empty ?difficulty=sandbox|relaxed|steward|hard ?drill=<crisis> ?happening=request|festival|bumper-catch|cruise ?nodynres)
bun run check          # typecheck + lint + tests + production build (must pass before you finish)
bun run test           # vitest only (NOT `bun test`: that is bun's own runner and skips the Vitest setup)
bun run snap -- --out shots/x.png [--path "/?perf"] [--eval @scripts/scenes/demo-city.js] [--times 400,1500] [--mobile [--size 844x390]] [--dpr 2]
bun run perf -- [--path "/?gputime"] [--seconds 10] [--idle] [--sound] [--profile 15]   # power/perf probe (see §8)
bun run flicker -- [--pieces all|names|a,b] [--defs canopy-tower] [--day] [--diff shots/f.png]   # thin-detail flashing probe (D-070)
bun run trailer          # ~75s trailer against the showcase city: fourteen shots on a sunrise→night→dawn arc (spire-to-island reveal with title, downtown dive, wind farm, Bloomtopia, drone flight, Aeroline ride, two fireworks acts with shaped bursts and a sky message, night sea with the glowing Lotus Atoll, fires + Flora console with a live Qwen3 1.7B answer streaming in (model loads at boot into a persistent Chrome profile; `--no-ai` skips), dawn retrofit, hive mist, end pull-back), joined with paced crossfades (fast by day, slow into night and the end; the drone→Aeroline cut is an expanding-circle wipe from the drone's propeller), city.tick is pinned into bloom season so weather never wanders in (the acts pace it instead of engine speed; shows fire per pulse, tick % 10 === 0, and only one show can be in the sky at a time, so a fast tick ramp and staggered launches fit two shows per act), City Pulse stays folded, and with the engine stopped each frame is advanced by hand — input + one sim tick + sync + render at an exact dt of 1/fps, with U.clock pinned to video time and the camera target's height pinned to the terrain (a timed engine step always leaves per-frame variance that reads as turbines stuttering and the camera trembling); the drone flies a street corridor found live from `grid.road`, never a diagonal over blocks; encodes at crf 25 so it can be committed as public/assets/trailer.mp4 (keep < 100 MB, D-079)
bun run showcase       # redraws public/assets/showcase-overview.webp (the New Chapter dialog's showcase overview, D-085/D-103: a rendered bird's-eye of the live founding city, HUD hidden by the scene) from the live founding city: rerun after changing that scenario
bun run optimize-glb -- raw.glb public/assets/x.glb --footprint 3 --height 4 [--ratio 0.5] [--yaw 90] [--tex 1024]
bun run tauri:dev      # desktop shell (Tauri v2) against the dev server; tauri:build packages it (needs Rust)
bun run release [patch|minor|major|X.Y.Z] [--dry-run] [--yes]   # tag + deploy to Firebase (see §10; ask first)
bun run ai-probe -- [--model qwen3-1.7b] [--ask "…"]… [--auto] [--max] [--phone]   # drive the city assistant with a real model in headless Chrome
bun run test:rust      # Rust unit tests (store, grammars, template); add `-- --ignored llm_qwen3_` for MLX parity (needs the HF cache)
bun run tauri:build:mac-arm64   # Apple Silicon desktop bundle with mlx.metallib (the assistant's native engine)
```

The package manager is **bun** (`bun.lock`; no `package-lock.json`). Use `bun install` / `bun add [-d]` / `bunx`, never
`npm` or `npx`.

`bun run snap` drives headless Chrome against the running dev server, saves screenshots and prints console
warnings and errors plus the app's tagged logs such as `[boot] ms {…}` (it exits 1 on page errors). Use it to _look_ at
your change (`[boot] modules {…}` breaks module init down per module). `shots/` is git-ignored. Scenes in `scripts/scenes/`: `demo-city.js` (small district), `blackout.js` (night power-failure
drill), `drought.js` (water-failure drill; buildings should visibly wilt), `retrofit.js` (channel + Bloom Retrofit
wave), `nightlife.js` (night downtown: glow should follow activity; `window.NEAR = 12` for a close-up) and `season.js`
(mid-Haze; prefix `window.SEASON = 1;` for a Monsoon shower), `fireworks.js` (finds or builds a Fireworks Factory at the Westport waterfront and launches a grand night show; `window.DAY`, `window.FAR`, `window.TAB = 1` for the dashboard's Fireworks tab; use `--after 7000`), `mobility.js` (first Pod Dock at rush hour; `window.NIGHT = 1`,
`window.LENS = 1` for the Traffic lens, `window.NEAR = 14`), `inventory.js` (dashboard Inventory tab on the worst object, plus every agent tool; `window.QUERY = 'district:westbrook'`
pre-fills the search), `mobile.js` (with `--mobile`: phone HUD; `window.SHEET = 'info' | 'pulse' | 'advisor' | 'lens' | 'goals' | 'build' | 'dashboard' | 'gesture'` (the console tabs open from the top bar),
the last returns camera distance/yaw before and after a synthetic pinch + twist), `fires.js` (three fires across the island: beacons, screen and edge pins, alert toast; `window.FAR = 1` for the
island view), `statinfo.js` (top-bar indicator guide; `window.STAT = 'credits' | 'pop' | 'energy' | 'water' | 'food' | 'eco' | 'happy'`, `window.HOVER = 1` for the hover card; `--mobile` for the sheet), `flora.js` (Flora's console; `window.VIEW = 'console' | 'profile' | 'tools'`,
`window.OPEN = '<tool>'` expands a tool card, `window.MAX = 1` maximizes; add `--mobile` for the phone console).
Field passes share the pulse (`FIELD_PULSES` = 6, D-020): phase 0 pairing + pollution, 1 ecology + desirability, 2 bloom, 3 Flora-Net,
4 night life, 5 mobility. All six are taken, so a new pass must share a phase or `FIELD_PULSES` must grow. `floranet.js` frames the Drone Hive and dispatches a mist. `weaver.js` weaves bridges, a banyan and reclaims coast. `interact.js` walks into the Mycelium Work Dome through its sliding doors (`window.FP`, `NIGHT`, `DARK = 1` switches the lights off, `STAY = 1` stays at the door; `?scenario=empty&nowizard`, `--after 9000`). `explore.js` enters an explore mode (`window.MODE`: walk, board, drone, balloon, roof, follow, train; `window.FP = 1` first person). Avatars live in `modules/explore/avatars.ts`, rooftops in `roof.ts` (D-054); everything that moves in explore modes (bodies and cameras) goes through `collider.ts` (`hits` / `reach`, D-055). Phones get the switcher and a touch pad that writes `input.keys` (D-057): a new mode control needs a pad button in `padFor`. `relocate.js` Shift-drags a building with real pointer events (`window.DEF`, `DX`, `DZ`, `DROP = 1`; builds one first on `?scenario=empty`). `showroom.js` lines buildings up for close review on `?scenario=empty` (`window.DEFS`, `FOCUS`, `NEAR`, `YAW`, `PITCH`, `NIGHT`). `landmark.js` frames the Aurora Gemini twin towers and their hero district at the island centre (`cameraCtl.setView({ …, aim })` lifts the orbit point so 56-tall towers fit; the smaller Wellspring Spire now stands in the Working Hills ≈ 211/209, D-135): a street grid of 14-tile blocks (`QUARTERS` in `content/scenarios/founding-city.ts`; quarters around `window.CX`/`window.CZ` ≈ 292/222 skyline, 292/286 exchange, 222/284 gardens, 215/220 working hills). To add a hero, append its id to a quarter: it takes the free graded lot nearest the centre (D-035). Bloomtopia, the fenced amusement park, fills the south islet (`window.CX`/`CZ` ≈ 252/440, `window.YAW` = π to face its gate); its suspension bridge is at ≈ 252/404 and the north-east one at ≈ 430/145. The towns (`TOWNS` in the same file) continue the grid: Westbrook ≈ 150/270, Eastgate ≈ 360/250, Hillcrest ≈ 255/160, Bayfront ≈ 270/340, Sunfield ≈ 130/205. Zoned sub-areas (D-049): Westport Works (industry) ≈ 113/285, Meridian Arena (sports, Bloom Stadium ≈ 345/285) ≈ 360/285, Harbour Commons (work) ≈ 300/330, Lumen Promenade (entertainment) ≈ 300/360. Sea wonders (`modules/scenery/sites.ts`): Tidewatch Lighthouse ≈ 471/41, Tide Gates ≈ 72/471,
Lotus Atoll ≈ 230/31, Abyssal Dome ≈ 440/471, Verdant Pillars ≈ 31/123, whale pods ≈ 154/481 and 348/26. Windward Isle (wind farm, 2×2 Breeze Turbines) ≈ 430/102. Aeroline stations: Hillcrest ≈ 256/159, Eastgate ≈ 353/256, Bayfront ≈ 241/368, Westbrook ≈ 144/271 (`services.get('explore').setMode('train')` rides a train); keep pieces in the quarter's render chunk (D-034) (`window.NEAR`, `window.PITCH`, `window.YAW`, `window.NIGHT`). Crises: `--path "/?drill=monsoon"`
(any crisis id, including `earthquake`, `thunderstorm`, `industrial-fire`; `&severity=1.2`), or the inspector's Crisis drills.
To light a fire from a snap eval: `(await import('/src/sim/hazards.ts')).ignite(bloomgrid.city, eid, 'lightning', 0.8)`.

## 3. Hard rules

1. **Sim purity.** `src/sim`, `src/ecs`, `src/core` and `src/content` must not import `three`, `@/render`,
   `@/ui` or `@/world` (ESLint enforces this). Sim randomness only via `Rng` / `hash2`; no `Math.random`, `Date`
   or `performance` in sim code.
2. **All player-driven state changes go through commands** (`ctx.commands.execute`). Each command implements
   `apply` (returns undo data or `null` to reject) and `revert`. Bulk or scripted actions pass `undoable=false`.
3. **Determinism is tested.** Same seed and command log must give the same `city.hash()`. If you add sim state,
   include it in `hash()` and in `sim/save.ts` (bump `SAVE_VERSION` and add a migration when the format changes).
   Sim randomness (including crisis scheduling) uses `city.rng`. Tests' `makeSim` sets `steward.autoCrises = false`
   so balance tests stay stable; crisis tests opt in.
4. **Features are modules.** New gameplay goes in `src/modules/<feature>/index.ts` as a `GameModule`, registered in
   `MODULES` in `src/main.ts`. Core code never imports a feature. Cross-module APIs use `ctx.services`, and
   notifications use `ctx.bus`. Extend `GameServices` / `GameEvents` through declaration merging in the module.
5. **Content is data.** Buildings live in `src/content/buildings/*.ts` (auto-discovered). Recipes only use
   `KitBuilder`; they never touch three.js.
6. **Both renderers must work.** Check your change with WebGPU _and_ `?renderer=webgl`. Write materials in TSL
   (`three/tsl`), never GLSL or `ShaderMaterial`.
7. **Performance budgets** (check with the `?perf` overlay, F3): 60 fps on an M1-class GPU for a typical city;
   **< 300 draw calls**; sim tick < 4 ms; 50k+ plant instances. Render repeated things through
   `ctx.instancer` (kit pieces + shared materials). Don't allocate in per-frame loops (reuse
   vectors/matrices). Throttle DOM updates (~5 Hz) and use `setText`.
8. **Don't break saves silently.** Saves store string ids, not registry indices. Bump `SAVE_VERSION` and add a step to
   `migrateSave` whenever the format changes.
9. **Renderers sync existing state at init.** Startup content is applied in bulk before modules load (D-007), so
   anything that mirrors sim state must render what already exists in its constructor, not only react to events.
10. **Startup content must stay cheap.** Watch the `[boot] ms` log: scenario under 100 ms and modules under 400 ms on
    WebGPU. Recipes are cached per variant (D-008); never run recipes per instance.

## 4. Where things go

| Task                               | Location / API                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New building                       | `src/content/buildings/<id>.ts` → `defineBuilding({...})`; helpers in `src/content/kit.ts`                                                                                 |
| Building detail / waterside       | detail helpers in `src/content/kit.ts` (`gableRoof`, `solarArray`, `louvres`, `planter`, `lamp`, `railing`, `awning`, `barrel`, `crate`, `piles`, `door`, `TRIM`; street level: `bench`, `entrance`, `forecourt`, `lilies`, `railRing`, `footbridge`, D-097; every building has an entrance, seating and light at street level): compose existing pieces (more instances, no new draw calls). A `placement.nearWater` building puts its sea side at local +z; `sim/orient.ts` turns it to the water (scenario fill, `findSites`, the Build tool) (D-095) |
| New kit piece / material           | `registerPiece` in `src/assets/kit/pieces.ts`; `define` in `src/render/materials/library.ts`                                                                               |
| Sim system                         | `System` with `phase: 'sim'` inside its module (or `src/sim/systems.ts` for core economy and clock)                                                                        |
| Per-tile data                      | `city.grid.addLayer(name, n => new Float32Array(n))`                                                                                                                       |
| Player tool                        | `ctx.tools.register(tool)`; tools get `hover / down / up / key`, plus `grid` and `dragPan` flags                                                                           |
| HUD panel                          | `src/ui/*` with the `h()` helper and the `.panel` class; icons via `icon()` from `src/ui/icons.ts` (no Unicode glyphs as standalone icons, D-061); the look (instrument theme: tokens incl. radius `--r-*`, mono numerals, coded section titles; D-059) lives in `src/ui/theme.css`, loaded last; dialogs and consoles take `.holo` + `holoHead()` / `rise()` from `src/ui/holo.ts` (D-063); big dialogs use the `--dlg-w` / `--dlg-h` frame, and on phones every console and dialog the `--sheet-h` sheet frame (D-107); focus rings show only while Tab-navigating (`kbd-nav` from `src/ui/focusRing.ts`, rule at the end of `theme.css`), so don't add per-control `outline: none`; every dialog and popup closes on Esc via `ctx.input.onKey(l, priority)` (dropdowns > 0 win, persistent consoles like City Pulse < 0 go last) |
| Global shader input                | `U` in `src/render/uniforms.ts`                                                                                                                                            |
| Saved module state                 | `ctx.services.get('save').addHook({ id, save, load })`                                                                                                                     |
| Boot progress stage                | `await onProgress(label, fraction)` in `src/game/createGame.ts`                                                                                                            |
| City change loading screen         | `ctx.services.get('loader').run(subtitle, async (stage) => …, reveal)` (`src/modules/loader/`; the boot screen reused): anything that replaces the city (found, load) runs inside it; `foundCityStaged` / `save.load(slot, stage)` report stages (D-111) |
| Pause panel                        | `src/modules/pause/` (card + folded pill, shown only for the player's own pause: dialogs (`.modal-scrim`), the loader, photo mode and `chapter-open` hold the clock without it; Space resumes at the last speed) (D-114) |
| Tier alerts (`pulse:tier`)         | settled by `stepTierGate` in `src/sim/tierGate.ts` (drop held 3 pulses, recovery 8, 30-pulse cooldown per system; Collapse skips the cooldown); the sim reads raw `pulse.tiers`. Listen to `pulse:tier` for alerts, read `pulse.tiers` for state (D-114) |
| Twin landmark (Aurora Gemini)      | building `src/content/buildings/aurora-gemini.ts` (`AURORA` exports the anchor points: tower axes, crown, Sun Gate), placed on the centre block by `heroDistrict` in `founding-city.ts`; searchlights and Light show in `src/modules/aurora/` (one additive mesh, drawn at night or during a show; service `aurora.show(eid)`). Every landmark (`isLandmark` in `explore/roof.ts`: heroes, `landmark`, big one-of-a-kinds) gets **Sky deck** (`explore.standOn(eid)`: spawn from `findRoof` or the collider's highest open spot, then a free collider stroll held by a `LEDGE` and the lot) and **Postcard** from the explore module. Module buttons in the building inspector go through `hud.buildingActions(eid => buttons)`. A recipe drawn smaller: `scaled(b, k)` from `src/content/kit.ts` (the Wellspring Spire at 0.7). The city camera's `aim` (in `CameraView`) orbits a point above the ground to frame tall landmarks; any pan resets it (D-135) |
| Hero building                      | procedural `recipe` with designed levels (below) and `retrofit: false`; check all three levels with `scripts/scenes/heroes.js` on `?scenario=empty` (D-082). A `{ glb, fallback }` recipe still loads, but GLB parts don't weather, light or level: avoid |
| Building levels (looks)            | every building that can level designs its level 2 and 3 inline in its recipe: `b.level(2 \| 3, fn)` adds pieces from that level, `b.upTo(1 \| 2, fn)` marks a roof or crown a later level replaces (lift it onto the new storey). Level blocks draw from their own stream, so level 1 never shifts. Grow in the building's own language (storeys, segments, wings, rides), never a generic slab. Check with `scripts/scenes/heroes.js` (`window.HERO`, `VARIANT`, `STYLE`); `tests/levelLooks.test.ts` fails for a levelling building with no design (D-100) |
| Native / desktop behaviour         | `src/platform/` (`web.ts`, `tauri.ts`); Rust commands in `src-tauri/src/lib.rs`                                                                                            |
| Terrain / island shape             | `src/sim/terrain.ts` (pure height function)                                                                                                                                |
| Starting city content              | `src/content/scenarios/<id>.ts` (`defineScenario`); builder in `src/sim/scenario.ts`                                                                                       |
| Management metric / tier           | `src/sim/pulse.ts` + `src/sim/pulseState.ts`; UI in `src/modules/pulse/`                                                                                                   |
| Data lens / advisor rule           | `registerOverlay` in `src/sim/overlays.ts` (needs `about` / `read` / `act` text for the Lenses card); `registerAdvisorRule` in `src/sim/advisor.ts`                                                                                  |
| Crisis / difficulty                | `registerCrisis` in `src/sim/crises.ts`; presets in `src/sim/difficulty.ts`; UI in `src/modules/crises/`                                                                   |
| Bloom, seasons, channels, retrofit | `src/sim/bloom.ts`, `src/sim/seasons.ts`, `src/sim/commands.ts`; visuals in `src/modules/bloom/`                                                                           |
| Night glow / pedestrian activity   | `src/sim/nightlife.ts`; shaders use `activityGlow()` from `render/materials/overlay.ts`                                                                                    |
| Commuting, congestion, pod docks   | `src/sim/mobility.ts` (+ `transit` on a building def); visuals in `src/modules/mobility/`                                                                                  |
| Street detail (kerbs, cars)        | road tile geometry `TileBuilder` in `RoadRenderer.ts` (raised pavements `PAVE_W` / `KERB_H` on open sides, dropped kerbs, skirts; `paveRise` for anything standing on a pavement), surface in the `road` material (`aRoad` = mask with junction-neighbour bits, overgrowth, level, born); vehicle kinds in `modules/mobility/carModel.ts` (one merged geometry, `aType` / `aPart`; a new kind needs a `CAR_MIX` share and the shader's pick), density `AGENTS_PER_TILE` (D-134) |
| Highway levels                     | `src/sim/roads.ts` (`roadLevel` / `roadWear` layers, capacity per level, wear in `updateRoadLevels`, `upgradeRoad` command, `roadStretch`); render `aLevel` in `RoadRenderer` + the `road` material, boulevard trees/lamps in `RoadRenderer.dressBoulevard`; inspector in `Hud.selectNetwork`; Flora `sim/roadTools.ts`. New highways start raw; scenarios set `roadLevel` / `b.roadLevel(...)` (D-096) |
| Sky-lane network (hubs, pods)      | `src/sim/skylanes.ts` (`transit.hub` on a def; `pulse.skylanes`); pod flight `modules/mobility/skypath.ts` (shader + CPU mirror for the ride camera: change both), pod model `podModel.ts` (D-051). Aeroline stations are rail links to the nearest hub; pods land at `aeroline.deck` + `RAIL_Y` (D-052). Lanes lift over rooftops (`liftOf`, D-053): check `await bloomgrid.services.get('skylanes').clearance()` reports `clipped: 0` after changing buildings or lanes. The pod is at WebGPU's 8 vertex-buffer limit: no new attributes |
| Soil, mist, drones (Flora-Net)     | `src/sim/floranet.ts` (+ `drones` on a building def, `mist` command); visuals in `src/modules/floranet/`                                                                   |
| Terrain edits, sea rise, seawalls  | `src/sim/coast.ts` (`setCorners` + `terrain:changed`; `defence` on a building def)                                                                                         |
| Sky-bridges, banyan merges         | `src/sim/weaver.ts` (`tower: true` on a building def); visuals in `src/modules/weaver/`, `banyanPieces`                                                                    |
| Building finish / style            | `style` on a building def (`StyleId` in `content/types.ts`); looks in `render/materials/styles.ts` (`STYLES`, district `FAMILIES`). Only neutral tints are restyled |
| Aeroline (maglev loop)             | route and stations: `aerolineRoute` in `content/scenarios/founding-city.ts`; drawing, trains, ride camera: `src/modules/aeroline/` (rises round the loop while its project runs: `construction.ts`, D-080). Keep the two lot rows beside the line low-rise; Bloom Helix towers (boarding) stand on each 6×4 station lot |
| Sky and sea scenery                | `src/modules/scenery/`: one merged mesh per piece (`GeoBuilder` in `render/bake.ts`), shader motion from `U.clock`; wonder sites in `sites.ts` (tested deep sea) |
| Signature bridges (render)         | `src/modules/construction/BridgeRenderer.ts` dresses straight spans from `findBridgeSpans` (`src/sim/bridges.ts`) by length                     |
| Explore modes, photo mode          | `src/modules/explore/` (collider in `collider.ts`); `ctx.tools.suspended` and `cameraCtl.enabled` gate input                                                               |
| Object inventory, readable ids     | `registerInventoryKind` in `src/sim/inventory.ts` (buildings, networks, bridges, sky-bridges, channels, districts built in; building `tags` for `is:old` / `is:upgradable` / `is:top`, D-080); UI in `src/modules/dashboard/InventoryView.ts`; districts via `nameArea` in a scenario |
| Agent (LLM) tools                  | `ctx.services.get('agent').register({ name, description, input, effect, run })` (`src/core/AgentTools.ts`); pure-sim read tools in `src/sim/inventoryTools.ts`; try them in the console: `await bloomgrid.services.get('agent').call('inventory_search', { status: 'critical' })` |
| City assistant (local LLM agent)   | engine `src/ai/llm/` (wllama + native MLX), loop `src/ai/agent.ts` (system prompts in `PROMPTS`, shown verbatim in the console's Profile tab; menus via `selectMenu`, routing via `plainIntent`), Profile/Tools tabs `src/modules/assistant/Dossier.ts`, tools `src/sim/{inventory,insight,action}Tools.ts` + game tools in `src/modules/assistant/index.ts`, console `src/modules/assistant/Panel.ts`; Rust `src-tauri/src/{llm,models}/`, `mlx.rs`. Measure agent changes with `bun run ai-probe`, not by argument |
| Knowledge base (Seedvault)        | guides `docs/knowledge/<category>/*.md` (front matter: `docs/knowledge/README.md`; `tests/knowledge.test.ts` checks links and section size), live reference `src/sim/knowledgeRefs.ts` (link it rather than copying numbers), journal via `ctx.platform.knowledge` (IndexedDB / desktop `knowledge/*.md`), base + field logs `src/modules/knowledge/base.ts`, search `search.ts`, Flora tools `tools.ts` (`knowledge_catalog` → `knowledge_read`), dialog `Vault.ts`; **?** / F1 (D-088). A new crisis kind needs a runbook that `covers` it |
| Build proposals (Flora's planner)  | `src/sim/proposals.ts` (`proposeBuilds`: advisories / rules → sized, unlocked, sited plans; `diagnose`), tool `propose_builds` in `sim/proposalTools.ts`; console cards (one-click Build, Lot, Locate chips, Undo) in `modules/assistant/Panel.ts` `proposals()`; alerts on tier drops carry cards (`assistant/index.ts`). A new advisory with a `build` gets proposals for free; a new shortage needs a case in `planFor` (D-089) |
| Bulk building actions (Flora)     | `act_on_buildings` in `src/sim/bulkTools.ts` (`pickBuildings` by type / district / query, `plan` per action, one `batch` command); a new per-building action needs a case in `plan` and `BULK_ACTIONS`, and a verb in `actionIn`. Many changes as one undo: `commands.execute('batch', records)` (`lastBatch` = applied indexes) (D-091) |
| Building inspector (status, flows) | verdict, fixes, Consumes / Produces from `buildingReport` in `src/sim/buildingReport.ts` (live values from the `Flow` store that `sim/pulse.ts` writes); view in `ui/Hud.ts` `updateInfo`; details scroll in `.ix-scroll`, actions stay pinned (`fillInfo`). A new upgrade blocker needs a case in `upgradeAdvice` (`sim/levels.ts`: reason, fix, `act` for the card's button, D-117). A new problem flag needs an issue + fix there; check with `scripts/scenes/inspect.js` (`?pick=bad\|home\|work\|power`, `?def=<id>`, `?scroll=1`) (D-109) |
| Inspector 3D preview               | `src/modules/preview/` (`preview` service: `show(host, eid)`; scissored render after `core.render`); pieces from `BuildingRenderer.snapshot(eid)` (every overlay: level, retrofit, rubble, read at full size; re-read on `building:tier` / ruin / repair); stage markup in `ui/Hud.ts` `buildInfo` (D-067) |
| Build progress (rising building)   | `src/modules/rising/` follows `BuildingRenderer.rising(eid)` (build-in length from `RISE_PER_UNIT`): blueprint, scaffold posts, scan frame and a progress tag (D-091). Change the rise pace there, not in a copy |
| Locating, selection highlight      | show an object with `ctx.cameraCtl.locate(x, z, { size, height })` (bird's-eye glide; the inventory service's `focus` / `select` already do), not `flyTo`; the reticle, ripples, beam and marker follow `selection:changed` in `src/modules/selection/` (unlit `beacon` / `beacon-xray` materials) (D-090) |
| Phone layout / touch input         | `.compact` rules in `src/ui/mobile.css` (loaded last), `platform/device.ts` (`isCompact`, `isTouchDevice`); foldable panels register with `hud.sheet(el)`; gestures in `input/Input.ts`, tools get `cancel` and `e.touch` (D-045). Check with `bun run snap -- --mobile` |
| Zones (living, work, industry…)    | `ZoneKind` / `ZONES` in `src/content/types.ts`; `nameArea(…, zone)` in a scenario; `District.zone` (saved, hashed); town sub-zones in `founding-city.ts` (`zones` on a `Town`) |
| Hazards (quake, lightning, fire)   | `src/sim/hazards.ts` (crises, fires, ruins, `respond` / `repair`), log via `logIncident` in `sim/crises.ts`; visuals, fire panel and locators (beacons, screen pins, `.` next fire) `src/modules/hazards/`; a `toast` with `at: { x, z }` is a fly-to button; Incidents tab `modules/dashboard/IncidentLog.ts`; Flora tools `sim/hazardTools.ts`; stations: `response` on a def (D-050) |
| Fireworks                          | sim `src/sim/fireworks.ts` (state in `fireworksState.ts`, `city.fireworks`; `fireworks` on a def; commands `launchFireworks`, `setFireworksAuto`), Flora tools `sim/fireworksTools.ts`; particles, top-bar button and toasts `src/modules/fireworks/` (the `firework` material flies sparks from `U.clock`: write a particle once, never re-pose); shaped bursts `fireworks/shapes.ts` and the sky message font `content/skyFont.ts` (`skyText` cleans messages, D-071); dashboard tab `modules/dashboard/FireworksView.ts` (D-068) |
| Group selection, batch removal     | Ctrl/⌘-drag in the select tool (`modules/construction/tools.ts`) → `selectInRect` (`src/sim/select.ts`) → `selection:changed` with `eids`; group inspector `selectGroup` in `ui/Hud.ts`; `demolishMany` command (one undo); Delete key and the inspector's Return to nature remove at once; removals animate via `instancer.removeAnimated` (D-070) |
| Relocating a building              | `move` command + `relocatePlan` in `src/sim/relocate.ts` (fee `MOVE_FEE`, keeps the record and uid, grades the new lot, drops sky-bridges woven to a moved tower); Shift-drag in the select tool (`modules/construction/tools.ts`, `carry`); `checkPlacement(…, moving, cost)` ignores the mover's own lot, lock and limit (D-116) |
| Build mode (actions, categories)   | `src/modules/build/` (`build` service: `open` / `close` / `toggle`; panel `BuildPanel.ts`, actions in `ACTIONS`, click-only: no hotkeys, D-101); a fixed full-height column on desktops like City Pulse (content changes never resize the frame); Build button bottom-centre (phones: beside Flora's orb), **B**; Done / Esc / right-click leave (D-084); action explanations and building facts in `src/ui/buildHelp.ts` (`ACTION_HELP`: a new tool needs an entry; numbers come from sim constants); the building preview floats beside the panel (`preview.showDef`, `BuildingRenderer.designParts`), never under panel glass (D-069) |
| Progression (fresh island)         | `city.growth` (`sim/growthState.ts`); unlock projects `sim/projects.ts` (`requires` on a def, `startProject`); fishing `sim/fishing.ts` (`fishing`, `limit` on a def; boats `modules/fishing`); earned wonders `sim/wonders.ts`; Flora gate and bill `sim/flora.ts`; Goals tab `modules/goals`; New Chapter dialog `modules/tutorial/Chapter.ts` (D-085) + guide `modules/tutorial` (steps are data). Progression is per scenario (`progression: true`): tests and the showcase run with everything open (D-072) |
| Waking Flora (fresh island)       | state `floraWake` in `src/sim/flora.ts` (criteria carry `build` / `progress` / `credits` hints in `sim/projects.ts`: the Goals tab and Flora's dormant card turn them into Build buttons); dormant card `modules/assistant/Dormant.ts`, orb states `Panel.setWake`, ceremony via the moments service (D-092) |
| City moments (ceremonies)         | `ctx.services.get('moments').play(spec, done?)` (`src/modules/moments/`: `Ceremony.ts` draws it, `index.ts` holds the triggers and queue; tones and timings in `moments.css`; sounds on the `moment` event in the audio module). Grand for once-a-city events, minor for frequent ones; never trigger while loading (baselines are taken after a city change) (D-094) |
| Milestones, tips, reward juice     | goals as data in `MILESTONES` (`src/sim/milestones.ts`: `progress`, `reward`, `build`; `claimMilestone`); tip value `tipValue` / `collectTip` in `src/sim/tips.ts` (the sim prices a tip, the module picks where it floats); bubbles, tracker card, build-ready burst and coins in `src/modules/juice/` (resident lines in `quotes.ts`; sounds on the `juice` event). Both commands run with `undoable = false`. Check with `scripts/scenes/juice.js` on `?scenario=fresh-island&nowizard` (`window.POP`, `window.CLAIM`, `window.NEAR`) (D-118) |
| Levels, ageing                     | `sim/levels.ts` (`Building.tier`, `Service.age/thrive`; `size`/`use`/`upkeepMul` wherever stats are summed), designed level pieces via `tierPieces` / `piecesAt` / `heightAt` (D-100) and weathering (concrete `aParams.w`, glass/timber `aParams.x` = 1 − grime) in `BuildingRenderer`; Flora `sim/levelTools.ts` (D-073) |
| Damage looks, switches             | `Service.scorch` (hazards write it; repair/renovate clear it) and weathering's soot range; ruins collapse in `BuildingRenderer.collapse` and rebuild on `building:repaired`; `interact` on a def + `toggleBuilding` (`sim/switches.ts`), read `Service.off` wherever output is summed (D-075) |
| Tornado, tsunami, risk             | `sim/disasters.ts` (crises + per-pulse steps, `evacuate` / `closeTideGates`), `sim/risk.ts` (`riskReport`; per-building `buildingExposure` feeds the Risk lens and the inspector, D-080), `shelter` / `radar` on a def, `leadFor` for warnings; visuals and Prepare panel `modules/disasters`; drills `?drill=tornado|tsunami` (D-076) |
| Music and sound                    | `src/modules/audio/` (Web Audio, all synthesised, no files; D-077): moods in `music.ts` (pure, tested), buses, ambience beds and effects in `index.ts` (effects hang off bus events; respect `MAX_SFX`; trains, pods and fires are camera-near beds in `nearby`). Nothing starts before the first gesture. `bun run perf -- --idle --sound` measures with audio running |
| Consequence rule                   | append to `RULES` in `sim/consequences.ts` (`target`, `apply` to `mods`, `cause`, `effect`); systems read `city.consequences.mods`; feed and Causes tab are automatic; add a case to `tests/consequences.test.ts` (D-074) |
| Wind turbines                      | building `src/content/buildings/wind-turbine.ts` (plinth + tower); nacelles and spinning rotors `src/modules/wind/` (one prevailing wind, CPU-posed from `U.clock`); founding-city farm placement in `founding-city.ts` (`WIND_TURBINES` cap, D-047) |
| City map (districts)               | `src/modules/citymap/` (canvas painted on open from `city.districts`; labels fit their district); button in `hud.lead`; **M** |
| About / credits, version          | `src/modules/about/` (`about` service: `open` / `close`; facts in `ABOUT`), opened by clicking the top-left brand. The version is `__APP_VERSION__`, injected from `package.json` by `define` in `vite.config.ts` (declared in `src/version.d.ts`), so `bun run release` updates it everywhere; never hard-code a version (D-101) |
| Top-bar indicator guides           | names and order in `src/sim/indicators.ts` (`INDICATOR_NAMES`, `SYSTEM_LABELS`, `INDICATOR_ORDER` / `SYSTEM_ORDER`: one name and one order per indicator on every surface, D-113/D-114; never hard-code a stat's label or list order); meaning, breakdown, levers per stat in `src/sim/statGuide.ts` (`statGuide`; a new lever kind needs a case in `run` in `src/modules/statinfo/index.ts`); hover card + click panel `src/modules/statinfo/`; check with `scripts/scenes/statinfo.js` (`window.STAT`, `window.HOVER = 1`) (D-092). The clock's season chip gets the same card and panel from `src/sim/seasonGuide.ts` (`seasonGuide`: effects, crisis odds, next season, levers; D-119) |
| Top status bar fitting             | `Hud.fitStats` adds cumulative `fit-1…7` classes to `.topbar` until `.stats` stops clipping (rules at the end of `ui/theme.css`); a new top-bar element should say at which level it gives way (D-071) |
| HUD layout (desktop)               | one left console, City Pulse with tabs (D-056; monitoring only, building has its own panel, D-084; phones show the same tabs as a sheet under the top bar, opened by the top bar's Pulse button, D-106): add a tab with `services.get('pulse').addTab(id, label, glyph, ...els)`; telemetry strip in its header (`hud.readout`); explore modes are a top-bar dropdown (`explore/index.ts`); Flora's orb in `hud.dockRow` (bottom-right); console styles at the end of `ui/theme.css`. Top-bar view toggles (City Pulse, map, fireworks) go in `hud.lead`, the actions panel's leading group; Save / Load live in ⚙ Settings → Game (tabs Game / Sound / Display, D-081). Panels have no corner brackets (D-081) |
| Colour grade, fog, environment     | grade keys (lift / gain / sat / con / bloom) in `KEYS` in `world/Atmosphere.ts` → `U.grade*`, applied by `render/grade.ts` in the post output node (after tone mapping); weather pushes them after the atmosphere; fog is `scene.fogNode` (`U.fogColor/Near/Far`; `atmosphere.fog` still writes them); reflections follow the sky through `U.envTint` on the noon bake; cloud shadows via `cloudShade()` in `define()` and the terrain. No ambient occlusion: half-res GTAO stippled close views (D-124) |
| Street walkers, meadow critters    | `src/modules/walkers/` (walkers from the activity field round the camera focus (the camera itself in explore modes); figure parts, limb swing and colours in `figure.ts`, a detailed LOD close up / in explore and a plain one further out over the same instance data; critters only in explore modes, rebuilt on `mobility:updated` or a 25-tile drift; `critters.ts` butterflies / fireflies). Shader-walked from `time`, no per-frame uploads (D-122) |
| Happenings (requests, festivals)   | sim `src/sim/happenings.ts` (kinds, `startHappening`, `applyHappenings` inside `updateConsequences`, `claimHappening`), state `happeningState.ts` (`city.happenings`, saved, hashed, `auto` off in tests and the trailer); card, toasts and moment `src/modules/happenings/`; Flora `sim/happeningTools.ts`; guide `docs/knowledge/systems/happenings.md`. A new kind needs a `propose` case, an effect in `applyHappenings`, a card hint and a guide line (D-123) |
| Highway planning (drag a road)     | `src/sim/roadPlan.ts` (`planRoad`: abutment grading, landing over water, skip reasons, budget; `bestRoute`: the L route with no wet bend); the `road` command and the Build tool both use it, so preview = result (D-125) |
| Close-up wildlife                  | `src/modules/walkers/` (`critters.ts` butterflies/fireflies, `fish.ts`, `rabbits.ts`, `birds.ts`, shared `kit.ts`): one instanced mesh each, shader-posed, placed round the camera and drawn only in explore modes. Fish draw after the water (which writes no depth) (D-126) |
| Hands-on buildings (doors, lights) | `src/modules/interact/` (card, **E** door / **L** lights in walk mode, save hook, `building:interact` for sounds); state and leaf motion in `BuildingRenderer` (`setDoor`, `setLights`, `dark`); a door is `door` on a recipe piece (slide in its own widths); the collider skips open leaves and cuts a doorway through hollow shells (`HOLLOW`, `glassDome`), lots up to `PLINTH_STEP` are climbed, and a raised door gets front steps (`doorSteps`, drawn and walked from the same function). Laptop screens: `screen` piece, atlas + app frames in `render/materials/display.ts` (`DISPLAY_RECTS` keeps drawing and shader in step). Render-only: no command, no hash. Check with `scripts/scenes/interact.js` (D-132) |
| Building signs (names, numbers)   | `src/modules/signs/` (one instanced quad per sign, glyphs packed into attributes, font atlas); placement `signSpots` in `BuildingRenderer.ts` from `sign: 'name' \| 'number'` on a recipe piece (kit `entrance` / `door` mark theirs); text packing `packSign` (tested in `tests/signs.test.ts`) (D-133) |
| Residents entering buildings       | door trips in `src/modules/walkers/index.ts` (`doorway`, trip kind in `info.z`'s integer part; the shader walks pavement → kerb → door); door from `doorwayOf` in `BuildingRenderer.ts` (D-133) |
| Mouse cursors                      | `src/ui/cursor.ts` draws them (canvas PNG, 1x + 2x) into `--cur-default` / `--cur-pointer`; CSS writes `cursor: var(--cur-pointer, pointer)`, never a bare `pointer` (D-132) |
| Clicking objects (picking)         | `pickObject` in `src/modules/construction/pick.ts` (ray against padded building / bridge boxes, then nearest within the margin, then the ground tile): tools that act on a clicked building use it, not `buildingAt(hit.tx, hit.tz)`; a new clickable kind needs a box there. Check with `scripts/scenes/pick.js` (D-129) |
| Bridges (named, levels, panel)     | registry `src/sim/bridges.ts` (`syncBridges` after every `setRoads`, `bridgeAt`, `upgradeBridge`; level in the deck tiles' `roadLevel`, capacity `BRIDGE_CAPACITY` in `roads.ts`), report `sim/bridgeReport.ts`, panel `Hud.selectBridge` (`selection:changed` with `bridge`), level dressing `BridgeRenderer.dressLevel`; check with `scripts/scenes/bridge.js` (`window.BUILD = 1` lays a crossing, `UPGRADE`, `PICK`) (D-128) |
| Road / bridge construction effects | `src/modules/roadworks/` (`schedule(tiles)`: build delay per new tile; sparks on the `firework` material; opening moment; `roadworks` cue for sounds); the road material's `aBorn` reveal; renderers pass the delays as instancer grow delays (D-128) |
| Builder, cost to date              | `City.builders` / `City.spent` (by serial; `BuildingRecord.by` / `spent`, saved v19); pass `by` to `build` / `road` (`flora` from Flora's tools); book any new credit spent on a building with `city.addSpend(eid, credits)` in the command and take it back in `revert` (D-128) |
| Closable notices                   | `closeX(label, onClose)` from `src/ui/closeX.ts` on every toast, alert card and request; a closed alert comes back only for a new incident (D-128) |
| Trees, wild greenery               | `src/world/Flora.ts` (species per setting: shore, rainforest, cloud forest, open country, street verge, garden beside a building; `refreshAround` re-plants when a neighbour changes), recipe trees via `tree()` + colours `TROPIC` in `src/content/kit.ts`; the `palm` piece (one mesh, parts in `uv.x`) and the broad-leaf `bush` in `assets/kit/pieces.ts`. A new species should reuse pieces: each new piece costs a draw per visible chunk (D-127) |
| Can't-build guidance (build gate)  | `buildBlock` in `src/sim/buildGate.ts` (locked / at limit / short of credits → reason + steps with actions); limit maths `sim/limits.ts` (shared with `City.checkPlacement`); steps as HUD `ui/gateSteps.ts` (`runGate`). A new placement block that the player can work towards needs a case there; planners filter with `unavailable` (D-130) |
| Placement preview                  | `src/sim/placementPreview.ts` (service area, pairing, land value) read by the Build tool's hover; ghost colours ok / warn / bad in `Ghost.setValid`; landing ripple in `modules/rising` (D-121) |
| Seasonal / crisis weather          | `src/modules/crises/Weather.ts` (uniforms + `atmosphere.haze`)                                                                                                             |
| New lit material                   | always via `define()` in `render/materials/library.ts` (gets lens + optional vitality support)                                                                             |

The full layer description is in `docs/architecture.md`.

## 5. Definition of done (every change)

- [ ] `bun run check` passes.
- [ ] New sim logic has Vitest coverage in `tests/` (determinism, undo/redo or save round-trip, as relevant).
- [ ] Visual change verified with `bun run snap` on WebGPU and `?renderer=webgl`; no new console errors.
- [ ] `bun run perf` and `bun run perf -- --idle` still within the §7½ power budget.
- [ ] Perf still within budget with the founding city (default boot) **and** `?stress=1500`: fps and
      `renderer.info.render.drawCalls` at near and full-island zoom, plus the `[boot] ms` log.
- [ ] **Docs updated in the same change** (see §6).

## 6. Keeping docs current

| When you…                                                                   | Update                                                                     |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Deliver or progress a roadmap item                                          | `docs/roadmap.md`: tick the checkbox, set the phase status (✅ 🚧 ⏳ ⬜)   |
| Make a lasting technical choice (dependency, convention, rejected approach) | Append `D-NNN` to `docs/decisions.md`                                      |
| Add or change a layer, extension point or frame-order rule                  | `docs/architecture.md`                                                     |
| Change commands, rules, workflow or gotchas                                 | this `AGENTS.md`                                                           |
| Change controls, URL flags or player-visible features                       | `README.md`                                                                |
| Change scope, player role or game rules                                     | `BloomGrid_Implementation_Requirements-v3.md` (note the change at the top) |

Keep docs short and factual. Prefer tables and checklists over prose. Never leave a doc describing behaviour the
code no longer has.

## 7. Conventions

- TypeScript strict, ES modules, `@/` alias for `src/`. Prettier: single quotes, width 110.
- File-level JSDoc explains _why_ a module exists; comment non-obvious intent, not mechanics.
- Naming: `PascalCase` classes, `camelCase` functions, kebab-case content ids (`canopy-tower`).
- Events are `domain:verb` (`building:added`); service keys are short nouns (`construction`, `world`).
- Units: 1 tile = 1 world unit; sea level y = 0; map `MAP_SIZE`² tiles (512); sim ticks at 10 Hz; `timeOfDay` in [0, 1).

## 7½. Power budget (laptops must stay cool)

`bun run perf` reports main-thread busy %, fps, CPU ms per frame and (with `?gputime`) GPU ms per frame; `--profile`
lists the hottest functions. Reference (headless, 60 Hz, founding city, High): **main thread ≈ 16% active / 14% idle,
GPU ≈ 3.5 ms per frame, GPU uploads < 1 MB/s.** If a change raises these noticeably, fix it or record why in
`docs/decisions.md`. Rules: never set `DynamicDrawUsage` on instance attributes; keep instanced batches ≥ 1040
capacity; never use `backdrop-filter` or animate `box-shadow`/layout properties in the HUD; anything that changes
shadow casters must call `atmosphere.invalidateShadows()`; rendering is paced by `PowerManager`, so don't add your
own `requestAnimationFrame` loops.

## 7¾. Growing the knowledge base (Seedvault)

The knowledge base is never finished: treat it as part of every feature. Flora's answers are only as good as it.

- **New system, crisis, building family or control** → add or update the doc that explains it in
  `docs/knowledge/` in the same change (a crisis kind needs a runbook that `covers` it; the test enforces this).
- **Numbers live in code** → extend the live reference (`src/sim/knowledgeRefs.ts`) rather than writing them into
  a guide; guides link `kb:reference-…`.
- **Write for retrieval**: one question per `##` section (Flora reads one section at a time, < 1,400 chars), headings
  in the player's words ("Prepare (in the warning window)", not "Phase A"), tags with the words players use. When a
  player phrase misses, add it to `SYNONYMS` in `modules/knowledge/search.ts` and a case to `tests/knowledge.test.ts`.
- **Measure, don't guess**: after changing docs, search or tools, ask Flora the doc's questions with
  `bun run ai-probe -- --ask "…"` and check she reads the right section.
- **Learn from play**: field logs and recoveries on your device show what actually goes wrong; when a pattern keeps
  coming up, turn it into a runbook step or a playbook. Ideas worth doing next: a "lessons" pass that promotes
  recurring field-log lessons into a doc, per-doc "was this useful" signals, and docs for new player questions
  seen in probes.

## 8. Gotchas (three r186 / tooling)

- Import from `three/webgpu` and `three/tsl`. Post-processing is **`RenderPipeline`** (`PostProcessing` was renamed);
  `PCFSoftShadowMap` is gone (use `PCFShadowMap`).
- TSL `material.positionNode` runs **after** instancing, so `positionLocal` is already instance-transformed.
  Scale-from-pivot effects (growth) go through CPU matrix tweens in `ChunkedInstancer`; sway is an additive world
  offset in the shader.
- Per-instance shader data comes from the `aParams` vec4 attribute (x greenery, y seed (its integer part is the
  building style on slab/glass/timber pieces, D-040), z glow, w = window lighting
  for glass / vitality for plants, see D-013) and `instanceColor`.
- `DynamicDrawUsage` attributes are re-uploaded in full **every frame and pass** by three's WebGPU backend. Use
  static usage + `needsUpdate` + `addUpdateRange`.
- `InstancedMesh` with ≤ 1024 instances stores matrices in a UBO (re-uploaded every frame, capacity baked into the
  shader). `ChunkedInstancer` keeps capacity ≥ 1040 to avoid this.
- Never dispose a geometry whose attributes are shared (WebGPU frees the GPU buffers). Batches clone piece geometry.
- three builds node graphs per render context (keyed by call depth: the bloom pass renders nested, so `compileAsync`
  misses it) and per `InstancedMesh` uuid. `ChunkedInstancer.warmup` adds one instance of every piece and builds every
  batch through `PostFX.compile()` (D-030). Re-check it when adding pieces, materials or render passes. An instancer
  that is refilled often (the inspector preview) calls `empty()`, not `clear()`, or each refill rebuilds its shaders (D-110).
- ECS component stores (`ecs/components.ts`) are global arrays indexed by entity id, shared by every `City` in the
  page, and ids are reused: when adding a store field, reset it where `City` adds a building, or a second city (new
  game, load, tests) reads the last one's values and breaks determinism.
- bitecs 0.4 API: `addComponent(world, eid, Component)`, `query(world, [A, B])`.
- Tweakpane v4 typings need `@tweakpane/core` (already a dev dependency).
- CSS `background-clip: text` doesn't paint through transformed child spans (bitten us in the boot title).
- **Vitest 5 caches transformed modules in `node_modules/.vitest-cache` and does not invalidate `import.meta.glob`
  when files are added** (new content files go missing in tests). `bun run test` clears it first; do the same if you run
  `vitest` directly.
- Headless screenshots can time out while the main thread is busy generating the world; re-run, or capture later.
- `bun run snap` ignores `--eval` when `--times` is given; use `--after <ms>` with `--eval`. An eval may return a
  Promise (e.g. to sample `renderer.info.render.drawCalls` over a second; it reads 0 between frames).
- Building ids (`LIV-0042`) come from `Building.uid`, a saved serial: build new buildings through `addBuilding` without a
  `uid` (it assigns one), and pass the record's `uid` back when re-adding (undo), or the id changes. New object kinds
  must give each object an id unique among live objects (`tests/inventory.test.ts` checks the founding city).
- Agent tools return plain JSON (no entity ids, typed arrays or DOM): strip HUD handles (`ref`) as `inventoryTools.ts` does.
  Tools that change the city must run commands and declare `effect: 'mutate'`.
- The assistant's tools: a tool that changes the city must be `effect: 'mutate'` and run an undoable command.
  Small models fill every optional argument they are shown: offer an optional filter only when the request names it
  (`narrow` can delete it from the schema), or a bulk action matches nothing (D-091).
  A tool can hold its arguments to what the turn has seen (`narrow`) and name an obvious next read the loop makes
  without a decision (`follow`, never an action): small models answer from a search snippet otherwise (D-088).
  Tool grammars are mirrored in `src-tauri/tests/fixtures/llm/bloomgrid-grammars.json` (the Rust engine compiles
  each); after changing a tool's input run `UPDATE_GRAMMARS=1 bun run test`, then `bun run test:rust`.
- Phones load web cores CPU-only at ≤ 2,048 tokens and step down after a failure or a page iOS killed mid-load (`src/ai/llm/device.ts`, D-103): iOS gives no error before it reloads the tab, so test model changes against the phone plan, not just the desktop one (`bun run ai-probe -- --phone` loads like an iPhone and prints process memory). Phones list only `phone: true` cores, and CPU plans use a q8_0 KV cache (`loadParams`, D-108): a new core needs `phone` only if it fits beside the city.
- wllama needs the page cross-origin isolated (COOP/COEP in `vite.config.ts` and `firebase.json`): any new
  cross-origin resource needs CORS or `crossorigin`. `bun install` copies its wasm into `public/wllama/`
  (`scripts/copy-wllama.mjs`); keep `@wllama/wllama` and `-compat` on the same pinned version. Import wllama only
  dynamically (it must not load at boot).
- Native MLX: Apple Silicon only (`cfg(mlx)` from `build.rs`); release bundles need `mlx.metallib`
  (`tauri:build:mac-arm64`). The first `cargo` build compiles MLX's C++ (minutes).
- Sim modules that `City.ts` imports must not import `City.ts` values back (only `import type`): a cycle leaves
  constants undefined at load (`DAY_LENGTH` lives in `pulseConst.ts` for this reason).
- Anything derived from terrain heights must refresh in `City.refreshTerrainDerived()` (sim) or on `terrain:changed`
  (render); edit corners only through `setCorners` so saves and the hash see the change.
- Buildings grade their lot (`sim/grading.ts`, D-099): the `build` command and the scenario builder level the lot, lift it to a
  higher street and cut rising banks to a ramp, never steeper than a highway allows; a scenario's levelled terraces are kept.
  Check a scenario change with `tests/grading.test.ts` (no showcase building in a hollow).
- Rest render things on the ground with `Grid.heightAt`: it follows the terrain mesh's triangles (D-098), a hand-rolled
  bilinear blend floats or sinks them on twisted tiles. Highway surfaces are `ROAD_LIFT` above it; buildings re-seat on
  `terrain:changed`.
- Shader animation the CPU must match (follow-cams) uses `U.clock`, not TSL `time` (they drift apart). Ambient motion
  (particles, sway) stays subtle: sway amplitudes are world units, so tiny pieces need tiny amplitudes.
- Explore modes change `camera.near/far` and the sky dome scale; anything depending on them must restore on exit.
- Missing files under `/assets/` get Vite's SPA fallback (HTML), so `GLTFLoader` rejects: always give GLB recipes a
  `fallback`. rtk may rewrite `bunx tauri …`; call `./node_modules/.bin/tauri` directly if it does.
- A snap `--eval` that does `import('/src/render/uniforms.ts')` gets a *second* module instance (Vite serves the app's
  copy with `?t=…`). Import the exact URL from `performance.getEntriesByType('resource')` to reach the app's `U`
  (e.g. to pin `U.clock` while capturing shader-animated scenery).
- Credit flow (credits per second) is `netIncome(city)` from `sim/finance.ts` everywhere (D-115); a new recurring income
  or cost must land in `city.stats` and in that formula, or the top bar's rate stops matching how credits move.
- Hazard damage goes through `damageBuilding` (books the credits and the log, ruins at zero); don't write
  `Service.condition` down directly for a hazard. A new crisis is logged automatically when it ends; give it
  `c.x / c.z` so the log and the map can place it.
- Building categories feed the Build panel in `CATEGORY_LABELS` order, click-only (no number keys, D-069): add a
  category with a `CATEGORY_CODES` prefix; the id regexes in `ai/agent.ts` and
  `modules/assistant/Panel.ts` list every prefix.
- A plain boot is a fresh island (D-072): scripts append `scenario=founding-city` unless a path names one, and a test
  that needs locked progression must apply `fresh-island` (or set `city.growth.progression`).
- Fresh-island pacing is guarded by `tests/pacing.test.ts` (a scripted steward times the unlocks); after changing
  unlock costs, fishing or early-game buildings, run it with `PACE=1` for a timeline (D-078).
- Founding-city balance is sensitive: after changing a scenario mix, measure settled (≈400 ticks) flow,
  unemployment, power margin and budget on seed 20261024 (`tests/zoning.test.ts` guards them). For traffic, list
  the jammed tiles (`mobilityLayers(city).traffic` > 0.8) per district before adding transit.
- `.info` is the inspector panel (a bottom sheet on phones): never use `info` as a modifier class (advisor tips use `note`,
  toasts `tone-info`), or the element is pulled out of its layout.
- Phones (D-045): a new HUD panel needs a `.compact` rule in `ui/mobile.css` or it will overlap at 390 px; a new tool
  that acts on a single tap should preview first when `e.touch` (no hover on touch), and a drag-drawing tool should
  implement `cancel` (a second finger turns the press into a camera gesture).
- Headless `?gputime` swings 1.7–5 ms between identical runs; compare several runs on and off before blaming a change.
- Small or thin lit details flash when the camera moves (sub-pixel, then bloomed). Scale glow by `pieceCover()`, draw
  repeating lines with `stripes()`, and fade patterns to their mean using `fwidth` (`groundPx()`) in
  `render/materials/library.ts` (D-064).
  Measure with `bun run flicker` (per piece: `--pieces all`; module meshes: `--pieces names`; `--diff` shows where):
  patterns with hard `step()`/per-cell `hash()` edges and noise contours need a pixel-wide soft edge or a fade to their mean (D-070).

## 8½. Security (don't introduce risks)

The game ships to the public web (Firebase) and as a signed desktop app whose webview can call Rust commands that
write to disk. Treat every change as security-relevant, and stop and ask before weakening any rule below.

- **CSP is on in both shells** (D-131): `firebase.json` (web, also served by `vite preview`) and
  `security.csp` / `devCsp` in `src-tauri/tauri.conf.json`. A new external origin (CDN, API, model host) goes into
  `connect-src` / `font-src` etc. in **both**, never as `*` or `'unsafe-eval'`. Check with `bun run build`, then
  `bunx vite preview` and `bun run snap -- --base http://localhost:4173`: CSP violations print as console errors.
- **No HTML from data.** Build DOM with `h()` / `textContent`; `innerHTML` only for static SVG markup we wrote.
  Anything from saves, knowledge notes, the LLM, city names or URL params is text. Links from data stay `http(s)`
  with `rel="noopener noreferrer"` (see `modules/knowledge/markdown.ts`). No `eval`, `new Function` or string timers.
- **Tauri commands are an attack surface.** Validate every argument in Rust: ids/keys against an allowlist charset
  (`key_path`, `kb_path`), files only from a fixed catalog (`llm/catalog.rs`), sizes capped. Never take a path from
  JS. Keep `capabilities/default.json` minimal; add a plugin permission only for a feature that needs it.
- **Downloads are pinned and verified**: model URLs name a commit (never `main`) and carry a sha256 checked before
  loading (`ai/llm/integrity.ts`, `models/store.rs`). Keep it that way for any new downloaded asset.
- **Flora's tools**: a tool that changes the city is `effect: 'mutate'` and runs an undoable command; treat text she
  reads (notes, logs, names) as untrusted. Never give her a tool that touches files, the network or settings.
- **No secrets in the repo** or in client code (everything in `src/` ships to the browser). CI secrets stay in GitHub
  secrets; new workflow steps get the least `permissions`, and prefer actions pinned to a commit SHA.
- **Dependencies**: add only what a feature needs, pin exact versions, and run `bun audit` (and `cargo audit` in
  `src-tauri/`) after adding or bumping one; mention any advisory you leave open.

## 9. Picking up work

1. Read `docs/progress.md` (snapshot and next up), then `docs/roadmap.md`, and find the first ⏳ or 🚧 phase.
2. Skim `docs/decisions.md` for constraints.
3. Run `bun run check` and `bun run dev` + `bun run snap` to see the current state.
4. Implement in small, verified steps; update the roadmap checkboxes as you go.
5. Finish with the §5 checklist and a summary of what changed, what you verified, and anything you deferred.

## 10. Releasing and deploying (Firebase Hosting)

A release is a `vX.Y.Z` tag on `main`. Pushing the tag runs `.github/workflows/firebase-hosting-release.yml`: it
checks the tag matches `package.json`, runs `bun run check`, deploys `dist/` to the **live** site (project
`bloomgrid-7ae90`) and creates a GitHub Release with generated notes. There is no PR-preview workflow.

**Deploying is outward-facing: only release when the user asks, and confirm the version with them first.**

| Step                                  | Command                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1. Preview the plan (changes nothing) | `bun run release --dry-run` (or `minor` / `major` / `1.2.0`)                                                           |
| 2. Cut it, after the user confirms    | `bun run release patch --yes`                                                                                          |
| 3. Watch the deploy                   | `gh run watch $(gh run list --workflow=firebase-hosting-release.yml --limit 1 --json databaseId -q '.[0].databaseId')` |
| 4. Report                             | `gh release view vX.Y.Z --web` link, plus the run result                                                               |
| Re-deploy an existing tag             | `gh workflow run firebase-hosting-release.yml -f tag=vX.Y.Z`                                                           |

- `release` refuses unless on `main`, tracked tree clean, not behind `origin/main`, tag unused. It runs `bun run check`
  (`--skip-check` skips it; CI still runs it), bumps the version in `package.json`, `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml` and `Cargo.lock`, commits `Release vX.Y.Z`, tags, and pushes `main` + tag atomically, so
  unpushed commits on `main` ship too.
- Interactive prompt by default; agents pass `--yes` only after the user said go. Pick `patch` unless the user says otherwise.
- A failed run deploys nothing: fix on `main` and release the next patch (don't move or delete published tags).
- CI needs the repo secret `FIREBASE_SERVICE_ACCOUNT_BLOOMGRID_7AE90` (set up by `firebase init hosting:github`).
- The same run's `macos` job attaches `BloomGrid_X.Y.Z_aarch64.dmg` (MLX) and `_x64.dmg` to the Release (D-058).
  They are ad-hoc signed unless the `APPLE_*` signing/notarization secrets are set; a failed mac build does not undo the web deploy.
