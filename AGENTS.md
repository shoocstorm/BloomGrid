# AGENTS.md — BloomGrid

Guide for AI coding agents (and humans) working on this repo. Read this first, then the docs it points to.
**Keep this file accurate:** if you change a convention, command or workflow described here, update it in the
same change.

## 1. What this project is

BloomGrid is a single-player **solarpunk island city builder and manager** in three.js (WebGPU, falling back to
WebGL2), written in TypeScript with Vite. The player is a _city steward_: they monitor the whole 3D island,
build and modify it, and keep it running well. Neglect can make the city decline or spiral out of control.

| Doc                                                                                          | Purpose                                                                       |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`BloomGrid_Implementation_Requirements-v3.md`](BloomGrid_Implementation_Requirements-v3.md) | **Canonical requirements** (player role, island world, systems, crises, NFRs) |
| [`BloomGrid_Implementation_Requirements-v2.md`](BloomGrid_Implementation_Requirements-v2.md) | Original aesthetic and content pillars (still valid unless v3 overrides)      |
| [`docs/roadmap.md`](docs/roadmap.md)                                                         | Phases, status and checklists. **What to work on next.**                      |
| [`docs/architecture.md`](docs/architecture.md)                                               | Layers, frame order, data flow, extension points                              |
| [`docs/decisions.md`](docs/decisions.md)                                                     | Architecture decision log (append-only)                                       |
| [`README.md`](README.md)                                                                     | Player-facing quickstart and controls                                         |

## 2. Commands

```bash
npm install
npm run dev            # http://localhost:5173  (?perf ?renderer=webgl ?quality=low|medium|high|ultra ?stress=2000 ?seed=N ?scenario=empty ?nodynres)
npm run check          # typecheck + lint + tests + production build (must pass before you finish)
npm test               # vitest only
npm run snap -- --out shots/x.png [--path "/?perf"] [--eval @scripts/scenes/demo-city.js] [--times 400,1500]
```

`npm run snap` drives headless Chrome against the running dev server, saves screenshots and prints console
warnings and errors plus the app's tagged logs such as `[boot] ms {…}` (it exits 1 on page errors). Use it to _look_ at
your change. `shots/` is git-ignored. Scenes in `scripts/scenes/`: `demo-city.js` (small district) and `blackout.js`
(night power-failure drill).

## 3. Hard rules

1. **Sim purity.** `src/sim`, `src/ecs`, `src/core` and `src/content` must not import `three`, `@/render`,
   `@/ui` or `@/world` (ESLint enforces this). Sim randomness only via `Rng` / `hash2`; no `Math.random`, `Date`
   or `performance` in sim code.
2. **All player-driven state changes go through commands** (`ctx.commands.execute`). Each command implements
   `apply` (returns undo data or `null` to reject) and `revert`. Bulk or scripted actions pass `undoable=false`.
3. **Determinism is tested.** Same seed and command log must give the same `city.hash()`. If you add sim state,
   include it in `hash()` and in `sim/save.ts` (bump `SAVE_VERSION` and add a migration when the format changes).
4. **Features are modules.** New gameplay goes in `src/modules/<feature>/index.ts` as a `GameModule`, registered in
   `MODULES` in `src/main.ts`. Core code never imports a feature. Cross-module APIs use `ctx.services`, and
   notifications use `ctx.bus`. Extend `GameServices` / `GameEvents` through declaration merging in the module.
5. **Content is data.** Buildings live in `src/content/buildings/*.ts` (auto-discovered). Recipes only use
   `KitBuilder`; they never touch three.js.
6. **Both renderers must work.** Check your change with WebGPU _and_ `?renderer=webgl`. Write materials in TSL
   (`three/tsl`), never GLSL or `ShaderMaterial`.
7. **Performance budgets** (check with the `?perf` overlay, F3): 60 fps on an M1-class GPU for a typical city;
   **< 300 draw calls**; sim tick < 4 ms; 50k+ plant instances. Render repeated things through
   `ctx.instancer` (kit pieces + shared materials). Don't allocate in per-frame loops (reuse
   vectors/matrices). Throttle DOM updates (~5 Hz) and use `setText`.
8. **Don't break saves silently.** Saves store string ids, not registry indices. Bump `SAVE_VERSION` and add a step to
   `migrateSave` whenever the format changes.
9. **Renderers sync existing state at init.** Startup content is applied in bulk before modules load (D-007), so
   anything that mirrors sim state must render what already exists in its constructor, not only react to events.
10. **Startup content must stay cheap.** Watch the `[boot] ms` log: scenario under 100 ms and modules under 400 ms on
    WebGPU. Recipes are cached per variant (D-008); never run recipes per instance.

## 4. Where things go

| Task                     | Location / API                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| New building             | `src/content/buildings/<id>.ts` → `defineBuilding({...})`; helpers in `src/content/kit.ts`          |
| New kit piece / material | `registerPiece` in `src/assets/kit/pieces.ts`; `define` in `src/render/materials/library.ts`        |
| Sim system               | `System` with `phase: 'sim'` inside its module (or `src/sim/systems.ts` for core economy and clock) |
| Per-tile data            | `city.grid.addLayer(name, n => new Float32Array(n))`                                                |
| Player tool              | `ctx.tools.register(tool)`; tools get `hover / down / up / key`, plus `grid` and `dragPan` flags    |
| HUD panel                | `src/ui/*` with the `h()` helper and the `.panel` glass style; dark theme via `body.night`          |
| Global shader input      | `U` in `src/render/uniforms.ts`                                                                     |
| Saved module state       | `ctx.services.get('save').addHook({ id, save, load })`                                              |
| Boot progress stage      | `await onProgress(label, fraction)` in `src/game/createGame.ts`                                     |
| Hero GLB model           | building `recipe: { glb: '/assets/x.glb' }`; files in `public/assets/`                              |
| Terrain / island shape   | `src/sim/terrain.ts` (pure height function)                                                         |
| Starting city content    | `src/content/scenarios/<id>.ts` (`defineScenario`); builder in `src/sim/scenario.ts`                |
| Management metric / tier | `src/sim/pulse.ts` + `src/sim/pulseState.ts`; UI in `src/modules/pulse/`                            |

The full layer description is in `docs/architecture.md`.

## 5. Definition of done (every change)

- [ ] `npm run check` passes.
- [ ] New sim logic has Vitest coverage in `tests/` (determinism, undo/redo or save round-trip, as relevant).
- [ ] Visual change verified with `npm run snap` on WebGPU and `?renderer=webgl`; no new console errors.
- [ ] Perf still within budget with the founding city (default boot) **and** `?stress=1500`: fps and
      `renderer.info.render.drawCalls` at near and full-island zoom, plus the `[boot] ms` log.
- [ ] **Docs updated in the same change** (see §6).

## 6. Keeping docs current

| When you…                                                                   | Update                                                                     |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Deliver or progress a roadmap item                                          | `docs/roadmap.md`: tick the checkbox, set the phase status (✅ 🚧 ⏳ ⬜)   |
| Make a lasting technical choice (dependency, convention, rejected approach) | Append `D-NNN` to `docs/decisions.md`                                      |
| Add or change a layer, extension point or frame-order rule                  | `docs/architecture.md`                                                     |
| Change commands, rules, workflow or gotchas                                 | this `AGENTS.md`                                                           |
| Change controls, URL flags or player-visible features                       | `README.md`                                                                |
| Change scope, player role or game rules                                     | `BloomGrid_Implementation_Requirements-v3.md` (note the change at the top) |

Keep docs short and factual. Prefer tables and checklists over prose. Never leave a doc describing behaviour the
code no longer has.

## 7. Conventions

- TypeScript strict, ES modules, `@/` alias for `src/`. Prettier: single quotes, width 110.
- File-level JSDoc explains _why_ a module exists; comment non-obvious intent, not mechanics.
- Naming: `PascalCase` classes, `camelCase` functions, kebab-case content ids (`canopy-tower`).
- Events are `domain:verb` (`building:added`); service keys are short nouns (`construction`, `world`).
- Units: 1 tile = 1 world unit; sea level y = 0; map 256×256 tiles; sim ticks at 10 Hz; `timeOfDay` in [0, 1).

## 8. Gotchas (three r186 / tooling)

- Import from `three/webgpu` and `three/tsl`. Post-processing is **`RenderPipeline`** (`PostProcessing` was renamed);
  `PCFSoftShadowMap` is gone (use `PCFShadowMap`).
- TSL `material.positionNode` runs **after** instancing, so `positionLocal` is already instance-transformed.
  Scale-from-pivot effects (growth) go through CPU matrix tweens in `ChunkedInstancer`; sway is an additive world
  offset in the shader.
- Per-instance shader data comes from the `aParams` vec4 attribute (x greenery, y seed, z glow, w spare) and
  `instanceColor`. Ask before repurposing `w`.
- Never dispose a geometry whose attributes are shared (WebGPU frees the GPU buffers). Batches clone piece geometry.
- WebGL2 compiles pipelines lazily; `ChunkedInstancer.warmup` precompiles every piece at boot. Re-check it when
  adding pieces or materials.
- bitecs 0.4 API: `addComponent(world, eid, Component)`, `query(world, [A, B])`.
- Tweakpane v4 typings need `@tweakpane/core` (already a dev dependency).
- CSS `background-clip: text` doesn't paint through transformed child spans (bitten us in the boot title).
- Headless screenshots can time out while the main thread is busy generating the world; re-run, or capture later.

## 9. Picking up work

1. Read `docs/roadmap.md` and find the first ⏳ or 🚧 phase.
2. Skim `docs/decisions.md` for constraints.
3. Run `npm run check` and `npm run dev` + `npm run snap` to see the current state.
4. Implement in small, verified steps; update the roadmap checkboxes as you go.
5. Finish with the §5 checklist and a summary of what changed, what you verified, and anything you deferred.
