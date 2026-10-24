# Progress & Handoff

A snapshot for picking up BloomGrid in a new session or with another agent. **Update the "Snapshot" and "Next up"
sections whenever you stop working** (see AGENTS.md §6).

## Snapshot (2026-10-24)

|             |                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| Branch      | `feature/island-city-pulse` (not yet merged to `main`)                                                     |
| Last commit | `8e62d43` Phase 6: Seasonal Bloom Engine                                                                   |
| Phases done | 0–6, plus 2.5 (island + loader), 2.6 (scale) and the power/heat interlude: see [`roadmap.md`](roadmap.md)  |
| Next phase  | **Phase 7 — Bioluminescence & Atmosphere** (or Phase 9 Flora-Net first: see "Open decisions")              |
| Tests       | 34 passing (`npm test`); `npm run check` clean                                                             |
| Save format | v4 (migrations from v1–v3 in `src/sim/save.ts`)                                                            |
| Map         | 384×384 tiles, Singapore-like island; founding city ≈1 670 buildings, ≈6 800 highway tiles, ≈22k residents |

### Measured baselines (headless Chrome, WebGPU, M-series, founding city, High quality)

| Metric      | Value                                                                      | How to measure                                        |
| ----------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| Boot        | ≈1.9–2.1 s (scenario ≈0.2 s, modules ≈0.4 s, shader warm-up ≈1.1 s)        | `[boot] ms` log via `npm run snap`                    |
| Frame rate  | 60 fps active, 30 idle (power mode Balanced)                               | `npm run perf` / `npm run perf -- --idle`             |
| Main thread | ≈17% active, ≈15% idle                                                     | `npm run perf`                                        |
| GPU         | ≈2.4–3.5 ms per frame (+≈2 ms during rain)                                 | `npm run perf -- --path "/?gputime"`                  |
| Draw calls  | ≈185–225 near, ≈200–245 overview (budget 300)                              | perf overlay (F3) or `renderer.info.render.drawCalls` |
| Sim         | average pulse ≈2.4 ms; field pass 4.1 ms (phase 0), bloom 1.8 ms (phase 2) | see the bench pattern in D-020                        |

## How to resume

1. Read [`../AGENTS.md`](../AGENTS.md) (rules, commands, definition of done, gotchas), then [`roadmap.md`](roadmap.md),
   [`decisions.md`](decisions.md) (D-001…D-020) and [`architecture.md`](architecture.md).
2. `npm install && npm run check` (it clears the Vitest cache first: see the gotcha in AGENTS.md).
3. `npm run dev`, then `npm run snap -- --path "/?perf" --out shots/now.png` to see the current state.
   Useful drills: `--eval @scripts/scenes/retrofit.js`, `blackout.js`, `drought.js`, `demo-city.js`, or
   `--path "/?drill=monsoon"` (any crisis id).
4. Pick the ⏳ phase in the roadmap, implement it in verified steps, and update roadmap, decisions, architecture,
   AGENTS and this file in the same change.

## What exists (one-line map)

| Area            | Where                                                      | Notes                                                                                                                        |
| --------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sim core        | `src/sim/`                                                 | `City`, `Grid`, `pulse.ts` (1 Hz management pulse), fields, bloom, crises, finance, upkeep, steward, seasons, scenario, save |
| Content         | `src/content/buildings/*.ts`, `src/content/scenarios/*.ts` | 10 buildings, founding-city scenario; auto-discovered                                                                        |
| Rendering       | `src/render/`, `src/assets/kit/pieces.ts`                  | `ChunkedInstancer` (static buffers, ≥1040 capacity, update ranges), TSL material library with lens/vitality/season support   |
| Feature modules | `src/modules/*`                                            | world, construction (buildings, roads, channels, tools), pulse, overlays, advisor, views, dashboard, settings, crises, bloom |
| HUD             | `src/ui/`                                                  | vanilla DOM; right column via `services.get('hud').right`                                                                    |
| Tooling         | `scripts/snap.mjs`, `scripts/perf.mjs`, `scripts/scenes/`  | headless screenshots, power/perf probe, drills                                                                               |

## Next up

### Phase 7 — Bioluminescence & Atmosphere (proposed scope)

- **Pedestrian-density field** (sim, field pattern from D-020): residents + jobs + amenities diffused over highways
  and parks; night glow of flowers, fungi paths, highway guidelines and canopies scales with it (sample like
  `bloomAt` via a density texture). The lens could be "Night life".
- **Fungi paths / luminous canopies**: glowing park and greenway decor whose brightness follows density.
- **Weather tied to seasons and crises**: drizzle in Monsoon season (light rain without a flood), haze in the Haze
  season (fog density + warm tint), using the existing `Weather` uniforms (`modules/crises/Weather.ts`).
- **Indoor-outdoor courtyards and waterfalls** on ground floors: kit pieces added to recipes or the retrofit
  overlay (`retrofitPieces`), e.g. an animated `waterfall` material.
- Acceptance idea: density field test (busy districts brighter than empty ones); a night snapshot at the downtown
  shows glow following activity; power budget unchanged.

### Open decisions (ask the user if unclear)

- **Order of Phases 7 and 9.** The user asked whether "Phase 6" meant Flora-Net (it did in the old plan file). Flora-Net
  (soil/hydration zones, pod misting, hummingbird drones) is Phase 9 and is independent of Phase 7; swapping them is
  fine if the user prefers.
- **Merging** `feature/island-city-pulse` into `main`: not done; wait for the user.

## Known issues / tech debt

Tracked in [`roadmap.md` → Tech debt](roadmap.md#tech-debt--open-issues). Most relevant next:

- WebGL2 shader warm-up 2–10 s in headless Chrome (WebGPU ≈1.1 s).
- Remaining CPU is three's per-draw overhead (~200–230 draws incl. shadows); next lever is `BatchedMesh` or GPU culling.
- Overgrown highways are hard to see from far away (the Access lens and advisor are the current way to find them).
- Season is derived from `city.tick`: changing `SEASON_SECONDS` shifts the season of existing saves.

## Environment notes

- The user develops on a **MacBook Pro (120 Hz ProMotion)** and cares about heat: keep within the power budget
  (AGENTS.md §7½) and check `npm run perf` after any render change.
- The user may run their own dev server (e.g. on :5174); agents typically run another on :5173. Both hot-reload.
- `rtk` (a token-saving CLI proxy) is installed in the user's shell; use `rtk proxy <cmd>` to see raw output when
  its filtering hides results (e.g. `rtk proxy npx vitest run`).
- Commits end with the Co-Authored-By line given by the harness; commit only when the user asks (they have asked
  for a commit per phase so far).
