---
id: systems-forecasts
title: Forecasts and Coming up
category: systems
summary: How the city sees trouble before it arrives. Each supply's trend is read from the last few minutes and projected ten minutes ahead, with the next season folded in, so you can build before the taps run dry.
tags:
  [forecast, forecasts, foresight, coming up, ahead, trend, projection, predict, prediction, will we run out, run short, running out, heads-up, warning, early warning, eta]
related: [systems-power, systems-water, systems-food, systems-budget, systems-harmony]
order: 12
---

## What is a forecast?

The City Pulse keeps a sample of every supply each 10 sim seconds. A forecast fits a line through the last
5 sim minutes. It ignores one-off jumps such as a big build or a crisis spike, then asks when that line crosses
the next tier: **runs short** (Strained) first, then **Critical**. It looks 10 sim minutes ahead. Energy, water,
food, harmony and credits are forecast; residents show only a growth trend.

## How do the seasons change a forecast?

When the next season starts inside the 10 minutes, its effect is added as a step. Haze cuts water output, and
Harvest raises food. If the season is what tips a supply over, the forecast says so: "Water runs short in ~4 min:
Haze begins then".

## Where do I see what is coming?

- **City Pulse → Coming up**: the next three things ahead. These are forecast shortfalls, forecast crises and the
  next season, soonest first. Hover a row for details.
- **Top bar**: hover an indicator for a Forecast line. Click it to see the trend chart with a dashed projection
  and the threshold line.
- **Flora**: ask "what's coming?" and she reads the forecasts, then proposes builds sized for the projected gap.

## Why does Flora warn me before anything is wrong?

Flora reviews the trends every so often. When a supply will run short soon and the trend is clear, she posts a
heads-up with one-click proposals. The proposals are sized for the gap at the end of the forecast, not today's
gap. Settings → Display → **Flora's heads-ups**:

- **Quiet**: no forecast warnings.
- **Normal**: only trouble due within about 5 minutes that she is sure of.
- **Eager**: everything she sees coming.

## How sure is a forecast?

Each forecast has a confidence. It is high when the samples follow a steady line and low when they jump about.
Trends too noisy to call are not projected, and a new city needs a minute of history first. A forecast assumes
you change nothing. Building, switching things off or changing the tax moves the line, and the forecast follows
within a minute.
