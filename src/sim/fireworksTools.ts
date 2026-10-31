import type { AgentTool } from '@/core/AgentTools';
import type { ActionCtx } from './actionTools';
import { buildingId } from './inventory';
import {
  FIREWORK_DEFS,
  GRAND_SHELLS,
  MIN_SHELLS,
  SHOW_FEE,
  SHOW_SHELLS,
  clockOf,
  launchBlocker,
  launchSites,
  novelty,
  stockTotal,
  storage,
} from './fireworks';
import { FIREWORK_KINDS, FIREWORK_SHAPES, type FireworkShape } from './fireworksState';
import { SKY_TEXT_MAX, skyText } from '@/content/skyFont';

/**
 * Fireworks tools for the city assistant and scripts (D-068): stock, shows and their effects; launching a
 * show; switching the nightly show. Plain JSON in and out; changes go through undoable commands.
 */
export const fireworksTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'fireworks_status',
    option: 'Check fireworks stock, shows so far and their effect on harmony',
    description:
      'Fireworks: shells in stock per kind and storage, the factories, whether the nightly 21:00 show is on, the show in the sky now, how many shows have run (with the last few), credits spent and earned from visitors, and the effect right now on harmony (afterglow, novelty fatigue) and pollution (smoke).',
    keywords: ['fireworks', 'firework', 'shells', 'show', 'pyrotechnics', 'celebration', 'party'],
    input: { type: 'object', properties: {} },
    effect: 'read',
    run({ city }) {
      const fw = city.fireworks;
      const nov = novelty(fw);
      return {
        factories: launchSites(city).map(([e]) => buildingId(city, e)),
        stock: Object.fromEntries(FIREWORK_KINDS.map((k) => [FIREWORK_DEFS[k].name, fw.stock[k]])),
        shells: stockTotal(fw.stock),
        storage: storage(city),
        nightlyShow: fw.auto ? `on, at 21:00 when ${SHOW_SHELLS}+ shells are in stock` : 'off',
        showNow: fw.show
          ? { shells: fw.show.shells, fired: fw.show.fired, grand: fw.show.grand, launchedBy: fw.show.cause }
          : null,
        shows: fw.shows,
        recent: fw.history
          .slice(-5)
          .reverse()
          .map((r) => ({ day: r.day, at: clockOf(r.time), shells: r.shells, grand: r.grand, by: r.cause })),
        harmonyNow: Math.round(city.pulse.harmony.fireworks * 10) / 10,
        novelty:
          nov >= 0.75
            ? 'fresh'
            : nov >= 0.3
              ? 'wearing thin'
              : nov >= 0
                ? 'jaded'
                : 'residents complain of the noise',
        smoke: `${Math.round(fw.smog * 100)}%`,
        credits: { spent: Math.round(fw.spent), visitors: Math.round(fw.revenue) },
        canLaunch: launchBlocker(city) ?? 'yes',
      };
    },
  },
  {
    name: 'launch_fireworks',
    option: 'Launch a fireworks show now, optionally writing a message or featuring a shape',
    description: `Launches a fireworks show now from a Fireworks Factory: ${SHOW_SHELLS} shells, or ${GRAND_SHELLS} for a grand show (needs ${MIN_SHELLS}+ in stock; uses what there is). Shows mix in shaped shells (hearts, the five Olympic rings, butterflies); \`shape\` features one of them. \`text\` writes a message in the sky in sparks (up to ${SKY_TEXT_MAX} letters, digits, spaces, ♥ ! ? & - +), e.g. "HAPPY BIRTHDAY". Crew fee ${SHOW_FEE} credits. Lifts harmony and draws visitors, but adds smoke, and shows in quick succession tire residents. Undoable.`,
    keywords: [
      'fireworks',
      'firework',
      'launch',
      'celebrate',
      'celebration',
      'show',
      'party',
      'set off',
      'heart',
      'olympic',
      'butterfly',
      'message',
      'write',
      'spell',
    ],
    llmArgs: ['grand', 'text', 'shape'],
    input: {
      type: 'object',
      properties: {
        grand: {
          type: 'boolean',
          description: `A grand show of ${GRAND_SHELLS} shells (default ${SHOW_SHELLS}).`,
        },
        text: {
          type: 'string',
          description: `A message to write in the sky, e.g. "HAPPY BIRTHDAY" or "I ♥ BLOOMGRID" (up to ${SKY_TEXT_MAX} characters).`,
        },
        shape: {
          type: 'string',
          enum: FIREWORK_SHAPES,
          description: 'Feature one shape: heart, rings (the five Olympic rings) or butterfly.',
        },
      },
    },
    effect: 'mutate',
    run(
      { city, commands },
      { grand = false, text, shape }: { grand?: boolean; text?: string; shape?: FireworkShape },
    ) {
      const why = launchBlocker(city);
      if (why) throw new Error(why);
      const message = text ? skyText(text) : '';
      if (text && !message)
        throw new Error('Nothing in that message can be written in sparks: use letters, digits or ♥.');
      if (!commands.execute('launchFireworks', { grand, text: message || undefined, shape }))
        throw new Error('The show could not launch.');
      const show = city.fireworks.show!;
      return {
        launched: true,
        shells: show.shells,
        grand,
        ...(show.text ? { message: show.text } : {}),
        ...(show.shape ? { featuring: show.shape } : {}),
        fee: show.fee,
        left: stockTotal(city.fireworks.stock),
      };
    },
  },
  {
    name: 'fireworks_nightly',
    option: 'Turn the nightly fireworks show on or off',
    description:
      'Switches the factories’ nightly 21:00 fireworks show on or off (it is on by default). Off saves shells for the steward’s own shows and spares residents the noise. Undoable.',
    keywords: ['fireworks', 'nightly', 'automatic', 'every night', 'stop', 'noise'],
    llmArgs: ['on'],
    input: {
      type: 'object',
      properties: { on: { type: 'boolean', description: 'true = nightly show on, false = off.' } },
      required: ['on'],
    },
    effect: 'mutate',
    run({ city, commands }, { on }: { on: boolean }) {
      if (city.fireworks.auto === on) return { nightlyShow: on ? 'already on' : 'already off' };
      commands.execute('setFireworksAuto', { on });
      return { nightlyShow: on ? 'on' : 'off' };
    },
  },
];
