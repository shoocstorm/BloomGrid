import { Vector3 } from 'three/webgpu';
import type { GameContext } from '@/game/context';
import { h } from '@/ui/dom';
import { openReel } from '@/modules/moments/reel';
import { FilmStage } from '@/modules/moments/FilmStage';
import { orbit, type Framing, type Shot, type V3 } from '@/modules/moments/shots';
import { LOOKS, type StageLook } from '@/render/stageUniforms';
import { Cat3D, Fish3D, type CatPose } from './cat3d';
import type { Coat } from './art';
import './cutscene.css';

/** Who plays the stray: the island's own cat, and the island. */
export interface Cast {
  name: string;
  coat: Coat;
  island: string;
}

/**
 * "The Stray" (D-178, in 3D since D-196): the adoption film's eight beats played on the 3D film stage instead of in SVG. The set
 * is the game's own houses on a night rooftop; the star is the procedural cat (`cat3d.ts`) in its shadow coat, lamp
 * eyes glowing, until dawn paints its true one. The letterbox, captions, the "!" / "munch" pins, the heart, the
 * sparkles and the end card stay DOM over the 3D frame (the reel kit), so it is a 2D + 3D film.
 *
 * Skip with the button or Esc; replayable from Build → Goals → Replays.
 */

/** The stray's colours: almost the night sky, with lamp eyes. */
const SHADOW = { fur: '#1b2130', belly: '#222a3a', mark: '#1b2130', eye: '#ffe27a' };
const PAW_COLOURS = ['#ffcf6a', '#ff9ec4', '#8ef07a', '#9fd8ff', '#ffffff'];

/** Night over the rooftops (moonlight from the west) and the dawn that breaks behind the cat (sun low in the east). */
const NIGHT: StageLook = { ...LOOKS.night, env: 0.45, sunDir: [-0.45, 0.62, 0.4], key: 0x9fb8ff, keyI: 0.75, rimI: 0.7, hemiI: 0.28, top: 0x03070f, low: 0x13284a, bloom: 1.1 };
const DAWN: StageLook = { ...LOOKS.dusk, night: 0.12, sunDir: [0.75, 0.3, 0.45], key: 0xffc493, keyI: 2.5, rimI: 1.2, hemiI: 0.9, top: 0x2d4a80, low: 0xffa77a, bloom: 0.8, zenith: 0x6d8fd0, horizon: 0xffc09a };

/** The cat's size on the set: a little larger than life against the houses, as a film's star is. */
const CAT = 0.12;

export function playAdoption(ctx: GameContext, cast: Cast, done: () => void): void {
  const stage = FilmStage.get(ctx);
  stage.clear();
  const reel = openReel(ctx, { scene: 'sx', label: 'The stray', key: -2, leak: 'rgba(160, 170, 255, 0.14)', leaving: () => stage.close() }, done);

  // ── The set: at the island's heart (night windows read the city's activity there), on its ground. ──
  const { city } = ctx;
  const cx = city.size / 2;
  const base = Math.max(0, city.grid.heightAt(cx, cx));
  const O = new Vector3(cx, base, cx);
  // The hero roof: a studio's flat garden roof, the cat's lookout over a street of homes and the towers beyond.
  const roof = stage.addBuilding('living-studio', 0, O.x, O.z, 0, base);
  stage.addBuilding('garden-residence', 0, O.x - 3, O.z + 0.4, Math.PI / 2, base);
  stage.addBuilding('garden-residence', 0, O.x + 3.1, O.z - 0.3, -Math.PI / 2, base);
  stage.addBuilding('garden-residence', 1, O.x - 1.5, O.z - 3.6, 0, base);
  stage.addBuilding('garden-residence', 0, O.x + 1.8, O.z - 3.9, Math.PI, base);
  stage.addBuilding('canopy-tower', 1, O.x + 4.5, O.z - 8.5, 0.4, base);
  stage.addBuilding('canopy-tower', 2, O.x - 7, O.z - 11, -0.3, base);
  stage.addBuilding('wind-turbine', 0, O.x + 10, O.z - 15, 0, base);
  stage.addBuilding('vertical-forest', 0, O.x - 1, O.z - 20, 0, base);
  // The moon hangs where the cameras look (north, over the towers).
  stage.frame(new Vector3(O.x, roof.max.y, O.z - 2), 6, new Vector3(-0.3, 0.2, -1), base);
  stage.look = { ...NIGHT, sunDir: [...NIGHT.sunDir] };

  // The walk: along the hero roof's front, the cat from its hiding spot on the right to the fish on the left.
  const z = (roof.min.z + roof.max.z) / 2 + 0.15;
  const x0 = roof.min.x + (roof.max.x - roof.min.x) * 0.72;
  const xFish = roof.min.x + (roof.max.x - roof.min.x) * 0.3;
  // The deck: the roof's most common height along the walk (panels and pergolas standing on it don't lift the cat).
  const heights = Array.from({ length: 11 }, (_, i) => stage.heightAt(xFish - 0.3 + ((x0 - xFish + 0.6) * i) / 10, z, base)).sort((a, b) => a - b);
  const deck = heights[5]!;
  const top = (_x: number) => deck;
  const catAt = (x: number) => new Vector3(x, top(x), z);

  const cat = new Cat3D();
  cat.paint(SHADOW, 2.6);
  cat.root.scale.setScalar(CAT);
  cat.root.rotation.y = Math.PI; // facing −x, toward the fish
  const fish = new Fish3D(3);
  const fishY = top(xFish) + CAT * 1.25;
  fish.root.position.set(xFish, fishY + 2.2, z);
  fish.root.scale.setScalar(0.42);
  stage.add(cat.root, fish.root);

  // Actor motion: the cat glides between marks (and arcs in a leap); the fish drops.
  const mv = { from: x0, to: x0, t0: 0, dur: 0, arc: 0 };
  const fishMv = { from: fishY + 2.2, to: fishY + 2.2, t0: 0, dur: 0.01 };
  let dawnAt = -1;
  let eyeGlow = 2.6;
  const head = new Vector3();
  stage.onFrame = (t, dt) => {
    const k = mv.dur > 0 ? Math.min(1, (t - mv.t0) / mv.dur) : 1;
    const e = mv.arc ? k : k * k * (3 - 2 * k);
    const x = mv.from + (mv.to - mv.from) * e;
    cat.root.position.set(x, top(x) + Math.sin(Math.PI * k) * mv.arc, z);
    cat.update(dt);
    const f = Math.min(1, (t - fishMv.t0) / fishMv.dur);
    const bounce = f < 1 ? 1 - (1 - f) ** 3 + Math.sin(f * Math.PI) * 0.06 : 1;
    fish.root.position.y = fishMv.from + (fishMv.to - fishMv.from) * bounce;
    fish.update(dt);
    stage.anchor.copy(cat.root.position);
    if (dawnAt >= 0) {
      const d = Math.min(1, (t - dawnAt) / 2.4);
      stage.grade(NIGHT, DAWN, d);
      if (eyeGlow > 0.15) cat.eye.emissiveIntensity = eyeGlow = Math.max(0.15, 2.6 * (1 - d * 3));
    }
  };
  const glide = (to: number, dur: number, arc = 0) => {
    mv.from = cat.root.position.x;
    mv.to = to;
    mv.t0 = stage.t;
    mv.dur = dur;
    mv.arc = arc;
  };
  const pose = (p: CatPose) => cat.pose(p);

  // ── Camera: each beat cuts to a shot (positions round a point on the set; `rel` ones track the cat). ──
  const v = (p: Vector3, dy = 0): V3 => [p.x, p.y + dy, p.z];
  const cut = (from: Framing, to?: Framing, dur = 0, opts: Partial<Shot> = {}) => {
    stage.shots = [{ at: stage.t, dur, from, to, ...opts }];
  };
  const H = CAT * 0.6; // the cat's head height on the roof

  // ── DOM over the 3D frame: pins follow a point on the set. ──
  const pins = h('div', { class: 'sx-pins' });
  const bang = h('b', { class: 'sx-pin sx-bang' });
  const munch = h('b', { class: 'sx-pin sx-munch' });
  const heart = h('i', { class: 'sx-pin sx-heart' });
  heart.innerHTML = HEART_SVG;
  const puff = h('div', { class: 'sx-pin sx-puff' });
  const sparkles = h('div', { class: 'sx-pin sx-sparkles' });
  pins.append(bang, munch, heart, puff, sparkles);
  reel.root.insertBefore(pins, reel.root.querySelector('.reel-confetti'));
  const fishPt = new Vector3();
  const place = (el: HTMLElement, p: Vector3) => {
    const s = stage.project(p);
    el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
  };
  const catMid = new Vector3();
  stage.onPins = () => {
    cat.headAt(head);
    head.y += CAT * 0.35;
    place(bang, head);
    place(munch, head);
    place(heart, head);
    place(puff, fishPt.set(xFish, fishY, z));
    place(sparkles, catMid.copy(cat.root.position).setY(cat.root.position.y + CAT * 0.4));
  };
  const pop = (el: HTMLElement, text?: string) => {
    if (text !== undefined) el.textContent = text;
    reel.pop(el, 'show');
  };

  const film = async () => {
    // 1. Night. Something is watching.
    cat.root.position.copy(catAt(x0));
    pose('idle');
    const eyes: V3 = [x0 - CAT * 0.5, top(x0) + H, z];
    cut(orbit([O.x, roof.max.y - 0.2, z], 6.5, 0.45, 0.22, 38), orbit([x0 - 0.4, roof.max.y, z], 2.2, 0.3, 0.16, 34), 5);
    reel.bed('wind', 0.3, 2);
    reel.bed('drone', 0.12, 3);
    if (!(await reel.wait(0))) return;
    stage.open();
    reel.cue('cs-night');
    if (!(await reel.wait(900))) return;
    reel.say('Every island has a secret…');
    if (!(await reel.wait(1500))) return;
    cut(orbit(eyes, 0.75, -0.95, 0.06, 30), orbit(eyes, 0.6, -0.9, 0.05, 28), 2.2);
    cat.blink();
    setTimeout(() => reel.alive && cat.blink(), 260);
    reel.cue('cs-blink');
    reel.say('…and yours has been watching you.');
    if (!(await reel.wait(1700))) return;

    // 2. Bait.
    fishMv.from = fish.root.position.y;
    fishMv.to = fishY;
    fishMv.t0 = stage.t;
    fishMv.dur = 0.6;
    const mid: V3 = [(x0 + xFish) / 2, top(x0) + CAT * 0.8, z];
    cut(orbit(mid, 2.1, -0.12, 0.16, 34), orbit(mid, 1.85, -0.08, 0.14, 34), 2);
    reel.cue('cs-boing');
    reel.say('Someone left out the good fish.');
    if (!(await reel.wait(700))) return;
    pose('wide');
    if (!(await reel.wait(1300))) return;

    // 3. The creep (a tracking shot alongside), and the freezes.
    cut({ pos: [0.25, 0.16, 0.7], look: [-0.1, 0.06, 0], fov: 34 }, { pos: [0.05, 0.13, 0.62], look: [-0.12, 0.06, 0], fov: 34 }, 3.5, { rel: true });
    pose('creep');
    glide(x0 + (xFish - x0) * 0.32, 1.5);
    reel.cue('cs-sneak');
    reel.say('Stealth level: cat.');
    if (!(await reel.wait(1100))) return;
    fish.twitch = 1;
    pose('freeze');
    glide(cat.root.position.x, 0);
    pop(bang, '!');
    reel.cue('cs-freeze');
    if (!(await reel.wait(900))) return;
    fish.twitch = 0;
    pose('creep');
    glide(x0 + (xFish - x0) * 0.55, 1);
    if (!(await reel.wait(900))) return;
    fish.twitch = 1;
    pose('tiptoe');
    glide(cat.root.position.x, 0);
    pop(bang, '!!');
    reel.cue('cs-freeze');
    reel.say('Very. Very. Still.');
    if (!(await reel.wait(1000))) return;
    fish.twitch = 0;

    // 4. The pounce: a low camera turning round the fish as the cat flies.
    const prey: V3 = [xFish, top(xFish) + CAT * 0.6, z];
    cut(orbit(prey, 0.8, -0.95, 0.04, 36), orbit(prey, 0.68, -0.35, 0.12, 34), 1.6, { ease: 'out' });
    pose('leap');
    glide(xFish + CAT * 0.3, 0.7, 0.3);
    reel.cue('cs-whoosh');
    reel.hit('thud', 0.55);
    reel.say('');
    if (!(await reel.wait(380))) return;
    fish.root.visible = false;
    pop(puff);
    if (!(await reel.wait(420))) return;
    pose('land');
    reel.cue('cs-munch');
    pop(munch, 'munch');
    if (!(await reel.wait(500))) return;
    pop(munch, 'munch munch');
    reel.cue('cs-munch');
    if (!(await reel.wait(650))) return;
    pop(munch, '*hic*');
    reel.say('Nom.');
    if (!(await reel.wait(1100))) return;

    // 5. Dawn breaks behind it, and the coat.
    const catEnd = catAt(xFish + CAT * 0.3);
    const hero: V3 = v(catEnd, H * 0.6);
    dawnAt = stage.t;
    cut(orbit(hero, 0.6, -0.55, 0.12, 32), orbit(hero, 1.0, -0.25, 0.2, 34), 2.6);
    reel.hit('swell', 0, 2.4);
    reel.hit('shimmer', 0.4);
    reel.bed('drone', 0, 2);
    reel.root.classList.add('s-dawn');
    for (let i = 0; i < 26; i++) {
      const a = (Math.PI * 2 * i) / 26 + Math.random() * 0.3;
      const r = 14 + Math.random() * 22;
      sparkles.append(
        h('i', { style: `--x:${(Math.cos(a) * r).toFixed(1)}vmin;--y:${(Math.sin(a) * r - 6).toFixed(1)}vmin;--d:${(Math.random() * 0.4).toFixed(2)}s` }),
      );
    }
    pop(sparkles);
    if (!(await reel.wait(350))) return;
    cat.paintCoat(cast.coat);
    pose('proud');
    reel.cue('cs-reveal');
    reel.say('Oh. You are rather lovely in the light.');
    if (!(await reel.wait(1950))) return;

    // 6. The slow blink, face to face (the cat faces −x: the camera stands there).
    const face: V3 = v(catEnd, H);
    cut(orbit(face, 0.55, -Math.PI / 2 - 0.2, 0.2, 28), orbit(face, 0.46, -Math.PI / 2 - 0.15, 0.17, 26), 2.4);
    pose('trust');
    cat.blink(0.9, 0.5);
    reel.say('A slow blink. In cat, that means: I trust you.');
    reel.cue('cs-blink');
    if (!(await reel.wait(900))) return;
    pop(heart);
    if (!(await reel.wait(1500))) return;

    // 7. The collar, then 8. the name and the card, the camera turning slowly round the cat.
    cut(orbit(hero, 0.8, -0.9, 0.12, 32), orbit(hero, 0.95, 0.5, 0.18, 32), 14, { ease: 'linear' });
    cat.collared = true;
    pose('proud');
    reel.cue('cs-bell');
    if (!(await reel.wait(700))) return;
    reel.cue('cs-fanfare');
    await reel.end({
      kicker: 'has decided to adopt you',
      title: cast.name,
      drop: true,
      sub: '(You thought it was the other way round.)',
      lines: [
        `${cast.name} joined ${cast.island || 'the island'}`,
        'Follows you across the rooftops',
        'Talks to you, and warns you of trouble',
        'Loves a pet (and brings the odd gift)',
        'Descended, it insists, from Ama Reyes’s ship’s cat',
      ],
      button: `Welcome home, ${cast.name}`,
      confetti: PAW_COLOURS,
      hold: 12,
    });
  };
  void film();
}

const HEART_SVG = `<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21C5 15.5 1 12 1 7a5.5 5.5 0 0 1 11-1.5A5.5 5.5 0 0 1 23 7c0 5-4 8.5-11 14z" fill="#ff7aa8"/></svg>`;
