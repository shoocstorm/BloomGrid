import { CanvasTexture, InstancedBufferAttribute, InstancedMesh, LinearMipmapLinearFilter, Matrix4, MeshStandardNodeMaterial, PlaneGeometry, Vector3 } from 'three/webgpu';
import { attribute, color, float, floor, fract, fwidth, mix, mod, step, texture, uv, vec2 } from 'three/tsl';
import type { GameModule } from '@/game/context';
import { U } from '@/render/uniforms';
import { Building } from '@/ecs/components';
import { buildingId } from '@/sim/inventory';
import { placeBuilding, signSpots } from '@/modules/construction/BuildingRenderer';

/**
 * Building signs (D-133): every building carries its name and readable id where people look for them. Lit name
 * strips over entrances (`sign: 'name'` in a recipe) read "Mycelium Work Dome · COM-0042"; doors (`sign: 'number'`)
 * carry a number plate with the id; a building with neither gets a plate at the middle of its front.
 *
 * One instanced quad per sign, one draw call: the text rides in three vec4 attributes (three characters per float,
 * base 96, 33 characters) and the shader looks each glyph up in a monospace font atlas drawn once at boot. Text
 * fades once a glyph is a few pixels wide (no shimmer, D-064), and the whole mesh only draws for close views.
 * Rebuilt (debounced) when buildings come and go.
 */

const COLS = 16;
const ROWS = 6;
const CW = 32;
const CH = 52;
/** Glyph width / height in the atlas. */
const ASPECT = CW / CH;
const CHARS = 33;
/** Instanced batches stay above the 1024-instance UBO path (AGENTS.md §8). */
const MIN_CAP = 2048;
/** City camera distance under which signs draw (they are unreadable further out). */
const SHOW_WITHIN = 30;
/** Glyph heights (world units): name boards read from a close city view, number plates from the street. */
const NAME_GLYPH = 0.065;
const PLATE_GLYPH = 0.04;
/** Padding round the text on a board or plate, in glyph heights. */
const PLATE_PAD_X = 0.35;
const PLATE_PAD_Y = 0.3;

function fontAtlas(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = COLS * CW;
  c.height = ROWS * CH;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#fff';
  g.font = `bold ${Math.round(CH * 0.74)}px ui-monospace, Menlo, Consolas, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < COLS * ROWS; i++) g.fillText(i === 95 ? '·' : String.fromCharCode(32 + i), (i % COLS) * CW + CW / 2, Math.floor(i / COLS) * CH + CH * 0.54);
  const t = new CanvasTexture(c);
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  return t;
}

/** Glyph index (0..95) for a character; anything outside printable ASCII becomes a space. */
const glyph = (ch: string) => {
  const c = ch === '·' ? 0x7f : ch.charCodeAt(0);
  return c >= 32 && c <= 127 ? c - 32 : 0;
};

/** Packs `text` (≤ 33 characters) and its kind into 12 floats: three base-96 characters per float, meta last. */
export function packSign(text: string, kind: 0 | 1, out: Float32Array, o: number): void {
  const n = Math.min(CHARS, text.length);
  for (let f = 0; f < 11; f++) {
    let v = 0;
    for (let k = 2; k >= 0; k--) v = v * 96 + (f * 3 + k < n ? glyph(text[f * 3 + k]!) : 0);
    out[o + f] = v;
  }
  out[o + 11] = n + kind * 64;
}

export const signsModule: GameModule = {
  id: 'signs',
  deps: ['construction'],
  init(ctx) {
    const { city } = ctx;
    const atlas = fontAtlas();
    const plane = new PlaneGeometry(1, 1);
    let cap = MIN_CAP;
    const attrs = [0, 1, 2].map(() => new InstancedBufferAttribute(new Float32Array(cap * 4), 4));

    const m = new MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0 });
    {
      const [a0, a1, a2] = [0, 1, 2].map((i) => attribute(`aText${i}`, 'vec4'));
      const comps = [a0!.x, a0!.y, a0!.z, a0!.w, a1!.x, a1!.y, a1!.z, a1!.w, a2!.x, a2!.y, a2!.z];
      const meta = a2!.w;
      const kind = step(64, meta);
      const n = meta.sub(kind.mul(64));
      const g = uv();
      // The board or plate pads the text.
      const padX = float(PLATE_PAD_X).div(n.mul(ASPECT).add(PLATE_PAD_X * 2));
      const padY = float(PLATE_PAD_Y / (1 + PLATE_PAD_Y * 2));
      const tx = g.x.sub(padX).div(float(1).sub(padX.mul(2)));
      const ty = g.y.sub(padY).div(float(1).sub(padY.mul(2)));
      const inText = step(0, tx).mul(step(tx, 1)).mul(step(0, ty)).mul(step(ty, 1));
      const cell = tx.mul(n);
      const i = floor(cell).clamp(0, CHARS - 1);
      const f = floor(i.div(3));
      const packed = comps.reduce((acc, c, k) => acc.add(c.mul(step(float(k).sub(0.5), f).mul(step(f, float(k).add(0.5))))), float(0));
      const k = i.sub(f.mul(3));
      const ch = mod(floor(packed.div(mix(mix(float(1), float(96), step(0.5, k)), float(9216), step(1.5, k)))), 96);
      const col = mod(ch, COLS);
      const row = floor(ch.div(COLS));
      const fx = fract(cell);
      const a = atlas ? texture(atlas, vec2(col.add(fx).div(COLS), float(1).sub(row.add(float(1).sub(ty.clamp(0.02, 0.98))).div(ROWS)))).a : float(0);
      // Glyphs under ~4 pixels wide fade out (the plate stays): no shimmer from afar.
      const show = float(1).sub(fwidth(cell).sub(0.12).div(0.18).clamp(0, 1));
      const ink = a.mul(inText).mul(show);
      // Name boards: mint letters on deep teal. Number plates: cream on charcoal. Both glow softly at night.
      const board = mix(color(0x123a35), color(0x2a3236), kind);
      const letters = mix(color(0xbff7e8), color(0xf3ead8), kind);
      m.colorNode = mix(board, letters, ink);
      m.emissiveNode = mix(color(0x7ff7e6), color(0xfff1cf), kind).mul(ink).mul(U.night.mul(0.55).add(0.06));
    }
    attrs.forEach((a, i) => plane.setAttribute(`aText${i}`, a));
    let mesh = new InstancedMesh(plane, m, cap);
    const setup = (x: InstancedMesh) => {
      x.count = 0;
      x.frustumCulled = false;
      x.castShadow = x.receiveShadow = false;
      x.name = 'signs';
      ctx.scene.add(x);
    };
    setup(mesh);

    const grow = (need: number) => {
      if (need <= cap) return;
      while (cap < need) cap *= 2;
      for (let i = 0; i < 3; i++) {
        const a = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
        attrs[i] = a;
        plane.setAttribute(`aText${i}`, a);
      }
      ctx.scene.remove(mesh);
      mesh.dispose();
      mesh = new InstancedMesh(plane, m, cap);
      setup(mesh);
    };

    const packed = new Float32Array(12);
    const mat = new Matrix4();
    const basis = new Matrix4();
    const up = new Vector3(0, 1, 0);
    const at = new Vector3();
    let dirty = true;
    const rebuild = () => {
      dirty = false;
      const eids = city.buildingEntities();
      const signs: { eid: number; text: string; kind: 0 | 1; at: Vector3; right: Vector3; normal: Vector3; w: number; h: number }[] = [];
      for (const eid of eids) {
        if (city.steward.ruins.includes(Building.uid[eid]!)) continue;
        const def = city.buildingDef(eid);
        if (typeof def.recipe !== 'function' && !def.recipe.fallback) continue;
        const rec = city.buildingRecord(eid);
        const place = placeBuilding(city.grid, def, rec.x, rec.z, rec.rot);
        const id = buildingId(city, eid);
        let plates = 0;
        let named: ReturnType<typeof signSpots>[number] | null = null;
        for (const s of signSpots(place)) {
          if (s.kind === 'number' && ++plates > 2) continue;
          const text = s.kind === 'number' ? id : def.name.slice(0, CHARS);
          const n = text.length;
          const span = (gh: number) => gh * (n * ASPECT + PLATE_PAD_X * 2);
          if (s.kind === 'name') {
            // A name board over the entrance strip: readable from a close city view, never wider than ~1 tile.
            const gh = Math.min(NAME_GLYPH, Math.max(s.width * 1.2, 0.9) / (n * ASPECT + PLATE_PAD_X * 2));
            signs.push({ eid, text, kind: 0, at: s.at, right: s.right, normal: s.normal, w: span(gh), h: gh * (1 + PLATE_PAD_Y * 2) });
            named = s;
          } else {
            // A number plate on the door's upper part (it may overhang a narrow door onto the wall beside it).
            const gh = Math.min(PLATE_GLYPH, Math.max(s.width * 1.3, 0.32) / (n * ASPECT + PLATE_PAD_X * 2));
            const ph = gh * (1 + PLATE_PAD_Y * 2);
            const lift = Math.max(0, Math.min(s.height * 0.22, s.height / 2 - ph));
            signs.push({ eid, text, kind: 1, at: s.at.clone().addScaledVector(up, lift), right: s.right, normal: s.normal, w: span(gh), h: ph });
          }
        }
        // A building named over its entrance but with no door plate: its number goes just under the name board.
        if (named && !plates) {
          const gh = PLATE_GLYPH * 0.8;
          const ph = gh * (1 + PLATE_PAD_Y * 2);
          const boardH = Math.min(NAME_GLYPH, Math.max(named.width * 1.2, 0.9) / (def.name.slice(0, CHARS).length * ASPECT + PLATE_PAD_X * 2)) * (1 + PLATE_PAD_Y * 2);
          const below = named.at.clone().addScaledVector(up, -(boardH / 2 + ph / 2 + 0.02));
          signs.push({ eid, text: id, kind: 1, at: below, right: named.right, normal: named.normal, w: gh * (id.length * ASPECT + PLATE_PAD_X * 2), h: ph });
        }
      }
      grow(signs.length);
      const im = mesh.instanceMatrix.array as Float32Array;
      const [t0, t1, t2] = attrs.map((a) => a.array as Float32Array);
      signs.forEach((s, i) => {
        // Just proud of the face, so the strip or door never shows through.
        at.copy(s.at).addScaledVector(s.normal, s.kind ? 0.006 : 0.004);
        basis.makeBasis(s.right, up, s.normal);
        mat.copy(basis).scale(new Vector3(s.w, s.h, 1)).setPosition(at);
        mat.toArray(im, i * 16);
        packSign(s.text, s.kind, packed, 0);
        t0!.set(packed.subarray(0, 4), i * 4);
        t1!.set(packed.subarray(4, 8), i * 4);
        t2!.set(packed.subarray(8, 12), i * 4);
      });
      mesh.count = signs.length;
      mesh.instanceMatrix.needsUpdate = true;
      for (const a of attrs) a.needsUpdate = true;
    };

    const stale = () => (dirty = true);
    ctx.bus.on('building:added', stale);
    ctx.bus.on('building:removed', stale);
    ctx.bus.on('building:ruined', stale);
    ctx.bus.on('building:repaired', stale);
    ctx.bus.on('terrain:changed', stale);
    ctx.bus.on('city:reset', stale);

    ctx.systems.add({
      id: 'signs.visuals',
      phase: 'sync',
      order: 9,
      update(c) {
        const explore = !c.cameraCtl.enabled;
        const near = explore || c.cameraCtl.distance < SHOW_WITHIN;
        if (dirty && near && !ctx.loading) rebuild();
        mesh.visible = near && mesh.count > 0;
      },
    });
  },
};
