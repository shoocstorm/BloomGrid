# Plan v7: Postcards from the future (Phases 34–36) ✅

Status: ✅ Phases 34–36 done (2026-11-22); three futures and a proactive offer deferred. Track progress with the checkboxes below, which are mirrored in
`docs/roadmap.md`. `docs/progress.md` points here.

## Idea

Flora runs a copy of the city forward in the background ("if nothing changes") and shows the steward where it is
heading. She plays a short film **forwards** over the real island: buildings slipping a level, ruins where fires and
storms will strike, the sea creeping up. It ends on a postcard with the numbers (residents, credits, harmony, what
is lost) and her best three levers, each with a button. The player changes something, asks again, and sees the
difference ("this saves 1,200 residents").

It is the time-lapse (plan v6) turned around: the forward run writes a history ledger of its own, and the same film
machinery plays it from today.

## Context

- `forecast.ts` (D-157) extrapolates trends from `pulse.history` (Theil–Sen, 10-min horizon). It knows the slope,
  not the consequences: crises, the director, ageing, migration and sea rise only show up by actually running the
  sim.
- The sim is pure and deterministic, and every sim system lives in `simSystems` (no module adds a `phase: 'sim'`
  system), so a worker given `serializeCity` reproduces the live sim exactly.
- Measured (vitest, node, 2026-11-22): one in-game day (3,600 ticks) takes ≈2.1 s on the 2,472-building founding
  city and ≈0.7 s on a fresh island. A 10-day look-ahead is ≈20 s in a worker, off the main thread.
- The CSP already allows workers (`worker-src 'self' blob:` in `firebase.json` and `tauri.conf.json`).

## Cross-cutting rules

- The live city is never touched: the run is a copy, in a worker (in tests, in-process).
- It is deterministic: same save, same days, same seed, same result (the run uses the save's own rng state). Crises,
  the director, happenings and stories run as the save has them set. "If nothing changes" means no player commands.
- Results are plain JSON (they cross `postMessage`).
- Main-thread budget: no per-frame work while a run is under way. Progress posts once per simulated day, and a new
  request cancels the old (`worker.terminate`).
- The film is render only, like the time-lapse: it veils, raises levels and flares, then lifts everything.

## Phase 34: The forward run (engine) ✅

- [x] `src/sim/foresee.ts` (pure): `foresee(save, { days, onDay })` runs a copy and returns a `Projection`:
      start / end snapshot (residents, credits, harmony, buildings, supply tiers), forward samples, level changes,
      buildings ruined or lost (by serial, with cause and tick), incidents (kind, place, tick), era / wonder marks,
      sea rise, and the day the council would replace the steward (if it does).
- [x] Worker `src/modules/future/forward.worker.ts` + service `future` (`project(days)` → promise with progress,
      `cancel`, last projection cached per city tick), in a new module `src/modules/future/`.
- [x] Tests `tests/foresee.test.ts`: the live city's hash is untouched; determinism; a neglected city (debt island)
      declines; a run reports ruins and incidents; JSON round-trip.
- [x] Verified in the browser (`scripts/scenes/future.js`): 2 days of the showcase in ≈2.9 s in the worker
      (≈1.45 s per day), the page at 60 fps meanwhile, progress per day, the cached projection reused while the city
      is left alone; the worker bundles as its own ≈470 KB chunk with no three.js.

## Phase 35: The postcard film ✅

- [x] "If Nothing Changes" (`modules/future/film.ts`) plays the projection forwards over the real island, render
      only. Levels slip or climb (`replayTier`), ruins fold to rubble (`BuildingRenderer.replayRuin`), losses fold
      away (veil), crises flare where they strike with a caption ("Day 3 · Earthquake · Eastgate") while the camera
      leans toward them, and the day / residents / harmony counters run with their deltas. Everything is redrawn
      from the sim on any exit (`rebuild`).
- [x] Postcard (`modules/future/postcard.ts`): before → after rows (residents, harmony, credits), a verdict (the
      council's day, slipping, or growing but losing buildings), what happened on the way, and up to three of
      Flora's levers (`proposeBuilds`, plus fire cover when the run saw fires) as one-click builds. Also
      *Watch again* and *Look further* (30 days).
- [x] Progress chip with Cancel while the worker runs; the film opens only once the future is known; its own loading
      beat (`INTROS.future`). Crisis flares are shared with the time-lapse (`timelapse/flare.ts`, shorter pillar).
- [x] Checked with `scripts/scenes/future.js` (`MODE = 'film' | 'card' | 'chip'`, `FIRE = 1`).

## Phase 36: Entry points and the what-if loop ✅

- [x] Flora's tool `look_ahead` (registered from the module after her own tools; no input): shows the postcard and
      returns residents, harmony and credits now and then, buildings lost, crises, fires and the council's day.
- [x] *See where this is heading* under City Pulse's Coming up, and *See where the city is heading* in an indicator's
      panel under its forecast line.
- [x] What-if: the postcard remembers the last look. A new look at the same horizon shows *vs last* beside each row,
      plus a line when losses or the council's verdict changed. A built lever offers *See the difference* (a fresh
      run, postcard only).
- [x] Docs: Seedvault guide `docs/knowledge/basics/look-ahead.md`, README, AGENTS, D-222–D-224, scene script
      (`MODE = 'whatif'`).
- [ ] Deferred: three futures (different crisis seeds) for a range. It triples the run time (≈45 s on the showcase);
      the postcard says "one possible future" instead. Also deferred: Flora offering a look ahead on her own when a
      forecast turns Critical.

## Risks

| Risk | Mitigation |
| --- | --- |
| A big city's run is slow | Horizon defaults to 10 days (~20 s on the showcase); progress by day; cancel; cache per tick |
| One random crisis roll tells a misleading story | Phase 36 offers three futures; captions say "a possible future" |
| Worker bundle drags in three.js | The worker imports only `src/sim` and `src/content` (sim purity is lint-enforced) |
