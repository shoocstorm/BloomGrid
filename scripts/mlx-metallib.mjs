// Copies the mlx.metallib built by mlx-sys into src-tauri/resources/, where
// tauri.mlx.conf.json bundles it into BloomGrid.app/Contents/Resources for
// mlx.rs to point MLX at. Runs as the overlay's beforeBundleCommand, after
// cargo and before bundling (Tauri copies `bundle.resources` at build.rs time,
// before mlx-sys has finished). Apple Silicon only (AGENTS.md §2).
//
// mlx-sys 0.6.0 writes the metallib to $MLX_RS_METAL_PATH/mlx.metallib, or by
// default ~/.mlx/lib/<mlx-c-key>/mlx.metallib — not into Cargo's OUT_DIR like
// older versions. Release CI sets MLX_RS_METAL_PATH under src-tauri/target so
// rust-cache keeps the metallib with the build script's other outputs; local
// builds use the ~/.mlx default. The old OUT_DIR layout stays as a fallback.
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const found = [];
const add = (lib) => {
  try {
    found.push({ lib, mtime: statSync(lib).mtimeMs });
  } catch {}
};

// mlx-sys 0.6.0: explicit path (CI) then the hash-keyed default.
const dirs = [];
if (process.env.MLX_RS_METAL_PATH) dirs.push(resolve(root, process.env.MLX_RS_METAL_PATH));
try {
  const home = join(homedir(), '.mlx', 'lib');
  for (const d of readdirSync(home)) dirs.push(join(home, d));
} catch {}
for (const d of dirs) add(join(d, 'mlx.metallib'));

// Older mlx-sys left it in the CMake build tree under OUT_DIR.
const target = join(root, 'src-tauri/target');
let entries = [];
try {
  entries = readdirSync(target);
} catch {}
for (const base of [target, ...entries.map((d) => join(target, d))]) {
  const build = join(base, 'release/build');
  let names = [];
  try {
    names = readdirSync(build).filter((d) => d.startsWith('mlx-sys-'));
  } catch {
    continue;
  }
  for (const d of names) {
    add(join(build, d, 'out/mlx.metallib'));
    add(join(build, d, 'out/build/lib/mlx.metallib'));
  }
}

if (!found.length) {
  console.error(
    '[mlx-metallib] no mlx.metallib found (looked at $MLX_RS_METAL_PATH, ~/.mlx/lib/* and target/**/build/mlx-sys-*/out): build for aarch64-apple-darwin with the metal feature first',
  );
  process.exit(1);
}
const newest = found.sort((a, b) => b.mtime - a.mtime)[0].lib;
mkdirSync(join(root, 'src-tauri/resources'), { recursive: true });
copyFileSync(newest, join(root, 'src-tauri/resources/mlx.metallib'));
console.log(
  `[mlx-metallib] ${newest} → src-tauri/resources/mlx.metallib (${(statSync(newest).size / 1e6).toFixed(0)} MB)`,
);
