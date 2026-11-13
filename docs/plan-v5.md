# Plan v5 — a city that thinks back (Phases 24–29)

## Context

BloomGrid's feature surface is broad, but the sim *reports* far more than it *responds*. An audit (2026-11-13) found:

- **One lever.** Commands are almost all "place / fix a thing". The only economic trade-off is a single linear tax
  slider (`pulse.ts` `pulseSystem`, `TAX_MIN/MAX` in `pulseState.ts`); upkeep funding is automatic
  (`finance.ts` `updateFinance`). There are no policies or ordinances.
- **No late game.** The fresh island ends at `MILESTONES` (≈17, last = 2 500 residents) plus 6 `PROJECTS`. The
  founding city has no progression and runs itself once water is fixed. `legacy.ts` scores only at game over.
- **Dead signals.** `demandHomes/Work/Food`, `avgCommute`, `nightlife` and the 240-sample `pulse.history` are
  computed but drive nothing.
- **Dice-roll crises.** `crises.ts` `updateCrises` rolls against `eventRate`. The 11 consequence `RULES` change
  weights but never cause an event.
- **Reactive Flora.** Advisor rules are threshold checks (`advisor.ts`). The only forecast is credit runway
  (`insightTools.ts` `runwaySimMinutes`). The agent acts once per turn (`ai/agent.ts`).
- **One global mood.** Residents are occupancy fractions under one `HarmonyBreakdown`. Requests are 4 categories
  (`happenings.ts`), and resident lines come from 5 `WANTS` (`modules/juice/quotes.ts`).

The user asked for all six directions: a smarter sim, proactive Flora, adaptive challenge, meaningful decisions,
long-term goals and living stories. They want a multi-phase plan.

The phases are ordered so each one feeds the next:

1. **Foresight** gives the sim forecasts.
2. **Policies** give the player choices to make about those forecasts.
3. **Living demand** makes the city answer those choices district by district.
4. **The director** turns neglect into causal crises and paces the challenge.
5. **Charters** give a long-term goal.
6. **Stories** tie it all into resident narratives and multi-step plans from Flora.

On approval, this plan is copied to `docs/plan-v5.md`. The roadmap gets the phases as ⬜ (24 as ⏳), and
`docs/progress.md` → Next up points to it. Each phase ships as its own commit, with `bun run check` passing, a
D-NNN entry, knowledge docs (§7¾) and README/AGENTS updates.

## Cross-cutting rules (every phase)

- **Sim purity and determinism.** New state goes in `city.hash()` and `sim/save.ts`. Bump `SAVE_VERSION`
  (v19 → v20, v21, …) with a `migrateSave` step that adds defaults.
- **Commands.** Player changes are undoable commands; claim-style ones use `undoable=false`.
- **Field pulses are full.** `FIELD_PULSES` has all 6 phases taken. New per-pulse work goes in
  `pulseSystem` / `updateConsequences`, which are cheap global passes, not new field passes. Sim tick stays
  < 4 ms.
- **Tests.**
  - `makeSim` keeps `autoCrises = false`; new auto systems (director, petitions, stories) get an `auto` flag that is off in tests and the trailer, the same as happenings.
  - Re-run `tests/zoning.test.ts` (founding-city balance) and `tests/pacing.test.ts` (`PACE=1`) after each phase.
  - Retune if either fails.
- **Flora.**
  - Every new system gets read tools.
  - Every mutating tool is `effect: 'mutate'` and runs an undoable command.
  - Changed grammars mean running `UPDATE_GRAMMARS=1 bun run test` and then `bun run test:rust`.
  - Measure with `bun run ai-probe`.
- **UI.**
  - New panels use `.holo` / `holoHead`, a `.compact` rule in `ui/mobile.css`, Esc via `input.onKey`, `closeX` on notices, and `icon()`.
  - Check with `bun run snap` on desktop and `--mobile`, under WebGPU and `?renderer=webgl`.

---

## Phase 24 — Foresight: trends, forecasts, proactive Flora

**Goal:** the city warns you about trouble before it arrives, and Flora speaks up with a fix.

- **`src/sim/forecast.ts` (new, pure).**
  - Fit a robust trend (Theil–Sen or EWMA slope) per metric on `pulse.history`: energy and water balance, food,
    population, credits, harmony, traffic.
  - Each forecast returns `{ metric, now, slope, etaToThreshold, confidence }` (ETA in sim minutes), with the
    thresholds taken from `tierGate` tier bounds.
  - Season-aware: blend in the next season's known modifiers from `seasons.ts` / `seasonGuide.ts`, so the
    forecast can say "Haze starts in 4 min and solar drops 20%".
  - The trend maths is a pure function of history. History lives in sim state, so nothing new needs saving.
- **Advisor.** A `registerAdvisorRule` for "forecast" emits the soonest ETA below threshold, with a `build` so that
  `proposeBuilds` sizes the fix to the *projected* shortfall at the ETA, not the current one.
  - Extend `planFor` in `proposals.ts` with a `horizon` argument.
- **Proactive Flora.** In `modules/assistant/index.ts`:
  - Add a review tick (every ~2 sim minutes, throttled per topic like the current 30 s notices).
  - It posts a forecast notice with proposal cards, using the same `notice()` path as `pulse:tier`.
  - No LLM is needed for the notice. The LLM explains it when the player asks.
  - A Settings → Game toggle sets how chatty Flora is: Quiet / Normal / Eager.
- **UI.**
  - Top-bar stat hover cards (`statinfo`, `statGuide.ts`) gain a "Forecast" line and a dashed projection on the
    trend chart.
  - City Pulse gets a small "Coming up" strip of the next 3 forecast events, seasons included.
- **Flora tools** (`insightTools.ts`): `forecast_metrics` and `whats_coming`.
- **Knowledge:** `docs/knowledge/systems/forecasts.md`.
- **Tests:** `tests/forecast.test.ts` covers synthetic rising and falling series, flat → no ETA, noisy → low
  confidence, and determinism.

## Phase 25 — Policies: ordinances and budget priorities

**Goal:** real trade-offs beyond placing buildings.

- **`src/sim/policies.ts`.** `POLICIES` as data: `{ id, name, category, cost/upkeep, requires, effects(city, mods), tradeoff text }`.
  - Effects write into `city.consequences.mods`, so every system that reads mods reacts automatically. Some
    effects add new mod keys.
  - Starter set, each with a cost or downside:
    - **Car-free core:** traffic −, harmony +, commerce −.
    - **Night-sky ordinance:** energy +, nightlife −, tourism at night −.
    - **Fishing quota:** overfishing −, food −.
    - **Green-roof mandate:** heat-island −, build cost +.
    - **Four-day week:** harmony +, output −.
    - **Tourist levy:** credits +, tourism −.
    - **Rainwater code:** water +, upkeep +.
    - **Public transit fares:** free or paid.
    - **Open data:** Flora's forecasts more confident, credits per sec −.
    - **Emergency reserve:** a % of income is held, and crisis damage −.
- **Budget priorities.** Replace the fixed `funding` in `finance.ts` with per-sector funding sliders: services,
  maintenance, response, ecology.
  - Underfunding lowers upkeep and degrades that sector: faster ageing, slower `respond`, less bloom.
  - The credit rate stays `netIncome(city)` (D-115).
- **Tax.**
  - Split into residential and commercial rates.
  - Harmony gets a non-linear response with a tolerance band that shifts with harmony, so raising tax when people are happy is cheap and when they're upset is costly.
  - The Phase 26 approval model uses this band.
- **Commands:** `setPolicy` (undoable, with a cooldown so policies can't be flapped) and `setFunding`.
  - State goes in `city.policies` (saved, hashed); this is a `SAVE_VERSION` bump.
- **Progression.** Policies unlock through `projects.ts` (a "Civic Charter" project) or milestones on the fresh
  island, and are all open in the showcase.
- **UI.**
  - New City Pulse tab, Policies (`pulse.addTab`): cards with the trade-off, current measured effect and toggles.
  - Budget sliders go in the same tab.
  - The Causes tab already lists consequence mods, so it shows policy effects for free.
- **Flora:**
  - `list_policies` (read);
  - `set_policy` (mutate);
  - an advisor rule that suggests a policy when it is the cheapest fix for a forecast from Phase 24.
- **Tests:** effects, undo, cooldown, save round-trip and determinism; the founding-city balance still holds with the default policies.

## Phase 26 — Living demand and districts

**Goal:** residents and businesses answer the steward, district by district.

- **Demand drives growth.** In `pulse.ts` pass 2, occupancy targets multiply by a demand factor (`demandHomes`,
  `demandWork`), and level-ups in `levels.ts` need local demand > 0.
  - **Migration.** Net in-flow and out-flow scale with harmony, desirability and policies, shown as a "+N moved
    in / −N left" figure.
- **Commute matters.** Per-home commute length from `computeMobility` feeds desirability. `avgCommute` gets surfaced
  in the inspector and the Traffic lens. Jobs get a coarse type (service, industry, creative, ecology) from building
  category, and commuters prefer a matching workplace, which fills the "commuters ignore job type" gap.
- **District approval.** `District.approval` (saved, hashed) is computed from local service coverage, pollution,
  traffic, commute, tax tolerance and policies; a district aggregate is cheap.
  - City harmony becomes the population-weighted mean of district approval plus city-wide terms.
  - **City map:** district approval shown as colour and a chip.
  - **Inspector:** a district card.
- **Petitions.** New happening kinds in `happenings.ts`:
  - `petition` (a district asks for a policy or a fix by a deadline);
  - `protest` (low approval: a district's output drops until it's addressed);
  - `praise` (a streak reward).
  
  Each needs a `propose` case, an effect in `applyHappenings`, a card hint and a guide line (per AGENTS).
- **Voices.** `quotes.ts` grows from 5 `WANTS` to district-aware lines that react to the last policy, tax change,
  crisis and forecast, attributed to the district ("— a Westbrook baker").
- **Flora:** `district_report`, plus `inventory_search` gains `district:` approval filters.
- **Tests:** migration determinism, the approval model, petition lifecycle and save round-trip; rebalance `zoning.test.ts` (seed 20261024).

## Phase 27 — The Director: causal crises and adaptive challenge

**Goal:** trouble grows out of what the city is doing, and pacing adapts to the player.

- **Neglect escalates.** In `consequences.ts`, a rule gets an optional
  `escalate: { at: intensity, crisis: id, lead }`. Crossing it calls `forecastCrisis` directly:
  - dirty coast → algal bloom;
  - heat island → heatwave;
  - long debt → strike (a new crisis);
  - grid strain → blackout;
  - low district approval → protest.
- **Chains.** A `followUps` field on `CrisisDef` gives each follow-up a probability: monsoon → landslide on
  bare slopes; heatwave → fire risk ×; quake → grid failure.
  - New crises get a runbook (`covers`), which `knowledge.test` enforces.
- **Director** (`src/sim/director.ts`).
  - It keeps a "tension" score from tiers, forecasts, approval and recent crises, plus a "mastery" EWMA of how fast
    the player recovers.
  - The difficulty preset sets a target tension band. The director adjusts `eventRate`, happening frequency,
    request size and calm gaps, pulling the city up when it's too calm and down when it's spiralling.
  - Seeded through `city.rng` and deterministic; `steward.autoDirector` is off in tests.
  - Sandbox keeps it off.
- **Showcase gets pressure.** The founding city gains slow structural drift: rising demand, ageing and seasonal
  peaks driven by the director. Once balanced, it no longer runs itself.
- **UI:**
  - the forecast strip from Phase 24 shows "Risk building: algal bloom (coast pollution 0.7/1.0)" with the lever;
  - the inspector's crisis drills list chains.
- **Tests:** escalation thresholds fire deterministically, chains, director bounds (never two crises at once, gap ≥ `MIN_GAP`), and the pacing test still passes.

## Phase 28 — Charters and eras: long-term goals

**Goal:** a reason to keep playing after unlocks finish, the showcase included.

- **Charters** (`src/sim/charters.ts`, data like `MILESTONES`): multi-step civic goals with tiers (Bronze, Silver,
  Gold). Each one is optional: pick up to 3 active at a time.
  - **Carbon-zero:** clean share 100% for N days.
  - **Ten Thousand Voices:** 10k residents with approval ≥ 70%.
  - **Resilient Isle:** survive 5 crises with no ruins.
  - **Ocean Steward:** fish stock recovered, coast clean.
  - **Transit City:** commute share by pod/Aeroline.
  - **Night Bloom:** a festival streak.
  - **Debt-free Decade.**
- **Rewards:** permanent perks such as a new policy, a cosmetic wonder variant, an extra building level look or a
  title. They feed `stewardLegacy`.
- **Eras.** The city advances through eras (Seedling → Grove → Canopy → Bloom) by charter tiers and population.
  - Each era opens a policy slot, brings new happening kinds and raises director tension.
  - Each era gets a grand moment (`moments` service).
- **Live legacy score.** `legacy.ts` `scoreLegacy` is shown live in the About/Goals area with its rank, so play has a
  visible score.
- **Scenario objectives.** `defineScenario({ objectives })` adds optional win conditions. Add 2 challenge scenarios
  from the founding city:
  - "Water Crisis Rescue": fix water within 20 sim min;
  - "Debt Island": clear a 30k loan with no tier below Strained.
  
  Both go in the New Chapter dialog's showcase list.
- **UI:** the Goals tab in the Build panel (D-153) gains Charters and Era sections, and the claim flow reuses juice.
- **Tests:** charter progress and claim, era transitions, objectives win/lose, save round-trip, pacing.

## Phase 29 — Living stories and Flora plans

**Goal:** named residents with storylines that follow the city's state, and Flora carrying out whole plans.

- **Story arcs** (`src/sim/stories.ts`, data). Short chained quests, 3–5 beats, about a named resident (seeded
  names from `city.rng`, tied to a home building uid):
  - a fisher whose catch falls with overfishing;
  - a start-up founder needing a creative job hub;
  - a family displaced by sea rise.
  
  Each beat triggers from city state (forecasts, approval, policies), has a choice with two outcomes (policy, build
  or credits), and ends with a reward or a lasting consequence mod.
- **Follow a resident.** The story card has "Visit" (`cameraCtl.locate` to their home) and, where possible,
  explore-mode follow. This builds toward the deferred "individual citizens".
- **Flora multi-action plans.** `propose_plan` returns an ordered list of commands (builds, policy, funding). The
  console shows one plan card with a single Approve, which runs as one `batch` (D-091), so one undo reverts it.
  - Flora's proactive review (Phase 24) can attach a plan.
- **Flora memory.** She notes the player's accepted and declined advice in the knowledge journal and avoids
  repeating declined suggestions.
- **Tests:** story determinism, beat triggers, plan batch undo; ai-probe asks such as "make the city carbon-zero".

---

## Critical files (by phase)

| Phase | New | Extend |
| --- | --- | --- |
| 24 | `sim/forecast.ts`, `tests/forecast.test.ts`, `docs/knowledge/systems/forecasts.md` | `sim/advisor.ts`, `sim/proposals.ts` (`planFor` horizon), `sim/insightTools.ts`, `sim/statGuide.ts`, `modules/assistant/index.ts`, `modules/statinfo/`, `modules/pulse/` |
| 25 | `sim/policies.ts`, `modules/policies/` | `sim/consequences.ts` (mods), `sim/finance.ts`, `sim/pulse.ts` (tax), `sim/pulseState.ts`, `sim/commands.ts`, `sim/save.ts`, `sim/projects.ts` |
| 26 | `sim/approval.ts` | `sim/pulse.ts` pass 2, `sim/levels.ts`, `sim/mobility.ts`, `sim/happenings.ts`, `modules/juice/quotes.ts`, `modules/citymap/` |
| 27 | `sim/director.ts` | `sim/consequences.ts` (`escalate`), `sim/crises.ts` (`followUps`), `sim/difficulty.ts`, `sim/steward.ts` |
| 28 | `sim/charters.ts`, `sim/eras.ts`, 2 scenarios | `sim/legacy.ts`, `sim/scenario.ts` (`objectives`), `modules/goals/`, `modules/tutorial/Chapter.ts`, `modules/moments/` |
| 29 | `sim/stories.ts`, `modules/stories/` | `ai/agent.ts`, `modules/assistant/Panel.ts`, `sim/proposals.ts`, `modules/knowledge/` |

## Reuse (don't rebuild)

- `consequences.mods` is the effect bus for policies, approval and escalation.
- `happenings.ts` handles petitions, protests and story beats as cards.
- `MILESTONES` / `PROJECTS` are the data patterns for charters and eras.
- `proposeBuilds`, `batch` and `notice()` cover Flora's cards, plans and proactive posts.
- `tierGate` bounds are the forecast thresholds.
- `moments`, juice coins and bursts provide the rewards.
- `stewardLegacy` provides the score.

## Verification (each phase)

1. `bun run check`. New tests for determinism (same seed and command log → same `city.hash()`), undo/redo and save round-trip.
2. Balance and pacing:
   - `bun run test` covering `zoning.test.ts` and `pacing.test.ts` (`PACE=1` timeline);
   - a 2 000-tick unattended run of the founding city with `autoDirector` on that must reach at least one Strained tier (proves it no longer runs itself).
3. **Visual check** with `bun run dev --port 3001` and `bun run snap --base http://localhost:3001` on the new panels, desktop and `--mobile`, under WebGPU and `?renderer=webgl`, with no console errors.
   - Add scene scripts `scripts/scenes/policies.js`, `forecast.js`, `charters.js` and `story.js`.
4. Sim tick < 4 ms in the perf overlay; `bun run perf` and `--idle` within the §7½ budget (UI-only changes should not move it).
5. **Flora:** `bun run ai-probe -- --ask "what's coming?" --ask "should I ban cars downtown?" --ask "make the city carbon-zero"` reads the right tools and docs.
6. **Docs:** roadmap ticks, D-NNN entries, AGENTS §4 rows (forecast, policies, approval, director, charters, stories), README controls, knowledge guides, and the progress snapshot.
