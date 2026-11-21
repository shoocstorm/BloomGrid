import type { GameContext } from '@/game/context';
import { isOpen } from '@/sim/growthState';
import { CAT_SIDE_SVG, CAT_SVG, COATS } from '@/modules/charm/art';
import { h } from '@/ui/dom';
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

  // ── The set: the core room, its round window on the city, the console ──
  let skyline = '';
  for (let i = 0; i < 16; i++) {
    const w = 20 + Math.random() * 26;
    const x = i * 26 - 10 + Math.random() * 8;
    const ht = 40 + Math.random() * 120;
    skyline += `<rect x="${x.toFixed(0)}" y="${(400 - ht).toFixed(0)}" width="${w.toFixed(0)}" height="${ht.toFixed(0)}" rx="2"/>`;
    for (let k = 0; k < ht / 18; k++)
      if (Math.random() < 0.45) skyline += `<rect class="hw-win" style="--d:${(Math.random() * 1.2).toFixed(2)}s" x="${(x + 5 + (k % 2) * 8).toFixed(0)}" y="${(400 - ht + 8 + k * 16).toFixed(0)}" width="5" height="6"/>`;
  }
  const window_ = h('div', { class: 'hw-window' });
  window_.innerHTML = `<svg viewBox="0 0 400 400" aria-hidden="true"><defs><clipPath id="hw-round"><circle cx="200" cy="200" r="200"/></clipPath></defs><g clip-path="url(#hw-round)"><rect class="hw-dusk" width="400" height="400"/><circle class="hw-sun" cx="300" cy="300" r="40"/><g class="hw-city">${skyline}</g></g></svg>`;
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
  reel.set.append(h('div', { class: 'hw-room' }), window_, count, ledge, guest, label, flora, log, bubble);

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

/** Flora's sigil: six petals round a core, and an eye (its lids and pupil move with `--lx`, `--ly`). */
const FLORA_SVG = `<svg viewBox="-60 -60 120 120" aria-hidden="true">
<circle class="hw-halo" r="52"/>
<g class="hw-petals">${Array.from({ length: 6 }, (_, i) => `<g transform="rotate(${i * 60})"><ellipse class="hw-petal" style="--i:${i}" rx="9" ry="21" cy="-27"/></g>`).join('')}</g>
<circle class="hw-core" r="17"/>
<g class="hw-eye"><ellipse class="hw-white" rx="11" ry="8"/><g class="hw-look"><circle class="hw-iris" r="5"/><circle class="hw-pupil" r="2.4"/><circle class="hw-glint" cx="1.6" cy="-1.6" r="1"/></g><rect class="hw-lid top" x="-12" y="-9" width="24" height="9"/><rect class="hw-lid bot" x="-12" y="0" width="24" height="9"/></g>
</svg>`;

/** A gull standing (40 × 30). */
const GULL_SVG = `<svg viewBox="-20 -26 40 30" aria-hidden="true"><path d="M-4 0 v4 M4 0 v4" stroke="#ffb43a" stroke-width="2"/><ellipse cx="0" cy="-8" rx="13" ry="8" fill="#fbfbfb" stroke="#6f7f8f"/><path d="M-12 -10 q8 -6 18 -2 l-8 6z" fill="#c9d3dc"/><circle cx="9" cy="-17" r="6" fill="#fbfbfb" stroke="#6f7f8f"/><path d="M14 -17 l8 2 l-8 2z" fill="#ffb43a"/><circle cx="10.5" cy="-18.5" r="1.2" fill="#1f2a33"/></svg>`;
