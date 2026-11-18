import type { CommandStack } from '@/core/Commands';
import { buildings } from '@/content';
import { Building } from '@/ecs/components';
import type { City } from './City';
import type { ConsequenceMods } from './consequenceState';
import { unavailable } from './buildGate';
import { placeName } from './happenings';
import { isActive } from './policies';
import { PULSE_TICKS } from './pulseConst';
import type { StoryRun } from './storyState';
import type { SimCtx } from './systems';

/**
 * Living stories (plan v5, Phase 29): short arcs about one named resident, tied to their home. Each beat triggers from
 * the city's state, offers two choices (pay now, or a goal: an ordinance or a build near their home by a deadline, or
 * let it go) and leads to the next beat or an ending. Endings pay a reward, leave a mood for a while, and some leave a
 * lasting outcome (a modifier for good, `LASTING`). One story at a time, a few minutes apart, never in a crisis; names
 * are drawn from `city.rng`. Stories are data: append to `ARCS`. Choices run as `storyChoice` (undoable = false, like
 * claims). Deterministic; state in `storyState.ts`. The card is `modules/stories`.
 */

/** Seconds between stories, and before the first. */
export const STORY_GAP: [number, number] = [360, 600];
const FIRST_GAP = 240;
/** Seconds a beat waits for the steward's choice before the story fades. */
export const CHOICE_SECONDS = 300;
/** Mood a turn of the story leaves, for this long. */
const MOOD_SECONDS = 180;

/** Outcomes that last (ids in `stories.lasting`). */
export const LASTING: Record<string, { name: string; text: string; apply(m: ConsequenceMods): void }> = {
  'fishers-coop': { name: "Fishers' co-op", text: 'The catch runs 5% larger.', apply: (m) => void (m.fishing *= 1.05) },
  'startup-hub': { name: 'Start-up hub', text: 'Businesses pay 3% more tax.', apply: (m) => void (m.workerTax *= 1.03) },
  'seawall-pride': { name: 'A coast that holds', text: 'Floods do 10% less damage.', apply: (m) => void (m.flood *= 0.9) },
  resettled: { name: 'Higher ground', text: '+0.3 harmony: the city looks after its own.', apply: (m) => void (m.harmony += 0.3) },
};

export interface StoryGoal {
  /** What to do, in a line ("Enact the Fishing quota"). */
  hint: string;
  within: number;
  /** Met when this count rises above where it stood when the choice was made. */
  count(city: City, run: StoryRun): number;
  /** A building that does it (the card offers to build one), if any. */
  build?(city: City): string | undefined;
  policy?: string;
}

export interface StoryChoice {
  label: string;
  /** Credits it costs now. */
  cost?: number;
  goal?: StoryGoal;
  /** On success (at once without a goal): credits, harmony for a while, a lasting outcome. */
  reward?: number;
  mood?: number;
  lasting?: string;
  /** The line the story keeps ("Paid the crew's fuel"). */
  told: string;
  /** Next beat id, or null: the story ends here. */
  next: string | null;
  /** How it ends when this is the last choice (default happy). */
  ending?: 'happy' | 'let down';
}

export interface StoryBeat {
  id: string;
  /** Seconds after the last beat before this one may start, and the state it waits for. */
  after?: number;
  when?(city: City, run: StoryRun): boolean;
  text(run: StoryRun): string;
  choices: [StoryChoice, StoryChoice];
}

export interface StoryArc {
  id: string;
  title: string;
  /** What the resident does ("fisher"). */
  role: string;
  icon: string;
  /** Can it start now? */
  when(city: City): boolean;
  /** Their home (an entity), or -1. */
  home(city: City): number;
  beats: StoryBeat[];
}

const centre = (e: number) => [Building.x[e]! + Building.w[e]! / 2, Building.z[e]! + Building.d[e]! / 2] as const;
export const homeOf = (city: City, run: StoryRun): number => city.uids.get(run.home) ?? -1;

/** Buildings within `r` tiles of the resident's home that pass `test`. */
function near(city: City, run: StoryRun, r: number, test: (id: string, cat: string, defence: boolean) => boolean): number {
  const h = homeOf(city, run);
  if (h < 0) return 0;
  const [hx, hz] = centre(h);
  let n = 0;
  for (const e of city.buildingEntities()) {
    const d = city.buildingDef(e);
    if (!test(d.id, d.category, !!d.defence)) continue;
    const [x, z] = centre(e);
    if ((x - hx) ** 2 + (z - hz) ** 2 <= r * r) n++;
  }
  return n;
}
const policyGoal = (id: string, name: string, within: number): StoryGoal => ({
  hint: `Enact ${name} (City Pulse → Policies)`,
  within,
  policy: id,
  count: (c) => (isActive(c, id) ? 1 : 0),
});
const parkGoal = (within: number): StoryGoal => ({
  hint: 'Build a park or garden within 14 tiles of their home',
  within,
  count: (c, r) => near(c, r, 14, (_id, cat) => cat === 'nature'),
  build: (c) => (unavailable(c, 'pocket-park') ? undefined : 'pocket-park'),
});
const residents = (city: City) => city.buildingEntities().filter((e) => city.buildingDef(e).category === 'residential');

export const ARCS: StoryArc[] = [
  {
    id: 'fisher',
    title: 'Light nets',
    role: 'fisher',
    icon: 'wave',
    when: (c) => c.growth.fish < 0.65 && c.buildingEntities().some((e) => !!c.buildingDef(e).fishing),
    // The home nearest a fishing dock.
    home(c) {
      const docks = c.buildingEntities().filter((e) => !!c.buildingDef(e).fishing);
      let best = -1;
      let bd = Infinity;
      for (const h of residents(c))
        for (const d of docks) {
          const [ax, az] = centre(h);
          const [bx, bz] = centre(d);
          const dist = (ax - bx) ** 2 + (az - bz) ** 2;
          if (dist < bd || (dist === bd && h < best)) [bd, best] = [dist, h];
        }
      return best;
    },
    beats: [
      {
        id: 'nets',
        text: (r) => `${r.name}, who fishes out of ${r.place}, hauls up half-empty nets. "The shoals are thinning, and the crew can't make the fuel money."`,
        choices: [
          { label: 'Enact a Fishing quota', goal: policyGoal('fishing-quota', 'the Fishing quota', 240), mood: 1.5, told: 'The council set a fishing quota.', next: 'coast' },
          { label: "Pay the crew's fuel", cost: 600, mood: 0.5, told: "The city paid the crew's fuel for a season.", next: 'coast' },
        ],
      },
      {
        id: 'coast',
        after: 120,
        text: (r) => `The catch is steadier. ${r.first} asks for green along the shore by ${r.place}: "Fish breed where the roots are."`,
        choices: [
          { label: 'Plant a park by the harbour', goal: parkGoal(360), reward: 800, lasting: 'fishers-coop', told: 'A park now shades the harbour; the fishers formed a co-op.', next: null },
          { label: 'Not now', mood: -1, told: 'The shore stayed bare.', next: null, ending: 'let down' },
        ],
      },
    ],
  },
  {
    id: 'founder',
    title: 'Kitchen-table start-up',
    role: 'founder',
    icon: 'tech',
    when: (c) => c.stats.population >= 1500,
    home: (c) => {
      const hs = residents(c);
      return hs.length ? hs[Math.floor(c.rng.next() * hs.length)]! : -1;
    },
    beats: [
      {
        id: 'idea',
        text: (r) => `${r.name} is building a start-up from a kitchen table in ${r.place}. "All we need is a desk in town and a fast line."`,
        choices: [
          {
            label: 'Build a tech workplace nearby',
            goal: {
              hint: 'Build a tech building within 16 tiles of their home',
              within: 360,
              count: (c, r) => near(c, r, 16, (_id, cat) => cat === 'tech'),
              build: (c) =>
                buildings
                  .all()
                  .filter((d) => d.category === 'tech' && !d.landmark && !unavailable(c, d.id))
                  .sort((a, b) => a.stats.cost - b.stats.cost || a.id.localeCompare(b.id))[0]?.id,
            },
            reward: 1200,
            told: 'A tech workplace opened round the corner.',
            next: 'growth',
          },
          { label: 'Offer a small grant', cost: 1000, told: 'The city gave a small grant.', next: 'growth' },
        ],
      },
      {
        id: 'growth',
        after: 150,
        text: (r) => `${r.first}'s company is hiring. "My team spends an hour a day in traffic. Can the streets breathe?"`,
        choices: [
          { label: 'Enact Car-free core', goal: policyGoal('car-free-core', 'Car-free core', 300), reward: 1500, lasting: 'startup-hub', told: 'Car-free streets: the company stayed and grew.', next: null },
          { label: 'Wish them well', mood: -0.5, told: 'The company moved to the mainland.', next: null, ending: 'let down' },
        ],
      },
    ],
  },
  {
    id: 'family',
    title: 'Higher ground',
    role: 'family',
    icon: 'drops',
    when: (c) =>
      c.steward.seaRise > 0.03 ||
      (c.consequences.rules['bare-coast']?.level ?? 0) >= 0.25 ||
      c.steward.history.some((h) => (h.kind === 'monsoon' || h.kind === 'king-tide') && c.tick - h.endTick < 600 * PULSE_TICKS),
    // The lowest home beside the water.
    home(c) {
      let best = -1;
      let low = Infinity;
      for (const h of residents(c)) {
        const [x, z, w, d] = [Building.x[h]!, Building.z[h]!, Building.w[h]!, Building.d[h]!];
        if (![[x - 1, z], [x + w, z], [x, z - 1], [x, z + d]].some(([px, pz]) => c.isWaterTile(px!, pz!))) continue;
        const y = c.grid.rangeOver(x, z, w, d).min;
        if (y < low || (y === low && h < best)) [low, best] = [y, h];
      }
      return best;
    },
    beats: [
      {
        id: 'flooded',
        text: (r) => `The ${r.family} family's home in ${r.place} floods with every high tide. "We love it here. But the water keeps coming in."`,
        choices: [
          {
            label: 'Build a Mangrove Seawall nearby',
            goal: {
              hint: 'Build a Mangrove Seawall within 14 tiles of their home',
              within: 360,
              count: (c, r) => near(c, r, 14, (_id, _cat, defence) => defence),
              build: (c) => (unavailable(c, 'mangrove-seawall') ? undefined : 'mangrove-seawall'),
            },
            reward: 800,
            lasting: 'seawall-pride',
            told: 'Mangroves now hold the tide back from their street.',
            next: 'after',
          },
          { label: 'Help them move uphill', cost: 1500, mood: 1, lasting: 'resettled', told: 'The city helped them move to higher ground.', next: null },
        ],
      },
      {
        id: 'after',
        after: 120,
        text: (r) => `The tide comes and goes; the ${r.family}s stay. Their neighbours ask for a park on the new shore.`,
        choices: [
          { label: 'Plant a park', goal: parkGoal(360), reward: 500, mood: 1, told: 'A park grew on the new shore.', next: null },
          { label: 'Not now', told: 'The shore stayed as it was.', next: null },
        ],
      },
    ],
  },
];

const FIRST = ['Marin', 'Priya', 'Tomas', 'Amara', 'Kenji', 'Lucia', 'Ade', 'Noor', 'Isak', 'Mei', 'Rafael', 'Sana', 'Oren', 'Talia', 'Kofi', 'Elin'];
const FAMILY = ['Osei', 'Lund', 'Adeyemi', 'Okafor', 'Nakamura', 'Moreau', 'Haddad', 'Silva', 'Varga', 'Tan', 'Brennan', 'Iqbal', 'Castell', 'Mwangi', 'Holm', 'Reyes'];

export const getArc = (id: string) => ARCS.find((a) => a.id === id);
const beatOf = (run: StoryRun) => getArc(run.arc)?.beats.find((b) => b.id === run.beat);

/** The beat on now and its choices (the card, Flora), or null. */
export function storyBeat(city: City): { arc: StoryArc; beat: StoryBeat; run: StoryRun } | null {
  const run = city.stories.current;
  const arc = run ? getArc(run.arc) : undefined;
  const beat = run ? beatOf(run) : undefined;
  return run && arc && beat ? { arc, beat, run } : null;
}

/** Starts an arc now (the scheduler, drills and tests). Returns the run, or null if the city doesn't qualify. */
export function startStory(city: City, arcId: string): StoryRun | null {
  const st = city.stories;
  const arc = getArc(arcId);
  if (st.current || !arc || !arc.when(city)) return null;
  const home = arc.home(city);
  if (home < 0) return null;
  const pick = (l: string[]) => l[Math.floor(city.rng.next() * l.length)]!;
  const first = pick(FIRST);
  const family = pick(FAMILY);
  const [x, z] = centre(home);
  const run: StoryRun = {
    id: st.nextId++,
    arc: arc.id,
    name: `${first} ${family}`,
    first,
    family,
    home: Building.uid[home]!,
    place: placeName(city, x, z),
    beat: arc.beats[0]!.id,
    beatTick: city.tick,
    status: 'choosing',
    told: [],
  };
  st.current = run;
  if (!st.arcs.includes(arc.id)) st.arcs.push(arc.id);
  city.bus.emit('story:beat', { run });
  return run;
}

function setMood(city: City, mood: number | undefined): void {
  if (!mood) return;
  city.stories.mood = mood;
  city.stories.moodUntil = city.tick + MOOD_SECONDS * PULSE_TICKS;
}

function end(city: City, run: StoryRun, outcome: 'happy' | 'let down' | 'moved away' | 'faded'): void {
  const st = city.stories;
  st.history.push({ id: run.id, arc: run.arc, name: run.name, outcome, tick: city.tick });
  if (st.history.length > 20) st.history.shift();
  st.current = null;
  const [lo, hi] = STORY_GAP;
  st.nextTick = city.tick + Math.round((lo + (hi - lo) * (st.auto ? city.rng.next() : 0.5)) * PULSE_TICKS);
  city.bus.emit('story:end', { run, outcome });
}

/** A choice's success: reward, mood, lasting outcome, then the next beat or the ending. */
function resolve(city: City, run: StoryRun, c: StoryChoice): void {
  city.credits += c.reward ?? 0;
  setMood(city, c.mood);
  if (c.lasting && !city.stories.lasting.includes(c.lasting)) city.stories.lasting.push(c.lasting);
  run.told.push(c.told);
  delete run.choice;
  delete run.until;
  delete run.baseline;
  if (c.next) {
    run.beat = c.next;
    run.beatTick = city.tick;
    run.status = 'between';
    city.bus.emit('story:resolved', { run, told: c.told });
  } else {
    city.bus.emit('story:resolved', { run, told: c.told });
    end(city, run, c.ending ?? 'happy');
  }
}

/** Per pulse: schedules a story, steps beats, checks goals and deadlines. */
export function updateStories(city: City): void {
  const st = city.stories;
  const run = st.current;
  if (run) {
    if (homeOf(city, run) < 0) return end(city, run, 'moved away');
    const beat = beatOf(run);
    if (!beat) return end(city, run, 'faded');
    if (run.status === 'between') {
      if (city.tick - run.beatTick >= (beat.after ?? 0) * PULSE_TICKS && (beat.when?.(city, run) ?? true)) {
        run.status = 'choosing';
        run.beatTick = city.tick;
        city.bus.emit('story:beat', { run });
      }
    } else if (run.status === 'choosing') {
      if (city.tick - run.beatTick >= CHOICE_SECONDS * PULSE_TICKS) {
        run.told.push('The moment passed.');
        end(city, run, 'faded');
      }
    } else {
      const c = beat.choices[run.choice!]!;
      if (c.goal!.count(city, run) > run.baseline!) resolve(city, run, c);
      else if (city.tick >= run.until!) {
        run.told.push(`${c.goal!.hint}: not in time.`);
        setMood(city, -1);
        end(city, run, 'let down');
      }
    }
    return;
  }
  if (!st.auto) return;
  if (st.nextTick === 0) st.nextTick = city.tick + FIRST_GAP * PULSE_TICKS;
  if (city.tick < st.nextTick || city.steward.crises.length > 0) return;
  // Arcs not told yet first, in a seeded order; then any.
  const fresh = ARCS.filter((a) => !st.arcs.includes(a.id));
  const pool = (fresh.length ? fresh : ARCS).filter((a) => a.when(city));
  const arc = pool.length ? pool[Math.floor(city.rng.next() * pool.length)]! : undefined;
  if (!arc || !startStory(city, arc.id)) st.nextTick = city.tick + 60 * PULSE_TICKS;
}

/** Lasting outcomes and the mood of the last turn (from `updateConsequences`). */
export function applyStories(city: City, mods: ConsequenceMods): void {
  const st = city.stories;
  if (city.tick < st.moodUntil) mods.harmony += st.mood;
  for (const id of st.lasting) LASTING[id]?.apply(mods);
}

/** Why choice `i` can't be taken now, or null. */
export function choiceBlock(city: City, i: number): string | null {
  const b = storyBeat(city);
  if (!b || b.run.status !== 'choosing') return 'No story is waiting for a choice.';
  const c = b.beat.choices[i];
  if (!c) return 'No such choice.';
  if ((c.cost ?? 0) > city.credits) return `It costs ◈${c.cost!.toLocaleString('en-US')}; the city has ◈${Math.floor(city.credits).toLocaleString('en-US')}.`;
  return null;
}

export function registerStoryCommands(stack: CommandStack<SimCtx>): void {
  stack.register<{ choice: number }, true>('storyChoice', {
    apply({ city }, p) {
      if (choiceBlock(city, p.choice)) return null;
      const { beat, run } = storyBeat(city)!;
      const c = beat.choices[p.choice]!;
      city.credits -= c.cost ?? 0;
      if (c.goal) {
        run.status = 'waiting';
        run.choice = p.choice;
        run.until = city.tick + c.goal.within * PULSE_TICKS;
        run.baseline = c.goal.count(city, run);
        city.bus.emit('story:choice', { run, label: c.label });
      } else {
        city.bus.emit('story:choice', { run, label: c.label });
        resolve(city, run, c);
      }
      return true;
    },
    // A story choice is a decision made in front of the resident: not undone (like claims, undoable = false).
    revert() {},
  });
}
