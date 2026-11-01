import type { GameModule } from '@/game/context';
import { shippedDocs } from '@/content/knowledge';
import { referenceDocs } from '@/sim/knowledgeRefs';
import { clockLabel } from '@/sim/hazards';
import { TIERS, type SystemKey } from '@/sim/pulseState';
import { SYSTEM_LABELS } from '@/modules/pulse/PulsePanel';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { KnowledgeBase } from './base';
import { describeActions } from './actions';
import { knowledgeTools } from './tools';
import { Vault } from './Vault';
import './knowledge.css';

/**
 * Seedvault (D-088): the city's knowledge base. Shipped guides (`docs/knowledge/`), a live reference generated
 * from the game's rules, and a journal kept on the device: the steward's and Flora's notes, and field logs the
 * city writes itself (every finished incident, every consequence that came into force, and every system that
 * fell and recovered, with what the steward did meanwhile). The steward reads it in the Seedvault dialog
 * (**?** / F1 or the book in the top bar); Flora reads it through two-level retrieval tools.
 */
export interface KnowledgeService {
  /** Opens the Seedvault on a doc (and section), or on its start page. */
  open(id?: string, section?: string): void;
  toggle(open?: boolean): void;
  readonly isOpen: boolean;
  readonly base: KnowledgeBase;
}

const GOOD_RULES = new Set(['harmony-streak', 'transit-city']);
export const knowledgeModule: GameModule = {
  id: 'knowledge',
  deps: ['hud', 'pulse'],
  init(ctx) {
    const kb = new KnowledgeBase([...shippedDocs(), ...referenceDocs()], ctx.platform.knowledge);
    void kb.load();
    const vault = new Vault(ctx, kb);
    const open = (id?: string, section?: string) => vault.show(id, section);

    for (const t of knowledgeTools(kb, { open })) ctx.services.get('agent').register(t);

    ctx.services.get('hud').lead.append(
      h(
        'button',
        {
          class: 'icon-btn kb-open',
          title: 'Seedvault: guides, runbooks and field logs (?)',
          'aria-label': 'Open the Seedvault knowledge base',
          onClick: () => vault.toggle(),
        },
        icon('book'),
      ),
    );
    ctx.input.onKey((e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return false;
      if (e.code === 'F1' || (e.key === '?' && e.shiftKey)) return (vault.toggle(), true);
      if (e.code === 'Escape' && vault.isOpen) return (vault.toggle(false), true);
      return false;
    });
    ctx.systems.add({ id: 'knowledge', phase: 'render', order: 131, update: (_c, f) => vault.update(f.dt) });

    // ── Field logs: the city writes down what happened ──
    const cityName = () => ctx.city.growth.name || 'BloomGrid';
    ctx.bus.on('incident:logged', ({ record: r }) => {
      if (ctx.loading) return;
      void kb.recordIncident(r.kind, {
        city: cityName(),
        clock: clockLabel(r.endTick),
        name: r.kind === 'fire' ? 'Fire' : r.name,
        icon: r.icon,
        severity: r.severity,
        district: r.district,
        ...(r.cause ? { cause: r.cause } : {}),
        hits: r.hits,
        lost: r.lost,
        fires: r.fires,
        displaced: r.displaced,
        cost: r.cost,
        outcome: r.outcome,
        ...(r.prevented?.length ? { prevented: r.prevented } : {}),
        secs: Math.round((r.endTick - r.startTick) / 10),
      });
    });
    ctx.bus.on('consequence', ({ rule, kind, text }) => {
      if (kind !== 'start' || ctx.loading) return;
      const name = text.split('. ')[0] ?? rule;
      void kb.recordConsequence({
        city: cityName(),
        clock: clockLabel(ctx.city.tick),
        rule,
        name: name.slice(0, 80),
        text,
        good: GOOD_RULES.has(rule),
      });
    });
    // Fix log: a system at Strained or worse that comes back to Stable, with the steward's commands in between.
    const down = new Map<SystemKey, { worst: number; log: number; tick: number }>();
    ctx.bus.on('city:reset', () => down.clear());
    ctx.bus.on('pulse:tier', ({ system, tier }) => {
      if (ctx.loading || !ctx.city.pulse.primed) return;
      const d = down.get(system);
      if (tier >= 2) {
        if (!d) down.set(system, { worst: tier, log: ctx.commands.log.length, tick: ctx.city.tick });
        else d.worst = Math.max(d.worst, tier);
        return;
      }
      if (!d) return;
      down.delete(system);
      const secs = Math.round((ctx.city.tick - d.tick) / 10);
      if (secs < 5) return;
      void kb.recordRecovery({
        city: cityName(),
        clock: clockLabel(ctx.city.tick),
        system: SYSTEM_LABELS[system],
        worst: TIERS[d.worst]!,
        back: TIERS[tier]!,
        secs,
        actions: describeActions(ctx.commands.log.slice(Math.min(d.log, ctx.commands.log.length))),
      });
    });

    ctx.services.provide('knowledge', {
      open,
      toggle: (o?: boolean) => vault.toggle(o),
      get isOpen() {
        return vault.isOpen;
      },
      base: kb,
    });
  },
};

declare module '@/core/Services' {
  interface GameServices {
    knowledge: KnowledgeService;
  }
}
