import type { GameContext } from '@/game/context';
import { isOpen } from '@/sim/growthState';
import { CAT_SIDE_SVG, CAT_SVG, COATS } from '@/modules/charm/art';
import { h } from '@/ui/dom';
import { cloud, seeded, skyline } from '@/modules/moments/films/art';
import './hello.css';

/**
 * "Hello, World" (D-185): Flora's awakening, ~18 s, cast from the city. In the Data Spire's core room at dusk:
 *
 * 1. A terminal boots her, line by line ("Loading civic empathy… 87%… 87%… please hold").
 * 2. The log folds away; her petals unfold round the core and an eye opens. "…hello?"
 * 3. She looks out of the round window at the city and counts everyone, out loud, to the real population.
 * 4. Something on the ledge: the island's cat if it is the steward's ("Classification: supervisor"), else a gull
 *    ("Threat level: snacks"). Her eye follows it.
 * 5. Her first words, typed into a bubble; then the card, and her console opens.
 *
 * Text from the city (its name) reaches the DOM only as text; the SVG is static markup we wrote.
 */
export function playHelloWorld(ctx: GameContext, done: () => void, notice?: string): void {
  const moments = ctx.services.tryGet('moments');
  if (!moments) return done();
  const { city } = ctx;
  const name = city.growth.name || 'the city';
  const pop = Math.round(city.stats.population);
  const blds = city.buildingEntities().length;
  const hasCat = isOpen(city.growth, 'cat') && !!ctx.services.tryGet('charm')?.on;
  const catName = ctx.services.tryGet('charm')?.cat.name ?? 'the cat';
  const reel = moments.reel({ scene: 'hw', label: 'Hello, World' }, done);

  // ── The set (D-188): the core room, server racks, its round window on a dusk city, light falling in ──
  const rand = seeded(city.seed * 5 + 3);
  const city2 =
    skyline({ x0: -20, x1: 420, ground: 400, tall: 150, count: 14, face: '#6b5a7e', side: '#58496b', glass: '#8f7fa6', lit: '#ffd98a', litShare: 0, green: '#5f8a6e', detail: false }, rand) +
    skyline({ x0: -10, x1: 410, ground: 400, tall: 200, count: 9, face: '#3d3552', side: '#2f2843', glass: '#55496e', lit: '#ffd98a', litShare: 0.3, green: '#4d7a5e', detail: true }, rand);
  const window_ = h('div', { class: 'hw-window' });
  window_.innerHTML = `<svg viewBox="0 0 400 400" aria-hidden="true"><defs><clipPath id="hw-round"><circle cx="200" cy="200" r="200"/></clipPath><linearGradient id="hw-skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a5a9a"/><stop offset="0.45" stop-color="#d98a8a"/><stop offset="0.75" stop-color="#f6b57c"/><stop offset="1" stop-color="#ffd9a0"/></linearGradient></defs><g clip-path="url(#hw-round)"><rect width="400" height="400" fill="url(#hw-skyg)"/><circle class="hw-sun" cx="290" cy="290" r="36"/><g opacity="0.85"><g transform="translate(90 110) scale(0.6 0.4)">${cloud(rand, '#ffd2c0', '#c98fa0')}</g><g transform="translate(300 80) scale(0.45 0.3)">${cloud(rand, '#ffd2c0', '#c98fa0')}</g></g><g class="hw-city">${city2}</g><rect y="388" width="400" height="12" fill="#2a2338"/></g><circle cx="200" cy="200" r="198" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="3"/><path d="M60 90 A170 170 0 0 1 150 36" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="5" stroke-linecap="round"/></svg>`;
  // Server racks on both walls, their lights blinking; cables hanging between them.
  const rack = (side: 'l' | 'r') => {
    let leds = '';
    for (let r = 0; r < 14; r++)
      for (let c = 0; c < 3; c++)
        if (rand() < 0.7) leds += `<circle class="hw-led" style="--d:${(rand() * 2).toFixed(2)}s;--c:${LEDS[Math.floor(rand() * LEDS.length)]}" cx="${18 + c * 10}" cy="${20 + r * 22}" r="2"/>`;
    const units = Array.from({ length: 14 }, (_, r) => `<rect x="8" y="${12 + r * 22}" width="64" height="18" rx="2" fill="#0d2226" stroke="#1d3a40"/>`).join('');
    const el = h('div', { class: `hw-rack ${side}` });
    el.innerHTML = `<svg viewBox="0 0 80 330" aria-hidden="true"><rect width="80" height="330" rx="4" fill="#081719"/>${units}${leds}</svg>`;
    return el;
  };
  const cables = h('div', { class: 'hw-cables' });
  cables.innerHTML = `<svg viewBox="0 0 1600 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 20 Q300 150 620 40 M980 30 Q1300 170 1600 24 M0 50 Q220 120 420 70" fill="none" stroke="#0b1f22" stroke-width="6"/><path d="M0 20 Q300 150 620 40" fill="none" stroke="#1f6b66" stroke-width="1.5" opacity="0.6"/></svg>`;
  const beam = h('div', { class: 'hw-beam' }, ...Array.from({ length: 14 }, () => h('i', { style: `--x:${(rand() * 100).toFixed(1)}%;--y:${(rand() * 100).toFixed(1)}%;--d:${(rand() * 6).toFixed(2)}s;--s:${(0.5 + rand()).toFixed(2)}` })));
  const count = h('div', { class: 'hw-count' }, h('b', {}), h('span', {}, 'residents'));
  const ledge = h('div', { class: 'hw-ledge' });

  // The visitor on the ledge: the steward's cat (the city's own rig and coat) or a gull.
  let visitor: HTMLElement;
  if (hasCat) {
    const coat = COATS[Math.floor((Math.abs(Math.floor(city.seed)) || 1) / 7) % COATS.length]!;
    const front = h('span', { class: 'ch-cat-in' });
    front.innerHTML = CAT_SVG;
    const side = h('span', { class: 'ch-side' });
    side.innerHTML = CAT_SIDE_SVG;
    front.append(side);
    visitor = h('div', { class: 'ch-cat pose-side act-walk' }, front);
    visitor.style.setProperty('--fur', coat.fur);
    visitor.style.setProperty('--belly', coat.belly);
    visitor.style.setProperty('--mark', coat.mark);
    visitor.style.setProperty('--eye', coat.eye ?? '#1f2a24');
  } else {
    visitor = h('div', { class: 'hw-gull' });
    visitor.innerHTML = GULL_SVG;
  }
  const guest = h('div', { class: 'hw-guest' }, visitor);
  const label = h('div', { class: 'hw-label' });

  // Flora: her petals, the core, the eye.
  const flora = h('div', { class: 'hw-flora' });
  flora.innerHTML = FLORA_SVG;
  const log = h('pre', { class: 'hw-log' });
  const bubble = h('div', { class: 'hw-bubble' });
  reel.set.append(h('div', { class: 'hw-room' }), cables, rack('l'), rack('r'), beam, window_, h('div', { class: 'hw-floorglow' }), count, ledge, guest, label, flora, log, bubble);

  const type = async (el: HTMLElement, text: string, cps = 60) => {
    for (let i = 0; i < text.length; i++) {
      el.textContent += text[i]!;
      if (i % 3 === 0 && !(await reel.wait((1000 / cps) * 3))) return false;
    }
    return true;
  };
  const line = async (text: string, pause = 200) => {
    if (log.textContent) log.textContent += '\n';
    if (!(await type(log, text, 120))) return false;
    return reel.wait(pause);
  };
  const look = (x: number, y: number) => {
    flora.style.setProperty('--lx', String(x));
    flora.style.setProperty('--ly', String(y));
  };

  const film = async () => {
    // 1. Boot.
    reel.on('boot');
    reel.cue('cs-night');
    if (!(await reel.wait(700))) return;
    for (const [t, p] of [
      ['BG-01 · Data Spire core · boot', 150],
      [`Indexing ${blds.toLocaleString('en-US')} buildings ....... ok`, 150],
      ['Loading civic empathy ......... 87%', 380],
      ['Loading civic empathy ......... 87%', 380],
      ['Loading civic empathy ......... please hold', 550],
      ['Loading civic empathy ......... 100% (it was shy)', 250],
      ['Installing puns ............... failed successfully', 500],
    ] as const)
      if (!(await line(t, p))) return;

    // 2. She wakes.
    reel.on('wake');
    reel.sound('awake');
    if (!(await reel.wait(1400))) return;
    reel.on('eye');
    reel.cue('cs-blink');
    reel.say('…hello?');
    look(-0.6, 0);
    if (!(await reel.wait(700))) return;
    look(0.6, 0);
    if (!(await reel.wait(700))) return;

    // 3. She counts the city.
    reel.on('count');
    // The window is to her right.
    look(0.8, -0.2);
    reel.say('First, she counted everyone. Out loud.');
    const n = count.querySelector('b')!;
    const steps = 22;
    for (let i = 1; i <= steps; i++) {
      n.textContent = Math.round((pop * i * i) / (steps * steps)).toLocaleString('en-US');
      if (i % 4 === 0) reel.cue('tick');
      if (!(await reel.wait(70))) return;
    }
    reel.say('Then again. Just to be sure.');
    reel.pop(count, 'again');
    if (!(await reel.wait(1300))) return;

    // 4. A visitor on the ledge.
    reel.on('guest');
    reel.cue(hasCat ? 'meow' : 'cs-boing');
    look(0.9, 0.5);
    if (!(await reel.wait(1700))) return;
    label.textContent = hasCat ? `Unknown resident: ${catName}. Classification: …supervisor.` : 'Unknown resident: gull. Threat level: snacks.';
    reel.on('label');
    reel.cue('cs-freeze');
    if (!(await reel.wait(2000))) return;

    // 5. Her first words.
    reel.on('speak');
    look(0, 0.1);
    reel.say('');
    if (!(await type(bubble, `Hello, steward. I've read every building in ${name}. Twice. Ask me anything.`, 45))) return;
    if (!(await reel.wait(1500))) return;
    reel.on('finale');
    await reel.end({
      kicker: 'Civic intelligence · BG-01 · online',
      title: 'Flora',
      drop: true,
      sub: 'Answers, advice and actions on request, for a few credits each.',
      lines: [
        `${pop.toLocaleString('en-US')} residents counted (twice)`,
        `${blds.toLocaleString('en-US')} buildings read`,
        hasCat ? `${catName} approves, probably` : 'One gull, under observation',
        ...(notice ? [notice] : []),
      ],
      button: 'Say hello',
      confetti: ['#5ff2da', '#8ef07a', '#ffffff', '#c8a8ff'],
    });
  };
  void film();
}

const LEDS = ['#5ff2da', '#5ff2da', '#8ef07a', '#ffd76a', '#ff6b6b'];

/** Flora's sigil: six petals round a core, and an eye (its lids and pupil move with `--lx`, `--ly`). */
const FLORA_SVG = `<svg viewBox="-60 -60 120 120" aria-hidden="true">
<circle class="hw-halo" r="52"/>
<g class="hw-petals">${Array.from({ length: 6 }, (_, i) => `<g transform="rotate(${i * 60})"><ellipse class="hw-petal" style="--i:${i}" rx="9" ry="21" cy="-27"/></g>`).join('')}</g>
<circle class="hw-core" r="17"/>
<g class="hw-eye"><ellipse class="hw-white" rx="11" ry="8"/><g class="hw-look"><circle class="hw-iris" r="5"/><circle class="hw-pupil" r="2.4"/><circle class="hw-glint" cx="1.6" cy="-1.6" r="1"/></g><rect class="hw-lid top" x="-12" y="-9" width="24" height="9"/><rect class="hw-lid bot" x="-12" y="0" width="24" height="9"/></g>
</svg>`;

/** A gull standing (40 × 30). */
const GULL_SVG = `<svg viewBox="-20 -26 40 30" aria-hidden="true"><path d="M-4 0 v4 M4 0 v4" stroke="#ffb43a" stroke-width="2"/><ellipse cx="0" cy="-8" rx="13" ry="8" fill="#fbfbfb" stroke="#6f7f8f"/><path d="M-12 -10 q8 -6 18 -2 l-8 6z" fill="#c9d3dc"/><circle cx="9" cy="-17" r="6" fill="#fbfbfb" stroke="#6f7f8f"/><path d="M14 -17 l8 2 l-8 2z" fill="#ffb43a"/><circle cx="10.5" cy="-18.5" r="1.2" fill="#1f2a33"/></svg>`;
