import type { GameContext } from '@/game/context';
import { h } from '@/ui/dom';
import { openReel } from '../reel';
import { cloud, seeded, skyline } from './art';
import './flight.css';

/**
 * "Maiden Flight" (D-185): the Sky-lane charter's film, ~18 s. The first pod's first hop over the city, by a test
 * pilot who would rather be anywhere else:
 *
 * 1. Day over the island's skyline. A pod on its pad; a clipboard ticks the checklist ("Courage… loading").
 * 2. Three, two, one. The pod lifts, wobbling, onto the glowing sky lane.
 * 3. A gull comes alongside and lands on the roof. The pilot's eyes go wide.
 * 4. The lane loops the loop; the gull holds on.
 * 5. Touchdown at the dock: the crowd cheers, and the gull leaves with the pilot's cap.
 * 6. Sky-lanes are open.
 *
 * Everything that moves along a curve is one SVG (`viewBox` 1600 × 900, cropped to fill): the pod rides the lane
 * with `animateMotion` (paced, so where it is at any moment is known), and the gull's approach is computed to meet it.
 */

const PILOTS = ['Ines', 'Bo', 'Tamsin', 'Okoro', 'Lumi', 'Rafa', 'Yuki', 'Dev'];
/** The sky lane: up off the pad, a loop-de-loop, and down to the dock. */
const LANE =
  'M260 690 C 260 560 330 470 470 440 C 600 410 700 440 800 440 A 110 110 0 1 0 800 220 A 110 110 0 1 0 800 440 C 950 440 1150 380 1200 470 C 1240 560 1270 676 1350 676';
/** Seconds the pod takes from pad to dock. */
const FLIGHT = 7;
/** When, into the flight, the gull lands on the roof. */
const GULL_LANDS = 2.2;
/** The pod and the gulls are drawn this much larger than their shapes. */
const K = 1.7;

export function playMaidenFlight(ctx: GameContext, done: () => void): void {
  const { city } = ctx;
  const pilot = PILOTS[Math.abs(city.seed) % PILOTS.length]!;
  const reel = openReel(ctx, { scene: 'mf', label: 'Maiden Flight', key: 5 }, done);

  // ── The set (D-188): sun and rays, two decks of cumulus, a skyline in three depths, a park, the pad and dock ──
  const rand = seeded(city.seed * 7 + 11);
  // As tall and as dense as the city is big.
  const size = Math.min(1, city.buildingEntities().length / 400);
  const cloudsAt = (n: number, y0: number, y1: number, k: number, lit: string, shade: string) =>
    Array.from({ length: n }, (_, i) => {
      const x = (i / n) * 1900 - 150 + rand() * 160;
      const y = y0 + rand() * (y1 - y0);
      return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${(k * (0.7 + rand() * 0.6)).toFixed(2)})">${cloud(rand, lit, shade)}</g>`;
    }).join('');
  const far = skyline({ x0: -60, x1: 1660, ground: 792, tall: 250 + 120 * size, count: 34, face: '#bcd3e3', side: '#aac5d8', glass: '#d6e8f2', lit: '#fff3cf', litShare: 0, green: '#a9cdb6', detail: false }, rand);
  const mid = skyline({ x0: -40, x1: 1640, ground: 792, tall: 200 + 110 * size, count: 18, face: '#93b6cc', side: '#7c9fb7', glass: '#c3dcea', lit: '#fff2c4', litShare: 0.06, green: '#6fae86', detail: true }, rand);
  // Foreground towers framing the edges, out of the flight's way.
  const near =
    skyline({ x0: -90, x1: 150, ground: 800, tall: 520, count: 2, face: '#5e8098', side: '#4a6b82', glass: '#86a9bf', lit: '#ffe6a6', litShare: 0.04, green: '#5c9a70', detail: true }, rand) +
    skyline({ x0: 1470, x1: 1700, ground: 800, tall: 500, count: 2, face: '#5e8098', side: '#4a6b82', glass: '#86a9bf', lit: '#ffe6a6', litShare: 0.04, green: '#5c9a70', detail: true }, rand);
  let park = '';
  for (let x = -40; x < 1660; x += 26 + rand() * 20) park += `<circle cx="${x.toFixed(0)}" cy="${(792 - rand() * 6).toFixed(0)}" r="${(10 + rand() * 9).toFixed(0)}"/>`;
  const crowd = Array.from({ length: 11 }, (_, i) => {
    const x = 1262 + i * 22 + (i % 2) * 4;
    const tall = 18 + ((i * 7) % 5) * 2;
    const hat = i % 4 === 1 ? `<path d="M${x - 8} ${760 - tall - 9} h16 l-4 -6 h-8z" fill="#3a4a5a"/>` : '';
    const flag = i % 3 === 0 ? `<path class="mf-wave" d="M${x + 6} ${760 - tall} v-26 l14 5 l-14 5" fill="${FANS[(i + 2) % FANS.length]}" stroke="#5a6a7a" stroke-width="1.5"/>` : '';
    return `<g class="mf-fan" style="--i:${i}"><rect x="${x - 6}" y="${760 - tall}" width="12" height="${tall}" rx="5" fill="${FANS[i % FANS.length]}"/><circle cx="${x}" cy="${760 - tall - 6}" r="6.5" fill="${SKIN[i % SKIN.length]}"/>${hat}<path class="mf-arms" d="M${x - 6} ${766 - tall} l-7 -10 M${x + 6} ${766 - tall} l7 -10" stroke="${SKIN[i % SKIN.length]}"/>${flag}</g>`;
  }).join('');
  const platform = (x: number, y: number, post: number, ring: boolean) =>
    `<rect x="${x + 50}" y="${y + 14}" width="20" height="${post}" fill="url(#mf-steel)"/><path d="M${x} ${y + 14} h120 l-10 10 h-100z" fill="#c9d6e0"/><rect x="${x}" y="${y}" width="120" height="14" rx="4" fill="url(#mf-deck)"/>` +
    [0, 1, 2, 3, 4].map((k) => `<rect x="${x + 4 + k * 28}" y="${y - 14}" width="2.5" height="14" fill="#9fb3c4"/>`).join('') +
    `<rect x="${x + 2}" y="${y - 15}" width="116" height="2.5" fill="#9fb3c4"/>` +
    (ring ? `<ellipse class="mf-ring" cx="${x + 60}" cy="${y + 2}" rx="40" ry="6"/>` : '');

  const svg = h('div', { class: 'mf-svg' });
  svg.innerHTML = `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs>
  <linearGradient id="mf-hullg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#eef3f8"/><stop offset="1" stop-color="#b9c9d8"/></linearGradient>
  <radialGradient id="mf-glassg" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="#e9f8ff"/><stop offset="0.5" stop-color="#a9dcf3"/><stop offset="1" stop-color="#5fa4c8"/></radialGradient>
  <linearGradient id="mf-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#dfe7ee"/><stop offset="1" stop-color="#a8b8c6"/></linearGradient>
  <linearGradient id="mf-deck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d4dee7"/></linearGradient>
  <linearGradient id="mf-hazeg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f3fa" stop-opacity="0"/><stop offset="1" stop-color="#e8f3fa" stop-opacity="0.75"/></linearGradient>
  <linearGradient id="mf-groundg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fae8f"/><stop offset="0.3" stop-color="#6d9c80"/><stop offset="1" stop-color="#4f7a64"/></linearGradient>
</defs>
<g class="mf-cl back">${cloudsAt(5, 220, 360, 1.2, '#ffffff', '#dbe7f2')}</g>
<g class="mf-birds">${[0, 1, 2, 3, 4].map((k) => `<path d="M${1100 + k * 22} ${210 + (k % 2) * 10} q6 -6 12 0 q6 -6 12 0" />`).join('')}</g>
<g class="mf-far">${far}</g>
<rect x="-60" y="520" width="1720" height="280" fill="url(#mf-hazeg)"/>
<g class="mf-mid">${mid}</g>
<rect x="-60" y="790" width="1720" height="140" fill="url(#mf-groundg)"/>
<g class="mf-park">${park}</g>
<rect x="-60" y="808" width="1720" height="4" fill="#e8efe9" opacity="0.6"/>
<path class="mf-lane-glow" d="${LANE}"/>
<path class="mf-lane" d="${LANE}"/>
<g class="mf-pad">${platform(200, 694, 96, true)}<circle class="mf-blink" cx="206" cy="676" r="5"/><circle class="mf-blink b2" cx="314" cy="676" r="5"/></g>
<g class="mf-dock">${platform(1290, 680, 110, false)}<path d="M1300 640 q60 -26 120 0 v6 h-120z" fill="#ffd76a" opacity="0.9"/><path class="mf-flag" d="M1404 600 v80 M1404 600 l28 10 l-28 10z"/></g>
<g class="mf-crowd">${crowd}</g>
<g class="mf-near">${near}</g>
<g class="mf-pod">
  <animateMotion class="mf-fly" dur="${FLIGHT}s" begin="indefinite" fill="freeze" rotate="auto" path="${LANE}"/>
  <g class="mf-wobble"><g transform="scale(${K})">
    <ellipse cx="0" cy="6" rx="34" ry="5" fill="#000" opacity="0.12"/>
    <path class="mf-fin" d="M-30 -10 l-14 -14 h10 l16 10z M-30 -18 l-12 -4 l12 -4z" fill="#6aa8ff"/>
    <ellipse class="mf-hull" cx="0" cy="-16" rx="40" ry="20" fill="url(#mf-hullg)"/>
    <path d="M-30 -26 q30 -12 60 0" fill="none" stroke="#fff" stroke-width="2.5" opacity="0.9"/>
    <path class="mf-glass" d="M-20 -26 a22 16 0 0 1 44 0 z" fill="url(#mf-glassg)"/>
    <g class="mf-pilot"><circle cx="2" cy="-27" r="8"/><rect class="mf-goggles" x="-5" y="-31" width="15" height="5" rx="2.5"/><path class="mf-cap" d="M-7 -33 q9 -10 18 0 z"/><g class="mf-eyes"><circle cx="-1" cy="-28.5" r="1.6"/><circle cx="6" cy="-28.5" r="1.6"/></g></g>
    <path d="M-12 -38 q8 -6 18 -4" fill="none" stroke="#fff" stroke-width="2" opacity="0.8"/>
    <rect class="mf-stripe" x="-38" y="-14" width="76" height="4" rx="2"/>
    <circle class="mf-nav red" cx="-36" cy="-16" r="2.4"/><circle class="mf-nav green" cx="38" cy="-16" r="2.4"/>
    <path class="mf-jet" d="M-38 -12 l-26 -6 v12 z"/>
    <g class="mf-rider" transform="translate(-6 -42)">${GULL}</g>
  </g></g>
</g>
<g class="mf-gull"><animateMotion class="mf-gull-in" begin="indefinite" fill="freeze" path="M0 0"/><g transform="scale(${K})">${GULL}</g></g>
<g class="mf-thief"><animateMotion class="mf-gull-out" dur="2.6s" begin="indefinite" fill="freeze" path="M1344 610 C 1300 520 1180 420 1000 360 S 640 260 300 150"/><g transform="scale(${K})">${GULL}<path class="mf-cap" d="M-4 12 q9 -10 18 0 z"/></g></g>
<g class="mf-cl front">${cloudsAt(3, 190, 250, 0.75, 'rgba(255,255,255,0.9)', 'rgba(220,232,242,0.9)')}</g>
</svg>`;
  const sun = h('div', { class: 'mf-sun' }, h('i', { class: 'rays' }), h('i', { class: 'disc' }), h('i', { class: 'flare f1' }), h('i', { class: 'flare f3' }));

  // The checklist on its clipboard, and the countdown.
  const items = [
    ['Seatbelt', '✓'],
    ['Sky-lane map', '✓'],
    ['Snacks', '✓✓'],
    ['Courage', 'loading…'],
  ] as const;
  const list = h(
    'div',
    { class: 'mf-clip' },
    h('b', {}, `Test pilot: ${pilot}`),
    ...items.map(([k, v], i) => h('div', { class: 'mf-item', style: `--i:${i}` }, h('span', {}, k), h('em', {}, v))),
  );
  const count = h('div', { class: 'mf-count' });
  reel.set.append(h('div', { class: 'mf-sky' }), sun, h('div', { class: 'mf-earth' }), svg, list, count);

  const s = svg.querySelector('svg')!;
  // Portrait screens see the whole flight (pad to dock), standing on the bottom bar, rather than its middle.
  if (innerHeight > innerWidth) {
    // Pad to dock, centred; the ground carries on below it (`.mf-earth`).
    s.setAttribute('viewBox', '170 100 1260 760');
    s.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    reel.root.classList.add('mf-portrait');
  }
  const fly = s.querySelector<SVGAnimationElement>('.mf-fly')!;
  const gullIn = s.querySelector<SVGAnimationElement>('.mf-gull-in')!;
  const gullOut = s.querySelector<SVGAnimationElement>('.mf-gull-out')!;
  // Where the pod will be when the gull lands: the lane is flown at an even pace.
  const lane = s.querySelector<SVGPathElement>('.mf-lane')!;
  const meet = lane.getPointAtLength(lane.getTotalLength() * (GULL_LANDS / FLIGHT));
  const from = { x: 1680, y: 180 };
  // The rider's perch on the roof, at the pod's scale.
  const perch = { x: meet.x - 6 * K, y: meet.y - 42 * K };
  gullIn.setAttribute('path', `M${from.x} ${from.y} C ${perch.x + 380} ${from.y + 40} ${perch.x + 140} ${perch.y - 140} ${perch.x} ${perch.y}`);
  gullIn.setAttribute('dur', '1.5s');

  const film = async () => {
    // 1. The pad and the checklist.
    reel.bed('wind', 0.35, 2);
    reel.hit('gulls', 1.2);
    reel.say('Sky-lane charter: approved. Test pilot: …available.');
    if (!(await reel.wait(1700))) return;
    reel.on('list');
    for (let i = 0; i < items.length; i++) {
      reel.cue('tick');
      if (!(await reel.wait(i === items.length - 1 ? 900 : 520))) return;
    }
    reel.say(`${pilot} has flown this route four hundred times. In a simulator.`);
    if (!(await reel.wait(1500))) return;

    // 2. Countdown and lift-off.
    reel.on('ready');
    for (const n of ['3', '2', '1']) {
      count.textContent = n;
      reel.pop(count);
      reel.cue('cs-blink');
      if (!(await reel.wait(700))) return;
    }
    count.textContent = '';
    reel.on('launch');
    // The score (D-195): the wind of the sky lane, the lift-off, a crowd at the dock.
    reel.bed('wind', 0.8, 1);
    reel.hit('swell', 0, 2.5);
    fly.beginElement();
    reel.cue('cs-whoosh');
    reel.say('One small hop for a pod…');
    // 3. A passenger nobody booked.
    if (!(await reel.wait((GULL_LANDS - 1.5) * 1000))) return;
    reel.on('gull');
    reel.hit('gulls', 0.3);
    reel.hit('wings', 1.1);
    gullIn.beginElement();
    if (!(await reel.wait(1500))) return;
    reel.on('aboard');
    reel.cue('cs-boing');
    reel.say('…and one passenger nobody booked.');
    if (!(await reel.wait(1500))) return;
    // 4. The loop.
    reel.say('The gull insisted on the scenic route.');
    reel.cue('cs-freeze');
    if (!(await reel.wait((FLIGHT - GULL_LANDS - 1.5) * 1000))) return;

    // 5. Touchdown, cheers, and a theft.
    reel.on('landed');
    reel.bed('wind', 0.25, 1);
    reel.hit('thud');
    reel.hit('crowd', 0.2);
    reel.cue('cs-fanfare');
    reel.say('Touchdown! The crowd goes mild. Then wild.');
    if (!(await reel.wait(1500))) return;
    reel.on('heist');
    reel.hit('wings', 0.1);
    reel.hit('gulls', 0.3);
    gullOut.beginElement();
    reel.cue('cs-munch');
    reel.say('Sky-lanes: open. Hats: at your own risk.');
    if (!(await reel.wait(2300))) return;

    // 6. The card.
    reel.on('finale');
    await reel.end({
      kicker: 'Unlock · charter granted',
      title: 'Sky-lanes',
      drop: true,
      sub: 'Commuters can fly now instead of jamming the streets.',
      lines: [
        'Pod Docks near busy homes',
        'Pod Interchanges and the Skylane Nexus',
        `${pilot} would like a word about the gull`,
        'The Drift will be singing about that gull for years',
      ],
      button: 'Clear for take-off',
      confetti: ['#8fc0ff', '#c8a8ff', '#ffffff', '#5ff2da'],
    });
  };
  void film();
}

const FANS = ['#ff9fb6', '#8fc0ff', '#ffd76a', '#8ef07a', '#c8a8ff'];
const SKIN = ['#f1c7a5', '#c98f68', '#8d5a3b', '#f5d3b8', '#b07a52'];

/** A gull, wings up (≈ 30 × 16, origin at its feet). */
const GULL = `<g class="mf-bird"><path class="w" d="M0 -6 q-8 -12 -18 -8 q8 2 10 10 z M0 -6 q8 -12 18 -8 q-8 2 -10 10 z"/><ellipse cx="0" cy="-4" rx="9" ry="5"/><circle cx="7" cy="-8" r="3.6"/><path class="beak" d="M10 -8 l6 1.5 l-6 1.5 z"/><circle class="eye" cx="8" cy="-9" r="0.9"/></g>`;
