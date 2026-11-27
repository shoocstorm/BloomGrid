/**
 * The sea wonders' stories (D-164): what each one is, the island's tale about it, what to look for and a few facts,
 * shown in the wonder's inspector (`index.ts`) and summarised in the knowledge base
 * (`docs/knowledge/basics/sea-wonders.md`). Plain data: no three, no DOM.
 */
export interface WonderLore {
  /** Inspector glyph (`ui/icons.ts`). */
  glyph: string;
  name: string;
  /** One line under the title. */
  tagline: string;
  /** The tale, a few short paragraphs. */
  story: string[];
  /** What to look for, close up. */
  look: string[];
  facts: [string, string][];
  bestSeen: 'Day' | 'Night' | 'Day and night' | 'Sunset';
  /** A line in the keeper's voice. */
  quote: string;
}

export const LORE: Record<string, WonderLore> = {
  lighthouse: {
    glyph: 'bulb',
    name: 'Tidewatch Lighthouse',
    tagline: 'The first light the island ever lit, and still the last one to go out.',
    story: [
      'Before there was a city there was a keeper. Ama Reyes, a fisher of the Drift, rowed out to this rock with a crate of solar glass and a promise to the fishing boats that nobody would be lost to the northern reefs again. She built the tower band by band, coral red and pearl white, so that even on a grey morning a sailor could count the stripes and know where home was. It was the first light lit on the island in a hundred years.',
      'The cottage, the jetty and the sailboat are hers; the keepers since have only added flowers. On the night the city was founded, every new resident walked to the north shore to watch the beam come round, and the tradition stuck: a city in BloomGrid begins when someone looks out to sea and sees this light.',
    ],
    look: [
      'The spiral of lit windows climbing the tower',
      'The keeper’s cottage with its solar roof and flower boxes',
      'The little sailboat moored at the jetty',
      'At night, two beams sweeping the sea',
    ],
    facts: [
      ['Height', '35 m to the vane'],
      ['Light', 'Two beams, one turn every 12 s'],
      ['Keeper', 'Always one, never the same twice'],
    ],
    bestSeen: 'Night',
    quote: '“Count the stripes, then count the beams. If both add up, you are home.”',
  },
  tideGates: {
    glyph: 'wave',
    name: 'Tide Gates',
    tagline: 'Three pearl rings that tell the sea how far it may come.',
    story: [
      'Nobody built the Tide Gates; they were grown. The reef-singers of the Tidekin, the people who stayed when the old marble city drowned, seeded three rings of living pearl on the shoals to the south-west and sang to them for a generation, until they stood taller than any wave. When a storm surge comes in, the runes along their faces wake one by one and the rings hum a single low note. The sea, the story goes, listens.',
      'The channel buoys between them were added later for the fishing boats, red to port and green to starboard, and the crown jewels were a gift from the first city council: one for each promise the island made to the sea. Keep the reef healthy, take only what it can spare, and never build where the water wants to be.',
    ],
    look: [
      'Runes glowing along both faces of each ring',
      'A jewel in a brass crown at the top of every gate',
      'Branching coral and sea fans round the stone plinths',
      'The red and green channel buoys between the rings',
    ],
    facts: [
      ['Rings', 'Three, 22, 15 and 10 m across'],
      ['Made of', 'Living pearl, bronze inlay'],
      ['Rises when', 'The city reaches 1,500 residents'],
    ],
    bestSeen: 'Sunset',
    quote: '“Three rings, three promises. The sea remembers all of them.”',
  },
  lotus: {
    glyph: 'flower',
    name: 'Lotus Atoll',
    tagline: 'A garden that floats, and blooms only for a city in bloom.',
    story: [
      'The Lotus Atoll drifts in the warm water north of the island and opens only when the city below is green enough to deserve it. Botanists say the giant lotuses feed on the pollen that blows off a living city’s roofs; the tea-house keeper says they simply like to be admired. The old reef-singers called it the Choir’s garden.',
      'Every evening someone rows out to light the floating lanterns, one for each resident who planted something that day. On festival nights there are thousands, and from the shore the atoll looks like a second, smaller city made of light. The tea pavilion on the second pad serves one blend, brewed from the petals that fall, and nobody has ever paid for a cup.',
    ],
    look: [
      'Four whorls of petals round a golden seed pod in every flower',
      'A closed bud standing up from a pad',
      'The tea pavilion with its living roof',
      'Raised leaves like green parasols, and lanterns drifting between the pads',
    ],
    facts: [
      ['Flowers', 'Up to 7 m across'],
      ['Lanterns', 'Lit every evening'],
      ['Rises when', 'Bloom index 55%+ from day 2'],
    ],
    bestSeen: 'Night',
    quote: '“Sit still long enough and the flowers turn to look at you.”',
  },
  dome: {
    glyph: 'eye',
    name: 'Abyssal Dome',
    tagline: 'A glass observatory that looks down as well as up.',
    story: [
      'The Abyssal Dome was the island’s first shared laboratory: astronomers in the cupola at the top, marine biologists in the glass rooms under the waterline, and one long table in the middle where they had to eat together. Most of what the city knows about its reef, its weather and its whales was argued out at that table, including the first measurements of the glow the Tidekin called the Choir.',
      'The solar petals round the rim open with the sun, and the little yellow submarine at the pier takes visitors down along the kelp farm to the dome’s lower rooms, where on a clear day you can watch the whales pass below your feet. It only rises for a city whose people are happy enough to wonder about things.',
    ],
    look: [
      'The telescope and dish on the cupola, the beacon on the spire',
      'Fourteen solar petals round the rim',
      'The yellow submarine at the end of the pier',
      'Rows of kelp-farm floats to the east',
    ],
    facts: [
      ['Dome', '18 m across, ribbed glass'],
      ['Legs', 'Twelve, raked into the seabed'],
      ['Rises when', 'Harmony 70+ from day 4'],
    ],
    bestSeen: 'Day and night',
    quote: '“Look up, then look down. It is the same wonder from both ends.”',
  },
  stacks: {
    glyph: 'leaf',
    name: 'Verdant Pillars',
    tagline: 'Six sea stacks wearing a jungle on their heads.',
    story: [
      'The Verdant Pillars are what is left of an older island, older even than the marble city in the bay, worn away by ten thousand years of waves until only its hardest rock stood up out of the sea. The jungle on their crowns has never been planted or cut; seeds arrive on the wind and in the birds, and whatever lands up there grows as it likes.',
      'The rope bridges were strung by the first ecologists who came to count the species, and the treehouse on the centre stack was their field station. They counted for forty years and never finished. A waterfall pours off the tallest pillar after every rain, and the sea arch to the south-east is said to grant a wish to anyone who sails through it at dawn.',
    ],
    look: [
      'Rope bridges with a lantern between the centre stack and its neighbours',
      'The waterfall and its mist at the foot of the tallest pillar',
      'Flowering vines hanging down the cliffs',
      'The treehouse and the mossy sea arch',
    ],
    facts: [
      ['Stacks', 'Six, 12 to 30 m tall'],
      ['Species counted', 'Still counting'],
      ['Rises when', '40 buildings and a healthy ecology'],
    ],
    bestSeen: 'Day',
    quote: '“We came to count the jungle. The jungle is still counting us.”',
  },
  turtle: {
    glyph: 'nature',
    name: 'Turtle Isle',
    tagline: 'An island that is asleep, and dreams a garden.',
    story: [
      'Turtle Isle is a sea turtle older than any map, dozing at the surface so long that soil gathered in the hollows of her shell and a garden grew. Fishermen call her Grandmother Tide, and the old singers said she is the sea’s own memory. She wakes once in a lifetime, they say, and swims to wherever the sea is cleanest, which is why she settled off this coast when the city learned to look after its own.',
      'The shrine among the palms was built by the first child to swim out to her, and every visitor since has left a pebble round the tide pool for luck. Speak quietly on the shell: she is listening, and she has never once let a city that cared for the sea go without a good harvest.',
    ],
    look: [
      'The scutes of her shell under the garden',
      'Her half-closed eye and calm, raised head',
      'The shrine with its tiered roof and lantern',
      'The tide pool ringed with pebbles left for luck',
    ],
    facts: [
      ['Shell', '27 m from head to tail'],
      ['Age', 'Older than the reef'],
      ['Rises when', 'Ecology 60+ from day 5'],
    ],
    bestSeen: 'Day',
    quote: '“Walk softly. You are standing on someone’s back.”',
  },
  colonnade: {
    glyph: 'ruin',
    name: 'Sunken Colonnade',
    tagline: 'The temple of a city that forgot the sea was rising.',
    story: [
      'Long before BloomGrid, another city stood on this coast. Its name was Halcyon. It was rich and proud and built in white marble, and it paved over its wetlands and cut down its mangroves and told itself the sea would always stay where it was. The sea did not. All that is left is the temple of its harbour, a ring of fluted columns standing to their knees in the water and a rotunda where an eternal flame still burns.',
      'The ivy and the glowing moss arrived on their own. The citizens of BloomGrid come out here when they are deciding something difficult, to sit on the steps and remember what happens to a city that only plans for today. The colonnade rises out of the haze once a city is big enough to need the reminder.',
    ],
    look: [
      'Lintels with glowing glyphs along the standing columns',
      'The fallen column’s drums tumbled into the sea',
      'The domed rotunda with its eternal flame and braziers',
      'Ivy, moss and lily pads reclaiming the ruins',
    ],
    facts: [
      ['Columns', 'Fourteen, four of them broken'],
      ['Flame', 'Never been relit, never gone out'],
      ['Rises when', '3,000 residents from day 6'],
    ],
    bestSeen: 'Sunset',
    quote: '“They built for forever and forgot the tide. Build for the tide, and forever takes care of itself.”',
  },
  geode: {
    glyph: 'gem',
    name: 'Prism Geode',
    tagline: 'A stone egg cracked open to show what a happy city is made of.',
    story: [
      'For centuries the Prism Geode was a plain grey rock that sailors used as a landmark and nothing more. Then one night, the story goes, the city was so content that its laughter carried across the water, and the rock split along a seam nobody had seen. Inside were crystals taller than houses: amethyst, rose and aqua, each one humming at a different pitch.',
      'The crystals glow after dark with light they gather during the day, and the boardwalk round the geode fills with people on clear nights who come to watch them brighten as the sun goes down. Scientists from the Abyssal Dome measure the hum; the Tidekin called the Geode one of the Choir’s ears; poets prefer not to know what it means.',
    ],
    look: [
      'The great crystal cluster bursting from the cracked shell',
      'Small crystal points lining the inner wall',
      'Shards scattered on the rocks, lamps along the boardwalk',
      'At night, every crystal aglow',
    ],
    facts: [
      ['Tallest crystal', '19 m'],
      ['Colours', 'Amethyst, rose, aqua'],
      ['Rises when', 'Harmony 75+ with 5,000 residents'],
    ],
    bestSeen: 'Night',
    quote: '“It took a whole city being happy at once to crack it open.”',
  },
  whales: {
    glyph: 'wave',
    name: 'Whale pods',
    tagline: 'Glowing humpbacks that sing the island’s weather.',
    story: [
      'Two pods of humpbacks live in the deep water round the island, their backs dotted with the same lumen glow as the reef. They do not stay put: each pod roams a ring of feeding grounds right round the coast, lingering at one for a while and then swimming slowly on to the next, so the whales off the south shore this morning may be off the east by evening. At a feeding ground they cruise deep, rise to blow two or three times, then arch their backs and dive with their flukes in the air. On most passes one of them breaches: a whole whale bursting out of the sea, twisting onto its side in mid-air and landing with a crash you can hear from the shore.',
      'The fishing crews read the weather from them, a habit they learned from the Tidekin. Breaching means fair skies; a pod that stays deep means a storm is coming. Each pod has a calf that swims at its mother’s side, and the city names every new calf by vote.',
    ],
    look: [
      'Spouts of mist when they surface to breathe',
      'A breach: a whale clear of the water, twisting as it falls',
      'Flukes raised as they dive',
      'At night, glowing spots along their flanks',
      'Rings spreading from a breach, and the smooth slick a fluke leaves',
      'A pod swimming on to its next feeding ground, its wake behind it',
    ],
    facts: [
      ['Pods', 'Two, four whales each'],
      ['Length', 'Up to 17 m'],
      ['Calves', 'One per pod, by its mother'],
      ['Range', 'Eleven feeding grounds round the island'],
    ],
    bestSeen: 'Day and night',
    quote: '“When the whales jump, hang out the washing.”',
  },
  dolphins: {
    glyph: 'wave',
    name: 'Dolphin schools',
    tagline: 'Racing the ferry, and usually winning.',
    story: [
      'Two schools of dolphins patrol the island’s outer water, leaping in arcs as they go and splashing at the top of every jump just to be seen. They follow the Tidesong cruise ferry out of the bay whenever they can, and the crew insists they keep score.',
      'Every so often a school runs deep for a while and the sea goes quiet; then they are back, leaping all at once, as if they had only gone to fetch their friends.',
    ],
    look: ['Leaps in arcs with a splash in and a splash out', 'The school running deep, then all surfacing together'],
    facts: [
      ['Schools', 'Two, seven dolphins each'],
      ['Speed', 'Faster than the ferry'],
    ],
    bestSeen: 'Day',
    quote: '“They are not racing us. They are just letting us come along.”',
  },
};
