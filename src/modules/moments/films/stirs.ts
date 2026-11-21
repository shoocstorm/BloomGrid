import type { GameContext } from '@/game/context';
import { LORE } from '@/modules/scenery/lore';
import { h } from '@/ui/dom';
import { openReel } from '../reel';
import { cloud, seeded } from './art';
import './stirs.css';

/**
 * "Something Stirs" (D-185): a sea wonder rises, ~17 s. An old fisher dozes in a rowboat and misses the whole thing:
 *
 * 1. A golden afternoon, a rowboat, snores. The float dips: a bite! …a boot. Again. He throws it back.
 * 2. Bubbles, then a glow under the water; the boat rocks. He sleeps on.
 * 3. The wonder rises behind him (its own silhouette, water streaming off it), and the gulls scatter. Silence.
 * 4. He wakes, turns round slowly, and his hat falls in the sea. "…huh."
 * 5. The card: the wonder's name, its tagline and the keeper's line from its lore (`scenery/lore.ts`).
 *
 * One film for every wonder that rises; `SHAPES` draws each one (a new wonder needs a shape, or it gets the dome).
 */

const FISHERS = ['Marlo', 'Pim', 'Saba', 'Teodor', 'Wren', 'Ilse', 'Kofi', 'Nan'];

export function playSomethingStirs(ctx: GameContext, wonder: { id: string; name: string }, done: () => void): void {
  const { city } = ctx;
  const lore = LORE[wonder.id];
  const fisher = `Old ${FISHERS[Math.abs(city.seed + wonder.id.length) % FISHERS.length]!}`;
  const reel = openReel(ctx, { scene: `sw sw-${wonder.id}`, label: `Something Stirs: ${wonder.name}` }, done);

  const art = SHAPES[wonder.id] ?? SHAPES.dome!;
  const shape = h('div', { class: 'sw-wonder' });
  shape.innerHTML = `<svg viewBox="0 0 400 260" aria-hidden="true">${art}</svg>`;
  // Its reflection in the sea (flipped, faded and broken by the swell), and the light behind it as it rises.
  const reflection = h('div', { class: 'sw-reflect' });
  reflection.innerHTML = `<svg viewBox="0 0 400 260" aria-hidden="true">${art}</svg>`;
  const rand = seeded(city.seed * 13 + wonder.id.length);
  const sky = h('div', { class: 'sw-clouds' });
  sky.innerHTML = `<svg viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${Array.from({ length: 6 }, (_, i) => {
    const x = (i / 6) * 1800 - 100 + rand() * 120;
    const y = 120 + rand() * 260;
    return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${(0.8 + rand() * 0.9).toFixed(2)} ${(0.55 + rand() * 0.3).toFixed(2)})">${cloud(rand, '#ffe3c9', '#e6a3a0')}</g>`;
  }).join('')}</svg>`;
  // A far island on the horizon with the Tidewatch Lighthouse on it: the city is just over there.
  const isle = h('div', { class: 'sw-isle' });
  isle.innerHTML = `<svg viewBox="0 0 300 60" aria-hidden="true"><path d="M0 60 Q40 30 90 34 Q140 14 190 30 Q250 22 300 60Z"/><rect x="226" y="6" width="6" height="22"/><path d="M224 6 h10 l-5 -6z"/><circle class="beam" cx="229" cy="8" r="3"/></svg>`;
  const swell = h('div', { class: 'sw-swell' });
  swell.innerHTML = `<svg viewBox="0 0 1600 400" preserveAspectRatio="none" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => {
    const y = 14 + i * i * 4.4;
    const a = 2 + i * 0.9;
    let d = `M-100 ${y}`;
    for (let x = -100; x <= 1700; x += 60) d += ` Q${x + 15} ${(y - a).toFixed(1)} ${x + 30} ${y} T${x + 60} ${y}`;
    return `<path d="${d}" style="--i:${i}" stroke-width="${(0.8 + i * 0.35).toFixed(2)}"/>`;
  }).join('')}</svg>`;
  const ripples = h('div', { class: 'sw-ripples' }, h('i', {}), h('i', {}), h('i', {}));
  const boat = h('div', { class: 'sw-boat' });
  boat.innerHTML = BOAT_SVG;
  const zzz = h('div', { class: 'sw-zzz' }, h('i', {}, 'z'), h('i', {}, 'z'), h('i', {}, 'Z'));
  const bang = h('div', { class: 'sw-bang' }, '!');
  const boot = h('div', { class: 'sw-boot' });
  boot.innerHTML = BOOT_SVG;
  const bubbles = h('div', { class: 'sw-bubbles' }, ...Array.from({ length: 18 }, () => h('i', { style: `--x:${(4 + Math.random() * 92).toFixed(1)}%;--d:${(Math.random() * 2.4).toFixed(2)}s;--s:${(0.5 + Math.random()).toFixed(2)}` })));
  const gulls = h('div', { class: 'sw-gulls' }, ...Array.from({ length: 6 }, (_, i) => h('i', { style: `--i:${i}` })));
  reel.set.append(
    h('div', { class: 'sw-sky' }),
    h('div', { class: 'sw-sun' }, h('i', { class: 'rays' }), h('i', { class: 'disc' })),
    sky,
    isle,
    gulls,
    h('div', { class: 'sw-godrays' }),
    shape,
    h('div', { class: 'sw-glow' }),
    h(
      'div',
      { class: 'sw-sea' },
      h('div', { class: 'sw-glitter' }),
      reflection,
      swell,
      h('i', { class: 'w1' }),
      h('i', { class: 'w2' }),
      h('i', { class: 'w3' }),
    ),
    h('div', { class: 'sw-foam' }),
    ripples,
    h('div', { class: 'sw-cascade' }, ...Array.from({ length: 12 }, (_, i) => h('i', { style: `--i:${i}` }))),
    bubbles,
    h('div', { class: 'sw-float' }),
    h('div', { class: 'sw-rocker' }, boat, zzz, bang),
    boot,
    h('div', { class: 'sw-hat' }),
  );

  const film = async () => {
    // 1. A quiet afternoon, and a bite.
    reel.on('doze');
    reel.say(`A quiet afternoon. The fish weren't biting. Neither was ${fisher}.`);
    if (!(await reel.wait(2800))) return;
    reel.on('bite');
    reel.cue('cs-blink');
    if (!(await reel.wait(700))) return;
    reel.on('reel');
    reel.cue('cs-boing');
    reel.say('A bite! …a boot. Again.');
    if (!(await reel.wait(1900))) return;
    reel.on('toss');
    reel.cue('cs-whoosh');
    reel.say('He threw it back. Some things belong to the sea.');
    if (!(await reel.wait(2000))) return;

    // 2. Something stirs.
    reel.on('stir');
    reel.sound('wonder');
    reel.say('The sea had other plans.');
    if (!(await reel.wait(2200))) return;

    // 3. It rises; he snores.
    reel.on('rise');
    reel.cue('cs-reveal');
    reel.say('');
    if (!(await reel.wait(3000))) return;

    // 4. "…huh."
    reel.on('wake');
    reel.cue('cs-freeze');
    if (!(await reel.wait(900))) return;
    reel.say('…huh.');
    if (!(await reel.wait(1800))) return;

    reel.on('finale');
    await reel.end({
      kicker: 'Sea wonder · risen',
      title: wonder.name,
      drop: true,
      sub: lore?.tagline ?? 'It rose from the sea where your city could see it.',
      lines: [
        ...(lore?.quote ? [lore.quote] : []),
        `Day ${city.day} · ${Math.round(city.stats.population).toLocaleString('en-US')} residents · ${fisher} saw nothing`,
      ],
      button: 'Behold',
      confetti: ['#5fd8ff', '#ffffff', '#5ff2da', '#ffe9a8'],
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

/** A rowboat, its fisher (straw hat, beard), the rod and line, an oar, a bucket and a lantern (360 × 200). */
const BOAT_SVG = `<svg viewBox="0 0 360 200" aria-hidden="true">
<defs>
  <linearGradient id="sw-hullg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8714a"/><stop offset="1" stop-color="#5e3a22"/></linearGradient>
  <linearGradient id="sw-coatg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4d82a6"/><stop offset="1" stop-color="#2f5a78"/></linearGradient>
</defs>
<path class="oar" d="M60 128 L-6 170 M-6 170 l-14 10 l6 6 l14 -10z"/>
<g class="rod-g"><path class="line" d="M300 40 Q 340 90 352 160" fill="none"/><path class="rod" d="M170 120 L300 40" fill="none"/><circle class="spool" cx="186" cy="111" r="6"/></g>
<g class="sw-fisher">
  <path class="coat" d="M118 150 q4 -46 34 -50 q30 4 34 50z" fill="url(#sw-coatg)"/>
  <path d="M150 104 l-4 46 M154 104 l4 46" stroke="#24465e" stroke-width="2" fill="none" opacity="0.6"/>
  <g class="sw-head"><circle class="skin" cx="152" cy="86" r="18"/><circle cx="146" cy="92" r="4" fill="#f0a98a" opacity="0.6"/><path class="beard" d="M136 90 q16 26 32 0 q-16 8 -32 0z"/><path class="eyes shut" d="M142 84 q4 3 8 0 M156 84 q4 3 8 0" fill="none"/><g class="eyes open"><circle cx="146" cy="84" r="2.6"/><circle cx="160" cy="84" r="2.6"/></g><g class="hat-on"><ellipse class="hat" cx="152" cy="72" rx="30" ry="7"/><path class="hat" d="M138 72 q14 -26 28 0z"/><rect x="138" y="66" width="28" height="4" fill="#c0503c"/></g></g>
  <path class="arm" d="M168 116 L188 108" fill="none"/>
</g>
<path class="bucket" d="M220 120 h26 l-4 24 h-18z"/><path d="M220 120 q13 -12 26 0" fill="none" stroke="#5a6a7a" stroke-width="2"/>
<g class="lantern"><rect x="78" y="112" width="12" height="18" rx="2"/><circle class="glow" cx="84" cy="121" r="5"/><path d="M84 112 v-6" stroke="#3a281c" stroke-width="2"/></g>
<path class="hull" d="M40 140 L320 140 Q300 186 180 188 Q60 186 40 140Z" fill="url(#sw-hullg)"/>
<path class="plank" d="M48 152 Q180 160 312 152 M62 166 Q180 174 300 166" fill="none"/>
<path class="trim" d="M40 140 L320 140" fill="none"/>
<path class="wet" d="M58 176 Q180 196 302 176" fill="none"/>
</svg>`;

const BOOT_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M10 4 h14 v20 l12 4 q4 2 2 8 h-30z" fill="#6b4a33" stroke="#3a281c" stroke-width="2"/><path d="M8 36 h32" stroke="#3a281c" stroke-width="3"/></svg>`;
