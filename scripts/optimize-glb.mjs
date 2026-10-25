#!/usr/bin/env node
/**
 * Hero-asset pipeline (Phase 12): turns a raw GLB (Hyper3D Rodin or an artist export) into a
 * game-ready one under public/assets/.
 *
 *   node scripts/optimize-glb.mjs raw.glb public/assets/x.glb --footprint 3 --height 4 [--ratio 0.5] [--yaw 90] [--tex 1024] [--stretch 1]
 *
 * - dedup / prune / weld, then meshopt simplification to `--ratio` of the triangles
 * - fits the model: base centre at the origin, longest horizontal side = `--footprint` tiles,
 *   height capped at `--height` (uniform scale), optional yaw in degrees; `--stretch` then scales
 *   height alone (landmarks that must tower over the skyline, e.g. slender supertrees)
 * - textures are downscaled to `--tex` px (default 1024) and re-encoded as JPEG (quality 82) with
 *   macOS `sips` when available (normal maps stay PNG, at half size); for KTX2 (GPU-compressed) textures
 *   install `toktx` (KTX-Software) and run the printed `@gltf-transform/cli etc1s` command afterwards
 * - meshopt compression (EXT_meshopt_compression), which the game's GLTFLoader decodes
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: optimize-glb.mjs <in.glb> <out.glb> --footprint N --height N [--ratio 0.5] [--yaw deg] [--tex 1024]');
  process.exit(1);
}
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = Number(rest[i + 1]);
const footprint = opt.footprint ?? 2;
const height = opt.height ?? 3;
const ratio = opt.ratio ?? 0.5;
const yaw = ((opt.yaw ?? 0) * Math.PI) / 180;
const stretch = opt.stretch ?? 1;

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);

const tris = () =>
  doc
    .getRoot()
    .listMeshes()
    .reduce((n, m) => n + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const before = { tris: Math.round(tris()), bytes: statSync(input).size };

await doc.transform(dedup(), prune(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }));

// Fit: wrap the scene's roots in a node that recentres, rotates and scales.
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
const { min, max } = getBounds(scene);
const sx = max[0] - min[0];
const sy = max[1] - min[1];
const sz = max[2] - min[2];
const s = Math.min(footprint / Math.max(sx, sz), height / sy);
const cx = (min[0] + max[0]) / 2;
const cz = (min[2] + max[2]) / 2;
const root = doc.createNode('fit').setScale([s, s * stretch, s]).setRotation([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]);
const inner = doc.createNode('recentre').setTranslation([-cx, -min[1], -cz]);
for (const child of scene.listChildren()) {
  scene.removeChild(child);
  inner.addChild(child);
}
root.addChild(inner);
scene.addChild(root);

// Texture downscale + JPEG via sips (macOS). Normal maps keep PNG to avoid block artefacts in lighting.
const maxTex = opt.tex ?? 1024;
let sips = false;
try {
  execSync('sips --help', { stdio: 'ignore' });
  sips = true;
} catch {
  /* not macOS: keep textures */
}
if (sips) {
  const normals = new Set(doc.getRoot().listMaterials().map((m) => m.getNormalTexture()).filter(Boolean));
  const dir = mkdtempSync(join(tmpdir(), 'glbtex-'));
  for (const [i, tex] of doc.getRoot().listTextures().entries()) {
    const img = tex.getImage();
    if (!img) continue;
    const isNormal = normals.has(tex);
    const src = join(dir, `t${i}.${tex.getMimeType() === 'image/jpeg' ? 'jpg' : 'png'}`);
    const dst = join(dir, `o${i}.${isNormal ? 'png' : 'jpg'}`);
    writeFileSync(src, img);
    execSync(`sips -Z ${isNormal ? maxTex / 2 : maxTex} ${isNormal ? '-s format png' : '-s format jpeg -s formatOptions 82'} "${src}" --out "${dst}"`, { stdio: 'ignore' });
    tex.setImage(new Uint8Array(readFileSync(dst))).setMimeType(isNormal ? 'image/png' : 'image/jpeg');
    tex.setURI(tex.getURI().replace(/\.(png|jpe?g)$/i, isNormal ? '.png' : '.jpg'));
  }
  rmSync(dir, { recursive: true, force: true });
}

let ktx = 'install toktx (KTX-Software) to enable KTX2 textures';
try {
  execSync('toktx --version', { stdio: 'ignore' });
  ktx = `bunx @gltf-transform/cli etc1s ${output} ${output} --quality 128`;
} catch {
  /* no toktx: keep source textures */
}
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(output, doc);

const textures = doc
  .getRoot()
  .listTextures()
  .map((t) => `${t.getMimeType()} ${t.getSize()?.join('×') ?? '?'} ${Math.round((t.getImage()?.byteLength ?? 0) / 1024)} KB`);
console.log(
  JSON.stringify(
    {
      in: before,
      out: { tris: Math.round(tris()), bytes: statSync(output).size, size: [sx * s, sy * s * stretch, sz * s].map((v) => +v.toFixed(2)) },
      ktx2: ktx,
      maxTexture: maxTex,
      sips,
      textures,
    },
    null,
    1,
  ),
);
