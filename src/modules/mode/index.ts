import type { GameModule } from '@/game/context';
import { buildings } from '@/content';
import { isTouchDevice } from '@/platform/device';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { upgradeAllPlan } from '@/sim/roads';
import './mode.css';

type Tone = 'make' | 'remove' | 'shape';

interface ModeInfo {
  icon: string;
  title: (ctx: Parameters<GameModule['init']>[0]) => string;
  hint: string;
  touchHint?: string;
  tone: Tone;
  /** Extra buttons on the banner while this tool is in hand (built once; `sync` runs at ~5 Hz). */
  extra?: (ctx: Parameters<GameModule['init']>[0]) => { el: HTMLElement; sync?: () => void };
}

/** Highway mode's "Upgrade all" (D-212): every highway one level, raw tracks first, when the treasury covers it. */
function upgradeAll(ctx: Parameters<GameModule['init']>[0]) {
  let plan: { tiles: number[]; cost: number } | null = null;
  ctx.bus.on('road:changed', () => (plan = null));
  ctx.bus.on('road:level', () => (plan = null));
  ctx.bus.on('city:reset', () => (plan = null));
  const label = h('span');
  const price = h('b');
  const el = h(
    'button',
    {
      class: 'mb-act',
      onClick: () => {
        plan ??= upgradeAllPlan(ctx.city);
        const n = plan.tiles.length;
        if (!n || ctx.city.credits < plan.cost) return;
        if (ctx.commands.execute('upgradeRoad', { tiles: plan.tiles }))
          ctx.bus.emit('toast', { text: `${n.toLocaleString()} highway tiles upgraded one level`, tone: 'ok' });
      },
    },
    icon('up'),
    label,
    price,
  );
  const sync = () => {
    plan ??= upgradeAllPlan(ctx.city);
    const n = plan.tiles.length;
    const short = ctx.city.credits < plan.cost;
    el.classList.toggle('hidden', !n);
    (el as HTMLButtonElement).disabled = short;
    setText(label, 'Upgrade all');
    setText(price, `◈${Math.round(plan.cost).toLocaleString()}`);
    el.title = short
      ? `Upgrading all ${n.toLocaleString()} highway tiles one level costs ◈${Math.round(plan.cost).toLocaleString()}: not enough credits yet`
      : `Raise all ${n.toLocaleString()} highway tiles one level (raw tracks → Living Highways → Bloom Boulevards); ⌘Z undoes`;
  };
  return { el, sync };
}

/** What each tool in hand is called on the banner, what it does, and its colour (D-202). */
const MODES: Record<string, ModeInfo> = {
  build: {
    icon: 'build',
    title: (ctx) => `Placing ${buildings.get(ctx.services.get('construction').state.def).name}`,
    hint: 'Click a lot to build · R rotates',
    touchHint: 'Tap a lot to build',
    tone: 'make',
  },
  road: {
    icon: 'road',
    title: () => 'Laying highways',
    hint: 'Drag to lay · ends snap onto highways · click to link a spot to the nearest one',
    touchHint: 'Drag to lay · tap to link a spot to the nearest highway',
    tone: 'make',
    extra: upgradeAll,
  },
  bulldoze: {
    icon: 'bulldoze',
    title: () => 'Removing',
    hint: 'Click a building, or drag across highways and channels, to return them to nature',
    touchHint: 'Tap a building twice, or drag across highways',
    tone: 'remove',
  },
  move: {
    icon: 'move',
    title: (ctx) => {
      const eid = ctx.services.get('construction').moving;
      return eid !== null && ctx.city.buildingEntities().includes(eid) ? `Moving ${ctx.city.buildingDef(eid).name}` : 'Moving a building';
    },
    hint: 'Click a lot to move it there · R rotates',
    touchHint: 'Tap a lot, tap again to move · or drag it there',
    tone: 'make',
    extra: (ctx) => ({
      el: h(
        'button',
        { class: 'mb-act', title: 'Rotate (R)', onClick: () => ctx.services.get('construction').rotateMove() },
        icon('rotate'),
        h('span', {}, 'Rotate'),
      ),
    }),
  },
  channel: { icon: 'channel', title: () => 'Digging channels', hint: 'Drag to dig a filtration channel', tone: 'shape' },
  retrofit: { icon: 'retrofit', title: () => 'Bloom Retrofit', hint: 'Click to retrofit the buildings round a spot', tone: 'shape' },
  mist: { icon: 'mist', title: () => 'Flora-Net mist', hint: 'Click to mist the soil round a spot', tone: 'shape' },
  reclaim: { icon: 'reclaim', title: () => 'Reclaiming land', hint: 'Drag along the coast to raise new land', tone: 'shape' },
  weave: { icon: 'flower', title: () => 'Green Weaver', hint: 'Click a tower, then a second one (or the same one again)', tone: 'shape' },
};

/**
 * The mode banner (D-202): while a tool is in hand (placing, highways, removing…), a bar at the bottom centre names
 * the mode in its colour, says how it works and has one Exit button, and a matching frame edges the screen, so the
 * steward always knows a click will build or remove and how to stop. Exit, Esc and right-click all put the tool down.
 * Picking up a tool also closes the inspector: a building selected by accident while building doesn't linger.
 */
export const modeModule: GameModule = {
  id: 'mode',
  deps: ['hud', 'construction'],
  init(ctx) {
    const ico = h('span', { class: 'mb-ico' });
    const title = h('b', { class: 'mb-title' });
    const hint = h('span', { class: 'mb-hint' });
    const exit = h(
      'button',
      { class: 'mb-exit', title: 'Stop (Esc or right-click)', onClick: () => ctx.tools.setActive('select') },
      icon('close'),
      h('span', {}, 'Exit'),
      isTouchDevice() ? null : h('kbd', {}, 'Esc'),
    );
    const bar = h(
      'div',
      { class: 'mode-bar hidden', role: 'status', 'aria-live': 'polite' },
      ico,
      h('div', { class: 'mb-text' }, title, hint),
      exit,
    );
    const extras = new Map<string, { el: HTMLElement; sync?: () => void }>();
    for (const [id, m] of Object.entries(MODES)) {
      if (!m.extra) continue;
      const x = m.extra(ctx);
      x.el.classList.add('hidden-mode');
      extras.set(id, x);
      bar.insertBefore(x.el, exit);
    }
    const frame = h('div', { class: 'mode-frame hidden', 'aria-hidden': 'true' });
    document.body.append(frame, bar);

    let current = 'select';
    let syncT = 0;
    const show = (id: string) => {
      current = id;
      const m = MODES[id];
      for (const t of ['make', 'remove', 'shape'] as Tone[]) {
        bar.classList.toggle(`tone-${t}`, m?.tone === t);
        frame.classList.toggle(`tone-${t}`, m?.tone === t);
      }
      bar.classList.toggle('hidden', !m);
      for (const [eid, x] of extras) {
        x.el.classList.toggle('hidden-mode', eid !== id);
        if (eid === id) x.sync?.();
      }
      frame.classList.toggle('hidden', !m);
      document.body.classList.toggle('tool-mode', !!m);
      if (!m) return;
      ico.replaceChildren(icon(m.icon));
      setText(title, m.title(ctx));
      setText(hint, (isTouchDevice() && m.touchHint) || m.hint);
    };
    ctx.bus.on('tool:changed', ({ id }) => {
      // A tool in hand: an open inspector (often a building clicked by accident) steps aside.
      if (id !== 'select') ctx.bus.emit('selection:changed', { eid: null });
      show(id);
      // Full view (D-206, D-210): every tool in hand (placing a building, highways, removing, shaping) gets the whole
      // map; the panels fade away and come back as they were when it is put down (Exit, Esc, right-click or another
      // tool); the banner keeps the way out on screen.
      document.body.classList.toggle('view-max', id in MODES);
    });
    // Films, explore modes and dialogs that suspend tools hide the banner with them.
    ctx.systems.add({
      id: 'mode.banner',
      phase: 'render',
      order: 106,
      update: (_c, f) => {
        const off = ctx.tools.suspended || ctx.loading || !!ctx.services.tryGet('moments')?.playing;
        bar.classList.toggle('mb-off', off);
        if (!off && (syncT += f.dt) > 0.2) {
          syncT = 0;
          extras.get(current)?.sync?.();
        }
        frame.classList.toggle('mb-off', off);
      },
    });
    ctx.bus.on('city:reset', () => {
      show('select');
      document.body.classList.remove('view-max');
    });
    show(ctx.tools.active?.id ?? current);
  },
};
