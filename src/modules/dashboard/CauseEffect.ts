import type { GameContext } from '@/game/context';
import { RULES, activeRules, measure, type Measures } from '@/sim/consequences';
import { riskReport } from '@/sim/risk';
import { POLICIES, isActive } from '@/sim/policies';
import { creditGrade } from '@/sim/consequenceState';
import { DAY_LENGTH } from '@/sim/pulseConst';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';

const fmt = (n: number) => Math.round(n).toLocaleString();
const clockOf = (tick: number) => {
  const t = (tick / 10 / DAY_LENGTH + 0.3) % 1;
  const m = Math.floor(t * 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Dashboard Cause & effect tab (D-074): the rules in force now (what caused them, what they do, how strong), the
 * slow stocks (credit rating, tourism reputation) with their money, the rules still dormant, and the feed of
 * rules coming into force and easing off, newest first, each with a fly-to when it has a place.
 */
export class CauseEffect {
  readonly el = h('div', { class: 'ce' });

  constructor(private ctx: GameContext) {}

  render(): void {
    const { city } = this.ctx;
    const st = city.consequences;
    const active = activeRules(city);
    const s = city.stats;
    const stock = (label: string, v: string, sub: string) =>
      h(
        'div',
        { class: 'db-tile' },
        h('div', { class: 'db-tile-k' }, label),
        h('div', { class: 'db-tile-v' }, v),
        h('div', { class: 'db-tile-s' }, sub),
      );
    this.el.replaceChildren(
      h(
        'div',
        { class: 'db-tiles' },
        stock(
          'Credit rating',
          creditGrade(st.credit),
          `${Math.round(st.credit * 100)}% · loans ${st.mods.interest > 0 ? `+${(st.mods.interest * 100).toFixed(1)}% interest` : 'at base rate'}`,
        ),
        stock(
          'Reputation',
          `${Math.round(st.reputation * 100)}%`,
          `visitors +${s.tourism.toFixed(1)}/s · ◈${fmt(st.tourismIncome)} so far`,
        ),
        stock('Insurance', `−${s.insurance.toFixed(1)}/s`, `◈${fmt(st.insurancePaid)} paid so far`),
        stock(
          'Harmony streak',
          `${(st.harmonyStreak / DAY_LENGTH).toFixed(1)} d`,
          'days at 70+ (a city people love after 1)',
        ),
      ),
      // Ordinances the steward chose (plan v5, Phase 25): causes by decision rather than by drift.
      ...(() => {
        const laws = POLICIES.filter((p) => isActive(city, p.id));
        if (!laws.length) return [];
        return [
          h('h3', {}, `Ordinances · ${laws.length}`),
          h(
            'div',
            { class: 'ce-list' },
            ...laws.map((p) =>
              h(
                'div',
                { class: 'ce-rule' },
                h('div', { class: 'ce-head' }, icon(p.icon), h('b', {}, p.name)),
                h('p', {}, h('span', { class: 'ce-k' }, 'Gain'), p.upside),
                h('p', {}, h('span', { class: 'ce-k' }, 'Cost'), p.downside),
              ),
            ),
          ),
        ];
      })(),
      h('h3', {}, active.length ? `In force · ${active.length}` : 'In force'),
      active.length
        ? h(
            'div',
            { class: 'ce-list' },
            ...active.map(({ rule, level }) =>
              h(
                'div',
                { class: 'ce-rule' },
                h(
                  'div',
                  { class: 'ce-head' },
                  icon(rule.icon),
                  h('b', {}, rule.name),
                  h('span', { class: 'ce-bar' }, h('i', { style: `width:${Math.round(level * 100)}%` })),
                ),
                h('p', {}, h('span', { class: 'ce-k' }, 'Cause'), rule.cause(city, measureCache(city))),
                h('p', {}, h('span', { class: 'ce-k' }, 'Effect'), rule.effect),
              ),
            ),
          )
        : h('p', { class: 'ce-note' }, 'Nothing in force: the city is in balance.'),
      h('h3', {}, 'Hazard risk'),
      h(
        'div',
        { class: 'ce-risks' },
        ...riskReport(city).map((r) =>
          h(
            'div',
            { class: `ce-risk ${r.level.toLowerCase()}` },
            h('div', { class: 'ce-head' }, icon(r.icon), h('b', {}, r.name), h('span', { class: 'ce-level' }, r.level)),
            h('ul', {}, ...r.factors.map((f) => h('li', { class: f.mul > 1.05 ? 'up' : f.mul < 0.95 ? 'down' : '' }, `${f.mul > 1.05 ? '▲' : f.mul < 0.95 ? '▼' : '·'} ${f.label}`))),
            h('p', {}, h('span', { class: 'ce-k' }, 'Lower it'), ' ', r.advice),
          ),
        ),
      ),
      h('h3', {}, 'Watching for'),
      h(
        'div',
        { class: 'ce-dormant' },
        ...RULES.filter((r) => !active.some((a) => a.rule === r)).map((r) =>
          h('span', { title: r.effect }, icon(r.icon), r.name),
        ),
      ),
      h('h3', {}, 'Feed'),
      h(
        'div',
        { class: 'ce-feed' },
        ...(st.feed.length
          ? [...st.feed].reverse().map((f) =>
              h(
                f.x !== undefined ? 'button' : 'div',
                {
                  class: `ce-item ${f.kind}`,
                  ...(f.x !== undefined ? { onClick: () => this.ctx.cameraCtl.flyTo(f.x!, f.z!, 60) } : {}),
                },
                h('span', { class: 'ce-when' }, `Day ${f.day} · ${clockOf(f.tick)}`),
                h('span', {}, f.text),
              ),
            )
          : [h('p', { class: 'ce-note' }, 'No events yet.')]),
      ),
    );
  }
}

/** Measurements for cause texts, at most once a second (one pass over the buildings). */
let cached: { tick: number; m: Measures } | null = null;
function measureCache(city: GameContext['city']): Measures {
  if (!cached || Math.abs(city.tick - cached.tick) >= 10) cached = { tick: city.tick, m: measure(city) };
  return cached.m;
}
