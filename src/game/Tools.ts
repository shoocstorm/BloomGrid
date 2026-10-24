import { Vector3 } from 'three/webgpu';
import type { PointerEventInfo } from '@/input/Input';
import { U } from '@/render/uniforms';
import { pickGround, type GroundHit } from '@/world/Picking';
import type { GameContext } from './context';

export interface Tool {
  id: string;
  label: string;
  /** Short glyph/emoji for the palette. */
  icon: string;
  hotkey?: string;
  /** Left-drag pans the camera while this tool is active. */
  dragPan?: boolean;
  /** Show the build grid overlay while active. */
  grid?: boolean;
  activate?(ctx: GameContext): void;
  deactivate?(ctx: GameContext): void;
  hover?(ctx: GameContext, hit: GroundHit | null): void;
  down?(ctx: GameContext, hit: GroundHit | null, e: PointerEventInfo): void;
  up?(ctx: GameContext, hit: GroundHit | null, e: PointerEventInfo): void;
  /** Return true to consume the key. */
  key?(ctx: GameContext, e: KeyboardEvent): boolean;
}

declare module '@/core/EventBus' {
  interface GameEvents {
    'tool:changed': { id: string };
    'tool:tooltip': { text: string | null; tone?: 'ok' | 'bad' };
  }
}

/** Registry + router for interactive tools. Feature modules add tools (e.g. Green Weaver). */
export class ToolManager {
  private tools = new Map<string, Tool>();
  active: Tool | null = null;
  hit: GroundHit | null = null;
  private hitStore: GroundHit = { point: new Vector3(), tx: 0, tz: 0, inBounds: false };
  defaultTool = 'select';

  constructor(private ctx: GameContext) {}

  register(tool: Tool): void {
    if (this.tools.has(tool.id)) throw new Error(`Tool "${tool.id}" already registered`);
    this.tools.set(tool.id, tool);
  }

  get(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  all(): Tool[] {
    return [...this.tools.values()];
  }

  setActive(id: string): void {
    const next = this.tools.get(id);
    if (!next || next === this.active) return;
    this.active?.deactivate?.(this.ctx);
    this.active = next;
    this.ctx.cameraCtl.dragPan = !!next.dragPan;
    next.activate?.(this.ctx);
    this.ctx.bus.emit('tool:tooltip', { text: null });
    this.ctx.bus.emit('tool:changed', { id });
  }

  /** Wire input → tools. */
  attach(): void {
    const { input } = this.ctx;
    input.onPointerDown((e) => {
      if (e.button === 0) this.active?.down?.(this.ctx, this.pick(), e);
    });
    input.onPointerUp((e) => {
      if (e.button === 0) this.active?.up?.(this.ctx, this.pick(), e);
    });
    input.onKey((e) => {
      if (this.active?.key?.(this.ctx, e)) return true;
      if (e.code === 'Escape' && this.active?.id !== this.defaultTool) {
        this.setActive(this.defaultTool);
        return true;
      }
      for (const t of this.tools.values()) {
        if (t.hotkey && t.hotkey === e.code && !e.ctrlKey && !e.metaKey) {
          this.setActive(t.id);
          return true;
        }
      }
      return false;
    });
  }

  pick(): GroundHit | null {
    const { input, city, camera } = this.ctx;
    if (!input.pointer.inside) return null;
    this.hit = pickGround(city.grid, camera, input.pointer.nx, input.pointer.ny, this.hitStore);
    return this.hit;
  }

  /** Per-frame hover update. */
  update(dt = 0): void {
    // Fade the build grid overlay in/out for tools that want it.
    const target = this.active?.grid ? 1 : 0;
    U.grid.value += (target - U.grid.value) * Math.min(1, dt * 8);
    this.active?.hover?.(this.ctx, this.pick());
  }
}
