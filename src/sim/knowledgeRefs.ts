import { buildings } from '@/content';
import { CATEGORY_CODES, CATEGORY_LABELS, type BuildingCategory, type BuildingDef } from '@/content/types';
import type { KnowledgeDoc } from '@/content/knowledge';
import { allCrises } from './crises';
// Side effects: every crisis, hazard and disaster registers itself on import.
import './hazards';
import './disasters';
import { RULES } from './consequences';
import { POLICIES, POLICY_COOLDOWN, POLICY_POPULATION } from './policies';
import { BUDGET_MAX, BUDGET_MIN } from './policyState';
import {
  CATCH_MUL,
  FESTIVAL_HARMONY,
  HAPPENING_GAP,
  HAPPENING_NAMES,
  HAPPENING_SECONDS,
  MOOD,
  REQUEST_RADIUS,
  REQUEST_REWARD,
  VISITORS,
} from './happenings';
import { allOverlays } from './overlays';
import { ISSUES } from './inventory';
import { DIFFICULTIES } from './difficulty';
import { PROJECTS } from './projects';
import { FAIL_SECONDS } from './steward';
import { DAY_LENGTH } from './pulseConst';
import { RESPONSE_COST } from './hazards';
import { EVACUATE_COST, GATES_COST } from './disasters';
import { LEVEL_DAYS, OLD_DAYS, TIER_SIZE, TIER_UPKEEP } from './levels';
import { ROAD_CAPACITY, ROAD_LEVEL_NAMES, ROAD_UPGRADE_COST } from './roads';

/**
 * Seedvault's live reference (D-088): docs generated from the game's own registries (crises, consequence
 * rules, lenses, issue codes, difficulties, unlock projects, every building), so the numbers Flora quotes and
 * the steward reads always match the build they are playing. Shipped guides link here instead of copying
 * numbers that would drift. Pure; generated once per page.
 */

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const cell = (s: string) => s.replace(/\|/g, '/').replace(/\n/g, ' ');
const table = (head: string[], rows: string[][]) =>
  [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n');

const ref = (
  d: Omit<KnowledgeDoc, 'source' | 'category' | 'covers' | 'order'> &
    Partial<Pick<KnowledgeDoc, 'covers' | 'order'>>,
): KnowledgeDoc => ({
  source: 'reference',
  category: 'reference',
  covers: [],
  order: 50,
  ...d,
});

function crisesDoc(): KnowledgeDoc {
  const list = allCrises();
  const body = [
    'Every crisis the island can throw at you, read from the game itself. **Warning** is how long a forecast comes before it hits (a working Weather Radar doubles it for storms, floods and waves); **lasts** is how long it is active.',
    '',
    table(
      ['Crisis', 'Warning', 'Lasts', 'What it does'],
      list.map((c) => [`${c.icon} ${c.name} (\`${c.id}\`)`, `${c.lead} s`, `${c.duration} s`, c.description]),
    ),
    '',
    ...list.flatMap((c) => [`## ${c.name}`, '', c.description, '', `**Prepare:** ${c.prep}`, '']),
  ].join('\n');
  return ref({
    id: 'reference-crises',
    title: 'Crisis almanac',
    summary: `All ${list.length} crises and disasters: warning time, duration, effects and how to prepare.`,
    tags: ['crisis', 'disaster', 'forecast', 'prepare', ...list.map((c) => c.id)],
    related: ['runbook-crisis-response', 'cause-effect-chains'],
    covers: list.map((c) => c.id),
    order: 10,
    body,
  });
}

function rulesDoc(): KnowledgeDoc {
  const body = [
    'Slow consequences (Dashboard → Causes). Each rule fades in over about 50 s when its cause holds and fades out over about 100 s once it is gone, so fixing a cause takes a while to show.',
    '',
    ...RULES.flatMap((r) => [
      `## ${r.icon} ${r.name}`,
      '',
      `**Effect:** ${r.effect}`,
      '',
      `Rule id \`${r.id}\`.`,
      '',
    ]),
  ].join('\n');
  return ref({
    id: 'reference-consequences',
    title: 'Consequence rules',
    summary: `The ${RULES.length} slow consequences of how the city is run, good and bad, and what each one does.`,
    tags: ['consequence', 'cause', 'effect', 'rule', ...RULES.map((r) => r.id)],
    related: ['cause-effect-chains', 'cause-effect-feedback-loops'],
    order: 20,
    body,
  });
}

function happeningsDoc(): KnowledgeDoc {
  const m = (sec: number) => (sec % 60 ? `${Math.floor(sec / 60)} min ${sec % 60} s` : `${sec / 60} min`);
  const body = [
    `One happening at a time, ${m(HAPPENING_GAP[0])} to ${m(HAPPENING_GAP[1])} apart, never during a crisis or while Harmony is Critical. Guide: [Happenings](kb:systems-happenings).`,
    '',
    '| Happening | Lasts | Needs |',
    '| --- | --- | --- |',
    `| ${HAPPENING_NAMES.request} | ${m(HAPPENING_SECONDS.request)} to answer | homes; asks for a Nature, Food, Sports or Work building within ${REQUEST_RADIUS} tiles |`,
    `| ${HAPPENING_NAMES.festival} | ${m(HAPPENING_SECONDS.festival)} | Harmony 55+, 150+ residents |`,
    `| ${HAPPENING_NAMES['bumper-catch']} | ${m(HAPPENING_SECONDS['bumper-catch'])} | a fishing dock |`,
    `| ${HAPPENING_NAMES.cruise} | ${m(HAPPENING_SECONDS.cruise)} | a waterfront building, 400+ residents |`,
    '',
    `- Request reward: ◈${REQUEST_REWARD.base} plus ◈${REQUEST_REWARD.perResident} per resident (up to ◈${REQUEST_REWARD.base + REQUEST_REWARD.cap}), and Harmony +${MOOD.claimed} for ${m(MOOD.seconds)}. A missed request: Harmony ${MOOD.missed} for ${m(MOOD.seconds)}. An answered request nobody claims pays out 2 min after its deadline.`,
    `- Festival: Harmony +${FESTIVAL_HARMONY} and visitors (◈${VISITORS.festival.flat}/s plus ${VISITORS.festival.share * 100}% of tax income); a free fireworks show when a factory has shells.`,
    `- Cruise: visitors (◈${VISITORS.cruise.flat}/s plus ${VISITORS.cruise.share * 100}% of tax income). Bumper catch: fishing haul ×${CATCH_MUL}.`,
  ].join('\n');
  return ref({
    id: 'reference-happenings',
    title: 'Happenings: numbers',
    summary:
      "Durations, conditions and rewards of residents' requests, festivals, bumper catches and cruise visits.",
    tags: ['happening', 'request', 'festival', 'cruise', 'catch', 'reward'],
    related: ['systems-happenings'],
    order: 25,
    body,
  });
}

function lensesDoc(): KnowledgeDoc {
  const body = [
    'Data lenses recolour the island by one measure (**L**, or City Pulse → Lenses). Esc or ✕ on the legend turns a lens off.',
    '',
    ...allOverlays().flatMap((o) => [
      `## ${o.icon} ${o.label} lens`,
      '',
      o.about,
      '',
      `- **Read it:** ${o.read}`,
      `- **Act on it:** ${o.act}`,
      `- Legend: ${o.legend[0]} → ${o.legend[1]}. Lens id \`${o.id}\`.`,
      '',
    ]),
  ].join('\n');
  return ref({
    id: 'reference-lenses',
    title: 'Data lenses',
    summary: 'Every data lens: what it measures, how to read its colours and what to do about what you see.',
    tags: ['lens', 'overlay', 'map', ...allOverlays().map((o) => o.id)],
    related: ['basics-reading-the-city'],
    order: 30,
    body,
  });
}

function issuesDoc(): KnowledgeDoc {
  const sev = ['notice', 'warning', 'critical'];
  const body = [
    'Issue codes the inspector, the Inventory (`issue:<code>`) and Flora use. Critical issues make an object **critical**, warnings make it **warning**; notices change nothing.',
    '',
    table(
      ['Code', 'Issue', 'Severity', 'What to do'],
      Object.entries(ISSUES).map(([code, i]) => [`\`${code}\``, i.label, sev[i.severity]!, i.hint]),
    ),
  ].join('\n');
  return ref({
    id: 'reference-issues',
    title: 'Issue codes',
    summary: 'Every problem a building, highway or district can report, how serious it is and the fix.',
    tags: ['issue', 'status', 'critical', 'warning', 'inventory', 'fix', ...Object.keys(ISSUES)],
    related: ['runbook-triage', 'basics-reading-the-city'],
    order: 40,
    body,
  });
}

function rulesOfPlayDoc(): KnowledgeDoc {
  const d = Object.values(DIFFICULTIES);
  const body = [
    '## Difficulty',
    '',
    table(
      ['Difficulty', 'Can fail', 'Crises / day', 'Severity', 'Credits', 'Loan interest / min', 'Sea rise'],
      d.map((x) => [
        x.label,
        x.fail ? 'yes' : 'no',
        String(x.eventRate),
        `×${x.severity}`,
        `×${x.creditMul}`,
        `${(x.interest * 100).toFixed(1)}%`,
        `${x.seaRise}`,
      ]),
    ),
    '',
    '## The fail clock',
    '',
    `While **harmony** or the **budget** is in Collapse, the council's fail clock runs one second per second; it unwinds twice as fast once both recover. At ${FAIL_SECONDS} s the steward is replaced (not on Sandbox).`,
    '',
    '## Unlock projects (fresh island)',
    '',
    ...Object.values(PROJECTS).flatMap((p) => [
      `### ${p.icon} ${p.name}`,
      '',
      `${p.description} **Unlocks:** ${p.unlocks}`,
      '',
      `Costs ◈${fmt(p.cost)} and takes ${p.days >= 1 ? `${p.days} sim day${p.days === 1 ? '' : 's'}` : `about ${Math.round(p.days * DAY_LENGTH)} s at normal speed`} once started.`,
      '',
    ]),
    '## Fixed costs',
    '',
    `- Dispatching fire crews: ◈${RESPONSE_COST} a fire.`,
    `- Evacuation siren: ◈${EVACUATE_COST}. Closing the Tide Gates: ◈${GATES_COST}.`,
    '- Repairing a ruin: half the building’s price.',
    '',
    '## Highway levels',
    '',
    table(
      ['Level', 'Carries', 'Upgrade cost / tile'],
      ROAD_LEVEL_NAMES.map((n, i) => [n, `×${ROAD_CAPACITY[i]}`, i ? `◈${ROAD_UPGRADE_COST[i]}` : 'new highways']),
    ),
    '',
    'Traffic wears highways in: a used raw track is paved for free, and a busy Living Highway grows into a boulevard.',
    '',
    '## Levels and ageing',
    '',
    `A home or workplace that thrives (powered, watered, staffed or full, green and in good repair) grows to level 2 after ${LEVEL_DAYS[0]} sim days and to level 3 after ${LEVEL_DAYS[1]} more. Levels hold ${TIER_SIZE.map((s) => `×${s}`).join(' / ')} people, jobs and output and cost ${TIER_UPKEEP.map((s) => `×${s}`).join(' / ')} upkeep. From ${OLD_DAYS} days old a building counts as old: upkeep creeps up 15% every 10 days (up to +90%) until it is renovated.`,
  ].join('\n');
  return ref({
    id: 'reference-rules',
    title: 'Rules of play',
    summary:
      'Difficulty presets, the fail clock, unlock projects, fixed costs and building levels, with live numbers.',
    tags: ['difficulty', 'fail', 'council', 'project', 'unlock', 'level', 'age', 'cost'],
    related: ['basics-steward-role', 'playbooks-fresh-island'],
    order: 5,
    body,
  });
}

function abilities(d: BuildingDef): string {
  const a: string[] = [];
  if (d.response) a.push('fights fires nearby');
  if (d.shelter) a.push('storm shelter');
  if (d.radar) a.push('longer storm warnings');
  if (d.defence) a.push('holds back the sea');
  if (d.transit) a.push(d.transit.hub ? 'pod hub' : 'pod transit');
  if (d.drones) a.push('drone hive');
  if (d.fireworks) a.push('makes fireworks');
  if (d.fishing) a.push('fishes the sea');
  if (d.placement?.nearWater) a.push('must touch water');
  if (d.floodproof) a.push('floodproof');
  if (d.tower) a.push('sky-bridge tower');
  return a.join(', ');
}

const stat = (n: number) => (n ? (Math.abs(n) >= 10 ? fmt(n) : String(Math.round(n * 10) / 10)) : '·');

function buildingDocs(): KnowledgeDoc[] {
  const by = new Map<BuildingCategory, BuildingDef[]>();
  for (const d of buildings.all()) by.set(d.category, [...(by.get(d.category) ?? []), d]);
  return (Object.keys(CATEGORY_LABELS) as BuildingCategory[])
    .filter((c) => by.has(c))
    .map((c, i) => {
      const defs = by.get(c)!.sort((a, b) => a.stats.cost - b.stats.cost);
      const body = [
        `${CATEGORY_LABELS[c]} buildings (ids \`${CATEGORY_CODES[c]}-…\`), cheapest first. Positive energy and water are made, negative are used; upkeep is credits per second at level 1.`,
        '',
        table(
          [
            'Building',
            'Cost',
            'Size',
            'Residents',
            'Jobs',
            'Energy',
            'Water',
            'Food',
            'Ecology',
            'Pollution',
            'Upkeep',
          ],
          defs.map((d) => [
            d.name,
            `◈${fmt(d.stats.cost)}`,
            `${d.footprint[0]}×${d.footprint[1]}`,
            stat(d.stats.population),
            stat(d.stats.jobs),
            stat(d.stats.energy),
            stat(d.stats.water),
            stat(d.stats.food),
            stat(d.stats.eco),
            stat(d.stats.pollution),
            d.stats.upkeep.toFixed(2),
          ]),
        ),
        '',
        ...defs.flatMap((d) => [
          `## ${d.name}`,
          '',
          `${d.description}${abilities(d) ? ` *Abilities: ${abilities(d)}.*` : ''} Type id \`${d.id}\`.`,
          '',
        ]),
      ].join('\n');
      return ref({
        id: `reference-buildings-${c}`,
        title: `${CATEGORY_LABELS[c]} buildings`,
        summary: `All ${defs.length} ${CATEGORY_LABELS[c].toLowerCase()} buildings with cost, size, output, upkeep and abilities.`,
        tags: ['building', c, CATEGORY_LABELS[c].toLowerCase(), ...defs.map((d) => d.id)],
        related: ['playbooks-growth'],
        order: 60 + i,
        body,
      });
    });
}

function policiesDoc(): KnowledgeDoc {
  const body = [
    `Ordinances are enacted in City Pulse → Policies (or by asking Flora). Each costs credits to enact, may have a running cost, and can change once every ${POLICY_COOLDOWN} s. On a fresh island the council hears them from ${POLICY_POPULATION} residents. Guide: [Policies and budgets](kb:systems-policies).`,
    '',
    '| Ordinance | Gain | Cost | Enact |',
    '| --- | --- | --- | --- |',
    ...POLICIES.map((p) => `| ${p.name} | ${p.upside} | ${p.downside} | ◈${p.enact.toLocaleString('en-US')} |`),
    '',
    `- Budgets (maintenance, emergency response, parks and ecology) run ${BUDGET_MIN * 100}–${BUDGET_MAX * 100}%: the share of that sector's upkeep the city pays. In debt, austerity pays 40% of it on top.`,
    '- Business tax is charged on workplaces (the worker share of tax income); above 15% shops and works hire fewer people.',
    '- Resident tax: −1.5 harmony per point above 10%, steeper above 16%; a long happy streak softens the steep part.',
  ].join('\n');
  return ref({
    id: 'reference-policies',
    title: 'Ordinances and budgets: numbers',
    summary: `The ${POLICIES.length} ordinances with their gains, costs and enact fees; budget and tax ranges.`,
    tags: ['policy', 'policies', 'ordinance', 'budget', 'tax', 'business tax', ...POLICIES.map((p) => p.id)],
    related: ['systems-policies', 'systems-budget'],
    order: 26,
    body,
  });
}

let cache: KnowledgeDoc[] | null = null;

/** The generated reference docs (built once: registries are fixed after load). */
export function referenceDocs(): KnowledgeDoc[] {
  cache ??= [
    rulesOfPlayDoc(),
    crisesDoc(),
    rulesDoc(),
    happeningsDoc(),
    policiesDoc(),
    lensesDoc(),
    issuesDoc(),
    ...buildingDocs(),
  ];
  return cache;
}
