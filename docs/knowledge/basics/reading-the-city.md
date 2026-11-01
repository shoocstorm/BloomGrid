---
id: basics-reading-the-city
title: Reading the city
category: basics
summary: Where to look to know what is going on: City Pulse tiers, the inspector, lenses, the dashboard, inventory and map.
tags: [top bar, indicator, credits, residents, harmony, best move, city pulse, tier, lens, inspector, dashboard, inventory, map, hud, monitor]
related: [reference-lenses, reference-issues, runbook-triage]
order: 4
---

## The top bar's numbers

Hover credits, residents, energy, water, ecology or harmony for a quick read: its tier, a gauge, what is happening
and the **best move**. Click one for the full picture: what adds to it and what takes away, the trend over the last
15 minutes, and buttons that act at once (build the right type, show the lens, change the tax, borrow, or build a
suggested plan already sited and sized). Every one of them undoes with ⌘Z.

## City Pulse (P)

Eight systems, each with a tier: **Thriving**, **Stable**, **Strained**, **Critical**, **Collapse**. Stable means
supply roughly meets demand; Strained means you are short and residents notice; Critical and Collapse mean things
are failing. Energy and water tiers come from supply ÷ demand (below 100% is Strained), food from residents fed,
jobs from employment, mobility from traffic flow, and the budget from the treasury and net income.

## The inspector

Click any building: its status, issues (with a hint for each), level, age, condition, risk, zone and id. Issues are
listed in [Issue codes](kb:reference-issues).

## Data lenses (L)

A lens recolours the island by one measure (power, water, pollution, traffic, soil, flood, risk…). Use them to find
*where* a problem is. Each lens is explained in [Data lenses](kb:reference-lenses).

## Dashboard (K) and inventory (I)

The dashboard shows trends over the last 40 sim-minutes, the budget per second and land use. Its **Incidents** tab
logs every crisis and fire; **Causes** shows the [consequence rules](kb:reference-consequences) in force. The
inventory lists every object with filters such as `status:critical`, `issue:power`, `district:westbrook`, `is:old`.

## City map (M)

Districts and zones at a glance, plus active fires.

> **Tip:** When something turns red, go from the top: click the number in the top bar, or City Pulse tells you *what*, a lens tells you *where*, the inspector tells you *why*. Then follow [Triage](kb:runbook-triage).
