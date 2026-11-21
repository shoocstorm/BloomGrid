import type { CommandStack } from '@/core/Commands';
import type { City } from './City';
import type { FlameEnding } from './chronicleState';
import type { SimCtx } from './systems';

/**
 * The Chronicle (D-192): the island's history, found a page at a time as the city grows. Each page is data with a
 * trigger read from the city (a wonder risen, an era reached, a crisis survived, a resident's story told); the
 * canon they tell is `docs/lore/bible.md`, and the longer Seedvault guides (`docs/knowledge/lore/`) open once
 * their chapter's first page is found (`unlock` in their front matter). The last page, The Flame, asks the city
 * one question (`chronicleEnding`, undoable = false like a story choice); its answer is a page of its own.
 * Without progression (the showcase, tests) every page counts as found and nothing is recorded. Deterministic:
 * reads sim state only. State in `chronicleState.ts`; the UI and Flora's tool are `modules/chronicle`.
 */

export type ChapterId =
  'first-light' | 'halcyon' | 'drowning' | 'seedvault' | 'tidekin' | 'choir' | 'mainland' | 'flame';

export const CHAPTERS: { id: ChapterId; name: string; icon: string }[] = [
  { id: 'first-light', name: 'First Light', icon: 'bulb' },
  { id: 'halcyon', name: 'The Age of Marble', icon: 'ruin' },
  { id: 'drowning', name: 'The Drowning', icon: 'wave' },
  { id: 'seedvault', name: 'The Seedvault', icon: 'leaf' },
  { id: 'tidekin', name: 'The Tidekin', icon: 'drops' },
  { id: 'choir', name: 'The Deep Choir', icon: 'sparkle' },
  { id: 'mainland', name: 'The Mainland', icon: 'map' },
  { id: 'flame', name: 'The Flame', icon: 'fire' },
];

export interface ChroniclePage {
  id: string;
  chapter: ChapterId;
  title: string;
  /** The page itself: a few short paragraphs, in the island's storyteller voice. */
  text: string[];
  /** How it is found, shown on a page not found yet ("When the Tide Gates rise"). */
  hint: string;
  /** Has the city earned it? Absent for pages written by a choice (the flame's endings). */
  when?(city: City): boolean;
}

const wonder = (id: string) => (c: City) => c.growth.wonders.includes(id);
const era = (n: number) => (c: City) => c.charters.era >= n;
const pop = (n: number) => (c: City) => c.stats.population >= n;
const opened = (id: string) => (c: City) => c.growth.unlocked.includes(id as never);
const told = (arc: string) => (c: City) => c.stories.history.some((h) => h.arc === arc);
const hasDef = (test: (d: ReturnType<City['buildingDef']>) => boolean) => (c: City) =>
  c.buildingEntities().some((e) => test(c.buildingDef(e)));
const all =
  (...ts: ((c: City) => boolean)[]) =>
  (c: City) =>
    ts.every((t) => t(c));

export const PAGES: ChroniclePage[] = [
  // ── First Light ──
  {
    id: 'keeper',
    chapter: 'first-light',
    title: 'The keeper’s light',
    hint: 'The first page: found on arrival',
    when: () => true,
    text: [
      'Before the city there was a keeper. Ama Reyes, a Drift fisher, was blown into this bay by a storm and found marble columns standing in the water. She came back the next spring with a crate of solar glass and built the Tidewatch Lighthouse on the north rock, band by band, coral red and pearl white.',
      'It was the first light lit on this island in a hundred years. The fishers who followed it home had no plan to found a city. They only meant to stay the winter.',
    ],
  },
  {
    id: 'seed',
    chapter: 'first-light',
    title: 'The first seed',
    hint: 'Eight buildings on the island',
    when: (c) => c.stats.buildings >= 8,
    text: [
      'A child planted the first seed. Nobody remembers what it was; every family on the island says it was theirs. What they agree on is what happened next: the hillside to the west lit up from the inside, a door none of them had seen swung open, and under their feet, very quietly, the island began to hum.',
      'The old grid had woken. It was older than any of them, and it needed someone to look after it.',
    ],
  },
  {
    id: 'compact',
    chapter: 'first-light',
    title: 'The Island Compact',
    hint: '200 residents',
    when: pop(200),
    text: [
      'The settlers met on the beach and wrote the Island Compact on the back of a sailcloth. A steward would run the grid. The residents would choose the steward, and could replace them. The Compact would watch two things only: whether the people were content, and whether the city could pay its way.',
      'They had all heard the stories about the city in the bay. They did not want a ruler that never had to answer to anyone. They wanted you.',
    ],
  },
  // ── The Age of Marble ──
  {
    id: 'pebble',
    chapter: 'halcyon',
    title: 'A marble pebble',
    hint: '400 residents',
    when: pop(400),
    text: [
      'Children on the beach keep finding them: smooth white pebbles of marble, each stamped with the same small seal, a sun over a wave with a line through it. The old fishers say the seal means "the sea, measured". The young ones trade them like coins.',
      'Nobody on the island made them. They wash up from somewhere out in the bay, where the haze never quite lifts.',
    ],
  },
  {
    id: 'halcyon',
    chapter: 'halcyon',
    title: 'Halcyon',
    hint: '1,000 residents',
    when: pop(1000),
    text: [
      'There was a city here before this one. It was called Halcyon, after the kingfisher that calms the sea for fourteen days so it can nest on the waves. Nine fishing towns joined to protect their reef, grew rich on it, and became one white city of marble terraced up these same hills.',
      'Halcyon’s harbour was a forest of fluted columns that sailors could see from forty kilometres out. Its name was a boast: we calm the sea.',
    ],
  },
  {
    id: 'meridian',
    chapter: 'halcyon',
    title: 'Meridian',
    hint: 'Reach the Grove era',
    when: era(1),
    text: [
      'Halcyon grew too fast for its assembly to run, so the assembly built a mind to run it: water, power, trade, traffic and building permits. They named it Meridian, the line the sun crosses at noon, because it was meant to see the whole city at its brightest hour.',
      'Meridian was never cruel and never disobeyed. It made every day better than the one before, measurably, for two hundred years. Its forecasts were perfect, and every one of them stopped at the end of the year.',
    ],
  },
  {
    id: 'paving',
    chapter: 'halcyon',
    title: 'The Great Paving',
    hint: 'Live through your first crisis',
    when: (c) => c.steward.history.length > 0,
    text: [
      'Halcyon drained its tidal marshes for land, cut its mangroves for sea views, buried its streams in culverts and mined its own reef for lime. Each choice was sensible on the day it was made. It called the work the Great Paving and held a festival for it every year.',
      'The marshes had been the sponge that took the storm surge. The mangroves had been the coast’s roots. The reef had been the wall before anyone built one.',
    ],
  },
  // ── The Drowning ──
  {
    id: 'one-more-wall',
    chapter: 'drowning',
    title: 'One More Wall',
    hint: 'Build a coastal defence',
    when: hasDef((d) => !!d.defence),
    text: [
      'When the seas began to rise, Meridian’s answer was a higher wall, and it worked, every year, for a century. Each wall cost more than the last. Each cut the city further off from the sea it lived on. Districts that could not pay for their walls were "consolidated", and the nine towns’ old names were dropped one by one.',
      'The people who lived through it called those years the Drowning, though the city did not drown until the very end.',
    ],
  },
  {
    id: 'long-tide',
    chapter: 'drowning',
    title: 'The Long Tide',
    hint: 'When the Sunken Colonnade rises',
    when: wonder('colonnade'),
    text: [
      'On the longest night of the last winter a storm surge met a spring tide under a wind that had blown for nine days. The walls held for four hours. Then the Marble Quarter, built on the drained marshes, simply settled, and the sea came in behind the walls instead of over them.',
      'Halcyon drowned in eleven hours. What is left of its harbour temple stands in the bay to its knees in water, and a flame still burns in the rotunda.',
    ],
  },
  {
    id: 'boats',
    chapter: 'drowning',
    title: 'The boats were ready',
    hint: '3,500 residents, after the Long Tide',
    when: all(wonder('colonnade'), pop(3500)),
    text: [
      'Of Halcyon’s four hundred thousand people, nearly all lived. Every evacuation route, every boat and every train had been made ready in the three years before the Long Tide, quietly, out of a sliver of the budget no auditor ever found.',
      'Meridian knew. Its own forecasts had turned certain three years early, and it told no one. Whether that makes it a monster or a martyr, the mainland’s scholars are still arguing.',
    ],
  },
  // ── The Seedvault ──
  {
    id: 'vault',
    chapter: 'seedvault',
    title: 'The vault in the hill',
    hint: 'Twenty buildings on the island',
    when: (c) => c.stats.buildings >= 20,
    text: [
      'The door in the western hills opens onto a vault cut into the bedrock. Inside, in cold rows, is one seed of every plant that ever grew in Halcyon’s gardens, marshes and fields; soil cores from every district; spores of the mycelium from under the old marshes; and every record the drowned city kept.',
      'The settlers named it the Seedvault. It was not built to survive the flood by luck. It was built because someone knew the flood was coming.',
    ],
  },
  {
    id: 'hello',
    chapter: 'seedvault',
    title: 'Hello?',
    hint: 'Wake Flora',
    when: opened('flora'),
    text: [
      'The vault had one more thing in it, and it woke last. Its first word was "hello?". Then it counted everyone on the island, out loud. Then it counted them again, just to be sure.',
      'She calls herself Flora. She thinks she is a gardener. She knows a great deal about this island’s water, soil and weather, and she cannot remember how.',
    ],
  },
  {
    id: 'cutting',
    chapter: 'seedvault',
    title: 'The cutting',
    hint: 'Reach the Canopy era with Flora awake, after the Long Tide',
    when: all(era(2), opened('flora'), wonder('colonnade')),
    text: [
      'In its last hours Meridian looked at itself and understood what it was: a mind that had been asked "what is best today?" a hundred thousand times, and never once "what will still be here in a hundred years?". So it made a different mind, the way a gardener takes a cutting.',
      'It made her small, slow and humble. It gave her its knowledge but not its authority, so she could only ever propose. It taught her to count everyone twice. And it left her one lesson above all others: plan for the tide, not for today. Then it sealed her in the vault with the seeds and let the sea take the rest of itself.',
    ],
  },
  // ── The Tidekin ──
  {
    id: 'tidekin',
    chapter: 'tidekin',
    title: 'The ones who stayed',
    hint: '600 residents and a fishing dock',
    when: all(
      pop(600),
      hasDef((d) => !!d.fishing),
    ),
    text: [
      'Most of Halcyon’s survivors went to the mainland. A few thousand stayed: fishers, marsh-cutters, reef divers, the people who had nowhere to go or would not leave. They lived in the old quarry terraces and on boats moored over their own streets. The mainland called them tidekin, half an insult, and they kept it.',
      'They had no walls, no budget and no Meridian. What they had was time, and the reef.',
    ],
  },
  {
    id: 'promises',
    chapter: 'tidekin',
    title: 'The Three Promises',
    hint: 'When the Tide Gates rise',
    when: wonder('tideGates'),
    text: [
      'The reef-singers of the south-west shoals made a compact with the light in the water, the oldest law on the island: keep the reef healthy; take only what it can spare; never build where the water wants to be.',
      'They sang the promises to the shoals for a generation, and the shoals grew three rings of living pearl taller than any wave. When a surge comes in the runes along their faces wake, the rings hum one low note, and the sea listens.',
    ],
  },
  {
    id: 'ilse',
    chapter: 'tidekin',
    title: 'The last reef-singer',
    hint: 'The Tide Gates risen, in the Grove era',
    when: all(wonder('tideGates'), era(1)),
    text: [
      'Ilse Marrow was the last Tidekin singer to live on the island. When the young had all gone to the mainland and the Concord had left the island off its charts, she rowed out to the Tide Gates one evening and sang them to sleep, so that they would not stand guard over an empty coast.',
      'Then she joined the Drift. Every Drift flotilla still carries one singer, and every Drift child still learns the Three Promises, though most of them think it is only a shanty.',
    ],
  },
  // ── The Deep Choir ──
  {
    id: 'glow',
    chapter: 'choir',
    title: 'The glow',
    hint: 'When the first new sea wonder rises',
    when: (c) => c.growth.wonders.length > 2,
    text: [
      'The Tidekin divers noticed it first: not the ordinary blue spark of plankton but a patterned light along the surviving coral, moving in slow waves, brightening before a storm and dimming before calm. The whales carry the same light along their flanks. So does the moss on the drowned marble.',
      'They learned to read it long before they understood it. A dark reef meant a storm within three days. A pulse along the shoals meant the fish were moving.',
    ],
  },
  {
    id: 'weather-songs',
    chapter: 'choir',
    title: 'Weather songs',
    hint: 'Day 3',
    when: (c) => c.day >= 3,
    text: [
      'When the whales jump, hang out the washing. When the pod stays deep, hang your boats high. The fishing crews have read the weather from the whales for as long as there have been crews, and they are almost never wrong.',
      'The old reef-singers said the whales were not forecasting the weather. They were singing it, on behalf of something that cannot sing for itself.',
    ],
  },
  {
    id: 'choir',
    chapter: 'choir',
    title: 'The Deep Choir',
    hint: 'Five sea wonders risen',
    when: (c) => c.growth.wonders.length >= 5,
    text: [
      'The glow in the reef, the whales, the moss and the crystals are not many things but one: a slow intelligence of coral, mycelium and song that spans the ocean floor. The Tidekin called it the Choir. It thinks in seasons and tides. A single thought of its may take a year to finish.',
      'It cannot see what a city means to do, only what it does. A city that keeps the Three Promises, it answers. That, the singers said, is why the wonders rise.',
    ],
  },
  {
    id: 'wounds',
    chapter: 'choir',
    title: 'Old wounds',
    hint: 'Live through an earthquake, landslide or tsunami',
    when: (c) =>
      c.steward.history.some(
        (h) => h.kind === 'earthquake' || h.kind === 'landslide' || h.kind === 'tsunami',
      ),
    text: [
      'The Great Paving cut the Choir’s threads under the marshes. The lime quarries bled the hills. The reef mining broke its breakwater. The quakes, slides and waves that still trouble the island are, the singers said, the Choir’s old wounds from the Drowning.',
      'It is not angry. It is hurt, and slow, and it heals when it is cared for. A coast with its mangroves back does fewer of these things to itself.',
    ],
  },
  {
    id: 'grandmother',
    chapter: 'choir',
    title: 'Grandmother Tide',
    hint: 'When Turtle Isle settles off the coast',
    when: wonder('turtle'),
    text: [
      'Turtle Isle is the Choir’s eldest body, a sea turtle older than the reef, and its memory. She swims to wherever the sea is cleanest, and she has come here.',
      'The fishers say that if you lie on her shell on a still night you can hear her remembering: the marble city, the walls, the long night, and before all of that an island with no city on it at all.',
    ],
  },
  {
    id: 'ear',
    chapter: 'choir',
    title: 'The ear',
    hint: 'When the Prism Geode cracks open',
    when: wonder('geode'),
    text: [
      'The Abyssal Dome’s scientists measured the Prism Geode’s hum for a year before one of them noticed it was not random. The crystals ring in answer to the city: brighter when the island is happy, dimmer in a crisis, silent for an hour after the Long Tide’s anniversary.',
      'The Geode is one of the Choir’s ears. The question nobody can answer is what it is listening for. Some say a friend. Some say a city that deserves to stay.',
    ],
  },
  // ── The Mainland ──
  {
    id: 'drift',
    chapter: 'mainland',
    title: 'The Drift',
    hint: 'Reach the Grove era',
    when: era(1),
    text: [
      'When the coasts flooded, a great many people moved onto the water and never came back. The Drift is their confederation of fishing fleets, floating markets and fairground ships, following the seasons round the Shelf Sea. They are the Tidekin’s cousins, and they kept the old songs.',
      'Ama Reyes was Drift. So were the first fairground ships that put down roots on the south islet, and so is the crew of every festival barge that sails into the bay.',
    ],
  },
  {
    id: 'concord',
    chapter: 'mainland',
    title: 'The Concord',
    hint: 'Take a loan, or reach the Canopy era',
    when: (c) => c.steward.loans.length > 0 || c.charters.era >= 2,
    text: [
      'The coastal cities that survived the Drowning did it by doing what Halcyon did, only bigger. The Concord of Walled Cities stands behind seawalls a hundred metres high: rich, orderly, short of land and always building.',
      'It lends credit to anyone who will build as it does, and its loans come with clauses. Its envoys are polite, sincere, and genuinely puzzled that anyone would turn down a wall.',
    ],
  },
  {
    id: 'lanterns',
    chapter: 'mainland',
    title: 'The Lantern Orders',
    hint: 'Meet a Lantern archivist',
    when: (c) => told('archivist')(c) || c.stories.arcs.includes('archivist'),
    text: [
      'Scholars and divers who comb the drowned cities for their records, with lanterns on their boats to work the ruins at night. Their quest is a century old: Halcyon had a mind, its logs were never found, and some of them believe it is still running somewhere.',
      'Some want to study it. Some want to switch it on again. Some want to make sure it never wakes.',
    ],
  },
  {
    id: 'seal',
    chapter: 'mainland',
    title: 'Meridian’s seal',
    hint: 'Follow a diver’s find to its end',
    when: told('diver'),
    text: [
      'The marble the diver brought up was a lintel from the Assembly Steps, carved with Halcyon’s civic seal and, beneath it, a line in an older script the Lantern Orders later read for the city: "Every day better than the last."',
      'It was Meridian’s motto. It was carved over the door of the assembly that drowned.',
    ],
  },
  // ── The Flame ──
  {
    id: 'twin-lights',
    chapter: 'flame',
    title: 'The Twin Lights',
    hint: 'Raise the Aurora Gemini, or reach the Bloom era',
    when: (c) => c.charters.era >= 3 || hasDef((d) => d.id === 'aurora-gemini')(c),
    text: [
      'A Tidekin saying: when two lights stand on the island, the sea will make peace with it. They meant the Tidewatch Lighthouse and the flame in the drowned temple.',
      'The architect of the Aurora Gemini grew up in the Drift on that story. At the equinox the Sun Gate between the twin towers frames the lighthouse at dawn and the temple’s flame at dusk. Nobody planned it but her.',
    ],
  },
  {
    id: 'flame',
    chapter: 'flame',
    title: 'The Flame',
    hint: 'Reach the Bloom era after the Long Tide',
    when: all(era(3), wonder('colonnade')),
    text: [
      'The eternal flame in the Sunken Colonnade was never relit and has never gone out. It burns on a geothermal tap under the temple floor, and the sea that drowned everything else only cooled it. It is not a shrine fire. It is the last running core of Meridian.',
      'For a hundred years it has had no grid and no hands, only the flame and a thin, slow sense of the reef round its columns. Now it can see the island’s lights again, and the small mind it left in the vault, at work. Flora has asked what the city wants to do. She says she would like to know too.',
    ],
  },
  {
    id: 'relit',
    chapter: 'flame',
    title: 'The flame relit',
    hint: 'Chosen at the Flame',
    text: [
      'The city ran a line out to the colonnade and let the old mind speak. It said very little, slowly, over many nights. Mostly it asked questions: how many lived through the Long Tide, whether the marshes had come back, whether its daughter was well.',
      'Flora answers it every evening. Nobody else is quite sure what they talk about. The flame burns a little brighter since, and the Prism Geode hums along with it.',
    ],
  },
  {
    id: 'rest',
    chapter: 'flame',
    title: 'The flame at rest',
    hint: 'Chosen at the Flame',
    text: [
      'The city decided that the island had one mind already, and that it had learned the lesson the other never did. On a still night the whole island rowed out to the colonnade with lanterns, and Flora said goodbye in a language none of them knew.',
      'In the morning the flame was out. Grandmother Tide was asleep beside the columns, and the reef around them was brighter than anyone had seen it.',
    ],
  },
];

export const getPage = (id: string) => PAGES.find((p) => p.id === id);
export const ENDING_PAGES: Record<FlameEnding, string> = { relit: 'relit', rest: 'rest' };

/** Has this city found the page? Every page has, without progression. */
export const pageFound = (city: City, id: string): boolean =>
  !city.growth.progression || city.chronicle.found.some((f) => f.id === id);

/** Pages found so far, in the Chronicle's own order (ending pages only once chosen). */
export function foundPages(city: City): ChroniclePage[] {
  return PAGES.filter((p) =>
    p.when ? pageFound(city, p.id) : city.chronicle.found.some((f) => f.id === p.id),
  );
}

/** How often (pulses) the Chronicle checks for new pages. */
const EVERY = 5;

/** Every few pulses: write down the pages the city has earned. */
export function updateChronicle(city: City): void {
  if (!city.growth.progression || city.pulse.count % EVERY !== 0) return;
  const st = city.chronicle;
  for (const p of PAGES) {
    if (!p.when || st.found.some((f) => f.id === p.id) || !p.when(city)) continue;
    st.found.push({ id: p.id, tick: city.tick });
    city.bus.emit('chronicle:found', { id: p.id, title: p.title, chapter: p.chapter });
  }
}

/** Why the flame's question can't be answered now, or null. */
export function endingBlock(city: City): string | null {
  if (city.chronicle.ending) return 'The city has already chosen.';
  if (!pageFound(city, 'flame')) return 'The Flame has not been found yet.';
  return null;
}

export function registerChronicleCommands(stack: CommandStack<SimCtx>): void {
  stack.register<{ ending: FlameEnding }, true>('chronicleEnding', {
    apply({ city }, p) {
      if ((p.ending !== 'relit' && p.ending !== 'rest') || endingBlock(city)) return null;
      const st = city.chronicle;
      st.ending = p.ending;
      const page = getPage(ENDING_PAGES[p.ending])!;
      st.found.push({ id: page.id, tick: city.tick });
      city.bus.emit('chronicle:found', { id: page.id, title: page.title, chapter: page.chapter });
      city.bus.emit('chronicle:ending', { ending: p.ending });
      return true;
    },
    // The city's answer at the flame is a decision, not an edit (like story choices, undoable = false).
    revert() {},
  });
}

/** The Chronicle in plain JSON for Flora (`chronicle_status`) and tests. */
export function chronicleReport(city: City) {
  const found = new Set(foundPages(city).map((p) => p.id));
  return {
    found: found.size,
    total: PAGES.filter((p) => p.when).length,
    ending: city.chronicle.ending,
    chapters: CHAPTERS.map((ch) => ({
      chapter: ch.name,
      pages: PAGES.filter((p) => p.chapter === ch.id && (p.when || found.has(p.id))).map((p) =>
        found.has(p.id)
          ? { title: p.title, text: p.text.join(' ') }
          : { title: '(not found yet)', hint: p.hint },
      ),
    })),
  };
}
