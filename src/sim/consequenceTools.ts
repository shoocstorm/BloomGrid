import type { AgentTool } from '@/core/AgentTools';
import type { ActionCtx } from './actionTools';
import { RULES, activeRules, measure } from './consequences';
import { creditGrade } from './consequenceState';
import { DAY_LENGTH } from './pulseConst';

/**
 * `why` for the city assistant (D-074): the cause-and-effect rules in force (cause, effect, strength), the slow
 * stocks (credit rating, reputation, insurance), and the feed of what came into force and when, optionally narrowed
 * to a topic ("fish", "fire", "debt"…). Read-only.
 */
export const consequenceTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'why',
    option: 'Explain why things are happening: causes and their effects',
    description:
      'Why the city is the way it is: every cause-and-effect rule in force (e.g. a bare coast making floods worse, a heat island bringing heatwaves, debt lowering the credit rating) with its cause, effect and strength; the credit rating, tourism reputation and insurance premium; and the recent feed of rules coming into force or easing off. `topic` narrows it (e.g. "fishing", "fire", "debt", "harmony").',
    keywords: ['why', 'because', 'cause', 'reason', 'explain', 'consequence', 'effect', 'happening'],
    llmArgs: ['topic'],
    input: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Optional subject, e.g. "fishing", "fire", "debt".' },
      },
    },
    effect: 'read',
    run({ city }, { topic }: { topic?: string }) {
      const m = measure(city);
      const t = topic?.toLowerCase().trim();
      const hit = (s: string) => !t || s.toLowerCase().includes(t);
      const st = city.consequences;
      const inForce = activeRules(city)
        .map(({ rule, level, since }) => ({
          rule: rule.name,
          strength: `${Math.round(level * 100)}%`,
          cause: rule.cause(city, m),
          effect: rule.effect,
          sinceDays: Math.round(((city.tick - since) / 10 / DAY_LENGTH) * 10) / 10,
        }))
        .filter((r) => hit(`${r.rule} ${r.cause} ${r.effect}`));
      return {
        inForce,
        watching: RULES.filter(
          (r) => !inForce.some((a) => a.rule === r.name) && hit(`${r.name} ${r.effect}`),
        ).map((r) => r.name),
        creditRating: `${creditGrade(st.credit)} (${Math.round(st.credit * 100)}%)`,
        reputation: `${Math.round(st.reputation * 100)}%`,
        visitorsPerSecond: Math.round(city.stats.tourism * 10) / 10,
        insurancePerSecond: Math.round(city.stats.insurance * 10) / 10,
        recent: st.feed
          .filter((f) => hit(f.text))
          .slice(-6)
          .reverse()
          .map((f) => ({ day: f.day, what: f.text })),
      };
    },
  },
];
