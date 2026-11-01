# BloomGrid: Feature Plan v4: from fishing village to living city

Planned 2026-10-31. Status per phase lives in [`roadmap.md`](roadmap.md) (Phases 16–22); this file holds the design
and checklists. Decisions taken with the user: **Fresh island** becomes the default New Game (the founding city stays
as a *Showcase city* option and `?scenario=founding-city`), and **Flora costs in-game credits per request** (scaled by
the turn's tokens) after an unlock project.

Why: every new game today starts in a finished 2 000-building city with the Aeroline, sky-lanes and Flora already
running, so there is little to grow toward. This plan adds an earned start, living buildings, cause-and-effect,
sound, and new hazards with prevention.

## 0. Pillars (why each feature exists)

| Pillar | Player feeling | Features |
|---|---|---|
| Earned growth | "I built this from a fishing village" | Fresh-island start, unlocks, earned wonders |
| Living buildings | "My districts mature, age and need me" | Levels, ageing, visible damage |
| Cause → effect | "That flood happened *because* I paved the mangroves" | Consequence chains, hazard risk, prevention |
| Presence | "The island sounds alive" | Music and sound |

Rules that carry over: sim purity and determinism (`city.rng`, everything hashed and saved), commands for every
player change, features as modules, both renderers, draw-call and power budgets. Every phase ends with the AGENTS
§5 checklist and a D-NNN entry.

## Phase 16: Fresh island start ("found your city")

| Item | Design | Where |
|---|---|---|
| City name | Wizard step 1: name (default `BloomGrid 001`, numbered by saves seen), seed, difficulty. Saved and hashed; shown in brand plate, title, toasts, Flora prompts | `City.name`, `sim/save.ts` (v11), `ui/` wizard |
| Starter scenario `fresh-island` | A coastal hamlet: a short highway, 6–8 homes, a Fishing Pier, 1 small solar, 1 water intake, 1 Ember Watch. Credits ~1 500 | `content/scenarios/fresh-island.ts` |
| Early income: fishing | **Fishing Boat Dock** (free, `nearWater`, limit 3 at the start, more as the population grows): earns credits per boat trip, jobs; catch falls if coastal pollution or algal bloom rises (a natural first consequence). Boats sail out and back (render) | `content/buildings/fishing-dock.ts`, `fishing` on def, `sim/fishing.ts`, `modules/fishing/` (instanced boats on `U.clock`) |
| Sea wonders earned | Start with 1–2 (lighthouse, whales). Each other wonder has a trigger: day count, eco index, bloom, population, harmony streak. On trigger: a "discovered" toast with fly-to, an inventory entry and a small harmony/tourism bonus | `sim/wonders.ts` (state: discovered set, saved); `modules/scenery/SeaWonders.ts` shows only discovered ones |
| Aeroline locked | A *Build the Aeroline* project (population ≥ 6k, credits, a power margin). Construction rolls out over N days (track pieces appear segment by segment); stations become buildable after | `sim/projects.ts` (generic multi-day projects), `modules/aeroline` reads project state instead of drawing unconditionally |
| Sky-lanes locked | Pod Dock / Skylane Nexus need the *Sky-lane charter* project (population ≥ 3k, a Drone Fabricator). Lanes already follow hub buildings, so gating the defs is enough | `content` defs: `requires: 'skylanes'`; Build tab shows the lock and its criteria |
| Flora locked | Unlock project needs a power plant, a **Data Spire** building, credits ≥ X. After that every request costs credits = base + tokens × rate (shown before sending, logged in the budget). Below the threshold Flora answers "no funds" in character | `sim/flora.ts` (unlock and billing state), `modules/assistant/` gate and charge through a `floraBill` command |
| Unlock system | Generic `requires` on a building def, plus `projects` with criteria, cost and duration. One Unlocks panel lists what's next and why | `sim/projects.ts`, `modules/pulse` *Goals* tab |
| How-to-play guide | First-run wizard: name, then difficulty, then a 6-step interactive tutorial (pan/zoom, build a dock, connect a highway, read the Pulse, earn credits, unlock Flora). Each step completes on the real action (bus events); skippable; re-openable from Settings | `modules/tutorial/` (steps as data: text, highlight selector, completion event) |
| Wizard | Replaces boot-straight-to-city: New Game / Continue / Showcase city | `ui/Boot.ts`, `game/newCity.ts` (`foundCity` with the scenario choice) |

Acceptance:
- [ ] A fresh island is playable for 30 sim-minutes without bankruptcy using docks alone.
- [ ] The tutorial completes end to end.
- [ ] Locked items show their criteria.
- [ ] A save round-trips name, unlocks and wonders.
- [ ] The founding city still boots via the wizard and `?scenario=`.
- [ ] Balance test on seed 20261024 for `fresh-island`.

## Phase 17: Music and sound

| Item | Design |
|---|---|
| Engine | Web Audio graph in a `modules/audio/` service: master, music, ambience and SFX buses with volume sliders in Settings; muted until the first input (autoplay rules); Tauri uses the same code |
| Music | 3–4 looping stems per mood (dawn, day, dusk, night, crisis). The mix follows `U.night`, harmony tier and active crises; crossfades over ~4 s. Royalty-free or generated assets in `public/audio/` (ask before paid generation) |
| Ambience | Sea surf (by distance to the coast), city hum (by nightlife activity), wind (wind turbines), rain/storm from Weather, birds in Bloom season. Positioned by camera focus, not per object (cheap) |
| SFX | UI clicks, build/place, demolish whoosh, retrofit bloom, lightning crack, quake rumble, fire crackle (near fires), fireworks launch and bursts (delayed by distance ≈ speed of sound), train pass, pod hum |
| Budget | ≤ 24 voices; the audio thread only; no per-frame JS beyond 5 Hz parameter updates; idle cost measured with `bun run perf -- --idle` |

Shipped as fully synthesised Web Audio instead of stems (no files, no licensing; D-077). Train pass, pod hum and
fire crackle are deferred.

Acceptance:
- [x] Settings sliders persist.
- [x] No sound before the first gesture.
- [x] Main-thread idle within the §7½ budget (≈ 15% with audio running).
- [x] The mute hotkey (**,**) works.

## Phase 18: Buildings that level up and age

| Item | Design | Where |
|---|---|---|
| Levels 1–3 | Separate from the retrofit flag. A building levels up when it has been well served, occupied and green for N days (or the player pays to upgrade). Each level adds +capacity / +jobs / +eco and more upkeep | `Building.tier` (new store, reset in `addBuilding`, saved, hashed), `sim/levels.ts` |
| Level looks | The recipe gets `b.level` (KitBuilder field): extra floors, roof gardens, lights. Templates are cached per variant × level (D-008 stays true); a level-up plays the existing grow tween and a toast | `BuildingRenderer` template key `def#variant#level` |
| Ageing | `age` in sim days per building (saved). Upkeep × (1 + 0.15 × age/10 days), capped; condition decays faster with age; renovating (a command, % of price) resets age and condition | `sim/upkeep.ts`, `Service.age` |
| Age looks | Shader only (no new pieces): weathering streaks, darker tint and moss creep driven by an `aParams` channel. Glass is already at the 8 vertex-buffer limit, so age rides on the existing condition param (render age = f(condition, age)) | `render/materials/library.ts` |
| UI | Inspector: level stars, age, *Upgrade* / *Renovate* buttons with costs; dashboard Inventory filters (old, upgradable); Flora tools `upgrade_building`, `renovate` | `ui/Hud.ts`, `sim/actionTools.ts` |

Acceptance:
- [ ] Determinism, undo and save tests for level-up, ageing and renovation.
- [ ] Upkeep growth visible in the budget.
- [ ] The perf boot budget is unchanged (templates per level are built lazily).

## Phase 19: Visible damage and interaction

| Item | Design |
|---|---|
| Burnt and struck | A `scorch` amount per building (0..1, saved). Lightning leaves a scorch mark and a broken roof piece; fire raises scorch with intensity. Shader: charred tint and soot gradient from the top; a few hidden "breach" pieces show broken windows. Repair fades it |
| Broken facilities | `broken` state when condition < 0.2 or power/water fails at a producer: turbines stop spinning, solar panels dim, water works stop its spray, a sparking alert; the inspector says why and offers repair |
| Ruins | Today's ruins get rubble pieces and smoke (hazards module already has smoke); a rebuild animates |
| Interactive objects | An `interact` hook on a def: actions in the inspector and a hotkey. Examples: wind turbine on/off (feathered: no power, no wear, quieter); fireworks factory production on/off; floodgates open/closed (Tide Gates, seawall); street lights dim at night (less power, less nightlife); stadium event (costs, then a harmony spike and a traffic jam). All are commands, saved and hashed |
| Physics-ish feedback | Turbine RPM follows wind strength (seasonal, storms); feathered during storms to avoid damage (a consequence hook); smoke columns bend with the wind |

Acceptance:
- [ ] Every new state renders on WebGPU and WebGL2.
- [ ] Every interaction is an undoable command with a test.
- [ ] `bun run flicker` shows no regression from damage shaders.

## Phase 20: Logic and consequences (core pillar)

Make every system feed others so player choices visibly ripple. Implement as **consequence rules**: pure sim
functions registered like advisor rules (`registerConsequence({ id, when, effect, explain })`). Each one logs to a
*Cause & effect* feed (dashboard tab and Flora tool `why`) with its trigger and outcome, so the player can trace
"why did this happen".

| Cause (player choice or state) | Effect (delayed, visible) |
|---|---|
| Paving or clearing mangroves and coast | Bigger flood and tsunami damage; fewer fish |
| Factory pollution near the coast | Algal bloom chance up; fishing income down; beach venues lose visitors |
| Over-fishing (too many docks for coast length) | Fish stock depletes; catch crashes for days; recovers if docks idle |
| Dense towers without parks | Heat island: heatwave damage and fire risk up; harmony down |
| Many wind turbines | Bird strikes lower bloom (pollinators); offset by Pollinator Sanctuary |
| Neglected upkeep (austerity) | Ageing ×2; broken facilities; crime-like "vandalism" incidents (condition hits) |
| Fireworks during Haze | Fire risk (exists); haze crisis smog lingers longer |
| No Ember Watch coverage | Fires spread further; insurance premium (credits/s) rises |
| Good harmony streak | Tourism income; a new sea wonder discovered sooner; Flora discount |
| Debt for long | Credit rating falls; loan interest up; citizens leave |
| Transit coverage high | Traffic jams down; pollution down; land value up near stations |

Mechanics to add:
- **Delays and stocks** (fish stock, groundwater, soil, credit rating, tourism reputation) so effects build and
  decay rather than flipping instantly.
- **Insurance and credit rating** as numbers on the budget panel.
- **Chain explainers** in the inspector ("This lot floods more because the Bayfront mangroves were removed on day
  3").

Acceptance:
- [ ] ≥ 10 consequence rules, each with a deterministic unit test (cause on, effect within N days; cause off,
  recovery).
- [ ] The Cause & effect feed shows each one.
- [ ] Flora's `why` explains a chosen incident.

## Phase 21: New hazards, reporting and prevention

| Hazard | Trigger and visual | Damage | Prevention |
|---|---|---|---|
| Tornado | Monsoon or storm season; funnel mesh (merged geometry, shader swirl on `U.clock`) moving along a seeded path; debris particles | Condition hits along a 4–6-tile track; turbines and solar break; can start fires | Storm shelters (harmony loss down), Wind-break forests (tree belts reduce intensity), Weather Radar (longer warning, so the steward can feather turbines and evacuate) |
| Tsunami | After an offshore earthquake (≥ magnitude X); a wave front band racing in from the epicentre direction, a sea-level surge on the coast | Floods low coastal tiles by height; boats lost; ruins on the waterfront | Mangrove Seawalls (exists: extend to wave height), Tide Gates closed (interaction), sea-wall height upgrades, evacuation siren (command: residents lost down for a fee) |
| Existing ones extended | Earthquake: building codes (retrofit level reduces damage). Lightning: lightning rods (`defence.lightning`). Fire: Ember Watch, sprinkler upgrade (level 2+) | | |

- **Risk model.** Each hazard has `chance = base × season × difficulty × Π(prevention factors) × Π(consequence
  factors)`, computed in `sim/risk.ts`. A **Risk** lens and a dashboard *Risk* panel show the factors ("Tsunami risk
  at Bayfront: High: no seawall, mangroves removed").
- **Damage reporting.** Extend the incident log (D-050): per-incident breakdown (buildings hit or ruined, residents
  displaced, credits lost, repair cost, prevention that helped and how much), a per-district map, and trends over
  time (incidents per season, cost per incident, prevented loss). CSV/JSON export from the dashboard; Flora tools
  `incident_report`, `risk_status`.
- **Drills.** Every new hazard works with `?drill=` and the inspector Crisis drills; snap scenes `tornado.js` and
  `tsunami.js`.

Acceptance:
- [ ] Determinism and save tests for both hazards.
- [ ] Prevention measurably cuts loss (a test runs the same seed with and without it).
- [ ] Draw-call budget during a tornado or tsunami stays under 300.

## Phase 22: Polish and balance pass

- Balance tests for both scenarios (fresh island and showcase).
- An early-to-mid game pacing curve: the first unlock in ~10 minutes, the Aeroline in ~2 hours.
- Flora's prompts learn the new systems (tools for unlocks, levels, interactions, risk, consequences; grammar
  fixture regenerated).
- A trailer update.

Shipped (D-078): `tests/pacing.test.ts` plays a scripted steward and times the unlocks (sim-minutes at 1×: Flora
≈ 35, sky-lanes ≈ 100, the Aeroline started ≈ 140, never broke; three seeds); unlock costs and fishing retuned to
get there; Flora's `goals_status` and `start_project` and a progression line in her brief. Showcase balance is
unchanged (`tests/zoning.test.ts`). The trailer update is deferred.

## Order and dependencies

```
16 Fresh start ──► 18 Levels/age ──► 20 Consequences ──► 21 Hazards+prevention ──► 22 Polish
        └──► 17 Sound (independent, can run in parallel)
                     19 Damage/interaction (after 18; feeds 20 and 21)
```

Each phase: new D-NNN, roadmap tick, `bun run check`, snap on both renderers, `bun run perf`, `bun run flicker` for
visual changes, and save-version bumps with migrations (v11+) wherever state is added.

## Risks and open questions

- **Balance of the fresh start:** fishing income must outpace upkeep early without trivialising the mid game.
  Tune it with a scripted 30-minute playthrough test.
- **Audio assets:** source or licence, size (lazy-load them), and whether to generate them (ask first: paid).
- **Glass vertex-buffer limit:** age and scorch must reuse existing per-instance params, not add attributes.
- **Save migration:** old saves load as the showcase city with everything unlocked.
- **Scope:** Phase 20 is the biggest; ship the rule framework and 4–5 rules first, then the rest.
