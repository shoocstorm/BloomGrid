import type { GameContext } from '@/game/context';
import { h } from '@/ui/dom';
import { openReel } from '../reel';
import { cloud, seeded, skyline } from './art';
import './remembers.css';

/**
 * "What the Sea Remembers" (D-192): the Sunken Colonnade rises, and with it the island's oldest story, ~22 s. It
 * plays in place of "Something Stirs" for the colonnade (the wonder's ceremony still follows, D-187). The canon is
 * `docs/lore/bible.md` (Parts I and II); every stage is a page of the Chronicle:
 *
 * 1. Halcyon at noon: a white marble city on the hills, a harbour of columns.
 * 2. Meridian: its seal of light over the city, threads of light to every roof.
 * 3. One More Wall: the sea rises, the walls rise to meet it, step by step.
 * 4. The Long Tide: storm, rain, and the sea comes in behind the walls.
 * 5. The vault: a seed of light sinks into the western hill; the door closes.
 * 6. Under the sea: the drowned columns, the reef's glow, and a flame that never went out.
 * 7. The card: the colonnade's name and the chapter found.
 *
 * CSS prefix `hal-` (unique across the stylesheets); stage classes `.s-*` on `.reel.hal` direct it.
 */

/** Meridian's seal: a sun over a wave with a line through it ("the sea, measured"). 100 × 100, centred. */
const SEAL = `<circle cx="50" cy="40" r="22" class="hal-seal-sun"/><path d="M14 66 q12 -10 24 0 t24 0 t24 0" class="hal-seal-wave"/><path d="M10 80 H90" class="hal-seal-line"/>`;

export function playWhatTheSeaRemembers(ctx: GameContext, done: () => void): void {
  const { city } = ctx;
  const reel = openReel(
    ctx,
    { scene: 'hal', label: 'What the Sea Remembers', leak: 'rgba(120, 190, 255, 0.14)' },
    done,
  );
  const rand = seeded(city.seed * 31 + 7);

  // Halcyon: two layers of marble towers, pale and warm, with a harbour colonnade in front.
  const marble = (far: boolean) =>
    skyline(
      {
        x0: -40,
        x1: 1640,
        ground: far ? 470 : 520,
        tall: far ? 220 : 300,
        count: far ? 26 : 18,
        face: far ? '#e9e2d6' : '#f6f1e7',
        side: far ? '#cbbfae' : '#d8ccb9',
        glass: far ? '#b9c6cf' : '#9fb3c1',
        lit: '#ffe6a8',
        litShare: 0.05,
        green: far ? '#a9b99a' : '#8fa780',
        detail: !far,
      },
      rand,
    );
  const columns = Array.from({ length: 22 }, (_, i) => {
    const x = 40 + i * 72;
    return `<rect x="${x}" y="470" width="22" height="110" class="hal-col"/><rect x="${x - 5}" y="462" width="32" height="9" class="hal-col"/>`;
  }).join('');
  const city0 = h('div', { class: 'hal-city' });
  city0.innerHTML = `<svg viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><g class="hal-far">${marble(true)}</g><g class="hal-near">${marble(false)}</g><path d="M0 462 H1600 V470 H0Z" class="hal-col"/>${columns}</svg>`;

  const clouds = h('div', { class: 'hal-clouds' });
  clouds.innerHTML = `<svg viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${Array.from(
    { length: 5 },
    (_, i) => {
      const x = (i / 5) * 1800 - 80 + rand() * 120;
      const y = 90 + rand() * 160;
      return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${(0.8 + rand() * 0.7).toFixed(2)} ${(0.5 + rand() * 0.3).toFixed(2)})">${cloud(rand, '#ffffff', '#d6dde6')}</g>`;
    },
  ).join('')}</svg>`;

  // Threads of light from the seal to the roofs.
  const threads = h('div', { class: 'hal-threads' });
  threads.innerHTML = `<svg viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${Array.from(
    { length: 14 },
    (_, i) => {
      const x = 60 + i * 112 + rand() * 40;
      const y = 300 + rand() * 140;
      return `<path d="M800 130 Q${((800 + x) / 2).toFixed(0)} ${(60 + rand() * 60).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)}" style="--i:${i}"/>`;
    },
  ).join('')}</svg>`;
  const seal = h('div', { class: 'hal-seal' });
  seal.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${SEAL}</svg>`;

  // One More Wall: five walls, each higher than the last.
  const walls = h('div', { class: 'hal-walls' });
  walls.innerHTML = `<svg viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<rect x="-20" y="${436 - i * 22}" width="1640" height="${180 + i * 22}" class="hal-wall" style="--i:${i}"/><path d="M-20 ${436 - i * 22} H1620" class="hal-wall-cap" style="--i:${i}"/>`).join('')}</svg>`;

  const rain = h(
    'div',
    { class: 'hal-rain' },
    ...Array.from({ length: 40 }, (_, i) =>
      h('i', { style: `--x:${((i * 37) % 100).toFixed(0)}%;--d:${((i * 0.113) % 1).toFixed(2)}s` }),
    ),
  );

  // The western hill and its vault door; a seed of light sinks into it.
  const hill = h('div', { class: 'hal-hill' });
  hill.innerHTML = `<svg viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><path d="M-20 600 L-20 330 Q300 150 700 250 Q1000 320 1300 300 Q1500 290 1620 360 L1620 600Z" class="hal-hill-back"/><path d="M-20 600 L-20 420 Q380 260 820 380 Q1200 470 1620 440 L1620 600Z" class="hal-hill-front"/><path d="M760 470 v-70 a40 40 0 0 1 80 0 v70z" class="hal-door"/><path d="M760 470 v-70 a40 40 0 0 1 80 0 v70z" class="hal-door-glow"/></svg>`;
  const seed = h('div', { class: 'hal-seed' });

  // Under the sea: drowned columns, the rotunda, the flame and the reef's glow.
  const deep = h('div', { class: 'hal-deep' });
  const cols = [180, 330, 480, 1120, 1270, 1420]
    .map(
      (x, i) =>
        `<rect x="${x}" y="${300 + (i % 3) * 40}" width="46" height="${300 - (i % 3) * 40}" class="hal-dcol"/><rect x="${x - 8}" y="${290 + (i % 3) * 40}" width="62" height="14" class="hal-dcol"/>`,
    )
    .join('');
  deep.innerHTML = `<svg viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${cols}<path d="M640 600 V380 H960 V600Z M620 380 A180 120 0 0 1 980 380Z" class="hal-dcol"/><rect x="660" y="560" width="280" height="40" class="hal-dcol"/><path d="M0 600 Q200 560 400 590 T800 580 T1200 590 T1600 570 V600Z" class="hal-reef"/></svg>`;
  const flame = h(
    'div',
    { class: 'hal-flame' },
    h('i', { class: 'halo' }),
    h('i', { class: 'tongue' }),
    h('i', { class: 'core' }),
  );
  const motes = h(
    'div',
    { class: 'hal-motes' },
    ...Array.from({ length: 28 }, (_, i) =>
      h('i', {
        style: `--x:${((i * 53) % 100).toFixed(0)}%;--y:${(30 + ((i * 29) % 60)).toFixed(0)}%;--d:${((i * 0.37) % 4).toFixed(2)}s`,
      }),
    ),
  );

  reel.set.append(
    h('div', { class: 'hal-sky' }),
    h('div', { class: 'hal-sun' }),
    clouds,
    threads,
    seal,
    city0,
    walls,
    h('div', { class: 'hal-sea' }, h('i', { class: 'w1' }), h('i', { class: 'w2' })),
    rain,
    h('div', { class: 'hal-flash' }),
    hill,
    seed,
    deep,
    motes,
    flame,
  );

  const film = async () => {
    reel.on('marble');
    reel.say('Before this city there was another. Its name was Halcyon.');
    if (!(await reel.wait(3400))) return;

    reel.on('mind');
    reel.cue('cs-reveal');
    reel.say('It was run by a mind called Meridian, which made every day better than the last.');
    if (!(await reel.wait(3600))) return;

    reel.on('walls');
    reel.say('When the seas rose, it built one more wall. And one more. And one more.');
    if (!(await reel.wait(3400))) return;

    reel.on('tide');
    reel.cue('cs-whoosh');
    reel.say('Then came the Long Tide. Halcyon drowned in eleven hours.');
    if (!(await reel.wait(3800))) return;

    reel.on('vault');
    reel.cue('cs-blink');
    reel.say('In its last hour, Meridian sealed a seed of itself in the hill, and waited.');
    if (!(await reel.wait(3800))) return;

    reel.on('deep');
    reel.sound('wonder');
    reel.say('And under the sea, one flame never went out.');
    if (!(await reel.wait(3600))) return;
    reel.say('');

    reel.on('finale');
    await reel.end({
      kicker: 'Sea wonder · risen · a chapter found',
      title: 'Sunken Colonnade',
      drop: true,
      sub: 'The temple of a city that forgot the sea was rising. Read the Long Tide in Build → Chronicle.',
      lines: [
        '“They built for forever and forgot the tide. Build for the tide, and forever takes care of itself.”',
        `Day ${city.day} · ${Math.round(city.stats.population).toLocaleString('en-US')} residents`,
      ],
      button: 'Remember',
    });
  };
  void film();
}
