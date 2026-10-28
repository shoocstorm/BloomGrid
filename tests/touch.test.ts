import { beforeAll, describe, expect, it } from 'vitest';
import { Input } from '@/input/Input';

/** Minimal canvas stand-in: Input only listens, captures pointers and reads its rect. */
class FakeCanvas extends EventTarget {
  setPointerCapture(): void {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 400, height: 800 };
  }
}

type Ev = { pointerId: number; pointerType?: string; clientX: number; clientY: number; button?: number };
const fire = (el: EventTarget, type: string, e: Ev) =>
  el.dispatchEvent(Object.assign(new Event(type), { button: 0, pointerType: 'touch', shiftKey: false, ctrlKey: false, metaKey: false, ...e }));

describe('touch input', () => {
  beforeAll(() => {
    (globalThis as { window?: unknown }).window ??= new EventTarget();
  });

  it('a one-finger tap reaches tools as a touch press', () => {
    const el = new FakeCanvas();
    const input = new Input(el as unknown as HTMLElement);
    const ups: boolean[] = [];
    input.onPointerUp((e) => ups.push(e.touch));
    fire(el, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    fire(el, 'pointermove', { pointerId: 1, clientX: 104, clientY: 103 });
    expect(input.isTap).toBe(true); // fingers get more slop than a mouse
    fire(el, 'pointerup', { pointerId: 1, clientX: 104, clientY: 103 });
    expect(ups).toEqual([true]);
    expect(input.buttons.size).toBe(0);
  });

  it('a second finger cancels the press and turns it into pinch + twist', () => {
    const el = new FakeCanvas();
    const input = new Input(el as unknown as HTMLElement);
    let ups = 0;
    let cancels = 0;
    input.onPointerUp(() => ups++);
    input.onPointerCancel(() => cancels++);
    fire(el, 'pointerdown', { pointerId: 1, clientX: 160, clientY: 400 });
    fire(el, 'pointerdown', { pointerId: 2, clientX: 240, clientY: 400 });
    expect(input.gesture).toBe(true);
    expect(cancels).toBe(1);
    // Spread to twice the distance and turn a little.
    const a = 0.2;
    fire(el, 'pointermove', { pointerId: 1, clientX: 200 - 80 * Math.cos(a), clientY: 400 - 80 * Math.sin(a) });
    fire(el, 'pointermove', { pointerId: 2, clientX: 200 + 80 * Math.cos(a), clientY: 400 + 80 * Math.sin(a) });
    expect(input.pinch).toBeCloseTo(Math.log(2), 5);
    expect(input.twist).toBeCloseTo(a, 5);
    expect(input.gestureMode).toBe('free');
    expect(input.dragDX).toBe(0); // one-finger drag is ignored while gesturing
    fire(el, 'pointerup', { pointerId: 1, clientX: 0, clientY: 0 });
    expect(input.gesture).toBe(true); // until every finger lifts
    fire(el, 'pointerup', { pointerId: 2, clientX: 0, clientY: 0 });
    expect(input.gesture).toBe(false);
    expect(ups).toBe(0);
    expect(input.buttons.size).toBe(0);
    input.endFrame();
    expect(input.pinch).toBe(0);
  });

  it('a parallel vertical two-finger drag locks to tilt', () => {
    const el = new FakeCanvas();
    const input = new Input(el as unknown as HTMLElement);
    fire(el, 'pointerdown', { pointerId: 1, clientX: 150, clientY: 400 });
    fire(el, 'pointerdown', { pointerId: 2, clientX: 250, clientY: 400 });
    for (let y = 395; y >= 360; y -= 5) {
      fire(el, 'pointermove', { pointerId: 1, clientX: 150, clientY: y });
      fire(el, 'pointermove', { pointerId: 2, clientX: 250, clientY: y });
    }
    expect(input.gestureMode).toBe('tilt');
    expect(input.gestureDY).toBeLessThan(-30);
  });
});
