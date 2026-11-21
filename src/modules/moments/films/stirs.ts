import type { City } from '@/sim/City';
import type { GameContext } from '@/game/context';
import { LORE } from '@/modules/scenery/lore';
import { WONDERS } from '@/sim/wonders';
import { h } from '@/ui/dom';
import { openReel } from '../reel';
import { cloud, seeded } from './art';
import './stirs.css';

/**
 * "Something Stirs" (D-185, D-193): a sea wonder rises, ~19 s. It plays for six of the seven wonders, so it is a
 * serial, not a rerun: the same old fisher (one per city) misses every wonder in a new way, and on the sixth he
 * finally sees one. Each episode is shot like film:
 *
 * 1. **Wide**, a slow push-in: the boat at sea, in the light of that wonder's hour (`LOOKS`: the Tide Gates after a
 *    storm, the Lotus at dawn, the Stacks in mist, the Dome at night, the Turtle at noon, the Geode under an aurora).
 * 2. **Close** on the fisher: the episode's gag (`BITS`; a `tease` beat first where it needs suspense, as the
 *    float nibbling before the boot comes up), which always ends with something going over the side.
 * 3. **Under the sea** (a hard cut): the thing sinks past the hull, a school of fish, light shafts; the camera tilts
 *    down after it to the reef, where the Choir's light (`docs/lore/bible.md` Part IV) runs in, gathers and flares,
 *    and something vast stirs.
 * 4. **Rise**, low and wide: the camera tilts up as the wonder breaks the surface, shaking; a ring of swell runs out,
 *    spray, water sheeting off it, gulls scatter, dolphins (the Choir's scouts) leap, and the swell lifts the boat.
 * 5. **Reaction**, a medium two-shot with the wonder behind him: the gag's payoff.
 * 6. **Final**, a wide pull-out, then the card (name, tagline, the keeper's line, a Tidekin saying, the episode).
 *
 * Episodes follow the order this city found its wonders (the showcase: `WONDERS` order). The camera is one wrapper
 * (`.sw-cam`) whose shot (`data-shot`) is a CSS animation, so a new shot is a hard cut and a shot's own animation is
 * its camera move. The CSS prefixes are `sw-` (the surface) and `su-` (under the sea).
 */

/** Each wonder's episode in its own key (D-195), semitones from A. */
const KEYS: Record<string, number> = { tideGates: 0, lotus: 2, stacks: -2, dome: -5, turtle: 3, geode: -3 };

const FISHERS = ['Marlo', 'Pim', 'Teodor', 'Kofi', 'Bram', 'Anselm', 'Joaquim', 'Hamish'];

/** A wonder's hour: sky, sea, sun (or moon), clouds, and a mood layer. */
interface Look {
  /** "A quiet ___": the time of day in words. */
  word: string;
  /** The sky from the zenith (`top`) down to the sea line. */
  top: string;
  sky: string;
  sea: [string, string, string];
  under: [string, string];
  /** Sun: across (vw), height above the sea line (vh), core and glow colours, rays' strength. */
  sun: { x: number; y: number; core: string; glow: string; rays: number };
  cloud: [string, string];
  isle: string;
  /** The wonder's silhouette and its lit details. */
  ink: string;
  hi: string;
  mood?: 'rain' | 'mist' | 'night' | 'aurora';
  /** The boat and fisher's light (night is dim). */
  dim?: number;
}

const GOLDEN: Look = {
  word: 'afternoon',
  top: '#4a6fa8',
  sky: 'linear-gradient(#4a6fa8 0%, #8a8fc0 40%, #e7a6a2 72%, #ffc98f 88%, #ffe2a8 100%)',
  sea: ['#5c93b8', '#2f6d96', '#174a6e'],
  under: ['#1f6f94', '#03141f'],
  sun: { x: 74, y: 9, core: '#fffdf0', glow: 'rgba(255, 220, 150, 0.85)', rays: 0.5 },
  cloud: ['#ffe3c9', '#e6a3a0'],
  isle: '#8a6f8f',
  ink: '#3c5a78',
  hi: '#c7f1ff',
};

export const LOOKS: Record<string, Look> = {
  tideGates: {
    word: 'evening after the storm',
    top: '#2f394f',
    sky: 'linear-gradient(#2f394f 0%, #56607c 38%, #a88a8c 70%, #f0b27a 88%, #ffd8a0 100%)',
    sea: ['#5a7f98', '#2c5674', '#123349'],
    under: ['#1c5a78', '#04151f'],
    sun: { x: 76, y: 5, core: '#fff1cf', glow: 'rgba(255, 190, 120, 0.75)', rays: 0.6 },
    cloud: ['#c9b5b8', '#5c5a72'],
    isle: '#5d5870',
    ink: '#30475e',
    hi: '#dff6ff',
    mood: 'rain',
  },
  lotus: {
    word: 'dawn',
    top: '#2e3a6b',
    sky: 'linear-gradient(#2e3a6b 0%, #7a6aa8 34%, #f09ab0 66%, #ffc3a0 86%, #fff0c8 100%)',
    sea: ['#8a9cc8', '#4f6aa0', '#23345e'],
    under: ['#2a4f86', '#060f22'],
    sun: { x: 24, y: 3, core: '#fff7e6', glow: 'rgba(255, 170, 170, 0.8)', rays: 0.5 },
    cloud: ['#ffd0dc', '#b77f9e'],
    isle: '#8a6f9a',
    ink: '#3c4f78',
    hi: '#fff0f6',
  },
  stacks: {
    word: 'morning',
    top: '#8fb0c2',
    sky: 'linear-gradient(#8fb0c2 0%, #b9cfd2 50%, #e4e2cf 85%, #f3ead2 100%)',
    sea: ['#8fb0ae', '#5c8a8c', '#2c5458'],
    under: ['#2f6a6a', '#06191a'],
    sun: { x: 66, y: 22, core: '#fffbe8', glow: 'rgba(255, 250, 220, 0.6)', rays: 0.2 },
    cloud: ['#f4f4ec', '#b8c6c4'],
    isle: '#7f9894',
    ink: '#3d5a56',
    hi: '#e8fff4',
    mood: 'mist',
  },
  dome: {
    word: 'night',
    top: '#040919',
    sky: 'linear-gradient(#040919 0%, #0c1a3c 50%, #1d3160 85%, #2c4470 100%)',
    sea: ['#1e3a5c', '#0f2440', '#050d1c'],
    under: ['#08263c', '#01060c'],
    sun: { x: 70, y: 26, core: '#f4f6ff', glow: 'rgba(190, 210, 255, 0.45)', rays: 0 },
    cloud: ['#34446a', '#151f3a'],
    isle: '#141f38',
    ink: '#1c3550',
    hi: '#9ff6ff',
    mood: 'night',
    dim: 0.7,
  },
  turtle: {
    word: 'noon',
    top: '#2f8fd8',
    sky: 'linear-gradient(#2f8fd8 0%, #5fb4ea 45%, #a8dcf2 85%, #dff4f6 100%)',
    sea: ['#3fc2c8', '#1f94b0', '#0c5a7c'],
    under: ['#1a8aa0', '#03222e'],
    sun: { x: 80, y: 40, core: '#ffffff', glow: 'rgba(255, 255, 230, 0.7)', rays: 0.35 },
    cloud: ['#ffffff', '#c8dcea'],
    isle: '#5f9a8a',
    ink: '#2f5a48',
    hi: '#bff7d0',
  },
  geode: {
    word: 'dusk',
    top: '#120c2c',
    sky: 'linear-gradient(#120c2c 0%, #2c1f5c 40%, #6a3f88 70%, #c0709a 90%, #f0a08a 100%)',
    sea: ['#5c4f8a', '#2e2a5c', '#120f2a'],
    under: ['#2a2060', '#05030f'],
    sun: { x: 30, y: 1, core: '#ffe6d0', glow: 'rgba(255, 150, 170, 0.6)', rays: 0.3 },
    cloud: ['#b07fb0', '#4c3570'],
    isle: '#3a2c5a',
    ink: '#2a2450',
    hi: '#f0c8ff',
    mood: 'aurora',
    dim: 0.85,
  },
};

/** One episode's gag: what he does instead of watching, and what goes over the side. */
interface Bit {
  id: 'boot' | 'bino' | 'camera' | 'kid' | 'coffee' | 'fish';
  /** What sinks in the under-the-sea shot (`ITEMS`), and where it went in (share of the boat's width). */
  item: keyof typeof ITEMS;
  ix: number;
  open: (f: string, word: string) => string;
  /** A beat before the gag lands (stage `hook` follows it), ~2 s. */
  tease?: string;
  a: string;
  b: string;
  under: string;
  react: (f: string) => string;
  /** The card's last line. */
  tag: (f: string) => string;
}

export const BITS: Bit[] = [
  {
    id: 'boot',
    item: 'boot',
    ix: 0.96,
    open: (f, w) => `A quiet ${w}. The fish weren't biting. Neither was ${f}.`,
    tease: 'Something nibbled at the line…',
    a: 'A bite! …a boot. Again.',
    b: 'He threw it back. Some things belong to the sea.',
    under: 'Far below, the reef’s old light stirred. Something had noticed.',
    react: () => '…huh.',
    tag: (f) => `${f} saw nothing`,
  },
  {
    id: 'bino',
    item: 'sandwich',
    ix: 0.5,
    open: (f) => `${f} had heard the stories. This time, he would keep watch.`,
    a: 'He kept a very close watch. On a gull.',
    b: 'The gull took his sandwich. Then dropped it in the sea.',
    under: 'Far below, the Choir’s light gathered. It knows a gift when it sees one.',
    react: (f) => `“Nothing out here but gulls,” said ${f}.`,
    tag: (f) => `${f} saw one gull. Up close`,
  },
  {
    id: 'camera',
    item: 'cap',
    ix: 0.22,
    open: (f) => `This time, ${f} brought a camera.`,
    a: 'He framed the lighthouse. Steady… steady…',
    b: 'Achoo.',
    under: 'The sea keeps everything it is given. And sometimes, it gives back.',
    react: () => '“Got it!” He had. The lighthouse came out beautifully.',
    tag: (f) => `${f} took a lovely photo of the lighthouse`,
  },
  {
    id: 'kid',
    item: 'paper',
    ix: 0.84,
    open: (f) => `${f} brought his granddaughter. She had questions.`,
    a: '“Grandpa, why is the sea glowing?” “Sea does that, love.”',
    b: 'She sent her paper boat down, for whoever was there.',
    under: 'Down where no light reaches, a light answered.',
    react: () => '“GRANDPA!” “Mm. Lovely, dear.”',
    tag: () => 'His granddaughter saw everything',
  },
  {
    id: 'coffee',
    item: 'mug',
    ix: 0.58,
    open: (f) => `${f} would not sleep through it this time. Third coffee.`,
    a: 'He did not blink. Not once.',
    b: 'His hands shook. The mug went over the side.',
    under: 'The Choir noticed. It always notices.',
    react: () => '…was that there before?',
    tag: (f) => `${f} blinked. Once`,
  },
  {
    id: 'fish',
    item: 'fish',
    ix: 0.3,
    open: (f) => `${f} caught a fish at last. A real one.`,
    a: 'He told it all about his day.',
    b: 'The fish had seen something over his shoulder.',
    under: 'It swam home, and told the deep what it had seen.',
    react: () => 'For once, he saw it. He tipped his hat. It seemed only polite.',
    tag: (f) => `${f} saw it. Finally`,
  },
];

/** The episode a wonder's film is: the order this city found its wonders (every one but the colonnade's). */
export function episodeOf(city: City, id: string): number {
  const ids = (city.growth.progression ? city.growth.wonders : WONDERS.map((w) => w.id)).filter((w) => w in SHAPES && w !== 'colonnade');
  const i = ids.indexOf(id);
  return (i < 0 ? ids.length : i) % BITS.length;
}

export function playSomethingStirs(ctx: GameContext, wonder: { id: string; name: string }, done: () => void): void {
  const { city } = ctx;
  const lore = LORE[wonder.id];
  const look = LOOKS[wonder.id] ?? GOLDEN;
  const ep = episodeOf(city, wonder.id);
  const bit = BITS[ep]!;
  // One fisher per city: the same man misses every wonder.
  const fisher = `Old ${FISHERS[Math.abs(Math.floor(city.seed)) % FISHERS.length]!}`;
  const reel = openReel(ctx, { scene: `sw sw-${wonder.id} sw-bit-${bit.id}${look.mood ? ` sw-mood-${look.mood}` : ''}`, label: `Something Stirs: ${wonder.name}`, key: KEYS[wonder.id] ?? 0 }, done);
  const root = reel.root;
  const css = (k: string, v: string) => root.style.setProperty(k, v);
  css('--sky-top', look.top);
  css('--sky', look.sky);
  css('--sea-a', look.sea[0]);
  css('--sea-b', look.sea[1]);
  css('--sea-c', look.sea[2]);
  css('--under-a', look.under[0]);
  css('--under-b', look.under[1]);
  css('--sun-x', String(look.sun.x));
  css('--sun-y', String(look.sun.y));
  css('--sun-core', look.sun.core);
  css('--sun-glow', look.sun.glow);
  css('--rays', String(look.sun.rays));
  css('--isle', look.isle);
  css('--ink', look.ink);
  css('--hi', look.hi);
  css('--dim', String(look.dim ?? 1));
  css('--ix', String(bit.ix));
  const shot = (name: 'wide' | 'close' | 'under' | 'rise' | 'medium' | 'final') => (root.dataset.shot = name);

  const rand = seeded(city.seed * 13 + wonder.id.length);
  const art = SHAPES[wonder.id] ?? SHAPES.dome!;
  const svg = (cls: string, markup: string, box = '0 0 400 260') => {
    const el = h('div', { class: cls });
    el.innerHTML = `<svg viewBox="${box}" aria-hidden="true">${markup}</svg>`;
    return el;
  };

  // ── The surface ──
  const clouds = h('div', { class: 'sw-clouds' });
  clouds.innerHTML = `<svg viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => {
    const x = (i / 7) * 1900 - 150 + rand() * 120;
    const y = 120 + rand() * 300;
    return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${(0.8 + rand() * 0.9).toFixed(2)} ${(0.5 + rand() * 0.3).toFixed(2)})">${cloud(rand, look.cloud[0], look.cloud[1])}</g>`;
  }).join('')}</svg>`;
  // The far island with the Tidewatch Lighthouse: the city is just over there.
  const isle = svg('sw-isle', `<path d="M0 60 Q40 30 90 34 Q140 14 190 30 Q250 22 300 60Z"/><rect x="226" y="6" width="6" height="22"/><path d="M224 6 h10 l-5 -6z"/><circle class="beam" cx="229" cy="8" r="3"/>`, '0 0 300 60');
  const stars = h('div', { class: 'sw-stars' }, ...Array.from({ length: 80 }, () => h('i', { style: `left:${(rand() * 100).toFixed(1)}%;top:${(rand() * 52).toFixed(1)}vh;--d:${(rand() * 3).toFixed(2)}s;--z:${(0.4 + rand()).toFixed(2)}` })));
  const aurora = h('div', { class: 'sw-aurora' }, h('i', {}), h('i', {}), h('i', {}));
  const mist = h('div', { class: 'sw-mist' }, h('i', {}), h('i', {}), h('i', {}));
  const rain = h('div', { class: 'sw-rain' }, ...Array.from({ length: 60 }, (_, i) => h('i', { style: `--x:${((i * 37) % 100).toFixed(0)}%;--d:${((i * 0.131) % 1).toFixed(2)}s` })));
  const gulls = h('div', { class: 'sw-gulls' }, ...Array.from({ length: 7 }, (_, i) => h('i', { style: `--i:${i}` })));
  const swell = h('div', { class: 'sw-swell' });
  swell.innerHTML = `<svg viewBox="0 0 1600 400" preserveAspectRatio="none" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => {
    const y = 14 + i * i * 4.4;
    const a = 2 + i * 0.9;
    let d = `M-100 ${y}`;
    for (let x = -100; x <= 1700; x += 60) d += ` Q${x + 15} ${(y - a).toFixed(1)} ${x + 30} ${y} T${x + 60} ${y}`;
    return `<path d="${d}" style="--i:${i}" stroke-width="${(0.8 + i * 0.35).toFixed(2)}"/>`;
  }).join('')}</svg>`;
  // The Choir's light under the surface, gathering where the thing went down.
  const lumen = h('div', { class: 'sw-lumen' });
  lumen.innerHTML = `<svg viewBox="0 0 1600 400" preserveAspectRatio="none" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => {
    const left = i % 2 === 0;
    const y0 = 60 + rand() * 300;
    return `<path d="M${left ? -40 : 1640} ${y0.toFixed(0)} C ${left ? 400 : 1200} ${(y0 + (rand() - 0.5) * 200).toFixed(0)} ${left ? 600 : 1000} ${(120 + rand() * 160).toFixed(0)} 800 ${(90 + rand() * 40).toFixed(0)}" style="--i:${i}"/>`;
  }).join('')}</svg>`;
  const biolum = h('div', { class: 'sw-biolum' }, ...Array.from({ length: 34 }, () => h('i', { style: `--x:${(rand() * 100).toFixed(1)}%;--y:${(rand() * 40).toFixed(1)}vh;--d:${(rand() * 3).toFixed(2)}s` })));
  const dolphins = h('div', { class: 'sw-dolphins' }, ...[0, 1, 2].map((i) => {
    const d = h('i', { style: `--i:${i}` });
    d.innerHTML = DOLPHIN_SVG;
    return d;
  }));
  const spray = h('div', { class: 'sw-spray' }, ...Array.from({ length: 22 }, (_, i) => {
    const a = -Math.PI * (0.1 + 0.8 * (i / 21)) + (rand() - 0.5) * 0.2;
    const r = 14 + rand() * 20;
    return h('i', { style: `--x:${(Math.cos(a) * r).toFixed(1)}vmin;--y:${(Math.sin(a) * r).toFixed(1)}vmin;--d:${(rand() * 0.5).toFixed(2)}s;--s:${(0.5 + rand()).toFixed(2)}` });
  }));
  const boat = h('div', { class: 'sw-boat' });
  boat.innerHTML = BOAT_SVG;
  const zzz = h('div', { class: 'sw-zzz' }, h('i', {}, 'z'), h('i', {}, 'z'), h('i', {}, 'Z'));
  const bang = h('div', { class: 'sw-bang' }, '!');
  const boot = h('div', { class: 'sw-boot' });
  boot.innerHTML = ITEMS.boot;

  const rig = h(
    'div',
    { class: 'sw-rig' },
    h('div', { class: 'sw-sky' }),
    stars,
    aurora,
    h('div', { class: 'sw-far' }, h('div', { class: 'sw-sun' }, h('i', { class: 'rays' }), h('i', { class: 'disc' })), clouds, isle, gulls),
    h('div', { class: 'sw-godrays' }),
    svg('sw-wonder', art),
    h('div', { class: 'sw-glow' }),
    dolphins,
    h(
      'div',
      { class: 'sw-sea' },
      h('div', { class: 'sw-glitter' }),
      svg('sw-reflect', art),
      swell,
      biolum,
      h('i', { class: 'w1' }),
      h('i', { class: 'w2' }),
      h('i', { class: 'w3' }),
    ),
    h('div', { class: 'sw-ring' }, h('i', {}), h('i', {})),
    lumen,
    h('div', { class: 'sw-foam' }),
    h('div', { class: 'sw-cascade' }, ...Array.from({ length: 12 }, (_, i) => h('i', { style: `--i:${i}` }))),
    spray,
    mist,
    h('div', { class: 'sw-ripples' }, h('i', {}), h('i', {}), h('i', {})),
    h('div', { class: 'sw-float' }),
    h('div', { class: 'sw-lift' }, h('div', { class: 'sw-rocker' }, boat, zzz, bang)),
    boot,
    h('div', { class: 'sw-hat' }),
    rain,
    h('div', { class: 'sw-rainbow' }),
  );

  // ── Under the sea ──
  const fish = h('div', { class: 'su-school' }, ...Array.from({ length: 16 }, (_, i) => {
    const el = h('i', { style: `--y:${(44 + rand() * 30).toFixed(1)}vh;--d:${(rand() * 0.9).toFixed(2)}s;--s:${(0.6 + rand() * 0.6).toFixed(2)};--k:${i % 3}` });
    el.innerHTML = FISH_SVG;
    return el;
  }));
  const kelp = Array.from({ length: 14 }, (_, i) => {
    const x = 40 + i * 115 + rand() * 60;
    const tall = 120 + rand() * 160;
    return `<path class="su-kelp" style="--i:${i}" d="M${x.toFixed(0)} 420 q-18 ${(-tall / 3).toFixed(0)} 0 ${(-tall * 0.66).toFixed(0)} t0 ${(-tall / 3).toFixed(0)}"/>`;
  }).join('');
  const floor = h('div', { class: 'su-floor' });
  floor.innerHTML = `<svg viewBox="0 0 1600 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${kelp}<path class="su-reef" d="M0 420 V330 Q80 290 150 320 Q220 260 300 310 Q360 330 420 300 Q520 250 600 320 L1000 320 Q1080 250 1180 300 Q1260 330 1320 290 Q1400 260 1470 310 Q1540 330 1600 300 V420Z"/><g class="su-ruin"><rect x="250" y="236" width="34" height="90" transform="rotate(-8 267 326)"/><rect x="240" y="226" width="54" height="12" transform="rotate(-8 267 326)"/><rect x="1300" y="270" width="110" height="26" rx="3" transform="rotate(6 1355 283)"/></g>${Array.from({ length: 10 }, (_, i) => `<circle class="su-coral" cx="${(80 + i * 160 + rand() * 60).toFixed(0)}" cy="${(320 + rand() * 30).toFixed(0)}" r="${(8 + rand() * 10).toFixed(0)}" style="--i:${i}"/>`).join('')}</svg>`;
  const threads = h('div', { class: 'su-lumen' });
  threads.innerHTML = `<svg viewBox="0 0 1600 600" preserveAspectRatio="none" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => {
    const left = i % 2 === 0;
    const y0 = 80 + rand() * 460;
    return `<path d="M${left ? -40 : 1640} ${y0.toFixed(0)} C ${left ? 300 : 1300} ${(y0 + (rand() - 0.5) * 300).toFixed(0)} ${left ? 600 : 1000} ${(380 + rand() * 120).toFixed(0)} 800 470" style="--i:${i}"/>`;
  }).join('')}</svg>`;
  const item = h('div', { class: `su-item su-item-${bit.item}` });
  item.innerHTML = ITEMS[bit.item];
  const under = h(
    'div',
    { class: 'sw-under' },
    h(
      'div',
      { class: 'su-cam' },
      h('div', { class: 'su-water' }),
      h('div', { class: 'su-shafts' }),
      h('div', { class: 'su-surface' }),
      svg('su-hull', `<path d="M10 0 Q180 60 350 0Z"/><path class="su-line" d="M346 0 V170"/><circle class="su-hook" cx="346" cy="172" r="3"/>`, '0 0 360 200'),
      h('div', { class: 'su-splash' }, h('i', {}), h('i', {})),
      fish,
      svg('su-shape', art),
      threads,
      h('div', { class: 'su-heart' }),
      floor,
      item,
      h('div', { class: 'su-motes' }, ...Array.from({ length: 30 }, () => h('i', { style: `--x:${(rand() * 100).toFixed(1)}%;--y:${(rand() * 140).toFixed(1)}vh;--d:${(rand() * 4).toFixed(2)}s` }))),
    ),
  );

  reel.set.append(h('div', { class: 'sw-cam' }, rig), under, h('div', { class: 'sw-flash' }));

  const day = look.mood !== 'night' && look.mood !== 'aurora';
  /** The gag's sounds (D-195), per bit and beat. */
  const gagSound = (beat: 'tease' | 'hook' | 'b' | 'react') => {
    const k = `${bit.id}:${beat}`;
    if (k === 'boot:tease') reel.hit('nibble');
    else if (k === 'boot:hook') {
      reel.hit('reel');
      reel.hit('splash', 0.4);
    } else if (k === 'boot:b') reel.hit('splash', 1.2);
    else if (k === 'boot:react') reel.hit('splash', 2.5);
    else if (k === 'bino:hook') {
      reel.hit('wings');
      reel.hit('gulls', 0.9);
    } else if (k === 'bino:b') {
      reel.hit('wings', 0.6);
      reel.hit('gulls', 0.4);
      reel.hit('splash', 1.6);
    } else if (k === 'camera:b') {
      reel.hit('sneeze', 0.1);
      reel.hit('splash', 1.75);
    } else if (k === 'camera:react') reel.hit('shutter', 0.95);
    else if (k === 'kid:b') reel.hit('splash', 1.3);
    else if (k === 'coffee:hook') reel.hit('heartbeat', 0, 2.4);
    else if (k === 'coffee:b') reel.hit('splash', 1.5);
    else if (k === 'fish:b') {
      reel.hit('sting', 0.1);
      reel.hit('splash', 1.8);
    } else if (k === 'fish:react') reel.hit('choir', 1.8, 2.2);
  };

  const film = async () => {
    // 1. Wide: the boat at sea, and the sound of the hour.
    shot('wide');
    reel.on('open');
    reel.bed('sea', day ? 1 : 0.6, 2);
    reel.bed('wind', look.mood === 'rain' ? 0.7 : look.mood === 'mist' ? 0.5 : 0.25, 2);
    if (look.mood === 'rain') reel.bed('rain', 1, 1.5);
    if (!day) reel.bed('drone', 0.25, 3);
    if (day) reel.hit('gulls', 1.4);
    if (look.mood === 'night') reel.cue('cs-night');
    reel.say(bit.open(fisher, look.word));
    if (!(await reel.wait(2900))) return;

    // 2. Close: the gag, and something over the side.
    shot('close');
    reel.on('a');
    // A beat of suspense first (the float nibbling, for the boot), then the gag lands.
    if (bit.tease) {
      reel.say(bit.tease);
      gagSound('tease');
      if (!(await reel.wait(2000))) return;
    }
    reel.on('hook');
    gagSound('hook');
    reel.cue(bit.id === 'boot' ? 'cs-boing' : bit.id === 'coffee' ? 'tick' : 'cs-sneak');
    reel.say(bit.a);
    if (!(await reel.wait(bit.tease ? 2100 : 2500))) return;
    reel.on('b');
    gagSound('b');
    reel.bed('drone', 0.35, 2);
    reel.cue(bit.id === 'camera' ? 'cs-freeze' : 'cs-whoosh');
    reel.say(bit.b);
    if (!(await reel.wait(2100))) return;

    // 3. Under the sea: it sinks, and the Choir notices.
    shot('under');
    reel.on('under');
    // Into the water: the surface goes silent, the deep roars, a heartbeat, the Choir's voices, a riser to the cut.
    reel.hit('plunge');
    for (const b of ['sea', 'wind', 'rain'] as const) reel.bed(b, 0, 0.2);
    reel.bed('deep', 1, 0.3);
    reel.bed('drone', 0.5, 1);
    reel.bed('choir', 0.7, 2.6);
    reel.hit('heartbeat', 0.8, 1.8);
    reel.hit('riser', 1.9, 1.9);
    reel.hit('choir', 2.4, 1.6);
    reel.hit('shimmer', 2.5);
    reel.say(bit.under);
    if (!(await reel.wait(3800))) return;

    // 4. It rises.
    shot('rise');
    reel.on('rise');
    // It breaks the surface: the impact, water, the swell of the score, the Choir in full; dolphins, gulls.
    reel.bed('deep', 0, 0.3);
    reel.bed('sea', 1, 0.6);
    reel.bed('wind', 0.3, 1);
    reel.bed('rain', 0, 2.5);
    reel.bed('choir', 1, 1.5);
    reel.bed('drone', 0.2, 2);
    if (look.mood === 'rain') reel.hit('thunder', 0.05);
    reel.hit('boom', 0.3);
    reel.hit('splash', 0.55);
    reel.hit('swell', 0.2, 3);
    reel.hit('dolphins', 1.6);
    if (day) reel.hit('gulls', 0.7);
    reel.say('');
    if (!(await reel.wait(3700))) return;

    // 5. The payoff.
    shot('medium');
    reel.on('react');
    reel.bed('choir', 0.35, 1.5);
    reel.bed('drone', 0, 2);
    gagSound('react');
    reel.cue(bit.id === 'camera' ? 'cs-blink' : bit.id === 'fish' ? 'cs-fanfare' : 'cs-freeze');
    if (!(await reel.wait(700))) return;
    reel.say(bit.react(fisher));
    if (!(await reel.wait(2400))) return;

    // 6. Wide, pulling out, then the card.
    shot('final');
    reel.on('final');
    reel.bed('sea', 0.7, 2);
    reel.bed('choir', 0.5, 2);
    reel.say('');
    if (!(await reel.wait(1500))) return;
    reel.on('finale');
    await reel.end({
      kicker: 'Sea wonder · risen · the Choir answers',
      title: wonder.name,
      drop: true,
      sub: lore?.tagline ?? 'It rose from the sea where your city could see it.',
      lines: [
        ...(lore?.quote ? [lore.quote] : []),
        'The Tidekin said it first: keep the promises, and the sea gives back.',
        `Episode ${ep + 1} · day ${city.day} · ${Math.round(city.stats.population).toLocaleString('en-US')} residents · ${bit.tag(fisher)}`,
      ],
      button: 'Behold',
      confetti: [look.hi, '#ffffff', '#5ff2da', '#ffe9a8'],
    });
  };
  void film();
}

/** The wonders as silhouettes (400 × 260, sitting on y = 260); `.hi` marks their lighter details. */
export const SHAPES: Record<string, string> = {
  // Three rings of living pearl, standing in the surf.
  tideGates: [90, 200, 310]
    .map((x, i) => `<circle cx="${x}" cy="${150 - (i % 2) * 14}" r="${62 - (i % 2) * 8}" fill="none" stroke-width="16" class="ring"/><circle class="hi" cx="${x}" cy="${88 - (i % 2) * 22}" r="5"/>`)
    .join(''),
  // A lotus as big as a reef: petals round a glowing heart, on its pad.
  lotus: `<ellipse cx="200" cy="252" rx="190" ry="20"/>${[-70, -40, -12, 12, 40, 70]
    .map((a) => `<ellipse cx="200" cy="170" rx="34" ry="84" transform="rotate(${a} 200 250)"/>`)
    .join('')}<circle class="hi" cx="200" cy="200" r="22"/>`,
  // Three wooded sea stacks.
  stacks: `<path d="M40 260 L60 90 L120 84 L130 260Z M150 260 L170 30 L240 26 L250 260Z M270 260 L282 120 L340 116 L356 260Z"/><g class="hi">${[
    [90, 84],
    [205, 26],
    [311, 116],
  ]
    .map(([x, y]) => `<circle cx="${x! - 14}" cy="${y! - 10}" r="16"/><circle cx="${x! + 12}" cy="${y! - 14}" r="18"/>`)
    .join('')}</g>`,
  // A glass dome with a cupola, a dish and solar petals at its rim.
  dome: `<rect x="50" y="200" width="300" height="60" rx="8"/><path d="M80 200 A120 120 0 0 1 320 200Z"/><path class="hi" d="M120 200 A80 80 0 0 1 280 200" fill="none" stroke-width="5"/><rect x="190" y="60" width="20" height="30"/><path d="M178 60 q22 -26 44 0z"/><path d="M232 74 l30 -22 l6 10z"/>${[60, 100, 300, 340]
    .map((x) => `<ellipse cx="${x}" cy="196" rx="10" ry="22" transform="rotate(${x < 200 ? -30 : 30} ${x} 210)"/>`)
    .join('')}`,
  // A turtle the size of an island, a palm on its shell.
  turtle: `<ellipse cx="200" cy="220" rx="160" ry="80"/><path class="hi" d="M120 200 q80 -70 160 0 M160 160 l-10 60 M240 160 l10 60 M200 150 v70" fill="none" stroke-width="5"/><ellipse cx="368" cy="226" rx="30" ry="20"/><circle class="eye" cx="380" cy="220" r="4"/><path d="M60 250 q-30 10 -40 -10 q20 -6 40 0z M340 254 q30 10 40 -6 q-20 -8 -40 0z"/><path d="M200 150 q4 -60 -6 -90" fill="none" stroke-width="7"/><path d="M194 60 q-40 -10 -60 14 M194 60 q40 -14 62 8 M194 60 q-20 -30 -46 -26 M194 60 q24 -30 50 -22" fill="none" stroke-width="10" stroke-linecap="round"/>`,
  // A colonnade the sea gave back: columns and a broken beam.
  colonnade: `${[40, 110, 180, 250, 320]
    .map((x, i) => `<rect x="${x}" y="${70 + (i === 4 ? 50 : 0)}" width="36" height="${190 - (i === 4 ? 50 : 0)}"/><rect x="${x - 6}" y="${60 + (i === 4 ? 50 : 0)}" width="48" height="12"/>`)
    .join('')}<path d="M30 48 L280 48 L300 60 L30 60Z"/><path class="hi" d="M50 90 v150 M120 90 v150 M190 90 v150 M260 90 v150" stroke-width="3"/>`,
  // A geode split open: crystals catching the light.
  geode: `<path d="M40 260 Q60 140 200 130 Q340 140 360 260Z"/>${[
    [140, 70, -14],
    [190, 30, 0],
    [240, 60, 12],
    [280, 110, 24],
    [110, 120, -28],
  ]
    .map(([x, y, r]) => `<path class="hi" d="M${x} ${y} l18 30 l-8 100 l-20 0 l-8 -100z" transform="rotate(${r} ${x} 200)"/>`)
    .join('')}`,
};

/** A gull standing, beak to +x (40 × 30, feet at the origin). */
const GULL = `<path d="M-4 0 v4 M4 0 v4" stroke="#ffb43a" stroke-width="2"/><ellipse cx="0" cy="-8" rx="13" ry="8" fill="#fbfbfb" stroke="#6f7f8f"/><path class="wing" d="M-12 -10 q8 -6 18 -2 l-8 6z" fill="#c9d3dc"/><circle cx="9" cy="-17" r="6" fill="#fbfbfb" stroke="#6f7f8f"/><path d="M14 -17 l8 2 l-8 2z" fill="#ffb43a"/><circle cx="10.5" cy="-18.5" r="1.2" fill="#1f2a33"/>`;

/**
 * The rowboat and its fisher (360 × 200), facing left (away from where the wonders rise), with every episode's props
 * (`.prop`, shown by `.sw-bit-*`): binoculars and a gull with designs on his sandwich, a camera on a tripod, his
 * granddaughter at the bow with a paper boat, a coffee mug and wide eyes, a fish.
 */
const BOAT_SVG = `<svg viewBox="0 0 360 200" aria-hidden="true">
<defs>
  <linearGradient id="sw-hullg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8714a"/><stop offset="1" stop-color="#5e3a22"/></linearGradient>
  <linearGradient id="sw-coatg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4d82a6"/><stop offset="1" stop-color="#2f5a78"/></linearGradient>
</defs>
<path class="oar" d="M60 128 L-6 170 M-6 170 l-14 10 l6 6 l14 -10z"/>
<g class="rod-g"><path class="line" d="M300 40 Q 340 90 352 160" fill="none"/><path class="rod" d="M170 120 L300 40" fill="none"/><circle class="spool" cx="186" cy="111" r="6"/></g>
<g class="prop p-cam"><path class="tripod" d="M108 140 L112 108 L116 140 M112 108 L104 140"/><rect class="body" x="98" y="94" width="26" height="15" rx="2.5"/><rect class="body" x="104" y="90" width="8" height="5" rx="1"/><rect class="lens" x="87" y="96" width="12" height="11" rx="2"/><rect class="p-cap" x="83.5" y="96" width="4" height="11" rx="1.2"/><circle class="p-flash" cx="118" cy="92" r="3.4"/></g>
<g class="sw-fisher">
  <path class="coat" d="M118 150 q4 -46 34 -50 q30 4 34 50z" fill="url(#sw-coatg)"/>
  <path d="M150 104 l-4 46 M154 104 l4 46" stroke="#24465e" stroke-width="2" fill="none" opacity="0.6"/>
  <path class="prop p-bino arm-alt" d="M140 118 Q126 112 132 94"/>
  <path class="prop p-cam arm-alt" d="M138 120 Q126 118 120 108"/>
  <path class="prop p-fish arm-alt" d="M140 118 Q122 116 124 100"/>
  <g class="sw-head">
    <circle class="skin" cx="152" cy="86" r="18"/><circle cx="144" cy="92" r="4" fill="#f0a98a" opacity="0.6"/>
    <circle class="nose" cx="135.5" cy="89" r="3.6"/>
    <path class="beard" d="M136 90 q16 26 32 0 q-16 8 -32 0z"/>
    <path class="eyes shut" d="M141 84 q4 3 8 0 M155 84 q4 3 8 0" fill="none"/>
    <g class="eyes open"><circle cx="144" cy="84" r="2.6"/><circle cx="158" cy="84" r="2.6"/></g>
    <g class="prop p-wide"><circle cx="145" cy="83" r="5" fill="#fff" stroke="#2a2a2a" stroke-width="1.4"/><circle cx="159" cy="83" r="5" fill="#fff" stroke="#2a2a2a" stroke-width="1.4"/><circle cx="143.4" cy="83" r="2.2" fill="#2a2a2a"/><circle cx="157.4" cy="83" r="2.2" fill="#2a2a2a"/><path d="M139 76 l10 -1 M153 75 l10 1" stroke="#9a8a7a" stroke-width="1.6"/></g>
    <g class="hat-on"><ellipse class="hat" cx="152" cy="72" rx="30" ry="7"/><path class="hat" d="M138 72 q14 -26 28 0z"/><rect x="138" y="66" width="28" height="4" fill="#c0503c"/></g>
    <g class="prop p-bino"><rect x="118" y="77" width="18" height="7.5" rx="2.4"/><rect x="118" y="86" width="18" height="7.5" rx="2.4"/><rect x="132" y="79" width="6" height="12" rx="1.2"/><circle class="glint" cx="119.5" cy="80" r="1.4"/></g>
  </g>
  <path class="arm" d="M168 116 L188 108" fill="none"/>
  <g class="prop p-mug"><rect x="185" y="97" width="13" height="14" rx="2"/><path class="handle" d="M198 100 q6 0 6 4.5 q0 4.5 -6 4.5" fill="none"/><path class="steam" d="M188 92 q3 -4 0 -8 q-3 -4 0 -8 M194 92 q3 -4 0 -8 q-3 -4 0 -8" fill="none"/></g>
  <g class="prop p-fish"><g class="p-fish-g"><path class="body" d="M100 92 q12 -12 26 0 q-12 12 -26 0z"/><path class="fin" d="M126 92 l9 -7 v14z"/><circle class="p-fisheye" cx="105" cy="90.5" r="1.6"/><path d="M110 86 q4 6 0 12" stroke="#5c9ab8" stroke-width="1" fill="none"/></g></g>
</g>
<g class="bkt"><path class="bucket" d="M220 120 h26 l-4 24 h-18z"/><path d="M220 120 q13 -12 26 0" fill="none" stroke="#5a6a7a" stroke-width="2"/></g>
<g class="lantern"><rect x="78" y="112" width="12" height="18" rx="2"/><circle class="glow" cx="84" cy="121" r="5"/><path d="M84 112 v-6" stroke="#3a281c" stroke-width="2"/></g>
<g class="prop p-sand"><path d="M190 132 h20 l-2 5 h-16z" fill="#e8c48a"/><rect x="191" y="129" width="18" height="3" rx="1" fill="#7cc26a"/><rect x="191" y="127.5" width="18" height="2" fill="#e85a4f"/><path d="M190 127.5 h20 l-3 -5 h-14z" fill="#f2d39a"/></g>
<g class="prop p-kid">
  <path class="kid-coat" d="M262 144 q2 -30 15 -32 q13 2 15 32z"/>
  <circle class="skin" cx="277" cy="101" r="11"/>
  <circle cx="281.5" cy="100" r="1.7" fill="#2a2a2a"/><path d="M279 106 q3 2 6 0" stroke="#a0524a" stroke-width="1.2" fill="none"/>
  <path class="kid-hat" d="M264 99 q13 -20 26 0z M262 99 h30" />
  <g class="kid-arm"><path class="kid-sleeve" d="M284 122 L300 112"/><path class="p-paper" d="M295 112 h15 l-3 5 h-9z M302 112 v-9 l6 9z"/></g>
</g>
<path class="hull" d="M40 140 L320 140 Q300 186 180 188 Q60 186 40 140Z" fill="url(#sw-hullg)"/>
<path class="plank" d="M48 152 Q180 160 312 152 M62 166 Q180 174 300 166" fill="none"/>
<path class="trim" d="M40 140 L320 140" fill="none"/>
<path class="wet" d="M58 176 Q180 196 302 176" fill="none"/>
<g class="prop p-gull"><g transform="translate(46 139) scale(1.25)"><g class="p-gull-a">${GULL}</g></g></g>
</svg>`;

/** What goes over the side, as it sinks (40 × 40). */
const ITEMS = {
  boot: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M10 4 h14 v20 l12 4 q4 2 2 8 h-30z" fill="#6b4a33" stroke="#3a281c" stroke-width="2"/><path d="M8 36 h32" stroke="#3a281c" stroke-width="3"/></svg>`,
  sandwich: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M4 22 h32 l-3 8 h-26z" fill="#e8c48a"/><rect x="5" y="17" width="30" height="5" rx="2" fill="#7cc26a"/><rect x="5" y="15" width="30" height="3" fill="#e85a4f"/><path d="M4 15 h32 l-5 -8 h-22z" fill="#f2d39a"/></svg>`,
  cap: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="13" fill="#23272e" stroke="#5a6470" stroke-width="2.4"/><circle cx="20" cy="20" r="6" fill="#343a44"/><path d="M12 14 q4 -4 10 -4" stroke="#7a8490" stroke-width="1.6" fill="none"/></svg>`,
  paper: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M3 22 h34 l-7 9 h-20z" fill="#fdfdf6" stroke="#b8c0c8"/><path d="M20 22 v-17 l11 17z" fill="#f4f4ea" stroke="#b8c0c8"/><path d="M20 22 v-12 l-8 12z" fill="#ffffff" stroke="#b8c0c8"/></svg>`,
  mug: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="8" y="10" width="20" height="22" rx="3" fill="#e85a4f" stroke="#a83a30" stroke-width="1.5"/><path d="M28 15 q8 0 8 6 q0 6 -8 6" fill="none" stroke="#e85a4f" stroke-width="3"/><rect x="11" y="16" width="14" height="3" fill="#fff" opacity="0.7"/></svg>`,
  fish: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M4 20 q16 -16 30 0 q-14 16 -30 0z" fill="#8fd0e8"/><path d="M33 20 l7 -7 v14z" fill="#6fb6d2"/><circle cx="10" cy="18" r="2" fill="#1d2a33"/></svg>`,
};

/** A small fish of the school, nose to +x (30 × 14). */
const FISH_SVG = `<svg viewBox="0 0 30 14" aria-hidden="true"><path d="M2 7 q11 -9 22 0 q-11 9 -22 0z"/><path d="M23 7 l7 -5 v10z"/><circle class="e" cx="6" cy="6" r="1"/></svg>`;

/** A dolphin mid-leap, nose to +x (80 × 34). */
const DOLPHIN_SVG = `<svg viewBox="0 0 80 34" aria-hidden="true"><path d="M2 20 q20 -18 52 -12 q10 -10 14 -6 q-3 5 -5 9 q10 3 15 9 q-12 0 -18 -2 q-8 10 -12 10 q2 -5 0 -9 q-24 6 -46 1z"/><path class="belly" d="M10 21 q20 4 44 -3" fill="none"/><circle class="e" cx="68" cy="16" r="1.2"/></svg>`;
