import { Matrix4, Mesh, type Object3D } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { hasPiece, registerPiece } from './kit/pieces';
import { registerMaterial } from '@/render/materials/library';

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


function registerGlbMaterial(id: string, mesh: Mesh): string {
  const mat = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
  registerMaterial(id, mat);
  return id;
}
