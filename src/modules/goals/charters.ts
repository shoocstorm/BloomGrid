import type { GameContext } from '@/game/context';
import { CHARTERS, MAX_ACTIVE, TIER_NAMES, charterBlock, charterValue, claimable, fmtValue, titles } from '@/sim/charters';
import { ERAS, eraOf, nextEra } from '@/sim/eras';
import { stewardLegacy } from '@/sim/legacy';
import { objectiveViews } from '@/sim/objectives';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const mins = (s: number) => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);

/**
 * The Goals tab's long-term sections (plan v5, Phase 28), shown in every city (the showcase included): a challenge's
 * objectives, the era and what the next one needs, the live legacy score and rank, and the civic charters (take up
 * to three; claim each tier as it is reached). `signature` is the text the tab compares to decide on a rebuild.
 */
export function longTermGoals(ctx: GameContext): { signature(): string; render(): HTMLElement[] } {
  const { city } = ctx;
  const legacy = () => stewardLegacy(city);

  const signature = () => {
    const st = city.charters;
    const parts: (string | number)[] = [st.era, st.active.join(), JSON.stringify(st.reached), JSON.stringify(st.claimed), legacy().score];
    for (const id of st.active) {
      const d = CHARTERS.find((c) => c.id === id)!;
      parts.push(fmtValue(d, charterValue(city, d)));
    }
    for (const v of objectiveViews(city)) parts.push(v.status, v.done ? 1 : 0, v.left === null ? '' : Math.round(v.left / 10));
    parts.push(st.challenge?.status ?? '');
    const n = nextEra(city);
    if (n) for (const x of n.needs) parts.push(Math.min(x.have, x.need));
    return parts.join('|');
  };

  const challenge = (): HTMLElement[] => {
    const run = city.charters.challenge;
    const views = objectiveViews(city);
    if (!run || !views.length) return [];
    const state = run.status === 'won' ? 'Won' : run.status === 'lost' ? 'Lost' : 'In play';
    return [
      h('div', { class: 'pulse-title' }, `Challenge · ${state}`),
      h(
        'div',
        { class: `gl-card gl-challenge ${run.status}` },
        ...views.map((v) =>
          h(
            'div',
            { class: `gl-obj ${v.done ? 'ok' : ''}` },
            icon(v.done ? 'st-ok' : v.spec.kind === 'keep-tiers' ? 'st-warn' : 'st-off'),
            h('div', {}, h('b', {}, v.spec.label), h('span', {}, v.status)),
            v.left !== null && run.status === 'playing' ? h('span', { class: 'gl-obj-time' }, mins(v.left)) : null,
          ),
        ),
        run.status !== 'playing'
          ? h('p', { class: 'gl-note' }, run.status === 'won' ? 'Well steered. The city plays on: take up a charter next.' : 'The council noted it. The city plays on as free play, or start the challenge again from the New Chapter dialog.')
          : null,
      ),
    ];
  };

  const era = (): HTMLElement[] => {
    const e = eraOf(city);
    const n = nextEra(city);
    const l = legacy();
    const t = titles(city);
    return [
      h('div', { class: 'pulse-title' }, 'Era and legacy'),
      h(
        'div',
        { class: 'gl-card gl-era' },
        h(
          'div',
          { class: 'gl-head' },
          h('span', { class: 'gl-ico' }, icon(e.icon)),
          h('b', {}, `${e.name} era`),
          h('span', { class: 'gl-state' }, `${city.charters.era + 1} / ${ERAS.length}`),
        ),
        h('p', { class: 'gl-desc' }, e.line),
        n
          ? h(
              'ul',
              { class: 'gl-crit' },
              ...n.needs.map((x) =>
                h('li', { class: x.have >= x.need ? 'ok' : '' }, icon(x.have >= x.need ? 'st-ok' : 'st-off'), `${n.era.name}: ${fmt(Math.min(x.have, x.need))} / ${fmt(x.need)} ${x.label}`),
              ),
            )
          : h('p', { class: 'gl-note' }, 'The last era: the city is in full bloom.'),
        h(
          'div',
          { class: 'gl-legacy' },
          h('span', {}, 'Legacy'),
          h('b', {}, fmt(l.score)),
          h('span', { class: 'gl-stars', 'aria-label': `${l.stars} of 5` }, ...Array.from({ length: 5 }, (_, i) => h('i', { class: i < l.stars ? 'on' : '' }))),
          h('em', {}, t.length ? t[t.length - 1]! : l.rank.title),
        ),
      ),
    ];
  };

  const charters = (): HTMLElement[] => {
    const st = city.charters;
    const cards = CHARTERS.map((d) => {
      const active = st.active.includes(d.id);
      const reached = st.reached[d.id] ?? 0;
      const claimedN = st.claimed[d.id] ?? 0;
      const ready = claimable(city, d.id);
      const done = reached >= 3;
      const next = d.tiers[Math.min(2, reached)]!;
      const v = active ? charterValue(city, d) : 0;
      const block = active || done ? null : charterBlock(city, d.id);
      return h(
        'div',
        { class: `gl-card gl-charter ${active ? 'running' : ''} ${ready ? 'ready' : ''} ${done && !ready ? 'open' : ''}` },
        h(
          'div',
          { class: 'gl-head' },
          h('span', { class: 'gl-ico' }, icon(d.icon)),
          h('b', {}, d.name),
          h('span', { class: 'gl-medals' }, ...TIER_NAMES.map((t, i) => h('i', { class: `m${i} ${i < claimedN ? 'won' : i < reached ? 'got' : ''}`, title: t }))),
        ),
        h('p', { class: 'gl-desc' }, d.description),
        active && !done
          ? h(
              'div',
              {},
              h('div', { class: 'gl-bar' }, h('i', { style: `width:${Math.round(Math.min(1, v / next.need) * 100)}%` })),
              h('p', { class: 'gl-note' }, `${TIER_NAMES[Math.min(2, reached)]}: ${fmtValue(d, v)} of ${fmtValue(d, next.need)} · ${d.lever}`),
            )
          : null,
        h(
          'div',
          { class: 'gl-foot' },
          h(
            'span',
            {},
            done
              ? claimedN >= 3
                ? `Gold · ${d.tiers[2].title}`
                : 'Gold reached'
              : next.reward
                ? `Next: ◈${fmt(next.reward)}`
                : `Next: ${next.perk?.name ?? ''}${next.title ? ` + title “${next.title}”` : ''}`,
          ),
          ready
            ? h(
                'button',
                { class: 'gl-start gl-claim', title: 'Claim the tier', onClick: () => ctx.commands.execute('claimCharter', { id: d.id }, false) },
                `Claim ${TIER_NAMES[claimedN]}`,
              )
            : done
              ? null
              : h(
                  'button',
                  {
                    class: 'gl-start',
                    disabled: !!block,
                    title: active ? 'Drop it (its progress resets; tiers reached are kept)' : (block ?? 'Take it up'),
                    onClick: () => ctx.commands.execute('setCharter', { id: d.id, on: !active }),
                  },
                  active ? 'Drop' : 'Take up',
                ),
        ),
      );
    });
    return [h('div', { class: 'pulse-title' }, `Charters · ${st.active.length} / ${MAX_ACTIVE} under way`), ...cards];
  };

  return { signature, render: () => [...challenge(), ...era(), ...charters()] };
}
