/**
 * Paper-plane notes (D-175): short, warm letters from residents to their steward. `{island}` is the island's name
 * and `{cat}` the island's cat. Lines are data: add freely, keep each under ~110 characters and kind.
 */
export const NOTES: readonly string[] = [
  'Dear steward, my balcony tomatoes are now the size of my fist. Thank you!',
  'We named the new goat after you. She is very stubborn. It is a compliment.',
  'A kid drew you a picture. It is mostly green. It is the island.',
  "The bees say hi. (They don't. But they would.)",
  '{cat} slept on my solar panel all afternoon. Output down 2%. Worth it.',
  'Is it true the fish wave at the boats? Asking for my grandma.',
  'Found a perfect seashell. I left it on the town hall step for you.',
  'Our street smells of jasmine and fresh bread. Ten out of ten.',
  'My son wants to be a steward when he grows up. Or a dolphin.',
  'Thank you for the trees. Signed, the birds (dictated).',
  'Please never pave the moss path. It is the softest place on {island}.',
  'The sunset from the pier tonight was ridiculous. You should see it.',
  'I learned to whistle today. Practising on everyone. Sorry in advance.',
  'Grandpa says {island} is the first place he has ever called home.',
  'The kite club (me) formally requests more wind. Thank you.',
  'A gull stole my whole sandwich at the park. Unrelated: love the park.',
  'Somebody knitted a scarf for the lighthouse. It looks very warm.',
  'My plants and I are thriving. Mostly the plants.',
  'Folded this in class. The teacher says hello, and to sit up straight.',
  '{cat} followed me home, ate my dinner and left. Best evening this month.',
  'We counted 41 butterflies on the way to school. New record!',
  'Our grandmother danced at the festival. She has not stopped talking about it.',
  'If you ever need a nap, the hammocks by the water are excellent.',
  'Thank you for keeping the lights on. My night-light thanks you too.',
];

/** The note picked by `r` in [0, 1), with the island's and cat's names filled in. */
export function noteText(r: number, island: string, cat: string): string {
  const line = NOTES[Math.floor(r * NOTES.length) % NOTES.length]!;
  return line.replaceAll('{island}', island || 'the island').replaceAll('{cat}', cat);
}
