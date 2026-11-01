import type { AgentTool } from '@/core/AgentTools';
import { Building, Service } from '@/ecs/components';
import type { ActionCtx } from './actionTools';
import { riskReport } from './risk';
import { EVACUATE_COST, GATES_COST, evacuateBlocker, gatesBlocker } from './disasters';
import { getCrisis } from './crises';
import { PULSE_TICKS } from './pulseConst';

/**
 * Hazard risk and preparation for the city assistant (D-076): how likely and harmful each hazard is now and why
 * (with what would lower it), and the steward's emergency moves: evacuate, close the Tide Gates, feather turbines.
 */
export const riskTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'risk_status',
    option: 'Check hazard risk (tornado, tsunami, storms, floods) and how to lower it',
    description:
      'Hazard risk now for tornadoes, tsunamis, thunderstorms, heatwaves, floods and algal blooms: a level (Low…Severe), the factors raising or lowering it (season, turbines spinning, parks as windbreaks, Storm Shelters, seawalls, Weather Radar, fire cover…), and what would lower it most. Also any tornado or tsunami on its way, with seconds left.',
    keywords: ['risk', 'hazard', 'tornado', 'tsunami', 'prepare', 'prevention', 'safe', 'danger', 'warning'],
    input: { type: 'object', properties: {} },
    effect: 'read',
    run({ city }) {
      const coming = city.steward.crises
        .filter((c) => c.def === 'tornado' || c.def === 'tsunami')
        .map((c) => ({
          hazard: getCrisis(c.def).name,
          phase: c.phase,
          seconds: Math.max(
            0,
            Math.round(((c.phase === 'forecast' ? c.startTick : c.endTick) - city.tick) / PULSE_TICKS),
          ),
          evacuated: !!c.evacuated,
          gatesClosed: !!c.gates,
        }));
      return {
        coming,
        risks: riskReport(city).map((r) => ({
          hazard: r.name,
          level: r.level,
          factors: r.factors.map((f) => `${f.mul > 1.05 ? '+' : f.mul < 0.95 ? '−' : '·'} ${f.label}`),
          lowerIt: r.advice,
        })),
      };
    },
  },
  {
    name: 'prepare_hazard',
    option: 'Prepare for a tornado or tsunami: evacuate, close the Tide Gates, feather turbines',
    description: `Emergency moves while a tornado or tsunami is forecast or under way: "evacuate" (siren; 70% fewer residents caught, ◈${EVACUATE_COST}), "close-gates" (Tide Gates; 40% lower tsunami surge, ◈${GATES_COST}), "feather-turbines" (every wind turbine out of the wind: no power for now, far less storm damage). Undoable.`,
    keywords: [
      'evacuate',
      'siren',
      'tide gates',
      'close gates',
      'feather',
      'prepare',
      'tornado',
      'tsunami',
      'shelter',
    ],
    llmArgs: ['action'],
    input: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['evacuate', 'close-gates', 'feather-turbines'],
          description: 'What to do.',
        },
      },
      required: ['action'],
    },
    effect: 'mutate',
    run({ city, commands }, { action }: { action: 'evacuate' | 'close-gates' | 'feather-turbines' }) {
      if (action === 'evacuate') {
        const why = evacuateBlocker(city);
        if (why || !commands.execute('evacuate', {})) throw new Error(why ?? 'Could not evacuate.');
        return { evacuated: true, cost: EVACUATE_COST };
      }
      if (action === 'close-gates') {
        const why = gatesBlocker(city);
        if (why || !commands.execute('closeTideGates', {}))
          throw new Error(why ?? 'Could not close the gates.');
        return { gatesClosed: true, cost: GATES_COST };
      }
      let n = 0;
      for (const e of city.buildingEntities())
        if (
          city.buildingDef(e).id === 'wind-turbine' &&
          !Service.off[e] &&
          commands.execute('toggleBuilding', { x: Building.x[e]!, z: Building.z[e]!, off: true })
        )
          n++;
      if (!n) throw new Error('Every turbine is already feathered (or there are none).');
      return { feathered: n };
    },
  },
];
