/**
 * What the island's cat says (D-177), by occasion. `{cat}`, `{island}`, `{day}`, `{name}` (a crisis or wonder) are
 * filled in by `line`. Lines are data: add freely, keep each short (a bubble, under ~80 characters) and in the
 * cat's voice: curious, a little vain, fond of the steward, food-motivated.
 */
export const TALK = {
  hello: [
    "Hi! I'm {cat}. I live on your rooftops. Pet me sometime?",
    "Oh, a new steward! I'm {cat}. I'll show you the warm roofs.",
  ],
  adopted: [
    "Hi. I'm {cat}. I live here now. With you. That's decided.",
    '{cat}, at your service. Mostly at my own service. But nearby.',
  ],
  helloBack: [
    'You came back! I kept the roofs warm for you.',
    'Welcome back, steward. Nothing exploded. Probably.',
    "There you are! {island} missed you. I didn't. (I did.)",
  ],
  morning: [
    'Good morning! Day {day}. Breakfast first?',
    'Day {day}! I had the best nap. Big plans today?',
    'Sun is up, so am I. Mostly. Day {day}.',
  ],
  evening: ['The lamps are coming on. Nearly nap time…', 'Getting dark. I know a warm roof. Night, steward.'],
  milestone: [
    'You did it! I knew you could.',
    'A milestone! Does that come with treats?',
    'Look at you go. Proud of you.',
  ],
  built: [
    'Ooh, a fresh roof. Still warm.',
    'Is that for me? It looks like it is for me.',
    'New building! New napping spot.',
  ],
  home: ['New neighbours! I hope they have fish.', 'More people to pet me. Excellent planning.'],
  level: ['That building grew! Better view from up there.', 'Taller and taller. I approve.'],
  golden: ['Shiny! You caught it!', 'Ooh, a golden one. You have quick paws.'],
  goldenSpotted: [
    'Psst! A golden bubble! Quick, before it floats off!',
    'Something shiny over there. Get it!',
  ],
  planeSpotted: ['A paper plane! Catch it, catch it!', 'Mail! Flying mail! Grab it!'],
  combo: ['Pop pop pop! You are fast.', 'Combo! Even I am impressed.'],
  claimable: [
    'Psst. Your milestone is ready. The glowing button!',
    'You earned a reward and left it sitting there. Claim it!',
  ],
  fireworks: ["Sparkles! I'll watch from here.", 'Boom! …I was not scared. You were.'],
  crisis: [
    'Uh-oh. {name}. Stay calm. I will stay calm too. Mostly.',
    '{name}! Hide the fish! I mean, you have got this.',
  ],
  crisisEnd: ['Phew. It is over. You did good.', 'All clear! Back to napping.'],
  fire: ['I smell smoke! Over there!', 'Fire! Quick, the Ember Watch!'],
  project: ['A grand plan, finished! I helped. By watching.', 'Done! What do we unlock next?'],
  happening: ['Something is going on in town! Do they have fish?', 'Listen! Residents are up to something.'],
  bridge: ['A bridge! Now I can visit the other side.', 'Ooh, a bridge. Good for chasing birds across.'],
  wonder: [
    'Whoa. {name}! Look what rose from the sea!',
    '{name}… that is the prettiest thing I have ever seen. After me.',
  ],
  era: ['A new era! {island} is growing up.', 'Look how far we have come, steward.'],
  follow: ['Wait for me!', 'Coming!', 'Where are we going?', 'Hey, slow down!'],
  thriving: [
    'Everyone is purring today.',
    'Full bellies, warm roofs. You are good at this.',
    '{island} feels happy. I can tell. I am a cat.',
  ],
  idle: [
    'I counted the boats. Then I forgot. Then I napped.',
    'Do you think the seagulls like me? They do not.',
    'This roof has the best sun. Ten out of ten.',
    'If you ever need advice: nap first. Decide later.',
    'I saw a butterfly. Then I saw another butterfly.',
    'You are doing great, steward. I am doing great too.',
  ],
  low: {
    energy: [
      'The lights flickered. I do not like the dark… unless I am napping.',
      'Power is short. My heated roof is cold!',
    ],
    water: [
      'My water bowl looks worried. We need more water.',
      'The fountains are sad and so am I. Water, please?',
    ],
    food: [
      'The market is nearly empty. I am worried about dinner.',
      'Not enough food. Even the fishmonger is hungry.',
    ],
    jobs: ['Lots of people sitting around. That is MY job.', 'Folks need work. Something to build, maybe?'],
    harmony: [
      'People look grumpy. Grumpier than me before breakfast.',
      'Nobody pets me when they are this unhappy.',
    ],
    budget: ['The treasury jingles less than my bell. Careful!', 'Money is tight. I can work for treats.'],
  },
  bond: [
    '',
    '{cat} thinks you are a friend now.',
    '{cat} has decided you are a Buddy. Huge honour.',
    'Best friends! {cat} will follow you anywhere. (Already does.)',
  ],
};

export type TalkKind = Exclude<keyof typeof TALK, 'low' | 'bond'>;

/** One line of `lines`, with the blanks filled in. */
export function line(lines: readonly string[], vars: Record<string, string | number>): string {
  const pick = lines[Math.floor(Math.random() * lines.length)] ?? '';
  return pick.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ''));
}
