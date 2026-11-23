# Plan v8: The Archipelago (Phases 37–40)

Status: ✅ Phases 37–40 done (2026-11-23, D-225, D-227). Track progress with the checkboxes below, which are mirrored in `docs/roadmap.md`.
`docs/progress.md` points here.

## Idea

The island stops being a closed box. Over the horizon lie four neighbours, each run by its own steward with a
personality and a small director of its own: a Drift flotilla, a Concord bastion, a Lantern archive and a free
island founded the same way as ours. The steward trades with them (standing agreements that ship energy, water
or food across the sea for credits), answers their envoys (aid after their storms, families looking for a home,
a bid against a rival) and gets help back when the home island is in trouble. Relations rise and fall with what
the city does; friends bring perks, a cold neighbour embargoes. Their crises reach the island too: a storm that
hits a neighbour to windward may be on its way.

No real multiplayer and no mainland: the neighbours are islands of the Shelf Sea, felt through trade, envoys,
ships on the horizon and their lights at night (bible Part V: the mainland is never visited).

## Context

- Happenings (D-123) and stories (D-169) already run one-at-a-time cards with two choices, deadlines, rewards and a
  rng scheduler that tests switch off. Dispatches follow the same shape in their own state.
- Energy and water balance per network (`pulse.ts` pass 1); food is city-wide. Trade attaches to the **main
  network** (the one producing most) through a harbour interconnect, so a shipment really changes supply tiers.
- Recurring credits must land in `city.stats` and `netIncome` (D-115): trade gets `stats.trade`.
- Perks and penalties go through `ConsequenceMods` (`tourismMul`, `interest`, `floraDiscount`, `damage`, `crisis`),
  so no new reader is needed for them.
- The director's queue (`queueCrisis`) can carry a neighbour's storm to the island as a chain link with a cause.
- The sea plane reaches ~770 tiles past the island's edge, and full-island fog starts near 960 units from the
  camera, so islands 300–450 tiles offshore read as hazy silhouettes at overview zoom and vanish close up.

## The neighbours (data, `NEIGHBOURS` in `sim/archipelago.ts`)

| Id | Name | Faction | Bearing | Sells | Wants | Ally perk | Temper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `drift` | Brightwater Flotilla | The Drift | south-east | food (fish) | water, energy | visitors spend more (`tourismMul`) | warm, forgiving |
| `concord` | Bastion Halden | The Concord | north-west | energy (tidal) | food | cheaper loans (`interest`) | proud, remembers slights |
| `lantern` | Vellum Holm | Lantern Orders | north-east | knowledge | energy, credits for dives | Flora's requests cheaper (`floraDiscount`) | curious, moody |
| `kestrel` | Kestrel Cay | free island | south-west | water | food, energy | mutual-aid crews (`damage`) | a peer and a rival |

First contact on a growing island: the Drift and Kestrel Cay in the Grove era, the Concord and the Orders in
Canopy (bible: "the mainland takes notice"). The showcase knows all four.

## Cross-cutting rules

- Pure sim, deterministic: neighbours' moods, crises and envoys draw only on `city.rng`, and only while
  `archipelago.auto` is on (off in tests and the demo, like happenings). State saved (v30) and hashed.
- Exports ship only surplus (never cause a shortage at home); imports arrive only while the partner has some to
  spare (their drought cuts your water).
- Every player choice is a command: `signTrade` / `endTrade` undoable; `answerDispatch` with `undoable = false`.
- Plain JSON everywhere (the forward run in the worker carries it unchanged).

## Phase 37: The neighbours (sim) ✅

- [x] `src/sim/archipelagoState.ts` (plain data) + `src/sim/archipelago.ts`: neighbours as data, per-neighbour
      relation (−100..100), prosperity, needs per good, own crisis, own director (next event, pace with temper).
- [x] Trade agreements: good × direction × size (share of the city's use at signing), price from the partner's
      need and relation; per pulse ship surplus / receive spare, book `stats.trade` (in `netIncome`), move
      relations. Main-network interconnect in `pulse.ts` pass 1; food into the food total.
- [x] Dispatches (one at a time): aid after their crisis (credits), families after a disaster (settle in vacant
      homes), a shortage request (an export at a premium), a help offer during the island's crisis, a rival bid
      (beat Kestrel Cay's harmony or ecology by a deadline). Two choices each; ignored ones expire.
- [x] Relation tiers (Hostile / Cool / Cordial / Friendly / Allied): Allied perks into the mods; Hostile embargo
      (agreements end, none signed).
- [x] Their storms reach you: a neighbour to windward struck by a storm queues the matching crisis for the island
      through the director (cause names the neighbour), only with auto crises on.
- [x] Commands `signTrade`, `endTrade`, `answerDispatch`; save v30 + migration; `hash()`; events
      `archipelago:contact`, `archipelago:dispatch`, `archipelago:answered`, `archipelago:tier`, `archipelago:crisis`.
- [x] Tests `tests/archipelago.test.ts`: off unless auto, determinism, exports never cause a shortage, imports fix
      one, trade credits in `netIncome`, undo / redo, save round-trip, embargo, refugees fill vacant homes.

## Phase 38: The Archipelago panel ✅

- [x] Dialog **The Archipelago** (`src/modules/archipelago/`, `.holo`, `--dlg-w`; phones the `--sheet-h` sheet):
      a sea chart (home island at the centre, neighbours on their bearings, relation rings, trade routes, a storm
      glyph over a struck neighbour) and a pane per neighbour (faction line, mood, what they sell and want, prices,
      Sign / End agreements, recent dealings).
- [x] Dispatch card (stacks with the `.jc-m` cards like stories): envoy, text, two choices with cost, time left,
      **Open chart**.
- [x] Top-bar button in `hud.lead`, Esc closes, toasts for contact, tier changes and a neighbour's crisis.
- [x] Check with `scripts/scenes/archipelago.js` (`window.VIEW = 'chart' | 'dispatch'`, `window.ID`), desktop and
      `--mobile`.

## Phase 39: On the horizon (render) ✅

- [x] Neighbour islands far offshore on their bearings (one merged mesh each, `GeoBuilder`, `wonder` material:
      the flotilla's moored hulls, the bastion's wall and towers, the holm's lantern stacks, the cay's green hill),
      lights at night (the `wonder` material's glow), a dark squall over a struck neighbour.
- [x] Trade boats: a cargo boat per agreement (≤ 6 plain meshes, CPU-posed from `U.clock`) sailing from just past the
      island's coast to the partner and back. Islands click → `objectInspector('isle:<id>')` with Open the chart.
- [x] Gallery entries (the four islands, the cargo boat); draw calls within budget at overview zoom.

## Phase 40: Flora, lore and docs ✅

- [x] Flora tools: `neighbour_islands` (read) and `set_trade` (mutate, undoable). Envoy answers stay with the steward on
      the card (they are final; D-227).
- [x] Lore: the neighbours in `docs/lore/bible.md` first (Part V, gazetteer, peoples, characters, timeline), the
      Chronicle page *The other light* (Kestrel Cay met).
- [x] Seedvault guide `docs/knowledge/systems/archipelago.md`, live numbers in `knowledgeRefs.ts`.
- [x] README, AGENTS (Where things go), architecture, decisions D-225 and D-227, roadmap, progress.

## Risks

| Risk | Mitigation |
| --- | --- |
| Trade breaks founding-city balance | Exports only ship surplus; sizes are shares of use; `tests/zoning.test.ts` runs with `auto` off and no agreements |
| Another card fights for the same corner | Dispatches stack with `.jc-m` cards like stories; one at a time, never during a film |
| Neighbour storms make the game harsher | Only through the director's queue (respects its band and gaps), only with auto crises; Sandbox has none |
| Horizon islands cost draw calls | One merged mesh per island in the shared `wonder` material; boats one instanced batch |
