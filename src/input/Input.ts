export interface PointerEventInfo {
  button: number;
  /** Normalised device coords. */
  nx: number;
  ny: number;
  /** Client pixels. */
  x: number;
  y: number;
  shift: boolean;
  ctrl: boolean;
}

type PointerListener = (e: PointerEventInfo) => void;
type KeyListener = (e: KeyboardEvent) => boolean | void;

/**
 * Collects DOM input for the canvas. Continuous state (keys held, pointer position, drags,
 * wheel) is polled per frame; discrete events are dispatched to listeners in priority order.
 */
export class Input {
  readonly keys = new Set<string>();
  readonly pointer = { x: 0, y: 0, nx: 0, ny: 0, inside: false };
  readonly buttons = new Set<number>();
  /** Accumulated since last `endFrame`. */
  wheel = 0;
  dragDX = 0;
  dragDY = 0;
  /** Total pointer travel since the current button went down (px). */
  dragDistance = 0;

  private downListeners: PointerListener[] = [];
  private upListeners: PointerListener[] = [];
  private keyListeners: KeyListener[] = [];

  constructor(private el: HTMLElement) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.buttons.add(e.button);
      this.dragDistance = 0;
      this.move(e);
      for (const l of this.downListeners) l(this.info(e));
    });
    el.addEventListener('pointerup', (e) => {
      this.buttons.delete(e.button);
      this.move(e);
      for (const l of this.upListeners) l(this.info(e));
    });
    el.addEventListener('pointermove', (e) => {
      if (this.buttons.size) {
        this.dragDX += e.movementX;
        this.dragDY += e.movementY;
        this.dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
      }
      this.move(e);
    });
    el.addEventListener('pointerenter', () => (this.pointer.inside = true));
    el.addEventListener('pointerleave', () => (this.pointer.inside = false));
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const scale = e.deltaMode === 1 ? 16 : 1;
        this.wheel += e.deltaY * scale * (e.ctrlKey ? 3 : 1);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      for (const l of this.keyListeners) if (l(e) === true) return void e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });
  }

  onPointerDown(l: PointerListener): void {
    this.downListeners.push(l);
  }
  onPointerUp(l: PointerListener): void {
    this.upListeners.push(l);
  }
  /** Return `true` from a key listener to consume the event. Earlier listeners win. */
  onKey(l: KeyListener): void {
    this.keyListeners.push(l);
  }

  endFrame(): void {
    this.wheel = 0;
    this.dragDX = 0;
    this.dragDY = 0;
  }

  private move(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    this.pointer.x = e.clientX - r.left;
    this.pointer.y = e.clientY - r.top;
    this.pointer.nx = (this.pointer.x / r.width) * 2 - 1;
    this.pointer.ny = -(this.pointer.y / r.height) * 2 + 1;
    this.pointer.inside = true;
  }

  private info(e: PointerEvent): PointerEventInfo {
    return { button: e.button, nx: this.pointer.nx, ny: this.pointer.ny, x: this.pointer.x, y: this.pointer.y, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
