# BloomGrid

A solarpunk **island city builder and manager** in three.js. You steward a Singapore-inspired island where
high-tech architecture and living nature grow together: build it, monitor it, and keep it from going wrong.

```bash
bun install
bun run dev        # http://localhost:5173
bun run test       # sim determinism, undo/redo, save/load (Vitest; not `bun test`)
bun run check      # typecheck + lint + tests + build
bun run snap -- --out shots/x.png   # headless screenshot (dev server must be running)
bun run perf                        # power/perf probe: main-thread %, fps, CPU/GPU ms per frame
bun run release    # bump version, tag vX.Y.Z and push: GitHub Actions deploys to Firebase Hosting
```

Releases: `bun run release [patch|minor|major|X.Y.Z]` (add `--dry-run` to preview). The tag push runs the
`firebase-hosting-release` workflow, which checks, builds and deploys to the live Firebase site.

URL flags: `?renderer=webgl` (force the WebGL2 fallback), `?quality=low|medium|high|ultra`, `?perf` (perf overlay),
`?stress=2000` (add a stress city), `?scenario=empty` (blank island instead of the founding city), `?difficulty=sandbox|relaxed|steward|hard`,
`?drill=monsoon|king-tide|heatwave|algal-bloom|grid-failure|blight` (start a crisis), `?seed=123`, `?nodynres`, `?gputime` (GPU timing), `?pr=1 ?msaa=0 ?shadows=0 ?bloom=0` (quality overrides).

Settings (⚙ in the top bar): power mode (Battery 30 fps / Balanced 60 fps, idles at 30 / Max) and graphics quality.

Seasons bring weather (drizzle in Monsoon, haze in Haze). At night the island glows where people are: busy streets light
their flowers, fungi paths and canopies brighter (see the Night life lens ✨ and the City Pulse "Night life" index).

Residents commute along the highways to the nearest workplace with free jobs; busy lanes jam (amber and coral
commuter lights, the Traffic lens ⇶, the Mobility health tier). Green Pod Docks fly nearby commuters over the
traffic along glowing sky-lanes.

Flora-Net watches the soil: gardens dry out in Haze and heatwaves or when the taps run dry, and farms exhaust their
soil (Soil water ❖ and Nutrients ✿ lenses, "Soil health" in City Pulse). Mist dry zones (M), dig channels, or build a
Drone Hive whose hummingbird drones pollinate, harvest, trim overgrown highways and mist gardens.

From day 3 the sea slowly rises (Flood risk lens 🌊, "Sea level" in City Pulse): defend the coast with Mangrove
Seawalls or reclaim the shallows as new land (T). The Green Weaver (V) grows flowering sky-bridges between towers, or
merges a tower with a banyan (click it twice).

Controls: WASD/arrows pan · right-drag or Q/E orbit · wheel zoom · R rotate building · G highway · C filtration channel ·
B Bloom Retrofit · M Flora-Net mist · V Green Weaver · T reclaim land · X bulldoze ·
4–0 build categories · N explore (walk / hoverboard / drone / ride a pod, Esc back) · J photo mode (P saves PNG) · P City Pulse · L data lenses · F Flora-Net advisor · K dashboard · O overview ·
Alt+1–4 / Shift+1–4 store / recall views · Space pause · 1/2/3 speed · ⌘Z/⇧⌘Z undo/redo · ⌘S/⌘L save/load · F3 perf · `` ` `` inspector.

## Desktop app

`bun run tauri:dev` opens BloomGrid in a native window (Tauri v2; needs a Rust toolchain); `bun run tauri:build`
packages it. Saves live as JSON files in the app data folder; ⚙ → Window toggles fullscreen (F11).

Hero models (Supertree Grove, Lotus Arts Pavilion, commuter pod) were generated with Hyper3D Rodin and optimised with
`bun run optimize-glb`; the game falls back to procedural versions if they are missing.

## Docs

- [`AGENTS.md`](AGENTS.md): how to work on this repo (rules, commands, definition of done, doc upkeep)
- [`BloomGrid_Implementation_Requirements-v3.md`](BloomGrid_Implementation_Requirements-v3.md): canonical requirements
- [`docs/progress.md`](docs/progress.md): handoff snapshot (where things stand, what's next)
- [`docs/roadmap.md`](docs/roadmap.md): phases and status
- [`docs/architecture.md`](docs/architecture.md): layers and extension points
- [`docs/decisions.md`](docs/decisions.md): decision log
