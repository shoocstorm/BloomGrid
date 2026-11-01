---
id: runbook-triage
title: "Triage: a system is failing"
category: runbooks
summary: The general procedure when a City Pulse tier drops to Strained or worse, whatever the system.
tags: [triage, failing, critical, strained, collapse, tier drop, what to do, fix, procedure]
related: [cause-effect-chains, reference-issues, field-log-recoveries]
order: 1
---

## 1. Stabilise time

Pause (**Space**) if several systems are falling at once. Nothing gets worse while you look.

## 2. Find what, where and why

1. **What**: City Pulse (**P**). Note every system at Strained or worse; Critical and Collapse first.
2. **Where**: the matching lens (**L**): Power, Water, Traffic, Pollution, Soil water…
3. **Why**: inspect a red building. Its issues each carry a fix ([Issue codes](kb:reference-issues)).
   Inventory filter `status:critical` lists them all.

## 3. Fix upstream first

If power is among the failing systems, fix it first: it drags jobs, water and harmony down with it. Then water, then
food and jobs, then harmony and the budget. See [Cause-and-effect chains](kb:cause-effect-chains).

## 4. Choose the cheapest real fix

- A short network: join it to a stronger one with one highway before building a new plant.
- A shortage city-wide: build supply with a 10–20% margin, not just to 100%.
- A crisis is active: follow its runbook ([Crisis response](kb:runbook-crisis-response)).
- The Flora-Net advisor (City Pulse → Flora-Net) offers one-click fixes for common problems.

## 5. Confirm and record

Unpause and watch the tier for a minute. When it is back to Stable the city writes it into the
[Recoveries field log](kb:field-log-recoveries) with what you did. Worth a note if the fix surprised you.
