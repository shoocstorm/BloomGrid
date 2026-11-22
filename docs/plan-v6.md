# Plan v6: The Island Remembers, a time-lapse of your city (Phases 30–33)

Status: Phases 30–32 ✅ (2026-11-22); Phase 33 ⬜ later. Track progress with the checkboxes below, which are mirrored in
`docs/roadmap.md`. `docs/progress.md` points here.

## Idea

The player gets a ~30–60 s film of their own island's whole life. It starts with the founding hamlet, then roads
spread, districts fill in, towers climb to level 3, and crises and eras get captions. It is shot over the real
island, so the city they built is the set. It plays from Build → Goals → Replays (and, later, at an era change and
on the game-over screen).

## Context: why not re-simulate the command log?

`CommandStack.log` holds every applied record, and determinism is tested. A re-simulation still doesn't work here:

- The log is **not saved**. A loaded city has no past.
- Crises, the director, happenings, stories and module save hooks (juice, interact, charm) all feed the city.
  Replaying hours of play (10 Hz × 2 h = 72k ticks plus field passes) would take minutes, and one missing input
  would make the result diverge.
- The film needs the *look* of the past, not the full sim state.

**Decision (D-219):** record a compact **history ledger** in the sim as the city lives, save it and hash it. The film
is **render only**: the real renderers hide whatever didn't exist yet and bring it back in order with their own
build-in animations, so no new city or loader is needed and the city is never changed.

## Cross-cutting rules

- Sim purity: the ledger lives in `src/sim/history*.ts`, recorded from `City` (adds, removes, roads) and from bus
  events the sim emits (tiers, eras, wonders, projects). It uses no `Date` and no `Math.random`.
- Determinism: the ledger goes in `city.hash()` and `sim/save.ts` (v27 → v28, migration = empty ledger, so older
  cities replay as founded on day 1).
- Content from before recording started counts as **founding** (tick 0): the scenario, and everything in a pre-v28
  save.
- Replays never change the city. The reel pauses the clock, and any veil is lifted on every exit path (end, Skip,
  Esc, `city:reset`).
- Budgets: reveals are batched (a cap per frame), shadows are invalidated at most ~4 Hz while revealing, and no
  allocations happen in the per-frame loop beyond the batch.

## Phase 30: History ledger (sim) ✅

- [x] `src/sim/historyState.ts`: `HistoryState` (born uid → tick; gone buildings; road tile → tick; tier changes;
      marks; samples with decimation), `createHistoryState`, `historyHash`.
- [x] `src/sim/history.ts`: recorders `noteBuilt` / `noteGone` / `noteRoads` / `noteTier` / `noteMark` /
      `sampleHistory`, plus `bornAt(uid)` and pruning of short-lived builds (an undone build never shows).
- [x] `City`: `history` state, reset, records in `addBuilding` / `removeBuilding` / `setRoads` (not for founding
      roads), bus hooks for `building:tier`, `era:advanced`, `wonder:discovered`, `project:done`, plus the hash.
- [x] Pulse: one sample per `SAMPLE_EVERY` pulses (day, residents, credits, harmony, buildings); halves itself
      past `SAMPLE_MAX`.
- [x] Save v28 + migration; serialize/deserialize with compact tuples.
- [x] Tests `tests/history.test.ts`: build → born; undo of a build leaves no trace; demolish + undo and move keep
      the original birth; roads; sample decimation; save round-trip keeps the hash; determinism.

## Phase 31: Replay timeline and veiled renderers ✅

- [x] `src/modules/timelapse/timeline.ts` (pure, tested): ledger + live city → ordered reveal events (buildings,
      road batches) and marks on film time. Founding content rises ring by ring from the heart in a short opening
      act. Film time blends real time with event rank, so idle stretches compress. The day/residents counter is
      interpolated from samples, and the length scales with history (24–60 s).
- [x] `BuildingRenderer.veil(eid)` / `unveil(eid, animate)` / `unveilAll()` (render only, using its own
      `remove` / `add`), plus a render-only `building:veiled` bus event that the wind rotors follow.
- [x] `RoadRenderer.mask` + `reveal(tiles)` (the material's build-in), and `BridgeRenderer` skips spans with a
      hidden tile. Exposed on the `construction` service (`roads`, `bridges`).
- [x] Tests `tests/timelapse.test.ts`: event order, founding act ordering, time compression, sample
      interpolation, length clamp.

## Phase 32: The film "The Island Remembers" ✅

- [x] `src/modules/timelapse/index.ts` (module + service `timelapse.play()`), `film.ts`, `timelapse.css`
      (prefix `tl-`): on location (`FilmStage.openLocation`), a loading beat (`INTROS.timelapse`), and a camera
      orbiting the centroid of what has risen, pulling back to fit it. One day arc over the whole film (dawn → dusk
      lights, no day/night flicker). DOM: a day counter, residents and buildings, a timeline bar with mark pips,
      captions for eras, wonders, unlocks and big crises. Score: beds plus a resolve. End card with the city's name
      and totals.
- [x] Registered as a replayable film (`moments.film`, id `timelapse`), earned once the city has history (a day or
      more, or anything built after founding). It shows in Build → Goals → Replays and the gallery's Cutscenes
      hall.
- [x] Every exit lifts the veil (end, Skip, `city:reset`).
- [x] `scripts/scenes/timelapse.js` (`window.AT`, `window.SKIP`), README, AGENTS, D-219, knowledge doc line,
      roadmap / progress.
- [x] Verified: `bun run check` (490 tests), snap on WebGPU, `?renderer=webgl` and `--mobile`, playback fps (56 headless at the busiest stretch), Skip lifts the veil.

## Promotion (2026-11-22) ✅

- [x] Featured card first in Build → Goals (dial, day range, running time, **New** while history is unwatched, full-width
      Watch), out of the replay chips; an unwatched film counts on the Goals badge (D-220).
- [x] Invitation under the top bar: first story (day 2+), each new era, every `GROWN_DAYS` of growth; steps aside for
      films, ceremonies, dialogs, pause and the ready call-out; idles away; watched / offered saved per city.
- [x] Checked with `scripts/scenes/timelapse.js` `PROMO = 'goals' | 'invite'`.

## Phase 33: Reach and polish ⬜ (later)

- [ ] Demolished buildings come back as ghosts (`FilmStage.addBuilding`) for their lifetime, then fold away.
- [ ] Buildings rise at their level of the time and grow through `tiers` during the film.
- [ ] Incident flares at the crisis's `x, z` (a ring and a caption pinned with `project`).
- [ ] Hide everything else attached to unbuilt things: signs, aurora searchlights, Aeroline (its `construction.ts`
      rise), pods on unbuilt hubs, the ferry pier, police pads.
- [ ] Offer the film at each era change and on the game-over screen; a Flora tool `play_timelapse`.
- [ ] Scrub the timeline in the City map ("the island on day N").
- [ ] Ledger size check on a long fresh island (road births as runs if saves grow past ~200 KB).

## Risks

| Risk | Mitigation |
| --- | --- |
| Old saves have no past | Migration = empty ledger: the whole city rises in the founding act (still a good film) |
| Re-adding thousands of buildings stalls frames | Per-frame cap on reveals; the founding act spreads its ring over ~4 s |
| Things attached to buildings float over empty lots | Wind rotors in Phase 31; the rest in Phase 33 (most are culled at time-lapse altitude) |
| Save growth | Founding content isn't stored, gone/tier lists are FIFO-capped, samples decimate |
