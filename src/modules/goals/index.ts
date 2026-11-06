import { buildings } from '@/content';
import type { GameModule } from '@/game/context';
import { PROJECTS, PROJECT_IDS, projectProgress, projectStatus } from '@/sim/projects';
import { WONDERS } from '@/sim/wonders';
import { MILESTONES, claimableMilestones, milestoneDone, openMilestones } from '@/sim/milestones';
import { DAY_LENGTH } from '@/sim/pulseConst';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { isCompact } from '@/platform/device';
import './goals.css';

const fmt = (n: number) => Math.round(n).toLocaleString();

/**
 * Goals (Phase 16, D-072): the City Pulse tab for a growing city. Unlock projects (Sky-lane charter, the Aeroline,
 * Wake Flora) with their criteria ticked live, cost, duration, a Start button and a progress bar; the sea wonders
 * found and what will reveal the rest; and the fishing fleet's stock and income. Rebuilt at 1 Hz while shown, and
 * on project and wonder events. A city without progression (the showcase) says everything is open. On phones,
 * where the console shows only the pulse, the panel sits at the top of the City Pulse sheet instead (its phone
 * home), shown only while there is something to earn.
 */
export const goalsModule: GameModule = {
  id: 'goals',
  deps: ['pulse', 'hud'],
  init(ctx) {
    const { city } = ctx;
    const pulse = ctx.services.get('pulse');
    const el = h('div', { class: 'goals' });
    const tab = pulse.addTab('goals', 'Goals', '✧', el);
    let key = '';
    /** Read by the 1 Hz refresh: only while its tab is open. */
    const shown = () => tab.selected;

    const render = () => {
      const g = city.growth;
      el.classList.toggle('gl-open', !g.progression);
      if (!g.progression) {
        const k = 'open';
        if (k === key) return;
        key = k;
        el.replaceChildren(
          h('div', { class: 'pulse-title' }, 'Goals'),
          h(
            'p',
            { class: 'gl-note' },
            'Everything is open in this city: the sky-lanes, the Aeroline, Flora and every sea wonder. Found a fresh island (Settings → Found a new city) to earn them.',
          ),
        );
        return;
      }
      const projects = PROJECT_IDS.map((id) => {
        const def = PROJECTS[id];
        const status = projectStatus(city, id);
        const run = g.projects.find((r) => r.id === id);
        const crit = def.criteria(city);
        const card = h(
          'div',
          { class: `gl-card ${status}` },
          h(
            'div',
            { class: 'gl-head' },
            h('span', { class: 'gl-ico' }, icon(def.icon)),
            h('b', {}, def.name),
            h(
              'span',
              { class: 'gl-state' },
              status === 'open'
                ? 'Done'
                : status === 'running'
                  ? 'Under way'
                  : status === 'ready'
                    ? 'Ready'
                    : 'Locked',
            ),
          ),
          h('p', { class: 'gl-desc' }, def.description),
          h('p', { class: 'gl-unlocks' }, h('span', {}, 'Unlocks '), def.unlocks),
        );
        if (status === 'running' && run) {
          const k = projectProgress(city, run);
          const left = Math.max(0, (run.endTick - city.tick) / 10);
          card.append(
            h('div', { class: 'gl-bar' }, h('i', { style: `width:${Math.round(k * 100)}%` })),
            h(
              'p',
              { class: 'gl-note' },
              `${Math.round(k * 100)}% · ${left > 90 ? `${Math.round(left / 60)} min` : `${Math.round(left)} s`} of sim time left`,
            ),
          );
        } else if (status !== 'open') {
          card.append(
            h(
              'ul',
              { class: 'gl-crit' },
              ...crit.map((c) =>
                h(
                  'li',
                  { class: c.ok ? 'ok' : '' },
                  icon(c.ok ? 'st-ok' : 'st-off'),
                  c.label,
                  // One click to pick up what meets it (D-092).
                  !c.ok && c.build && buildings.has(c.build)
                    ? h(
                        'button',
                        { class: 'gl-do', title: `Build a ${buildings.get(c.build).name}`, onClick: () => ctx.services.get('construction').startBuilding(c.build!) },
                        icon('build'),
                        'Build',
                      )
                    : null,
                ),
              ),
            ),
            h(
              'div',
              { class: 'gl-foot' },
              h(
                'span',
                {},
                `◈${fmt(def.cost)} · ${def.days >= 1 ? `${def.days} day${def.days > 1 ? 's' : ''}` : def.days * 24 >= 2 ? `${Math.round(def.days * 24)} h` : `${Math.round(def.days * DAY_LENGTH)} s`} of work`,
              ),
              h(
                'button',
                {
                  class: 'gl-start',
                  disabled: status !== 'ready',
                  title:
                    status === 'ready'
                      ? 'Start the project'
                      : city.credits < def.cost
                        ? 'Not enough credits'
                        : 'Meet every criterion first',
                  onClick: () => ctx.commands.execute('startProject', { id }),
                },
                'Start',
              ),
            ),
          );
        }
        return card;
      });
      const wonders = WONDERS.map((w) => {
        const found = g.wonders.includes(w.id);
        return h(
          'div',
          { class: `gl-wonder ${found ? 'found' : ''}` },
          icon(found ? 'st-ok' : 'st-off'),
          h('b', {}, found ? w.name : '???'),
          h('span', {}, found ? 'Discovered' : w.hint),
        );
      });
      // Steward milestones (D-118): the next few, with a Claim button once reached.
      const milestones = openMilestones(city)
        .slice(0, 4)
        .map((m) => {
          const p = m.progress(city);
          const done = milestoneDone(city, m);
          return h(
            'div',
            { class: `gl-ms ${done ? 'ready' : ''}` },
            h('span', { class: 'gl-ico' }, icon(m.icon)),
            h('div', { class: 'gl-ms-text' }, h('b', {}, m.title), h('span', {}, m.hint), h('div', { class: 'gl-bar' }, h('i', { style: `width:${Math.round(Math.min(1, p.have / p.need) * 100)}%` }))),
            done
              ? h(
                  'button',
                  { class: 'gl-start gl-claim', title: 'Claim the reward', onClick: () => ctx.commands.execute('claimMilestone', { id: m.id }, false) },
                  `◈${fmt(m.reward)}`,
                )
              : h('span', { class: 'gl-ms-reward' }, `◈${fmt(m.reward)}`),
          );
        });
      const s = city.stats;
      el.replaceChildren(
        h('div', { class: 'pulse-title' }, `Milestones · ${g.milestones.length} / ${MILESTONES.length}`),
        ...(milestones.length ? milestones : [h('p', { class: 'gl-note' }, 'Every milestone claimed. The island is in good hands.')]),
        h('div', { class: 'pulse-title' }, 'Unlock projects'),
        ...projects,
        h('div', { class: 'pulse-title' }, 'Sea wonders'),
        h('div', { class: 'gl-wonders' }, ...wonders),
        h('div', { class: 'pulse-title' }, 'Fishing fleet'),
        h(
          'div',
          { class: 'gl-fish' },
          h('span', {}, 'Fish stock'),
          h('b', {}, `${Math.round(g.fish * 100)}%`),
          h('span', {}, 'Catch'),
          h('b', {}, `+${s.fishing.toFixed(1)}/s`),
          h('span', {}, 'Earned'),
          h('b', {}, `◈${fmt(g.fishIncome)}`),
        ),
      );
      if (g.fish < 0.45)
        el.append(
          h(
            'p',
            { class: 'gl-note warn' },
            'The sea is overfished: fewer boats (or a cleaner coast) let the stock recover.',
          ),
        );
      key = '';
    };

    const badge = () => {
      const g = city.growth;
      const ready = g.progression
        ? PROJECT_IDS.filter((id) => projectStatus(city, id) === 'ready').length + claimableMilestones(city).length
        : 0;
      tab.setBadge(ready ? String(ready) : '', ready ? 'warn' : '');
      // Phones keep the console folded over the city: say once when a project becomes ready to start.
      if (!g.progression) return;
      for (const id of PROJECT_IDS) {
        const now = projectStatus(city, id) === 'ready';
        if (now && !told.has(id) && isCompact())
          ctx.bus.emit('toast', { text: `${PROJECTS[id].name} is ready to start: open City Pulse`, tone: 'ok' });
        if (now) told.add(id);
        else told.delete(id);
      }
    };
    const told = new Set<string>();
    let timer = 0;
    ctx.systems.add({
      id: 'goals',
      phase: 'render',
      order: 112,
      update(_c, f) {
        timer += f.dt;
        if (timer < 1) return;
        timer = 0;
        badge();
        if (shown()) render();
      },
    });
    for (const ev of [
      'project:start',
      'project:done',
      'wonder:discovered',
      'milestone:claimed',
      'city:reset',
      'load:done',
    ] as const)
      ctx.bus.on(ev, () => ((key = ''), render(), badge()));
    ctx.bus.on('project:done', ({ id }) =>
      ctx.bus.emit('toast', { text: `✓ ${PROJECTS[id].name} complete: ${PROJECTS[id].unlocks}`, tone: 'ok' }),
    );
    render();
  },
};
