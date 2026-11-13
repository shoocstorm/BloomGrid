import type { GameContext, GameModule } from '@/game/context';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import {
  POLICIES,
  cooldownLeft,
  isActive,
  policiesLocked,
  policyBlock,
  sectorOf,
  type PolicyDef,
} from '@/sim/policies';
import { BUDGET_MAX, BUDGET_MIN, BUDGET_SECTORS, type BudgetSector } from '@/sim/policyState';
import { TAX_MAX, TAX_MIN } from '@/sim/pulseState';
import { paidShare, taxSplit } from '@/sim/finance';
import { upkeepMul } from '@/sim/levels';
import './policies.css';

/**
 * City Pulse → Policies (plan v5, Phase 25): ordinances with their trade-off and running cost, sector budgets and
 * the business tax. Every change is a command (⌘Z undoes it); the panel refreshes at 2 Hz with `setText`.
 */

const SECTOR_LABEL: Record<BudgetSector, [string, string]> = {
  maintenance: [
    'Maintenance',
    'Buildings and highways: below 100% they wear down and roads overgrow; above, crews mend faster.',
  ],
  response: [
    'Emergency response',
    'Fire stations and drones: below 100% fires spread faster; above, slower.',
  ],
  ecology: ['Parks and ecology', 'Parks and gardens: below 100% they give less ecology and the bloom fades.'],
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const per = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));

interface Card {
  def: PolicyDef;
  el: HTMLElement;
  sw: HTMLButtonElement;
  cost: HTMLElement;
  note: HTMLElement;
}

class PoliciesPanel {
  readonly el = h('div', { class: 'pol' });
  private cards: Card[] = [];
  private lock = h('p', { class: 'pol-lock' });
  private sliders = new Map<BudgetSector, { input: HTMLInputElement; val: HTMLElement; paid: HTMLElement }>();
  private biz!: { input: HTMLInputElement; val: HTMLElement; paid: HTMLElement };
  private total = h('b');
  private timer = 0;

  constructor(private ctx: GameContext) {
    const toast = (text: string, tone: 'ok' | 'bad' = 'ok') => ctx.bus.emit('toast', { text, tone });
    for (const def of POLICIES) {
      const sw = h('button', {
        class: 'pol-sw',
        role: 'switch',
        'aria-label': def.name,
      }) as HTMLButtonElement;
      const cost = h('span', { class: 'pol-cost' });
      const note = h('small', { class: 'pol-note' });
      sw.addEventListener('click', () => {
        const on = !isActive(ctx.city, def.id);
        const why = policyBlock(ctx.city, def.id, on);
        if (why) return toast(why, 'bad');
        if (ctx.commands.execute('setPolicy', { id: def.id, on }))
          toast(`${def.name} ${on ? 'in force' : 'repealed'} (⌘Z undoes)`);
        this.refresh();
      });
      const el = h(
        'div',
        { class: 'pol-card' },
        h(
          'div',
          { class: 'pol-h' },
          h('span', { class: 'pol-ic' }, icon(def.icon)),
          h('b', {}, def.name),
          sw,
        ),
        h('p', { class: 'pol-up' }, def.upside),
        h('p', { class: 'pol-down' }, def.downside),
        h('div', { class: 'pol-f' }, cost, note),
      );
      this.cards.push({ def, el, sw, cost, note });
    }

    const budgets = h('div', { class: 'pulse-sec' }, h('div', { class: 'pulse-title' }, 'Budgets'));
    const slider = (
      label: string,
      title: string,
      min: number,
      max: number,
      step: number,
      onChange: (v: number) => void,
    ) => {
      const input = h('input', { type: 'range', min, max, step }) as HTMLInputElement;
      const val = h('b');
      const paid = h('small');
      input.addEventListener('input', () => setText(val, `${input.value}%`));
      input.addEventListener('change', () => onChange(Number(input.value) / 100));
      budgets.append(
        h(
          'div',
          { class: 'pol-slider', title },
          h('div', { class: 'kv' }, h('span', {}, label), val),
          input,
          paid,
        ),
      );
      return { input, val, paid };
    };
    for (const k of BUDGET_SECTORS) {
      const [label, title] = SECTOR_LABEL[k];
      this.sliders.set(
        k,
        slider(label, title, BUDGET_MIN * 100, BUDGET_MAX * 100, 5, (v) => {
          if (ctx.commands.execute('setBudget', { sector: k, value: v }))
            toast(`${label} budget ${Math.round(v * 100)}% (⌘Z undoes)`);
        }),
      );
    }
    this.biz = slider(
      'Business tax',
      'Tax on workplaces. Above 15% shops and works hire fewer people.',
      TAX_MIN * 100,
      TAX_MAX * 100,
      1,
      (v) => {
        if (ctx.commands.execute('setBusinessTax', { rate: v }))
          toast(`Business tax ${Math.round(v * 100)}% (⌘Z undoes)`);
      },
    );

    this.el.append(
      h(
        'div',
        { class: 'pulse-sec' },
        h('div', { class: 'pulse-title' }, 'Ordinances'),
        this.lock,
        h('div', { class: 'kv' }, h('span', {}, 'Running cost'), this.total),
        ...this.cards.map((c) => c.el),
      ),
      budgets,
    );
    ctx.bus.on('policy:changed', () => this.refresh());
  }

  update(dt: number): void {
    this.timer += dt;
    if (this.timer < 0.5 || !this.el.isConnected || !this.el.offsetParent) return;
    this.timer = 0;
    this.refresh();
  }

  private refresh(): void {
    const city = this.ctx.city;
    const locked = policiesLocked(city);
    setText(this.lock, locked ?? '');
    this.lock.hidden = !locked;
    setText(this.total, city.stats.policyCost > 0 ? `−◈${per(city.stats.policyCost)}/s` : 'none');
    for (const c of this.cards) {
      const on = isActive(city, c.def.id);
      const block = policyBlock(city, c.def.id, !on);
      c.el.classList.toggle('on', on);
      c.sw.setAttribute('aria-checked', String(on));
      c.sw.classList.toggle('blocked', !!block);
      c.sw.title = block ?? (on ? 'Repeal' : 'Enact');
      const run = c.def.perSec(city);
      setText(
        c.cost,
        `${on ? '' : `Enact ◈${fmt(c.def.enact)} · `}${run > 0.05 ? `◈${per(run)}/s` : 'no running cost'}`,
      );
      const wait = cooldownLeft(city, c.def.id);
      setText(c.note, wait > 0 ? `can change in ${Math.ceil(wait)} s` : !on && block ? block : '');
    }
    // Designed upkeep per sector, and what is paid at the budget.
    const designed: Record<BudgetSector, number> = { maintenance: 0, response: 0, ecology: 0 };
    for (const e of city.buildingEntities()) {
      const d = city.buildingDef(e);
      designed[sectorOf(d)] += d.stats.upkeep * upkeepMul(e);
    }
    for (const k of BUDGET_SECTORS) {
      const s = this.sliders.get(k)!;
      const v = Math.round(city.policies.budget[k] * 100);
      if (document.activeElement !== s.input) s.input.value = String(v);
      setText(s.val, `${v}%`);
      setText(s.paid, `pays ◈${per(designed[k] * paidShare(city, k))}/s of ◈${per(designed[k])}/s planned`);
    }
    const r = Math.round(city.policies.businessRate * 100);
    if (document.activeElement !== this.biz.input) this.biz.input.value = String(r);
    setText(this.biz.val, `${r}%`);
    setText(this.biz.paid, `brings in ◈${per(taxSplit(city).business)}/s`);
  }
}

export const policiesModule: GameModule = {
  id: 'policies',
  deps: ['pulse', 'hud'],
  init(ctx) {
    const panel = new PoliciesPanel(ctx);
    ctx.services.get('pulse').addTab('policies', 'Policies', 'pen', panel.el);
    ctx.systems.add({ id: 'policies', phase: 'render', order: 136, update: (_c, f) => panel.update(f.dt) });
  },
};
