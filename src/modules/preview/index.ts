import {
  BackSide,
  Color,
  Matrix4,
  Box3,
  CircleGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicNodeMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three/webgpu';
import { color, float, length, mix, positionLocal, smoothstep, uv, abs, fract } from 'three/tsl';
import type { GameContext, GameModule } from '@/game/context';
import { getPiece } from '@/assets/kit/pieces';
import { ChunkedInstancer } from '@/render/Instancer';
import { buildings } from '@/content';

export interface PreviewService {
  /** Shows building `eid` on the stage `host` (an element whose box is a transparent window in the HUD). */
  show(host: HTMLElement, eid: number): void;
  /** Shows building type `defId` as it would be built (the Build tab, D-069). */
  showDef(host: HTMLElement, defId: string): void;
  hide(): void;
  /** Back to the framing it opened with. */
  reset(): void;
}

declare module '@/core/Services' {
  interface GameServices {
    preview: PreviewService;
  }
}

/** Turntable speed (rad/s): a slow showroom turn, paused while the player drags. */
const SPIN = 0.22;
const _box = new Box3();
const _pbox = new Box3();
const _size = new Vector3();
const _v = new Vector2();

/**
 * Object preview: the selected building alone on a small studio stage inside the inspector, turning slowly;
 * drag to orbit, wheel to zoom, double-click to reset. It draws with the main renderer into a scissored
 * viewport under the stage's transparent window, after the city frame: one renderer and the city's own
 * materials (a separate renderer would mean a second GPU device and recompiling every material). Pieces are
 * read back from the building's live instances and placed at its real position, so shader lookups by world
 * position (bloom field, lenses) match the city. Nothing renders while the stage is hidden.
 */
class Preview {
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.1, 4000);
  private stage = new Group();
  private instancer = new ChunkedInstancer(this.stage, 64);
  private dome: Mesh;
  private floor: Mesh;
  private key = new DirectionalLight(0xfff2dc, 2.6);
  private rim = new DirectionalLight(0x8ff8ec, 1.1);
  private host: HTMLElement | null = null;
  private clips: HTMLElement[] = [];
  /** What is on stage (`e<eid>` or `d<def id>`) and how to read its pieces. */
  private shown = '';
  private parts: () => { piece: string; matrix: Matrix4; color: Color; params: number[] }[] = () => [];
  private retry = 0;
  private target = new Vector3();
  private radius = 10;
  private yaw = 0;
  private pitch = 0.42;
  private zoom = 1;
  private home = { yaw: 0, pitch: 0.42 };
  private drag: { x: number; y: number; id: number } | null = null;
  private idleSpin = 0;

  constructor(private ctx: GameContext) {
    const s = this.scene;
    s.add(this.stage, this.key, this.key.target, this.rim, this.rim.target, new HemisphereLight(0xdff6ff, 0x30443a, 1.15));
    // Backdrop: a deep teal dome, lighter toward the horizon, so the stage never shows the city behind it.
    const domeMat = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
    const up = positionLocal.y.mul(0.5).add(0.5);
    domeMat.colorNode = mix(color(0x0b3a3c), color(0x02090b), smoothstep(0.35, 0.9, up));
    this.dome = new Mesh(new SphereGeometry(1, 32, 16), domeMat);
    this.dome.renderOrder = -2;
    // Floor: a soft glowing disc with survey rings.
    const floorMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    const r = length(uv().sub(0.5)).mul(2);
    const rings = smoothstep(0.08, 0.0, abs(fract(r.mul(6)).sub(0.5)).sub(0.42)).mul(0.18);
    floorMat.colorNode = color(0x5ff2da);
    floorMat.opacityNode = float(1).sub(smoothstep(0.05, 1, r)).mul(0.12).add(rings.mul(float(1).sub(r)));
    this.floor = new Mesh(new CircleGeometry(1, 64).rotateX(-Math.PI / 2), floorMat);
    this.floor.renderOrder = -1;
    s.add(this.dome, this.floor);
  }

  show(host: HTMLElement, eid: number): void {
    this.open(host, `e${eid}`, () => this.ctx.services.get('construction').renderer.snapshot(eid));
  }

  showDef(host: HTMLElement, defId: string): void {
    const def = buildings.get(defId);
    const at = new Vector3(this.ctx.cameraCtl.target.x, 0, this.ctx.cameraCtl.target.z);
    this.open(host, `d${defId}`, () => this.ctx.services.get('construction').renderer.designParts(def, at));
  }

  private open(host: HTMLElement, key: string, parts: Preview['parts']): void {
    if (this.host !== host) this.bind(host);
    this.host = host;
    // Clipping boxes: the stage, then every scrolling ancestor (the inspector sheet, the right column).
    this.clips = [host];
    for (let el = host.parentElement; el && el !== document.body; el = el.parentElement) {
      // `display: contents` boxes (the phone's right column) have no box to clip by.
      const cs = getComputedStyle(el);
      if (cs.display !== 'contents' && /auto|scroll|hidden/.test(cs.overflowY)) this.clips.push(el);
    }
    if (key === this.shown) return;
    this.shown = key;
    this.parts = parts;
    this.yaw = this.ctx.cameraCtl.yaw + 0.5;
    this.pitch = 0.42;
    this.home = { yaw: this.yaw, pitch: this.pitch };
    this.zoom = 1;
    this.retry = 0;
    this.load();
  }

  hide(): void {
    this.host = null;
  }

  reset(): void {
    this.yaw = this.home.yaw;
    this.pitch = this.home.pitch;
    this.zoom = 1;
  }

  /** Copies the building's live pieces; GLB parts may still be loading, so an empty read retries briefly. */
  private load(): void {
    this.instancer.clear();
    const parts = this.parts();
    if (!parts.length) {
      this.retry = 0.25;
      return;
    }
    this.retry = 0;
    _box.makeEmpty();
    for (const p of parts) {
      this.instancer.addMatrix(p.piece, p.matrix, p.color, p.params);
      const g = getPiece(p.piece).geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      _box.union(_pbox.copy(g.boundingBox!).applyMatrix4(p.matrix));
    }
    _box.getCenter(this.target);
    _box.getSize(_size);
    this.radius = Math.max(1.5, _size.length() / 2);
    const R = this.radius;
    this.dome.position.copy(this.target);
    this.dome.scale.setScalar(R * 14);
    this.floor.position.set(this.target.x, _box.min.y + 0.02, this.target.z);
    this.floor.scale.setScalar(R * 1.8);
    this.camera.near = R * 0.05;
    this.camera.far = R * 40;
  }

  private bind(host: HTMLElement): void {
    host.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      host.setPointerCapture(e.pointerId);
      host.classList.add('dragging');
    });
    host.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      this.yaw -= (e.clientX - this.drag.x) * 0.012;
      this.pitch = Math.min(1.35, Math.max(-0.05, this.pitch + (e.clientY - this.drag.y) * 0.008));
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.idleSpin = 2.5;
    });
    const end = () => {
      this.drag = null;
      host.classList.remove('dragging');
    };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
    host.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.zoom = Math.min(2.6, Math.max(0.45, this.zoom * Math.exp(e.deltaY * 0.0015)));
        this.idleSpin = 2.5;
      },
      { passive: false },
    );
    host.addEventListener('dblclick', () => this.reset());
  }

  update(dt: number): void {
    const host = this.host;
    if (!host || !host.isConnected || host.offsetParent === null) return;
    if (this.retry > 0 && (this.retry -= dt) <= 0) this.load();
    const { renderer } = this.ctx;
    const canvas = renderer.domElement.getBoundingClientRect();
    const r = host.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    // Scissor = the stage clipped by its scrolling ancestors (it must never paint over the city).
    let x0 = r.left;
    let y0 = r.top;
    let x1 = r.right;
    let y1 = r.bottom;
    for (const el of this.clips.slice(1)) {
      const c = el.getBoundingClientRect();
      x0 = Math.max(x0, c.left);
      y0 = Math.max(y0, c.top);
      x1 = Math.min(x1, c.right);
      y1 = Math.min(y1, c.bottom);
    }
    if (x1 - x0 < 2 || y1 - y0 < 2) return;

    if (!this.drag && (this.idleSpin -= dt) <= 0) this.yaw += dt * SPIN;
    const d = (this.radius / Math.sin((this.camera.fov * Math.PI) / 360)) * 0.82 * this.zoom;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * d,
      this.target.y + Math.sin(this.pitch) * d,
      this.target.z + Math.cos(this.yaw) * cp * d,
    );
    this.camera.lookAt(this.target);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    // Key light over the camera's shoulder, rim from behind.
    this.key.position.set(this.camera.position.x + d * 0.4, this.target.y + d, this.camera.position.z - d * 0.2);
    this.key.target.position.copy(this.target);
    this.rim.position.set(this.target.x * 2 - this.camera.position.x, this.target.y + d * 0.5, this.target.z * 2 - this.camera.position.z);
    this.rim.target.position.copy(this.target);
    this.scene.environment = this.ctx.scene.environment;
    this.instancer.update(dt, this.camera);

    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setViewport(r.left - canvas.left, r.top - canvas.top, r.width, r.height);
    renderer.setScissor(x0 - canvas.left, y0 - canvas.top, x1 - x0, y1 - y0);
    renderer.setScissorTest(true);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.getSize(_v);
    renderer.setViewport(0, 0, _v.x, _v.y);
    renderer.autoClear = autoClear;
  }
}

/** The inspector's 3D object preview (see `Preview`). */
export const previewModule: GameModule = {
  id: 'preview',
  deps: ['construction'],
  init(ctx) {
    const p = new Preview(ctx);
    ctx.services.provide('preview', {
      show: (host, eid) => p.show(host, eid),
      showDef: (host, id) => p.showDef(host, id),
      hide: () => p.hide(),
      reset: () => p.reset(),
    });
    // After the city frame (core.render), so it draws over the canvas under the stage's window.
    ctx.systems.add({ id: 'preview', phase: 'render', order: 50, update: (_c, f) => p.update(f.dt) });
  },
};
