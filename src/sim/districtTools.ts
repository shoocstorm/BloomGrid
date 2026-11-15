import type { AgentTool } from '@/core/AgentTools';
import type { ActionCtx } from './actionTools';
import {
  APPROVAL,
  COMPLAINT_TEXT,
  JOB_TYPES,
  approvalBand,
  complaintLine,
  complaints,
  districtView,
} from './approval';
import { HAPPENING_NAMES, describeHappening } from './happenings';
import { migrationLine } from './statGuide';

/**
 * Flora's district tool (plan v5, Phase 26, D-159): approval of the steward by district, what it is made of, what
 * residents complain about and the fix, migration, and any petition or protest running there. Read-only; the
 * fixes are builds, ordinances and taxes through the tools that already exist. Registered last with the other
 * plan-v5 tools so menus for other requests keep their letters.
 */

const r1 = (v: number) => Math.round(v * 10) / 10;

export const districtTools: AgentTool<ActionCtx, never>[] = [
  {
    name: 'district_report',
    option: 'How each district feels about the steward (approval, complaints, who is moving in or out)',
    description:
      "District approval of the steward (0–100) for every district where people live, lowest first, or for one district: its band (Angry < 35 protests, Unhappy, Uneasy, Content, Delighted ≥ 75 thanks you), what lifts or drags it (city-wide harmony, power and water at its homes, amenities, smog, commute length, workers in the kind of job they want), its top complaint and the fix, residents moving in and out per minute, and any petition or protest there. Use for 'which district is unhappy', 'why is Westbrook upset', 'who is leaving'.",
    keywords: [
      'district',
      'approval',
      'unhappy',
      'protest',
      'petition',
      'neighbourhood',
      'complaint',
      'moving',
      'leaving',
      'migration',
    ],
    input: {
      type: 'object',
      properties: {
        district: {
          type: 'string',
          description: 'One district by name, e.g. "Westbrook" (default: all, lowest approval first).',
        },
      },
    },
    effect: 'read',
    // A district only when the request names one (the host pins it), or small models invent one.
    narrow(schema) {
      const props = { ...schema.properties };
      if ((props.district?.enum?.length ?? Infinity) > 3) delete props.district;
      return { ...schema, properties: props };
    },
    run({ city }, a: { district?: string }) {
      const view = city.approval.view;
      const one = a.district ? districtView(city, a.district) : null;
      if (a.district && !one)
        throw new Error(
          `No district called "${a.district}". Districts: ${view.districts.map((d) => d.name).join(', ')}.`,
        );
      const list = (one ? [one] : view.districts.filter((d) => d.capacity > 0)).map((d) => {
        const approval = city.approval.districts[d.key]?.approval ?? city.stats.happiness;
        const why = complaints(d);
        return {
          district: d.name,
          approval: Math.round(approval),
          band: approvalBand(approval),
          heading:
            Math.round(d.target) > Math.round(approval)
              ? 'rising'
              : Math.round(d.target) < Math.round(approval)
                ? 'falling'
                : 'steady',
          residents: Math.round(d.residents),
          movement: migrationLine(d.movedIn, d.movedOut),
          points: Object.fromEntries(
            Object.entries(d.terms).map(([k, v]) => [k === 'city' ? 'cityWideHarmony' : k, r1(v)]),
          ),
          commuteTiles: r1(d.commute),
          workersInWantedJob: `${Math.round(d.match * 100)}%`,
          complaints: why.length
            ? why.map((k) => ({ what: COMPLAINT_TEXT[k].label, fix: COMPLAINT_TEXT[k].fix }))
            : [complaintLine(d, approval)]
                .filter((c) => c !== null)
                .map((c) => ({ what: c.label, fix: c.fix })),
          growth: {
            homes: d.homeDemand > 0 ? 'wanted' : 'no more wanted',
            workplaces: d.workDemand > 0 ? 'wanted' : 'no more wanted',
          },
        };
      });
      list.sort((x, y) => x.approval - y.approval);
      const h = city.happenings.current;
      const voice =
        h && (h.kind === 'petition' || h.kind === 'protest' || h.kind === 'praise')
          ? { kind: HAPPENING_NAMES[h.kind], summary: describeHappening(city, h) }
          : null;
      // A sentence first: small models answer from the top of a result, and invent an unhappy district otherwise.
      const low = list[0];
      const verdict = !low
        ? 'Nobody lives in a named district yet.'
        : one
          ? `${low.district}: ${low.approval} (${low.band}), ${low.complaints[0] ? `main complaint ${low.complaints[0].what.toLowerCase()}` : 'no complaints'}.`
          : low.approval >= 45
            ? `No district is unhappy. Lowest: ${low.district} at ${low.approval} (${low.band})${low.complaints[0] ? `, main complaint ${low.complaints[0].what.toLowerCase()}` : ''}.`
            : `Unhappy: ${list
                .filter((d) => d.approval < 45)
                .map(
                  (d) =>
                    `${d.district} ${d.approval}${d.complaints[0] ? ` (${d.complaints[0].what.toLowerCase()})` : ''}`,
                )
                .join(', ')}.`;
      return {
        verdict,
        cityHarmony: Math.round(city.stats.happiness),
        cityMovement: migrationLine(view.movedIn, view.movedOut),
        rules: `Below ${APPROVAL.petition} a district may petition; below ${APPROVAL.protest} for a minute it protests (its workplaces lose staff); ${APPROVAL.praise}+ for three minutes it thanks you. Workers want ${JOB_TYPES.join(' / ')} jobs.`,
        districts: list,
        ...(voice ? { now: voice } : {}),
      };
    },
  },
];
