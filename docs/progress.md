# Progress & Handoff

A snapshot for picking up BloomGrid in a new session or with another agent. **Update the "Snapshot" and "Next up"
sections whenever you stop working** (see AGENTS.md §6).

## Snapshot (2026-10-25)

|             |                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch      | `main`, remote `origin` (github.com/shoocstorm/BloomGrid); releases are `vX.Y.Z` tags deployed to Firebase Hosting (AGENTS.md §10)                              |
| Last change | North Terrace (10 more heroes, D-033/D-034), uncommitted on `main` |
| Phases done | **All roadmap phases 0–12** (8 = core; deferred items listed below), plus 2.5, 2.6 and the power/heat interlude                                                 |
| Next phase  | No phase left: pick from the deferred list below, or merge to `main` (ask the user)                                                                             |
| Tests       | 63 passing (`bun run test`); `bun run check` clean                                                                                                              |
| Save format | v6 (terrain edits, sky-bridges, sea rise; migrations from v1–v5 in `src/sim/save.ts`)                                                                           |
| Map         | 512×512 tiles (D-028), Singapore-like island (≈88k land tiles); founding city ≈1 720 buildings at its original tile size, ≈24k residents, water Strained (≈95%) |

### Measured baselines (headless Chrome, WebGPU, M-series, founding city, High quality)

| Metric      | Value                                                                                                                                | How to measure                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Boot        | ≈2.1 s to interactive WebGPU, ≈2.5–3.0 s WebGL2, no post-boot stall (scenario ≈0.25 s, modules ≈0.25–0.29 s, warm-up ≈1.3 s, D-030)  |
| Frame rate  | 60 fps active, 30 idle (power mode Balanced)                                                                                         | `bun run perf` / `bun run perf -- --idle`             |
| Main thread | ≈16% active, ≈14.5% idle                                                                                                             | `bun run perf`                                        |
| GPU         | ≈1.0–3 ms per frame headless (noisy: compare several runs; +≈2 ms in storm rain)                                                     | `bun run perf -- --path "/?gputime"`                  |
| Draw calls  | ≈206–249 near (249 over the South Avenue toward downtown), ≈215 overview; `?stress=1500` 298 worst / 264 overview (budget 300: add heroes only inside hero chunks, D-034) | perf overlay (F3) or `renderer.info.render.drawCalls` |
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
| Content         | `src/content/buildings/*.ts`, `src/content/scenarios/*.ts` | 57 buildings (2 with Rodin GLBs; the central Wellspring Spire and its 40-building hero district are procedural), founding-city scenario; auto-discovered                                                                                                                                   |
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
