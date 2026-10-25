import { Matrix4, Mesh, MeshStandardMaterial, MeshStandardNodeMaterial, type BufferGeometry, type Material, type Node, type Object3D } from 'three/webgpu';
import { materialColor, materialEmissive } from 'three/tsl';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hasPiece, registerPiece } from './kit/pieces';
import { registerMaterial } from '@/render/materials/library';
import { overlayDim, withOverlay } from '@/render/materials/overlay';
import { U } from '@/render/uniforms';

export interface GlbPart {
  piece: string;
  matrix: Matrix4;
}

/**
 * Loads and caches external assets (GLB hero models from Hyper3D or artists). Each mesh in a
 * GLB becomes an instanced kit piece, so hero assets get the same batching as procedural ones.
 */
export class AssetManager {
  private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private glbs = new Map<string, Promise<GlbPart[]>>();

  /**
   * One merged geometry (world transforms applied) plus the first material, for hand-built
   * instanced meshes with their own shaders (e.g. commuter pods).
   */
  loadGlbGeometry(url: string): Promise<{ geometry: BufferGeometry; material: Material | null }> {
    return this.loader.loadAsync(url).then((gltf) => {
      const geos: BufferGeometry[] = [];
      let material: Material | null = null;
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o: Object3D) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        geos.push(g.index ? g.toNonIndexed() : g);
        material ??= Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
      });
      const geometry = mergeGeometries(geos);
      if (!geometry) throw new Error(`No mergeable meshes in ${url}`);
      return { geometry, material };
    });
  }

  loadGlbPieces(url: string): Promise<GlbPart[]> {
    let p = this.glbs.get(url);
    if (!p) {
      p = this.loader.loadAsync(url).then((gltf) => {
        const parts: GlbPart[] = [];
        let i = 0;
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o: Object3D) => {
          if (!(o as Mesh).isMesh) return;
          const mesh = o as Mesh;
          const id = `glb:${url}#${i++}`;
          if (!hasPiece(id)) {
            const matName = registerGlbMaterial(id, mesh);
            registerPiece({ id, geometry: mesh.geometry, material: matName });
          }
          parts.push({ piece: id, matrix: mesh.matrixWorld.clone() });
        });
        return parts;
      });
      this.glbs.set(url, p);
    }
    return p;
  }
}


/**
 * GLB materials become node materials so hero models behave like the kit: data lenses tint
 * them, and at night their surfaces keep a faint self-lit glow (bioluminescent city) instead of
 * going black.
 */
function registerGlbMaterial(id: string, mesh: Mesh): string {
  registerMaterial(id, toNodeMaterial(Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material));
  return id;
}

export function toNodeMaterial(src: Material): Material {
  if (!(src instanceof MeshStandardMaterial)) return src;
  const m = new MeshStandardNodeMaterial();
  for (const k of ['color', 'map', 'roughness', 'metalness', 'roughnessMap', 'metalnessMap', 'normalMap', 'normalScale', 'aoMap', 'emissive', 'emissiveMap', 'emissiveIntensity', 'transparent', 'opacity', 'alphaTest', 'side', 'vertexColors', 'flatShading'] as const) {
    const v = (src as unknown as Record<string, unknown>)[k];
    if (v === undefined || v === null) continue;
    const cur = (m as unknown as Record<string, unknown>)[k];
    if (cur && typeof (cur as { copy?: unknown }).copy === 'function' && typeof v === 'object') (cur as { copy(x: unknown): void }).copy(v);
    else (m as unknown as Record<string, unknown>)[k] = v;
  }
  m.name = src.name;
  m.colorNode = withOverlay(materialColor as Node<'vec3'>, true);
  m.emissiveNode = overlayDim(materialEmissive.add(materialColor.mul(U.night).mul(0.12)) as Node<'vec3'>);
  return m;
}
