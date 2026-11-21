import type { GameContext } from '@/game/context';
import { h } from '@/ui/dom';
import { openReel } from '../reel';
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
  const reel = openReel(ctx, { scene: 'mf', label: 'Maiden Flight' }, done);

  // ── The set: sky, clouds, the island's skyline ──
  const clouds = h('div', { class: 'mf-clouds' }, h('i', { class: 'c1' }), h('i', { class: 'c2' }), h('i', { class: 'c3' }));
  // A skyline of towers, as tall as the city is big (a little random, render-only).
  const towers = Math.min(26, 10 + Math.round(city.buildingEntities().length / 30));
  let skyline = '';
  for (let i = 0; i < towers; i++) {
    const w = 38 + Math.random() * 40;
    const x = (i / towers) * 1640 - 20 + Math.random() * 20;
    const ht = 90 + Math.random() * 190;
    skyline += `<rect x="${x.toFixed(0)}" y="${(790 - ht).toFixed(0)}" width="${w.toFixed(0)}" height="${ht.toFixed(0)}" rx="4"/>`;
    if (Math.random() < 0.4) skyline += `<circle cx="${(x + w / 2).toFixed(0)}" cy="${(790 - ht - 14).toFixed(0)}" r="16" class="mf-crown"/>`;
  }
  const crowd = Array.from({ length: 9 }, (_, i) => {
    const x = 1270 + i * 26;
    return `<g class="mf-fan" style="--i:${i}"><rect x="${x - 6}" y="742" width="12" height="20" rx="5" fill="${FANS[i % FANS.length]}"/><circle cx="${x}" cy="734" r="7"/><path class="mf-arms" d="M${x - 6} 748 l-7 -10 M${x + 6} 748 l7 -10"/></g>`;
  }).join('');

  const svg = h('div', { class: 'mf-svg' });
  svg.innerHTML = `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<g class="mf-skyline">${skyline}</g>
<rect class="mf-ground" x="-50" y="788" width="1700" height="140"/>
<path class="mf-lane" d="${LANE}"/>
<g class="mf-pad"><rect x="200" y="694" width="120" height="14" rx="4"/><rect x="250" y="708" width="20" height="82"/><circle class="mf-blink" cx="208" cy="690" r="5"/><circle class="mf-blink b2" cx="312" cy="690" r="5"/></g>
<g class="mf-dock"><rect x="1290" y="680" width="120" height="14" rx="4"/><rect x="1340" y="694" width="20" height="96"/><path class="mf-flag" d="M1404 600 v80 M1404 600 l28 10 l-28 10z"/></g>
<g class="mf-crowd">${crowd}</g>
<g class="mf-pod">
  <animateMotion class="mf-fly" dur="${FLIGHT}s" begin="indefinite" fill="freeze" rotate="auto" path="${LANE}"/>
  <g class="mf-wobble"><g transform="scale(${K})">
    <ellipse class="mf-hull" cx="0" cy="-16" rx="40" ry="20"/>
    <path class="mf-glass" d="M-20 -26 a22 16 0 0 1 44 0 z"/>
    <g class="mf-pilot"><circle cx="2" cy="-27" r="8"/><rect class="mf-goggles" x="-5" y="-31" width="15" height="5" rx="2.5"/><path class="mf-cap" d="M-7 -33 q9 -10 18 0 z"/><g class="mf-eyes"><circle cx="-1" cy="-28.5" r="1.6"/><circle cx="6" cy="-28.5" r="1.6"/></g></g>
    <rect class="mf-stripe" x="-38" y="-14" width="76" height="4" rx="2"/>
    <path class="mf-jet" d="M-38 -12 l-26 -6 v12 z"/>
    <g class="mf-rider" transform="translate(-6 -42)">${GULL}</g>
  </g></g>
</g>
<g class="mf-gull"><animateMotion class="mf-gull-in" begin="indefinite" fill="freeze" path="M0 0"/><g transform="scale(${K})">${GULL}</g></g>
<g class="mf-thief"><animateMotion class="mf-gull-out" dur="2.6s" begin="indefinite" fill="freeze" path="M1344 610 C 1300 520 1180 420 1000 360 S 640 260 300 150"/><g transform="scale(${K})">${GULL}<path class="mf-cap" d="M-4 12 q9 -10 18 0 z"/></g></g>
</svg>`;

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
  reel.set.append(h('div', { class: 'mf-sky' }), clouds, h('div', { class: 'mf-earth' }), svg, list, count);

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
    fly.beginElement();
    reel.cue('cs-whoosh');
    reel.say('One small hop for a pod…');
    // 3. A passenger nobody booked.
    if (!(await reel.wait((GULL_LANDS - 1.5) * 1000))) return;
    reel.on('gull');
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
    reel.cue('cs-fanfare');
    reel.say('Touchdown! The crowd goes mild. Then wild.');
    if (!(await reel.wait(1500))) return;
    reel.on('heist');
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
      lines: ['Pod Docks near busy homes', 'Pod Interchanges and the Skylane Nexus', `${pilot} would like a word about the gull`],
      button: 'Clear for take-off',
      confetti: ['#8fc0ff', '#c8a8ff', '#ffffff', '#5ff2da'],
    });
  };
  void film();
}

const FANS = ['#ff9fb6', '#8fc0ff', '#ffd76a', '#8ef07a', '#c8a8ff'];

/** A gull, wings up (≈ 30 × 16, origin at its feet). */
const GULL = `<g class="mf-bird"><path class="w" d="M0 -6 q-8 -12 -18 -8 q8 2 10 10 z M0 -6 q8 -12 18 -8 q-8 2 -10 10 z"/><ellipse cx="0" cy="-4" rx="9" ry="5"/><circle cx="7" cy="-8" r="3.6"/><path class="beak" d="M10 -8 l6 1.5 l-6 1.5 z"/><circle class="eye" cx="8" cy="-9" r="0.9"/></g>`;
