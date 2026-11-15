import type { Material, Node } from 'three/webgpu';

/**
 * Materials that write their own share of the bloom target (`mrtNode` with an `emissive` output: transparent beams,
 * trails, wakes, lanes, whales). Their MRT only makes sense while the bloom pipeline's scene pass has an `emissive`
 * attachment. Without it (Low quality renders straight to the canvas through three's framebuffer target, whose
 * texture is not named `output`), none of the MRT's outputs matches an attachment and the fragment shader's output
 * struct comes out empty: WebGPU rejects the pipeline and the object is never drawn. Register such a material here
 * instead of setting `mrtNode`; `PostFX.configure` attaches the MRT only while bloom runs (D-162).
 */
type WithMRT = Material & { mrtNode: Node | null };

const entries: { material: WithMRT; node: Node }[] = [];
let active = true;

export function bloomMRT(material: Material, node: Node): void {
  const m = material as WithMRT;
  entries.push({ material: m, node });
  m.mrtNode = active ? node : null;
}

/** Attaches (bloom pipeline on) or detaches every registered material's MRT. */
export function setBloomMRT(on: boolean): void {
  if (on === active) return;
  active = on;
  for (const { material, node } of entries) {
    material.mrtNode = on ? node : null;
    material.needsUpdate = true;
  }
}
