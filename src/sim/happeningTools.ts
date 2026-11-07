import type { AgentTool } from '@/core/AgentTools';
import type { ActionCtx } from './actionTools';
import { HAPPENING_NAMES, askName, describeHappening, requestReward } from './happenings';
import { PULSE_TICKS } from './pulseConst';

/**
 * Happenings for the city assistant (D-123): what the residents are asking for or what good surprise is on, the
 * time left, and the last few outcomes. Read-only: claiming stays a one-click action on the card.
 */
export const happeningTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'happenings_status',
    option: "Check residents' requests and festivals",
    description:
      "Happenings: the residents' request or good surprise running now (a request for a kind of building nearby, a street festival, a bumper catch, a cruise visit), where it is, what it needs, the reward and the time left; plus the last few outcomes (claimed, missed, done).",
    keywords: [
      'request',
      'residents',
      'ask',
      'festival',
      'cruise',
      'catch',
      'happening',
      'event',
      'visitors',
      'reward',
    ],
    input: { type: 'object', properties: {} },
    effect: 'read',
    run({ city }) {
      const st = city.happenings;
      const h = st.current;
      return {
        now: h
          ? {
              kind: HAPPENING_NAMES[h.kind],
              status: h.status,
              place: h.place,
              summary: describeHappening(city, h),
              ...(h.kind === 'request'
                ? { asks: askName(h.category!), withinTiles: h.radius, reward: h.reward }
                : { visitorCredits: Math.round(h.earned) }),
              secondsLeft: Math.max(0, Math.ceil((h.endTick - city.tick) / PULSE_TICKS)),
            }
          : null,
        nextRequestReward: requestReward(city),
        recent: st.history
          .slice(-5)
          .reverse()
          .map((r) => ({
            kind: HAPPENING_NAMES[r.kind],
            place: r.place,
            outcome: r.outcome,
            credits: r.credits,
          })),
      };
    },
  },
];
