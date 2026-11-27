import type { GameContext } from '@/game/context';
import type { CameraView } from '@/input/CityCamera';
import { closeX } from '@/ui/closeX';
import { IDLE_SECONDS, idleTimer } from '@/ui/idle';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';

/** Below this many tiles between the old view and the moment, the camera barely moved: no card. */
const NEAR = 45;

/** Where on the island a point lies, in the player's words ("north-east"); -z is north, +x east. */
export function compassOf(x: number, z: number, size: number): string {
  const dx = x - size / 2;
  const dz = z - size / 2;
  if (Math.hypot(dx, dz) < size * 0.12) return 'centre';
  const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const a = Math.atan2(dz, dx); // 0 = east, π/2 = south (+z)
  return names[(Math.round(a / (Math.PI / 4)) + 8) % 8]!;
}

/**
 * The way back (D-209): when a ceremony (a sea wonder rising, an unlock, an era) flies the camera off to where it
 * happened, a card under the top bar says where that is and offers one click back to the view the player was
 * building in. "Stay here" keeps the new view; after going back, a toast keeps a ⌖ Show to the place for a while.
 * Esc or × put it away; left untouched it goes after the same idle time as the other cards (D-201), a bar draining
 * along its foot to show it (paused while the pointer is on it, D-232).
 */
export class ReturnCard {
  private card: HTMLElement;
  private kick = h('span', { class: 'mr-kick-t' });
  private name = h('b', { class: 'mr-name' });
  private line = h('p', { class: 'mr-line' });
  private ico = h('span', { class: 'mr-ico' });
  private drain = h('i', { class: 'mr-drain' });
  private view: CameraView | null = null;
  private to: { x: number; z: number; label: string } | null = null;
  private idle;

  constructor(private ctx: GameContext) {
    const back = h('button', { class: 'mr-back', onClick: () => this.back() }, icon('undo'), 'Back to where you were');
    this.card = h(
      'section',
      { class: 'mr panel holo hidden', role: 'status', 'aria-live': 'polite', 'aria-label': 'Return to your view' },
      h('header', { class: 'mr-kick' }, icon('locate'), this.kick),
      h('div', { class: 'mr-main' }, this.ico, h('div', { class: 'mr-text' }, this.name, this.line)),
      h('div', { class: 'mr-foot' }, h('button', { class: 'btn ghost mr-stay', onClick: () => this.hide() }, 'Stay here'), back),
      closeX('this card', () => this.hide()),
      this.drain,
    );
    this.card.style.setProperty('--mr-idle', `${IDLE_SECONDS.card}s`);
    this.idle = idleTimer(this.card, IDLE_SECONDS.card, () => this.hide());
    // The countdown starts again from the top when the pointer leaves: so does the bar.
    this.card.addEventListener('pointerleave', () => this.restartDrain());
    ctx.hud.append(this.card);
    ctx.input.onKey((e) => {
      if (e.key !== 'Escape' || !this.shown) return false;
      this.hide();
      return true;
    });
    for (const ev of ['city:reset', 'load:done'] as const) ctx.bus.on(ev, () => this.hide());
  }

  get shown(): boolean {
    return !this.card.classList.contains('hidden');
  }

  /**
   * Offers the way back to `view` after the camera was flown to `to`. `what` names the place (a wonder) and
   * `emblem` is its icon; a camera that hardly moved offers nothing.
   */
  offer(view: CameraView, to: { x: number; z: number }, what: { kick: string; name: string; emblem: string }): void {
    if (Math.hypot(view.x - to.x, view.z - to.z) < NEAR) return;
    const size = this.ctx.city.grid.w;
    const where = compassOf(to.x, to.z, size);
    const dist = Math.round(Math.hypot(view.x - to.x, view.z - to.z));
    const off = where === 'centre' ? 'at the heart of the island' : `off the island's ${where} coast`;
    this.view = view;
    this.to = { ...to, label: `${what.name} · ${where === 'centre' ? 'island centre' : where}` };
    setText(this.kick, what.kick);
    setText(this.name, what.name);
    setText(this.line, `You're looking at it now, ${off}: ${dist} tiles from where you were building.`);
    this.ico.replaceChildren(icon(what.emblem));
    this.card.classList.remove('hidden', 'mr-in');
    void this.card.offsetWidth;
    this.card.classList.add('mr-in');
    document.body.classList.add('moment-return');
    this.idle.arm();
    this.restartDrain();
  }

  private restartDrain(): void {
    this.drain.classList.remove('run');
    void this.drain.offsetWidth;
    this.drain.classList.add('run');
  }

  private back(): void {
    const v = this.view;
    const to = this.to;
    this.hide();
    if (!v) return;
    const cam = this.ctx.cameraCtl;
    if (!cam.enabled || cam.cinematic) return;
    cam.setView(v);
    // The place stays one click away for a while.
    if (to) this.ctx.bus.emit('toast', { text: to.label, tone: 'info', at: { x: to.x, z: to.z } });
  }

  hide(): void {
    this.card.classList.add('hidden');
    document.body.classList.remove('moment-return');
    this.idle.disarm();
    this.view = null;
  }
}
