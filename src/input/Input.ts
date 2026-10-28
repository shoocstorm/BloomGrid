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
  /** A finger, not a mouse or pen: tools preview on the first tap and act on a confirming second one. */
  touch: boolean;
}

type PointerListener = (e: PointerEventInfo) => void;
type KeyListener = (e: KeyboardEvent) => boolean | void;

/** Two-finger gesture state at the last measurement (client pixels / radians). */
interface Pinch {
  dist: number;
  angle: number;
  x: number;
  y: number;
}

/**
 * Collects DOM input for the canvas. Continuous state (keys held, pointer position, drags,
 * wheel, two-finger gestures) is polled per frame; discrete events are dispatched to listeners in
 * priority order.
 *
 * Touch: one finger behaves like the left mouse button. A second finger turns the touch into a
 * camera gesture (pinch zoom, twist rotate, drag pan or tilt): tools get a cancel instead of an up,
 * and nothing reaches them until every finger has lifted.
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
  /** performance.now() of the last player input (drives idle frame-rate throttling). */
  lastActivity = performance.now();
  /** The last pointer was a finger. */
  touch = false;
  /** Two or more fingers are (or were, until all lift) down: a camera gesture, not a tool action. */
  gesture = false;
  /** Locked once the fingers have moved: 'tilt' for a parallel vertical drag, else 'free'. */
  gestureMode: 'free' | 'tilt' | null = null;
  /** Gesture deltas since last `endFrame`: pinch as a log scale (> 0 spreads), twist in radians, midpoint move in px. */
  pinch = 0;
  twist = 0;
  gestureDX = 0;
  gestureDY = 0;

  private downListeners: PointerListener[] = [];
  private upListeners: PointerListener[] = [];
  private cancelListeners: (() => void)[] = [];
  private keyListeners: KeyListener[] = [];
  private touches = new Map<number, { x: number; y: number }>();
  private last = { x: 0, y: 0 };
  private prev: Pinch = { dist: 1, angle: 0, x: 0, y: 0 };
  private total = { pinch: 0, twist: 0, dx: 0, dy: 0 };

  constructor(private el: HTMLElement) {
    const touch = () => (this.lastActivity = performance.now());
    for (const ev of ['pointerdown', 'pointermove', 'wheel']) el.addEventListener(ev, touch, { passive: true });
    window.addEventListener('keydown', touch);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone (or synthetic): capture is a convenience */
      }
      this.touch = e.pointerType === 'touch';
      if (this.touch) {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size >= 2) {
          if (!this.gesture) {
            this.gesture = true;
            this.gestureMode = null;
            this.total = { pinch: 0, twist: 0, dx: 0, dy: 0 };
            this.dragDistance = Infinity;
            for (const l of this.cancelListeners) l();
          }
          this.prev = this.measure();
          return;
        }
      }
      this.buttons.add(e.button);
      this.dragDistance = 0;
      this.last = { x: e.clientX, y: e.clientY };
      this.move(e);
      for (const l of this.downListeners) l(this.info(e));
    });
    const release = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        this.touches.delete(e.pointerId);
        if (this.gesture) {
          if (this.touches.size >= 2) this.prev = this.measure();
          if (this.touches.size === 0) {
            this.gesture = false;
            this.buttons.delete(0);
          }
          return;
        }
      }
      this.buttons.delete(e.button);
      this.move(e);
      if (e.type === 'pointercancel') for (const l of this.cancelListeners) l();
      else for (const l of this.upListeners) l(this.info(e));
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointermove', (e) => {
      const t = this.touches.get(e.pointerId);
      if (t) {
        t.x = e.clientX;
        t.y = e.clientY;
        if (this.gesture) return this.updateGesture();
      }
      // Deltas from client positions: touch pointers report no movementX in some browsers.
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.last = { x: e.clientX, y: e.clientY };
      if (this.buttons.size) {
        this.dragDX += dx;
        this.dragDY += dy;
        this.dragDistance += Math.abs(dx) + Math.abs(dy);
      }
      this.move(e);
    });
    el.addEventListener('pointerenter', () => (this.pointer.inside = true));
    // A lifted finger "leaves" the canvas; keep its spot so build previews stay where it tapped.
    el.addEventListener('pointerleave', (e) => e.pointerType !== 'touch' && (this.pointer.inside = false));
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
      this.touches.clear();
      this.gesture = false;
    });
  }

  /** The press so far is a tap, not a drag (fingers get more slop than a mouse). */
  get isTap(): boolean {
    return this.dragDistance <= (this.touch ? 12 : 6);
  }

  onPointerDown(l: PointerListener): void {
    this.downListeners.push(l);
  }
  onPointerUp(l: PointerListener): void {
    this.upListeners.push(l);
  }
  /** A press that will not get its up: a second finger turned it into a camera gesture, or the browser cancelled it. */
  onPointerCancel(l: () => void): void {
    this.cancelListeners.push(l);
  }
  /** Return `true` from a key listener to consume the event. Earlier listeners win. */
  onKey(l: KeyListener): void {
    this.keyListeners.push(l);
  }

  endFrame(): void {
    this.wheel = 0;
    this.dragDX = 0;
    this.dragDY = 0;
    this.pinch = 0;
    this.twist = 0;
    this.gestureDX = 0;
    this.gestureDY = 0;
  }

  /** Distance, angle and midpoint of the first two fingers. */
  private measure(): Pinch {
    const [a, b] = this.touches.values();
    if (!a || !b) return this.prev;
    return { dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), angle: Math.atan2(b.y - a.y, b.x - a.x), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private updateGesture(): void {
    if (this.touches.size < 2) return;
    const m = this.measure();
    const p = this.prev;
    let twist = m.angle - p.angle;
    if (twist > Math.PI) twist -= Math.PI * 2;
    if (twist < -Math.PI) twist += Math.PI * 2;
    const pinch = Math.log(m.dist / p.dist);
    this.pinch += pinch;
    this.twist += twist;
    this.gestureDX += m.x - p.x;
    this.gestureDY += m.y - p.y;
    this.prev = m;
    if (this.gestureMode) return;
    const t = this.total;
    t.pinch += pinch;
    t.twist += twist;
    t.dx += m.x - p.x;
    t.dy += m.y - p.y;
    if (Math.abs(t.dx) + Math.abs(t.dy) + Math.abs(t.pinch) * 120 + Math.abs(t.twist) * 120 < 14) return;
    const parallel = Math.abs(t.pinch) < 0.06 && Math.abs(t.twist) < 0.08;
    this.gestureMode = parallel && Math.abs(t.dy) > Math.abs(t.dx) * 2 ? 'tilt' : 'free';
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
    return {
      button: e.button,
      nx: this.pointer.nx,
      ny: this.pointer.ny,
      x: this.pointer.x,
      y: this.pointer.y,
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      touch: e.pointerType === 'touch',
    };
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
