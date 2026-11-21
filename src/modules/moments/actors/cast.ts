import type { GameContext } from '@/game/context';
import { Cat3D, type CatPose } from '@/modules/charm/cat3d';
import { COATS } from '@/modules/charm/art';
import { Person3D, type Look, type PersonPose } from './person';
import { Gull3D, type GullPose } from './gull';
import { Flora3D } from './flora';

/**
 * The films' recurring cast (D-197), one look each, and their exhibits in the model gallery's "Film cast" hall
 * (each pose is a level), so a character is reviewed on the gallery's lit stage before a film uses it.
 */
export const CAST = {
  /** The old fisher of "Something Stirs" (a different name per city, the same oilskins). */
  fisher: { skin: 0xe8b48e, hair: 0xb9b4ad, top: 0xf2c23a, bottom: 0x3e5a7a, vest: 0xe9a62a, hat: 'souwester', hatColour: 0xf2c23a, beard: true, prop: 'rod', shoes: 0x2b2b30 },
  /** The Sky-lane test pilot of "Maiden Flight" (who would rather be anywhere else). */
  pilot: { skin: 0xc68e62, hair: 0x2a1d16, top: 0x7fd1c7, bottom: 0x33383f, vest: 0x8a6a3a, hat: 'helmet', hatColour: 0x5a3a24, prop: 'clipboard', shoes: 0x5a3a24 },
  /** Ama Reyes, who lit the Tidewatch Lighthouse ("First Light"). */
  keeper: { skin: 0x9a6440, hair: 0x15120f, top: 0x2f4f6a, bottom: 0x4a3a2c, vest: 0x6a8a5a, hat: 'hood', hatColour: 0x3a5a4a, long: true, prop: 'lantern', shoes: 0x3a2a20 },
  /** A Halcyon citizen ("What the Sea Remembers"): white linen. */
  citizen: { skin: 0xf6d2b4, hair: 0x5a3a24, top: 0xf4f1e8, bottom: 0xe9e2d0, shoes: 0xc9a77a, long: true },
} satisfies Record<string, Look>;

/** A crowd member's look, varied by `i` (a dock's cheering residents). */
export function crowdLook(n: number): Look {
  const i = Math.abs(Math.round(n)) % 420;
  const tops = [0xf2a7a0, 0x7fd1c7, 0xf7d36b, 0x9ec5ff, 0xc9a7f2, 0xf4f1e8, 0xe7795f];
  const skins = [0xf6d2b4, 0xe8b48e, 0xc68e62, 0x9a6440, 0x6e4430];
  const hairs = [0x2a1d16, 0x15120f, 0x5a3a24, 0xd8b46a, 0x8a4a2a, 0xe58fb5];
  const bottoms = [0x3e5a7a, 0x9a8a68, 0x33383f, 0x5f7a4a];
  const hats = ['none', 'none', 'beanie', 'cap', 'none'] as const;
  return {
    skin: skins[(i * 3) % skins.length]!,
    hair: hairs[(i * 5) % hairs.length]!,
    top: tops[i % tops.length]!,
    bottom: bottoms[(i * 7) % bottoms.length]!,
    hat: hats[i % hats.length],
    hatColour: tops[(i + 3) % tops.length]!,
    long: i % 3 === 1,
    prop: i % 4 === 2 ? 'flag' : 'none',
  };
}

const PERSON_POSES: PersonPose[] = ['stand', 'walk', 'cheer', 'startled', 'shrug', 'facepalm', 'point', 'wave', 'sit', 'fish', 'slump', 'hold', 'think', 'grip', 'read'];
const CAT_POSES: CatPose[] = ['idle', 'wide', 'creep', 'freeze', 'tiptoe', 'leap', 'land', 'proud', 'trust'];
const GULL_POSES: GullPose[] = ['stand', 'fly', 'glide', 'squawk'];
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** The "Film cast" hall of the model gallery. */
export function addCastExhibits(ctx: GameContext): void {
  const gallery = ctx.services.tryGet('gallery');
  if (!gallery) return;
  const people: [keyof typeof CAST, string, string][] = [
    ['fisher', 'The old fisher', 'Something Stirs: the fisher who misses every wonder the sea gives back, until the sixth.'],
    ['pilot', 'The test pilot', 'Maiden Flight: the first pod’s pilot, who would rather be anywhere else.'],
    ['keeper', 'Ama Reyes', 'First Light: the keeper who lit the Tidewatch Lighthouse and brought the first boat in.'],
    ['citizen', 'A citizen of Halcyon', 'What the Sea Remembers: the white city that built one more wall.'],
  ];
  for (const [id, name, blurb] of people)
    gallery.add({
      id: `cast:${id}`,
      name,
      group: 'Film cast',
      blurb,
      levels: PERSON_POSES.map(cap),
      build: (level) => {
        const p = new Person3D(CAST[id]);
        p.act(PERSON_POSES[level] ?? 'stand');
        p.pose.snap();
        p.root.rotation.y = -0.5;
        return { object: p.root, update: (_t, dt) => p.update(dt) };
      },
    });
  gallery.add({
    id: 'cast:gull',
    name: 'The gull',
    group: 'Film cast',
    blurb: 'Maiden Flight and Something Stirs: the island’s gull, who has never bought a ticket for anything.',
    levels: GULL_POSES.map(cap),
    build: (level) => {
      const g = new Gull3D();
      g.pose = GULL_POSES[level] ?? 'stand';
      g.root.rotation.y = -0.5;
      return { object: g.root, update: (_t, dt) => g.update(dt) };
    },
  });
  gallery.add({
    id: 'cast:flora',
    name: 'Flora',
    group: 'Film cast',
    blurb: 'Hello, World: the city’s civic intelligence as she wakes, a bloom of six petals round a core with one eye.',
    levels: ['Bud', 'Waking', 'In bloom'],
    build: (level) => {
      const f = new Flora3D();
      f.open = level / 2;
      f.wake = level / 2;
      f.eyeOpen = level > 0 ? 1 : 0;
      f.root.rotation.y = 0.5;
      return { object: f.root, update: (_t, dt) => f.update(dt) };
    },
  });
  gallery.add({
    id: 'cast:cat',
    name: 'The island’s cat',
    group: 'Film cast',
    blurb: 'The Stray and Hello, World: the island’s cat in 3D, in its ginger coat here (each island’s coat is its own).',
    levels: CAT_POSES.map(cap),
    build: (level) => {
      const c = new Cat3D();
      c.paintCoat(COATS[0]!);
      c.pose(CAT_POSES[level] ?? 'idle');
      c.root.rotation.y = -0.5;
      return { object: c.root, update: (_t, dt) => c.update(dt) };
    },
  });
}
