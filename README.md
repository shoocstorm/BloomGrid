# BloomGrid

A solarpunk **island city builder and manager** in three.js. You steward a Singapore-inspired island where
high-tech architecture and living nature grow together: build it, monitor it, and keep it from going wrong.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # sim determinism, undo/redo, save/load
npm run check      # typecheck + lint + tests + build
npm run snap -- --out shots/x.png   # headless screenshot (dev server must be running)
npm run perf                        # power/perf probe: main-thread %, fps, CPU/GPU ms per frame
```

URL flags: `?renderer=webgl` (force the WebGL2 fallback), `?quality=low|medium|high|ultra`, `?perf` (perf overlay),
`?stress=2000` (add a stress city), `?scenario=empty` (blank island instead of the founding city), `?seed=123`, `?nodynres`, `?gputime` (GPU timing), `?pr=1 ?msaa=0 ?shadows=0 ?bloom=0` (quality overrides).

Settings (⚙ in the top bar): power mode (Battery 30 fps / Balanced 60 fps, idles at 30 / Max) and graphics quality.

Controls: WASD/arrows pan · right-drag or Q/E orbit · wheel zoom · R rotate building · G highway · X bulldoze ·
4–0 build categories · P City Pulse · L data lenses · F Flora-Net advisor · K dashboard · O overview ·
Alt+1–4 / Shift+1–4 store / recall views · Space pause · 1/2/3 speed · ⌘Z/⇧⌘Z undo/redo · ⌘S/⌘L save/load · F3 perf · `` ` `` inspector.

## Docs

- [`AGENTS.md`](AGENTS.md): how to work on this repo (rules, commands, definition of done, doc upkeep)
- [`BloomGrid_Implementation_Requirements-v3.md`](BloomGrid_Implementation_Requirements-v3.md): canonical requirements
- [`docs/roadmap.md`](docs/roadmap.md): phases and status
- [`docs/architecture.md`](docs/architecture.md): layers and extension points
- [`docs/decisions.md`](docs/decisions.md): decision log
