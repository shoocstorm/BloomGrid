---
id: basics-reading-the-city
title: Reading the city
category: basics
summary: Where to look to know what is going on: City Pulse tiers, the inspector, lenses, the dashboard, inventory and map.
tags: [city pulse, tier, lens, inspector, dashboard, inventory, map, hud, monitor]
related: [reference-lenses, reference-issues, runbook-triage]
order: 4
---

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

> **Tip:** When something turns red, go from the top: City Pulse tells you *what*, a lens tells you *where*, the inspector tells you *why*. Then follow [Triage](kb:runbook-triage).
