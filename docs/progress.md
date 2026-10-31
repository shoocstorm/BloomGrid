# Progress & Handoff

A snapshot for picking up BloomGrid in a new session or with another agent. **Update the "Snapshot" and "Next up"
sections whenever you stop working** (see AGENTS.md §6).

## Snapshot (2026-10-31)

|             |                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch      | `main` (uncommitted: phone support), remote `origin` (github.com/shoocstorm/BloomGrid); releases are `vX.Y.Z` tags deployed to Firebase Hosting (AGENTS.md §10) |
| Last change | Shaped fireworks and sky messages, self-fitting status bar (D-071); before that less flashing (flicker probe, D-070), animated instant Return to nature, Ctrl/⌘-drag group selection, Delete key; before that the Build tab explains itself: action tiles, click-only category chips, explanation cards and a floating 3D building preview; two waterfront Fireworks Factories in the founding city (D-069); before that fireworks (D-068): Fireworks Factory, nightly 21:00 shows and steward launches (top-bar button, dashboard Fireworks tab, Flora tools), harmony afterglow vs novelty fatigue, visitor income, smoke and stray-spark fires, GPU-flown particles; before that explore modes on phones: top-bar switcher and touch pad with a City view button (D-057); one desktop console: City Pulse tabs Pulse / Build / Lenses / Flora-Net replace the toolbar, lens bar and advisor panels (D-056); explore physics: piece-level colliders and wild trees; drone, balloon, walker, board and cameras stop at walls (D-055); explore avatars (chibi steward, jet board, quadcopter), balloon and landmark-rooftop modes (D-054); solar petals recoloured sea-green / bronze with gold busbars (was silicon blue); sky-lanes lift over buildings, rooftop landings, cruise arc profile (D-053); pod ↔ Aeroline transfers and street-scale wild trees (D-052); sky-lane network: hubs, spokes, trunks, the central Skylane Nexus, routing pods, hub rings, new procedural pod (D-051); before that fire locators: light beacons and ground rings, on/edge-of-screen 🔥 pins, clickable alert toasts (`toast` `at`), `.` next fire, fires on the city map; before that hazards: earthquakes, lightning, spreading fires, Ember Watch, ruins, incident log, Flora tools (D-050); zoned founding city with industry, sports and transit (D-049); city map of named districts, ⌗ MAP / Y (D-048); desktop HUD merges and wind power: Breeze Turbines, Windward Isle farm, clean energy 99% (D-047); Flora's Profile/Tools dossier and Flora on phones (D-046); playable on phones: compact HUD with chip sheets, touch gestures, tap-to-confirm building (D-045); before that Flora's 29 tools and console (D-044) |
| Phases done | **All roadmap phases 0–15** (8 = core; deferred items listed below), plus 2.5, 2.6 and the power/heat interlude                                                 |
| Next phase  | No phase left: pick from the deferred list below, or merge to `main` (ask the user)                                                                             |
| Tests       | 134 passing (`bun run test`), 31 Rust (`bun run test:rust`); `bun run check` clean                                                                                                              |
| Save format | v10 (fireworks state; v9 zones, fires, ruins and the incident log in the steward state; migrations from v1–v9 in `src/sim/save.ts`)                                                                           |
| Map         | 512×512 tiles (D-028), Singapore-like island (≈88k land tiles); founding city ≈2 000 buildings on one grid, ≈25k residents, water Strained (≈95%) |

### Measured baselines (headless Chrome, WebGPU, M-series, founding city, High quality)

| Metric      | Value                                                                                                                                | How to measure                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Boot        | ≈2.1 s to interactive WebGPU, ≈2.5–3.0 s WebGL2, no post-boot stall (scenario ≈0.25 s, modules ≈0.25–0.29 s, warm-up ≈1.3 s, D-030)  |
| Frame rate  | 60 fps active, 30 idle (power mode Balanced)                                                                                         | `bun run perf` / `bun run perf -- --idle`             |
| Main thread | ≈17.6% active, ≈16% idle                                                                                                              | `bun run perf`                                        |
| GPU         | ≈1.0–3 ms per frame headless (noisy: compare several runs; +≈2 ms in storm rain)                                                     | `bun run perf -- --path "/?gputime"`                  |
| Draw calls  | ≈160–262 near (≈262 downtown, ≈250 at Bloomtopia), ≈253 overview, 297 near-horizon dusk; `?stress=1500` 286 worst / 255 overview (318 near-horizon: over budget, pre-existing) (budget 300: keep hero pieces in their quarter's chunk, D-034/D-035) | perf overlay (F3) or `renderer.info.render.drawCalls` |
| Sim         | pulse tick ≈0.4 ms; field tick (one pass per pulse, D-029) ≈2.2 ms median / ≈3 ms p95: ecology 2.8, activity 2.4, bloom 2.0 ms worst |

## How to resume

1. Read [`../AGENTS.md`](../AGENTS.md) (rules, commands, definition of done, gotchas), then [`roadmap.md`](roadmap.md),
   [`decisions.md`](decisions.md) (D-001…D-026) and [`architecture.md`](architecture.md).
2. `bun install && bun run check` (it clears the Vitest cache first: see the gotcha in AGENTS.md).
3. `bun run dev`, then `bun run snap -- --path "/?perf" --out shots/now.png` to see the current state.
   Useful drills: `--eval @scripts/scenes/retrofit.js`, `explore.js`, `weaver.js`, `floranet.js`, `mobility.js`, `nightlife.js`, `season.js`, `blackout.js`, `drought.js`, `demo-city.js`, or
   `--path "/?drill=monsoon"` (any crisis id).
4. Pick the ⏳ phase in the roadmap, implement it in verified steps, and update roadmap, decisions, architecture,
   AGENTS and this file in the same change.

## What exists (one-line map)

| Area            | Where                                                      | Notes                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sim core        | `src/sim/`                                                 | `City`, `Grid`, `pulse.ts` (1 Hz management pulse), fields, bloom, night life, mobility, Flora-Net soil, coast (terrain edits, sea rise), weaver, crises, finance, upkeep, steward, seasons, scenario, save |
| Content         | `src/content/buildings/*.ts`, `src/content/scenarios/*.ts` | 59 buildings (2 with Rodin GLBs; the central Wellspring Spire and its 40-building hero district are procedural), founding-city scenario; auto-discovered                                                                                                                                   |
| Rendering       | `src/render/`, `src/assets/kit/pieces.ts`                  | `ChunkedInstancer` (static buffers, ≥1040 capacity, update ranges), TSL material library with lens/vitality/season support                                                                                  |
| Feature modules | `src/modules/*`                                            | world, construction (buildings, roads, channels, tools), pulse, overlays, advisor, views, dashboard, settings, crises, bloom, mobility                                                                      |
| HUD             | `src/ui/`                                                  | vanilla DOM; right column via `services.get('hud').right`                                                                                                                                                   |
| Tooling         | `scripts/snap.mjs`, `scripts/perf.mjs`, `scripts/scenes/`  | headless screenshots, power/perf probe, drills                                                                                                                                                              |

## Next up

### Optimization backlog (ranked; quick wins done 2026-10-25)

1. ✅ First-frame shader stall removed (D-030).
2. ✅ Field passes moved off the pulse tick (D-029).
3. ⏸ KTX2 textures (≈1.6 MB across three hero GLBs; skipped for now). Needs an encoder: Khronos KTX-Software `.pkg` (sudo; no Homebrew formula) or npm `ktx2-encoder` (third-party WASM). Revisit when more hero assets land.
4. ✗ Cheaper shadow pass: measured, no gain (D-031).
5. ✗ `BatchedMesh`: measured, ≈10% fewer draws for a large refactor (D-031).
6. Far-chunk impostors or GPU-driven culling (only if content roughly doubles).

### Deferred work (pick next with the user)

- Assistant follow-ups (Phase 14 deferred): Laya decisions, multi-action plans, proactive advice; measure with `bun run ai-probe`.
- Phase 8 leftovers: canopy greenways, hyperloop, ferries, player-drawn sky-lanes.
- KTX2 textures (install `toktx`, wire `KTX2Loader` + basis transcoder), Windows/Linux packaging and code signing.
- Individual citizens (follow-cam targets), depth of field in photo mode, more Rodin hero assets (ask before generating:
  paid credits).
- Tech debt in the roadmap (WebGL2 warm-up, `BatchedMesh`, worker sim).

### Phase 11 follow-ups (deferred)

- Rapier (only if dynamic bodies are needed), individual citizens to follow, depth of field in photo mode.
- Walk-mode collision uses solid boxes; domes and trees are passable.

### Phase 10 follow-ups (deferred)

- Reclaimed land is a flat fill at 1.0 with blocky edges; no terraform-down, no coastline smoothing.
- Highways can't be drawn onto water as land later; bridges over reclaimed tiles aren't converted.
- Sky-bridges have no mobility effect (commuters still use highways).

### Phase 9 follow-ups (deferred)

- Drones fly fixed sorties per pass; no boid flocking or collision with buildings.
- Pod misting has no water cost; soil does not feed the water network or the Ecology tier directly.

### Deferred from Phase 8

- Canopy greenways, hyperloop (under the hills, to the islets), ferries, player-drawn sky-lanes, vehicle follow-cam.
- Commuters ignore the activity field and the job type; jobs inside residential towers are not destinations.

### Phase 7 follow-ups (deferred)

- Activity is visual only; it could feed desirability or the advisor ("quiet district") later.
- Kerb fungi are only on highway tiles facing open ground; parks' own fungi already glow with activity.

### Open decisions (ask the user if unclear)

- **Phase 9 vs the deferred Phase 8 items** (greenways, hyperloop, ferries): independent; ask which the user wants first.

## Known issues / tech debt

Tracked in [`roadmap.md` → Tech debt](roadmap.md#tech-debt--open-issues). Most relevant next:

- Headless boot timings swing a lot between identical runs (warm-up 1.3–3.5 s on WebGL2); compare several runs.
- Remaining CPU is three's per-draw overhead (≈100 visible batches); `BatchedMesh` rejected (D-031), GPU culling if content grows.
- Overgrown highways are hard to see from far away (the Access lens and advisor are the current way to find them).
- Season is derived from `city.tick`: changing `SEASON_SECONDS` shifts the season of existing saves.

## Environment notes

- The user develops on a **MacBook Pro (120 Hz ProMotion)** and cares about heat: keep within the power budget
  (AGENTS.md §7½) and check `bun run perf` after any render change.
- The user may run their own dev server (e.g. on :5174); agents typically run another on :5173. Both hot-reload.
- `rtk` (a token-saving CLI proxy) is installed in the user's shell; use `rtk proxy <cmd>` to see raw output when
  its filtering hides results (e.g. `rtk proxy bunx vitest run`).
- Commits end with the Co-Authored-By line given by the harness; commit only when the user asks (they have asked
  for a commit per phase so far).
