import type { City } from '@/sim/City';
import { districtLabel, moodOf, complaints } from '@/sim/approval';
import { OUTSKIRTS_KEY } from '@/sim/approvalState';
import { POLICIES } from '@/sim/policies';
import { warnings } from '@/sim/forecast';
import { PULSE_TICKS } from '@/sim/pulseConst';

/**
 * What residents say when their tip bubble pops (D-118): a line from the building's kind, or, when the city has
 * something on its mind (short of food or power, a festival mood, night), a line about that. They give the
 * hamlet a voice and quietly point at what needs doing. Lines are data: add freely, keep them under ~44 chars.
 */
const BY_CATEGORY: Record<string, string[]> = {
  residential: [
    'Our balcony tomatoes finally came in!',
    'The kids love the new street trees.',
    'Best sea view on the island.',
    'Kept the solar shutters open all day.',
    'Neighbours brought soup. Love it here.',
    'Moved in last week. Already home.',
  ],
  food: [
    'Fresh catch at the market tonight!',
    'The greens are early this season.',
    'Saved you the ripest melon, steward.',
    'Gulls tried to steal the haul again.',
  ],
  nature: [
    'Saw a heron by the pond this morning.',
    'Picnic under the canopy, anyone?',
    'The moss garden is glowing again.',
    'Bees are back on the flower beds.',
  ],
  commercial: [
    'Busy day! Thanks for the customers.',
    'New bloom-tea blend is selling out.',
    'The café queue goes round the corner.',
  ],
  energy: ['Panels humming nicely today.', 'Clean watts, clear skies.', 'Not a single brown-out this week!'],
  utility: [
    'Pipes are clean and the water sparkles.',
    'All quiet on the night shift.',
    'Running smooth, steward.',
  ],
  tech: ['The servers dream in green.', 'Uptime: perfect. Mood: excellent.'],
  industry: ['Order shipped ahead of schedule!', 'Recycled every scrap this shift.'],
  sports: ['What a match last night!', 'New record on the track!', 'The crowd was electric.'],
};

const WANTS: { when: (c: City) => boolean; lines: string[] }[] = [
  {
    when: (c) => c.stats.population > 20 && c.pulse.foodRatio < 0.9,
    lines: ['The market ran out of greens again…', 'Could we get another market garden?'],
  },
  {
    when: (c) => c.stats.energyUsed > c.stats.energyProduced,
    lines: ['Lights keep flickering. More power?', 'Can we get another solar spire?'],
  },
  {
    when: (c) => c.stats.happiness >= 75,
    lines: ['Happiest island in the archipelago!', 'Wouldn’t live anywhere else.'],
  },
  {
    when: (c) => c.stats.demandHomes > 0.4,
    lines: ['My cousin wants to move here. Room?', 'Friends keep asking for a spare flat.'],
  },
  {
    when: (c) => c.timeOfDay > 0.8 || c.timeOfDay < 0.2,
    lines: ['The glow-fungi are out tonight.', 'Stars are bright over the harbour.'],
  },
];

/** Who says it, by the building they live or work in ("a Westbrook baker"). */
const WHO: Record<string, string[]> = {
  residential: ['resident', 'grandmother', 'student', 'parent', 'night-shift nurse', 'retired teacher'],
  food: ['farmer', 'fisher', 'market grower'],
  nature: ['park keeper', 'birdwatcher', 'gardener'],
  commercial: ['baker', 'shopkeeper', 'café owner'],
  energy: ['grid engineer', 'panel cleaner'],
  utility: ['pump keeper', 'water engineer'],
  tech: ['coder', 'designer'],
  industry: ['foundry hand', 'fabricator'],
  sports: ['coach', 'groundskeeper'],
};

/** Recent ordinances: what residents say when one comes in (a liked line, a grumble) or goes. */
const ON_POLICY: Record<string, [string, string]> = {
  'car-free-core': ['Walked downtown today. So quiet!', 'No parking near the shop now…'],
  'night-sky': ['I can see the Milky Way again!', 'The streets feel dark at night.'],
  'fishing-quota': ['The shoals will thank us.', 'Smaller hauls this week. Hm.'],
  'green-roofs': ['My roof is a meadow now!', 'That roof garden cost a fortune.'],
  'four-day-week': ['Three-day weekends! Bliss.', 'Hard to get a plumber on Fridays.'],
  'tourist-levy': ['The levy pays for the parks.', 'Fewer tourists in the café lately.'],
  'rainwater-code': ['Our cistern is already full.', 'Another inspection for the gutters…'],
  'free-transit': ['Free pods to work. Love it.', 'The pods are packed at rush hour.'],
};
const ON_TAX: Record<'up' | 'down', string[]> = {
  up: ['Taxes went up? Again?', 'Steward, my wallet felt that.'],
  down: ['Lower taxes! Dinner’s on me.', 'A bit more in my pocket. Nice.'],
};
const ON_CRISIS: Record<string, string> = {
  monsoon: 'Sandbags at the door again.',
  'king-tide': 'The tide’s in the street!',
  heatwave: 'Too hot to sleep. Fans all night.',
  'algal-bloom': 'The bay smells awful today.',
  'grid-failure': 'Candles again tonight.',
  blight: 'Something’s eating the garden.',
};
const ON_FORECAST: Record<string, string> = {
  energy: 'Heard power’s going to run short.',
  water: 'Neighbours say the taps will run dry.',
  food: 'The market’s worried about stocks.',
  harmony: 'People are getting fed up, steward.',
  budget: 'Is the city running out of money?',
};
const ON_COMPLAINT: Record<string, string[]> = {
  services: ['Brownouts in our street again.', 'The taps sputter every evening.'],
  amenities: ['Nowhere for the kids to play here.', 'This street needs a park.'],
  pollution: ['The air tastes of the foundry.', 'Can’t hang washing out for the smog.'],
  commute: ['Ninety minutes to work. Every day.', 'Spent my morning in traffic.'],
  jobMatch: ['No jobs in my line nearby.', 'Trained as a gardener, stuck in a shop.'],
};
const PROUD = ['Best neighbourhood on the island.', 'Wouldn’t trade this street for anything.'];
const PROTEST = ['We marched to the plaza today.', 'Signs are up on every balcony.'];

/** The last resident tax rate a tip saw, and when it last changed (sim tick) and which way. */
let lastTax = -1;
let taxNews: { dir: 'up' | 'down'; tick: number } | null = null;
/** Seconds a policy or tax change stays news. */
const NEWS = 180;

/**
 * What a resident says when a tip pops, and who they are (D-118; district voices, plan v5 Phase 26): about one tip
 * in two speaks to the news when there is some (an ordinance or tax change, a crisis, a forecast, the district's
 * protest, complaint or pride), the rest to the building's kind. `x`, `z` place the speaker in their district.
 */
export function voiceFor(city: City, category: string, r: number, x: number, z: number): { text: string; by: string } {
  const area = city.areaAt(Math.floor(x), Math.floor(z));
  const key = area?.name ?? OUTSKIRTS_KEY;
  const who = WHO[category] ?? WHO.residential!;
  const place = key === OUTSKIRTS_KEY ? 'an outskirts' : `a ${districtLabel(key)}`;
  const by = `— ${place} ${who[Math.floor(r * 31) % who.length]!}`;
  if (taxNews && city.tick - taxNews.tick > NEWS * PULSE_TICKS) taxNews = null;
  if (lastTax >= 0 && city.pulse.taxRate !== lastTax) taxNews = { dir: city.pulse.taxRate > lastTax ? 'up' : 'down', tick: city.tick };
  lastTax = city.pulse.taxRate;
  const news = newsLines(city, key);
  if (news.length && r < 0.5) return { text: news[Math.floor((r / 0.5) * news.length)]!, by };
  return { text: quoteFor(city, category, r), by };
}

/** Lines about what is happening now, most pressing first. */
function newsLines(city: City, key: string): string[] {
  const out: string[] = [];
  const h = city.happenings.current;
  const here = h && h.district === key;
  if (here && h.kind === 'protest' && h.status === 'active') out.push(...PROTEST);
  const mood = city.approval.districts[key] ? moodOf(city, key) : null;
  const view = city.approval.view.districts.find((d) => d.key === key);
  const liked = (mood?.approval ?? city.stats.happiness) >= 55;
  const recent = NEWS * PULSE_TICKS;
  for (const p of POLICIES) {
    const at = city.policies.changed[p.id];
    if (at === undefined || city.tick - at > recent) continue;
    const lines = ON_POLICY[p.id];
    if (!lines) continue;
    out.push(p.id in city.policies.active ? (liked ? lines[0] : lines[1]) : `Shame they dropped the ${p.name.toLowerCase()}.`);
  }
  if (taxNews) out.push(...ON_TAX[taxNews.dir]);
  for (const c of city.steward.crises) if (c.phase === 'active' && ON_CRISIS[c.def]) out.push(ON_CRISIS[c.def]!);
  const f = warnings(city)[0];
  if (f && ON_FORECAST[f.metric]) out.push(ON_FORECAST[f.metric]!);
  if (view && mood) {
    const worst = complaints(view)[0];
    if (mood.approval < 50 && worst) out.push(...ON_COMPLAINT[worst]!);
    else if (mood.approval >= 75) out.push(...PROUD);
  }
  return out;
}

/** A line for a tip from a building of `category`, picked with `r` in [0, 1). */
export function quoteFor(city: City, category: string, r: number): string {
  const wants = WANTS.filter((w) => w.when(city));
  // About one tip in three speaks to the city's mood, when it has one.
  if (wants.length && r < 0.35) {
    const lines = wants[Math.floor((r / 0.35) * wants.length)]!.lines;
    return lines[Math.floor(r * 97) % lines.length]!;
  }
  const lines = BY_CATEGORY[category] ?? BY_CATEGORY.residential!;
  return lines[Math.floor(r * lines.length * 13) % lines.length]!;
}

/** The icon a bubble shows for a building of `category`. */
export const TIP_ICONS: Record<string, string> = {
  residential: 'happy',
  food: 'food',
  nature: 'flower',
  commercial: 'credits',
  energy: 'sun',
  utility: 'drops',
  tech: 'chip',
  industry: 'industry',
  sports: 'sports',
};
