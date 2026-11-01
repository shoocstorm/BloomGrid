---
id: runbook-blackout
title: Blackout and grid failure
category: runbooks
summary: Restoring power when a network browns out or the largest plant trips in a grid failure.
tags: [blackout, brownout, power, grid failure, outage, offline, energy]
related: [systems-power, runbook-triage, reference-buildings-energy]
covers: [grid-failure]
order: 14
---

## Grid failure

The **largest power plant trips offline** for the crisis. Overloaded grids (margin under 110%) fail more often.

1. Energy tier and Power lens: which networks went red?
2. Join short networks to ones with spare power using a highway.
3. If the whole city is short, add quick, cheap generation (wind or solar) on the worst network.
4. The tripped plant (`offline`) comes back when the crisis ends.

## A local brownout

A single network uses more than it makes (`no-power` / `power-short` on its buildings and highways):

1. Power lens: find the red network.
2. Cheapest fix: connect it to a network with spare power.
3. Otherwise add generation **on that network**.

## Prevention

- 110–120% margin city-wide.
- **Several** plants, not one big one: a grid failure takes only the largest.
- Before levelling up many buildings, add power for them.
