import { buildings } from '@/content';
import type { GameContext } from '@/game/context';
import type { BuildBlock, GateAction } from '@/sim/buildGate';
import { PROJECTS } from '@/sim/projects';
import { h } from './dom';
import { icon } from './icons';

/**
 * The build gate's steps as HUD (D-130): a short "what next" list where each step that has an action is a button.
 * Used by the Build panel's explanation card and the milestone card; every action runs through the same services
 * and commands as the rest of the HUD.
 */
export function runGate(ctx: GameContext, a: GateAction): void {
  const toast = (text: string, tone: 'ok' | 'bad' = 'ok') => ctx.bus.emit('toast', { text, tone });
  switch (a.kind) {
    case 'category':
      return ctx.services.get('build').open(a.category);
    case 'place':
      ctx.services.get('build').open(buildings.get(a.def).category);
      return ctx.services.get('construction').startBuilding(a.def);
    case 'start':
      if (ctx.commands.execute('startProject', { id: a.project }))
        toast(`${PROJECTS[a.project].name} started (⌘Z undoes)`);
      else toast(`${PROJECTS[a.project].name} can't start yet`, 'bad');
      return;
    case 'goals':
      return ctx.services.get('build').show('goals');
    case 'credits':
      ctx.services.get('build').close();
      return ctx.services.tryGet('statinfo')?.open('credits');
  }
}

const KIND_TITLE: Record<BuildBlock['kind'], string> = {
  capped: 'Limit reached · how to build more',
  locked: 'Locked · how to unlock it',
  credits: 'Not enough credits · what to do',
};

export function gateSteps(ctx: GameContext, block: BuildBlock): HTMLElement {
  return h(
    'div',
    { class: `gate gate-${block.kind}` },
    h(
      'div',
      { class: 'gate-h' },
      icon(block.kind === 'credits' ? 'credits' : block.kind === 'locked' ? 'st-off' : 'st-warn'),
      h('b', {}, KIND_TITLE[block.kind]),
    ),
    h('p', { class: 'gate-why' }, block.reason),
    h(
      'ol',
      { class: 'gate-steps' },
      ...block.steps.map((s) =>
        h(
          'li',
          {},
          h('span', {}, s.text),
          s.act
            ? h(
                'button',
                { class: 'gate-do', onClick: () => runGate(ctx, s.act!.action) },
                s.act.label,
                icon('next'),
              )
            : null,
        ),
      ),
    ),
  );
}
