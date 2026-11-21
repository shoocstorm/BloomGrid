import type { GameContext } from '@/game/context';
import type { JuiceSound } from '@/modules/juice';
import { h } from '@/ui/dom';
import type { FilmHit } from '@/modules/moments/score';
import { CAT_SIDE_SVG, CAT_SVG, type Coat } from './art';
import './cutscene.css';

/**
 * "The Stray" (D-178): the short film that plays when a fresh island befriends its cat. About twenty seconds, in
 * its own illustrated night over the island's rooftops (DOM and CSS over the city, which is paused under it):
 *
 * 1. Letterbox and night. Two lamp-bright eyes blink beside a chimney: something has been watching you.
 * 2. A fish on a string drops into view. The eyes go wide.
 * 3. The shadow creeps out along the roof, freezing in a ridiculous pose whenever the fish twitches ("!", "!!").
 * 4. The pounce: a leap at the fish, a puff of stars, the fish gone. Munch, munch, *hic*.
 * 5. Dawn breaks behind it: light sweeps over the shadow and its true coat appears, in a shower of sparkles.
 * 6. A slow blink at the camera (in cat, "I trust you"), a heart.
 * 7. Its name drops in letter by letter: it has decided to adopt *you*. A collar with a bell lands with a jingle.
 * 8. Paw-print confetti and a card: what the cat will do from now on. Welcome home.
 *
 * Skip with the button, Esc, or (at the card) its button. Sounds are cues on the `juice` event (`cs-*`), all
 * synthesised by the audio module. The cast is the island's own cat: name, coat, island name.
 */
export interface Cast {
  name: string;
  coat: Coat;
  island: string;
}

/** The stray's colours on stage: almost the night sky, with lamp eyes. */
const SHADOW = { fur: '#1b2130', belly: '#222a3a', mark: '#1b2130', eye: '#ffe27a' };

let current: { skip(): void } | null = null;
let keysBound = false;

export function playAdoption(ctx: GameContext, cast: Cast, done: () => void): void {
  if (current) return;
  if (!keysBound) {
    keysBound = true;
    // While the film runs it owns the keyboard: Esc skips, nothing reaches the city.
    ctx.input.onKey((e) => {
      if (!current) return false;
      if (e.code === 'Escape') current.skip();
      return true;
    }, 1000);
  }
  const speed = ctx.engine.speed;
  ctx.engine.speed = 0;
  const cue = (sound: JuiceSound) => ctx.bus.emit('juice', { sound });
  let alive = true;
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // ── The set ──
  const stars = h('div', { class: 'cs-stars' });
  for (let i = 0; i < 70; i++)
    stars.append(
      h('i', {
        style: `left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 62).toFixed(1)}%;--d:${(Math.random() * 3).toFixed(2)}s;--z:${(0.5 + Math.random()).toFixed(2)}`,
      }),
    );
  const moon = h('div', { class: 'cs-moon' });
  const sky = h('div', { class: 'cs-sky' }, h('div', { class: 'cs-dawn' }), stars, moon);
  const skyline = h('div', { class: 'cs-skyline' });
  skyline.innerHTML = SKYLINE_SVG;
  const ledge = h(
    'div',
    { class: 'cs-ledge' },
    h('i', { class: 'cs-chimney' }),
    h('i', { class: 'cs-bush b1' }),
    h('i', { class: 'cs-bush b2' }),
    h('i', { class: 'cs-panel' }),
  );
  const fish = h(
    'div',
    { class: 'cs-fish' },
    h('i', { class: 'cs-string' }),
    h('span', { class: 'cs-fish-body' }),
  );
  (fish.lastChild as HTMLElement).innerHTML = FISH_SVG;
  const puff = h('div', { class: 'cs-puff' });

  // ── The star: the island's cat, rigged as in the city (`ch-cat` classes drive its poses) ──
  const front = h('span', { class: 'ch-cat-in' });
  front.innerHTML = CAT_SVG;
  const side = h('span', { class: 'ch-side' });
  side.innerHTML = CAT_SIDE_SVG;
  front.append(side, h('i', { class: 'cs-collar' }, h('b', {})));
  const cat = h('div', { class: 'ch-cat cs-cat' }, front);
  const paint = (c: { fur: string; belly: string; mark: string; eye?: string }) => {
    cat.style.setProperty('--fur', c.fur);
    cat.style.setProperty('--belly', c.belly);
    cat.style.setProperty('--mark', c.mark);
    cat.style.setProperty('--eye', c.eye ?? '#1f2a24');
  };
  paint(SHADOW);
  const bang = h('b', { class: 'cs-bang' });
  const munch = h('div', { class: 'cs-munch' });
  const jump = h('div', { class: 'cs-jump' }, cat, bang, munch);
  const actor = h('div', { class: 'cs-actor' }, jump);
  const flash = h('div', { class: 'cs-flash' });
  const sparkles = h('div', { class: 'cs-sparkles' });
  const heart = h('div', { class: 'cs-heart' });
  const cap = h('p', { class: 'cs-cap' });
  const title = h('div', { class: 'cs-title' });
  const paws = h('div', { class: 'cs-paws' });
  const card = h('div', { class: 'cs-card' });
  const skip = h('button', { class: 'cs-skip', onClick: () => finish() }, 'Skip ›');
  const root = h(
    'div',
    { class: 'cs-root', role: 'dialog', 'aria-label': 'Cutscene: the stray' },
    // The art, as one layer: the finish drifts and grades it (D-188).
    h('div', { class: 'cs-set' }, sky, skyline, fish, actor, ledge, puff, flash, sparkles, heart),
    title,
    paws,
    card,
    h('div', { class: 'cs-bar top' }, skip),
    h('div', { class: 'cs-bar bot' }, cap),
  );
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  ctx.services.tryGet('moments')?.finish(root, root.querySelector('.cs-set')!, 'rgba(160, 170, 255, 0.14)');
  document.body.append(root);
  document.body.classList.add('cutscene-on');

  // ── Direction ──
  const at = (x: number, secs = 0) => {
    actor.style.setProperty('--t', `${secs}s`);
    actor.style.setProperty('--x', `${x}vw`);
  };
  const pose = (...cls: string[]) => {
    cat.className = ['ch-cat', 'cs-cat', ...cls].join(' ');
  };
  const say = (text: string) => {
    cap.classList.remove('show');
    void cap.offsetWidth;
    cap.textContent = text;
    cap.classList.add('show');
  };
  const pop = (el: HTMLElement, text: string) => {
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  };
  const look = (x: number, y: number) => {
    cat.style.setProperty('--lx', String(x));
    cat.style.setProperty('--ly', String(y));
  };
  const face = (dir: 1 | -1) => (side.style.scale = dir < 0 ? '-1 1' : '1 1');

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    alive = false;
    current = null;
    root.classList.add('out');
    ctx.bus.emit('film:state', { on: false });
    ctx.engine.speed = speed;
    setTimeout(() => {
      root.remove();
      document.body.classList.remove('cutscene-on');
      done();
    }, 950);
  };
  current = { skip: finish };

  const film = async () => {
    // 1. Night. Something is watching.
    at(76);
    pose();
    look(-0.4, 0.3);
    // The score (D-195): a night breeze over the rooftops; the city's music ducks under it.
    const hit = (h: FilmHit, delay?: number, dur?: number) => alive && ctx.bus.emit('film:hit', { hit: h, delay, dur });
    ctx.bus.emit('film:state', { on: true, key: -2 });
    ctx.bus.emit('film:bed', { bed: 'wind', level: 0.3, fade: 2 });
    ctx.bus.emit('film:bed', { bed: 'drone', level: 0.12, fade: 3 });
    // The lead-in (D-194): the city freezes, the letterbox slides in, an iris closes, and the night opens.
    const lead = ctx.services.tryGet('moments')?.leadIn(root);
    requestAnimationFrame(() => root.classList.add('in'));
    if (lead) await lead;
    if (!alive) return;
    cue('cs-night');
    await wait(900);
    if (!alive) return;
    say('Every island has a secret…');
    await wait(1500);
    if (!alive) return;
    pose('blink2');
    cue('cs-blink');
    say('…and yours has been watching you.');
    await wait(1700);
    if (!alive) return;

    // 2. Bait.
    fish.classList.add('down');
    cue('cs-boing');
    say('Someone left out the good fish.');
    await wait(700);
    pose('wide');
    look(-0.9, -0.7);
    await wait(1300);
    if (!alive) return;

    // 3. The creep, and the freezes.
    face(-1);
    pose('pose-side', 'act-walk');
    at(63, 1.5);
    cue('cs-sneak');
    say('Stealth level: cat.');
    await wait(1100);
    if (!alive) return;
    fish.classList.add('twitch');
    pose('pose-side', 'act-walk', 'freeze');
    actor.style.setProperty('--t', '0s');
    at(63 + (76 - 63) * 0.27);
    pop(bang, '!');
    cue('cs-freeze');
    await wait(900);
    if (!alive) return;
    fish.classList.remove('twitch');
    pose('pose-side', 'act-walk');
    at(57, 1);
    await wait(900);
    if (!alive) return;
    fish.classList.add('twitch');
    pose('pose-side', 'act-walk', 'freeze', 'tiptoe');
    actor.style.setProperty('--t', '0s');
    pop(bang, '!!');
    cue('cs-freeze');
    say('Very. Very. Still.');
    await wait(1000);
    if (!alive) return;
    fish.classList.remove('twitch');

    // 4. The pounce.
    pose('pose-side', 'act-leap');
    at(50, 0.7);
    jump.classList.add('leap');
    cue('cs-whoosh');
    hit('thud', 0.55);
    say('');
    await wait(380);
    if (!alive) return;
    fish.classList.add('gone');
    puff.classList.add('show');
    await wait(420);
    if (!alive) return;
    jump.classList.remove('leap');
    pose('land', 'full');
    look(0, 0);
    cue('cs-munch');
    pop(munch, 'munch');
    await wait(500);
    pop(munch, 'munch munch');
    cue('cs-munch');
    await wait(650);
    pop(munch, '*hic*');
    say('Nom.');
    await wait(1100);
    if (!alive) return;

    // 5. Dawn, and the coat.
    root.classList.add('dawn');
    hit('swell', 0, 2.4);
    hit('shimmer', 0.4);
    ctx.bus.emit('film:bed', { bed: 'drone', level: 0, fade: 2 });
    flash.classList.add('show');
    for (let i = 0; i < 26; i++) {
      const a = (Math.PI * 2 * i) / 26 + Math.random() * 0.3;
      const r = 14 + Math.random() * 22;
      sparkles.append(
        h('i', {
          style: `--x:${(Math.cos(a) * r).toFixed(1)}vmin;--y:${(Math.sin(a) * r - 6).toFixed(1)}vmin;--d:${(Math.random() * 0.4).toFixed(2)}s`,
        }),
      );
    }
    paint(cast.coat);
    pose('full', 'glow');
    cue('cs-reveal');
    say('Oh. You are rather lovely in the light.');
    await wait(2300);
    if (!alive) return;

    // 6. The slow blink.
    pose('slowblink');
    say('A slow blink. In cat, that means: I trust you.');
    cue('cs-blink');
    await wait(900);
    heart.classList.add('show');
    await wait(1500);
    if (!alive) return;

    // 7. The name, and the collar.
    say('');
    title.replaceChildren(
      h('div', { class: 'cs-name' }, ...[...cast.name].map((ch, i) => h('span', { style: `--i:${i}` }, ch))),
      h('p', { class: 'cs-sub' }, 'has decided to adopt you.'),
      h('p', { class: 'cs-aside' }, '(You thought it was the other way round.)'),
    );
    title.classList.add('show');
    cue('cs-fanfare');
    hit('resolve', 0.3);
    await wait(1700);
    if (!alive) return;
    cat.classList.add('collared');
    cue('cs-bell');
    for (let i = 0; i < 34; i++)
      paws.append(
        h('i', {
          style: `left:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 1.6).toFixed(2)}s;--r:${(Math.random() * 360).toFixed(0)}deg;--s:${(0.6 + Math.random() * 0.8).toFixed(2)};--c:${PAW_COLOURS[i % PAW_COLOURS.length]}`,
        }),
      );
    paws.classList.add('show');
    await wait(1500);
    if (!alive) return;

    // 8. Welcome home.
    title.classList.add('up');
    skip.classList.add('hidden');
    card.replaceChildren(
      h('b', {}, `${cast.name} joined ${cast.island || 'the island'}`),
      h(
        'ul',
        {},
        h('li', {}, 'Follows you across the rooftops'),
        h('li', {}, 'Talks to you, and warns you of trouble'),
        h('li', {}, 'Loves a pet (and brings the odd gift)'),
        h('li', {}, 'Descended, it insists, from Ama Reyes’s ship’s cat'),
      ),
      h('button', { class: 'cs-go', onClick: () => finish() }, `Welcome home, ${cast.name}`),
    );
    card.classList.add('show');
    (card.querySelector('.cs-go') as HTMLElement | null)?.focus({ preventScroll: true });
    await wait(12000);
    finish();
  };
  void film();
}

const PAW_COLOURS = ['#ffcf6a', '#ff9ec4', '#8ef07a', '#9fd8ff', '#ffffff'];

/** The island's rooftops at night (1000 × 260, cut to the screen's width): domes, a tower, a turning turbine. */
const SKYLINE_SVG = `<svg viewBox="0 0 1000 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<path class="far" d="M0 260V190h40v-30h50v30h40v-50q30-30 60 0v50h50v-70h30v70h60v-40h40v40h50v-90h50v90h40v-30l40-30 40 30v30h60v-60h20v60h50v-40q30-25 60 0v40h50v-50h40v50h60v70z"/>
<path class="near" d="M0 260V215h70v-25h20v25h90v-35q35-30 70 0v35h80v-20h120v20h60v-40h30v40h110v-30l35-25 35 25v30h90v-20h40v20h80v45z"/>
<g class="cs-turbine" transform="translate(820 120)"><rect x="-2" y="0" width="4" height="70"/><g class="blades"><path d="M0 0 3-34h-6zM0 0l29 19-3 4zM0 0l-29 19 3 4z"/></g><circle r="4"/></g>
</svg>`;

/** A fish, nose down, on its string (26 × 44). */
const FISH_SVG = `<svg viewBox="0 0 26 44" aria-hidden="true">
<path d="M13 2c7 6 9 16 6 26-1 3-4 6-6 7-2-1-5-4-6-7C4 18 6 8 13 2z" fill="#9fd0e8"/>
<path d="M13 4c4 5 5 13 3 22" stroke="#e8f6ff" stroke-width="1.6" fill="none" opacity=".7"/>
<path d="M13 33l-7 9h14z" fill="#7fb6d2"/>
<circle cx="10.5" cy="10" r="1.6" fill="#1d2a33"/>
<path d="M8 17q5 2 10 0M8 22q5 2 10 0" stroke="#6aa6c4" stroke-width=".8" fill="none"/>
</svg>`;
