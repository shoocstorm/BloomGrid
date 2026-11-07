---
id: systems-power
title: Power
category: systems
summary: How electricity is made, carried and used, what the energy tier means, and how to keep a safe margin.
tags: [power, energy, electricity, grid, network, solar, wind, brownout, blackout]
related: [runbook-blackout, reference-buildings-energy, cause-effect-chains]
order: 10
---

## How it works

Generators (Energy category: solar, wind, reeds, algae and more) make power; almost every other building uses some.
Power travels along **Living Highways**: one connected set of highways and the buildings on them is a **network**,
and each network must make at least what it uses. A building with no highway within 3 tiles of its lot gets nothing.

## The energy tier

Supply ÷ demand across the city: **115%+** Thriving, **100–115%** Stable, **85–100%** Strained, **60–85%**
Critical, below that Collapse. A network that uses more than it makes browns out (issue `no-power`), and its
buildings stop working.

## Keeping a margin

- Aim for 110–120%: demand rises with every new building, with building levels and in a **heatwave** (cooling
  demand spikes).
- Spread generation over several plants. A **grid failure** trips the single largest plant offline, and grid
  failures are likelier when the margin is under 110%.
- Wind (Breeze Turbines) is cheap and clean but turbines in large numbers affect birds and pollinators, and a
  tornado wrecks spinning turbines: feather them when one is forecast.
- Clean generation raises the clean-energy share, which helps the bloom.

## Find the problem

Power lens (**L**): red buildings and highways are on a network that is short. Join it to a stronger network with a
highway, or add generation on it. Building numbers: [Energy buildings](kb:reference-buildings-energy).
