# BloomGrid — Game Implementation Requirements (v3)

> **Status:** canonical. Supersedes v2 for scope, player role and world. v2
> (`BloomGrid_Implementation_Requirements-v2.md`) remains the reference for the **aesthetic and content
> pillars** (biophilic architecture, Seasonal Bloom Engine, mobility layer, Flora-Net AI, Green Weaver) —
> everything in v2 still applies unless contradicted here.
>
> Delivery phases and status live in [`docs/roadmap.md`](docs/roadmap.md).

## 0. What changed from v2

| Topic        | v2                             | v3                                                                                                                        |
| ------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| World        | Unspecified continent-like map | **An island city-state inspired by Singapore**: one main island plus satellite islets, surrounded by sea                  |
| Player role  | Builder / terraformer          | **City steward: builder _and_ manager.** Monitor the whole 3D city, diagnose problems, act, and keep the city functioning |
| Failure      | None                           | The city **can decline or spiral out of control**: cascading failures, crises, recovery, and an optional fail state       |
| Presentation | —                              | Futuristic, cinematic loading experience; city-health readability everywhere                                              |

---

## 1. Player Fantasy & Role — "The City Steward"

The player is the steward of a living solarpunk island city. They are not only placing buildings; they are
responsible for a complex system that must **keep running**.

Core loop: **Observe → Diagnose → Act → Verify.**

1. **Observe** — survey the whole island in 3D, from a satellite overview down to street level. Data overlays,
   a city dashboard and the AI advisor show what is happening and where.
2. **Diagnose** — drill into a district, building or network to find the _cause_ (for example: brownout in the
   east ← grid capacity exceeded ← new canopy towers with no energy pairing).
3. **Act** — build, upgrade, demolish, re-route networks, set budgets and policies, dispatch Flora-Net responses,
   or terraform with the Green Weaver.
4. **Verify** — watch indicators recover (or not) over time; trends and alerts confirm the effect.

Design rules:

- Every important sim value must be **visible** (an overlay, a dashboard number or a visual state of the world)
  and **actionable** (at least one player lever affects it).
- Problems should be **legible before they are lethal**: tiered warnings with time to respond.
- The world itself shows health: thriving districts bloom and glow; failing ones wilt, dim and go grey.

## 2. The World — A Singapore-Inspired Island

- **Main island**: a wide, roughly diamond-shaped island (wider east–west than north–south) with an irregular,
  natural coastline, beaches and mangrove edges.
- **Central nature reserve**: gentle forested hills (the highest point is modest, Bukit Timah-like) and inland
  **reservoirs** at the heart of the island. Keeping them protected matters for water security.
- **Southern bay & river mouth**: a sheltered bay (Marina Bay-like) where a short river meets the sea. This is the
  natural site for a dense, iconic downtown.
- **Satellite islets**: a southern resort islet (Sentosa-like), a north-eastern rustic islet (Pulau Ubin-like) and
  a western industrial islet (Jurong Island-like). Later reachable by bridges, ferries and the hyperloop.
- **Sea**: open ocean all around, with shallow shelves near the coast and deep water beyond.
- **Scarcity is the theme**: land is limited, so the city grows **up** (towers, sky-gardens) and, later,
  **outward** through **land reclamation** (Green Weaver and terraforming phases).
- **Island-specific pressures** (later phases): water self-sufficiency (reservoirs, desalination, water
  recycling), coastal defence against sea-level rise and king tides, monsoon flooding, heat islands.

## 3. City Systems (simulation scope)

All systems are deterministic and live in the renderer-agnostic sim (`src/sim`). Each has a visible overlay and
at least one lever.

| System                | Key values                                                | Player levers                                      |
| --------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Demand & population   | residents, jobs, food; housing / work / food demand       | build mix, zoning (later), policies                |
| Energy grid           | production, demand, capacity per district, storage        | solar spires, bioreactors, storage, grid links     |
| Water                 | reservoir level, supply, treatment, filtration lines      | reservoirs, filtration lines, desalination (later) |
| Ecology               | eco index, pollution, greenery, biodiversity              | parks, symbiotic pairing, Flora-Net                |
| Happiness ("Harmony") | composite score from services, eco, energy, density, jobs | everything above + policies                        |
| Economy               | credits, income, upkeep, loans                            | taxes/budget sliders, upkeep levels, loans         |
| Land value            | per-tile desirability                                     | nature proximity, services, pollution              |
| Mobility (later)      | congestion, coverage                                      | highways, sky-lanes, transit                       |

## 4. Decline, Crises & Control

The city must be able to **get worse** when neglected, and the player must be able to pull it back.

- **Health tiers** for every system: _Thriving → Stable → Strained → Critical → Collapse_. Tier changes raise
  alerts and are shown on the dashboard and in the world.
- **Cascades** (examples):
  - Energy deficit → brownouts → workplaces stall → jobs lost → residents leave → revenue falls.
  - Pollution → plants wilt → eco index collapses → harmony falls → land value drops.
  - Water shortage → greenery dies back → heat rises → harmony falls.
  - Overspending → debt → forced upkeep cuts → services degrade.
  - Neglected nature (the solarpunk twist): unmanaged overgrowth blocks highways and damages infrastructure.
- **Crises & events**: monsoon floods, king tides, heatwaves, algal blooms, grid failures, plant blight. Each has
  a forecast or early warning, a visible effect and response tools.
- **Recovery**: every cascade has a counter-play; recovery should feel visibly rewarding (districts re-bloom).
- **Fail state** (configurable): bankruptcy or harmony collapse leads to "Steward replaced". Sandbox mode
  disables failure.

## 5. Monitoring & Management UX

- **Overview camera** that frames the whole island; quick jumps to districts; follow-cam for vehicles and drones
  (later).
- **Data overlays / heatmaps**: energy, water, pollution, eco, harmony, land value, coverage, traffic.
- **City dashboard**: KPIs with sparkline trends, budget breakdown, demand meters.
- **AI advisor (Flora-Net)**: prioritised alerts with a "show me" camera jump and suggested fixes; an event log.
- **Inspector**: building and district panels showing inputs, outputs, problems and upgrade options.
- **Time controls**: pause and speeds, so the player can stop the clock to manage a crisis.
- **World readability**: health states are reflected in materials (moss vitality, wilting, lights dimming,
  bioluminescence strength).

## 6. Presentation

- **Loading experience** must feel futuristic and cinematic: animated emblem, growing bio-circuit vines, pollen
  particles, a system-boot log with real progress stages, and a dramatic reveal into the world. It must respect
  `prefers-reduced-motion`.
- The HUD keeps the solarpunk glass style and switches to a dark bioluminescent theme at night.

## 7. Non-Functional Requirements

- **Performance**: 60 fps on an M1-class GPU in a typical city; < 300 draw calls; sim tick < 4 ms; 50k+ plant
  instances; dynamic resolution and quality tiers.
- **Extensibility**: new content as data files; new systems as `GameModule`s; the sim never imports the renderer.
- **Determinism**: same seed + same commands = same city (tested).
- **Saves**: versioned format with migrations once v1 ships to players.
- **Platforms**: web first (WebGPU with WebGL2 fallback); Tauri desktop later through `src/platform`.
- **Accessibility**: reduced motion, colour-blind-safe overlay palettes, rebindable keys (later).
- **Single player** for now.
