import type { GameContext, GameModule } from '@/game/context';
import { Vector3 } from 'three/webgpu';
import { U } from '@/render/uniforms';
import { seasonAt } from '@/sim/seasons';
import { MOODS, makeRandom, midiHz, pickMood, type Mood } from './music';

const KEY = 'bloomgrid.audio';
/** Most sound effects playing at once (music and ambience are separate). */
const MAX_SFX = 14;
/** Fire crackles leave this many effect voices free for everything else. */
const CRACKLE_HEADROOM = 4;
/** Pods sampled per 4 Hz tick for the nearest one (the fleet can be ~1000: a full sweep spans a few ticks). */
const POD_SAMPLES = 160;
/** Hearing ranges (world units) for trains, pods and fires. */
const TRAIN_EAR = 70;
const POD_EAR = 28;
const FIRE_EAR = 90;
/** Aeroline cruise speed (Trains.ts `VMAX`): the whine rises with speed toward it. */
const TRAIN_VMAX = 22;
const _pod = new Vector3();
/** 0 at `range`, 1 at the source, eased so a passing source swells. */
const nearness = (d: number, range: number) => Math.max(0, 1 - d / range) ** 2;

export interface AudioLevels {
  master: number;
  music: number;
  ambience: number;
  sfx: number;
  muted: boolean;
}

export interface AudioService {
  readonly levels: AudioLevels;
  set(levels: Partial<AudioLevels>): void;
  toggleMute(): void;
  /** True once the browser let audio start (after the first click or key). */
  readonly running: boolean;
}

declare module '@/core/Services' {
  interface GameServices {
    audio: AudioService;
  }
}

function loadLevels(): AudioLevels {
  const d: AudioLevels = { master: 0.7, music: 0.45, ambience: 0.6, sfx: 0.7, muted: false };
  try {
    return { ...d, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AudioLevels>) };
  } catch {
    return d;
  }
}

/**
 * Music and sound (Phase 17, D-077), all synthesised with Web Audio: no files to download or license. Four buses
 * (master → music, ambience, effects) with volumes in Settings and a mute key (,). Nothing starts until the first
 * click or key (browser autoplay rules). **Music** is generative: a slow pad of detuned saws under a low-pass filter
 * plays the mood's chords (dawn, day, dusk, night, crisis), with a sparse plucked arpeggio from its scale; the
 * mood follows the time of day and active crises and crossfades at the bar. **Ambience** is filtered noise: surf
 * (louder near the coast and low), city hum (by night life), wind (by camera height and storms), rain, and birdsong
 * in Bloom by day. **Effects** are short synths on game events: build, demolish, retrofit, level-up, lightning,
 * quakes, fireworks (the bang arrives later with distance), alerts and UI clicks. **Near the camera**, Aeroline
 * trains rush and whine (pitch with speed), sky-lane pods whoosh softly, and fires roar and crackle (short noise
 * ticks, kept off the last few effect voices). Parameters update at 4 Hz on the main thread; everything else runs
 * on the audio thread.
 */
class Sound {
  levels = loadLevels();
  private ac: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private amb!: GainNode;
  private sfx!: GainNode;
  private noise!: AudioBuffer;
  private beds: Record<
    'surf' | 'hum' | 'wind' | 'rain' | 'rail' | 'pod' | 'fire',
    { gain: GainNode; filter: BiquadFilterNode }
  > | null = null;
  /** The maglev's electric whine (a sine an octave apart from its rush). */
  private whine!: { osc: OscillatorNode; gain: GainNode };
  private podCursor = 0;
  private podBest = Infinity;
  private podNear = Infinity;
  private padFilter!: BiquadFilterNode;
  private voices = 0;
  private mood: Mood = 'day';
  private nextBar = 0;
  private chord = 0;
  private rnd = makeRandom(11);
  private timer = 0;
  private birdAt = 0;

  constructor(private ctx: GameContext) {}

  get running(): boolean {
    return this.ac?.state === 'running';
  }

  /** Creates the graph on the first gesture (browsers refuse audio before one). */
  start(): void {
    if (this.ac) {
      if (this.ac.state === 'suspended') void this.ac.resume();
      return;
    }
    const ac = new AudioContext();
    this.ac = ac;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.connect(ac.destination);
    this.master = ac.createGain();
    this.master.connect(comp);
    this.music = ac.createGain();
    this.amb = ac.createGain();
    this.sfx = ac.createGain();
    for (const g of [this.music, this.amb, this.sfx]) g.connect(this.master);
    // Two seconds of white noise, looped by every noise voice.
    this.noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = this.noise.getChannelData(0);
    const r = makeRandom(3);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    this.padFilter = ac.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.Q.value = 0.7;
    this.padFilter.connect(this.music);
    this.beds = {
      surf: this.bed('lowpass', 420),
      hum: this.bed('lowpass', 160),
      wind: this.bed('bandpass', 520),
      rain: this.bed('highpass', 2400),
      rail: this.bed('lowpass', 300),
      pod: this.bed('bandpass', 1300),
      fire: this.bed('lowpass', 650),
    };
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 180;
    const wg = ac.createGain();
    wg.gain.value = 0;
    osc.connect(wg).connect(this.amb);
    osc.start();
    this.whine = { osc, gain: wg };
    this.applyLevels();
    this.nextBar = ac.currentTime + 0.2;
  }

  private bed(type: BiquadFilterType, f: number) {
    const ac = this.ac!;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = f;
    const gain = ac.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.amb);
    src.start();
    return { gain, filter };
  }

  applyLevels(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.levels));
    } catch {
      /* storage blocked */
    }
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const L = this.levels;
    this.master.gain.setTargetAtTime(L.muted ? 0 : L.master, t, 0.05);
    this.music.gain.setTargetAtTime(L.music * 0.5, t, 0.2);
    this.amb.gain.setTargetAtTime(L.ambience, t, 0.2);
    this.sfx.gain.setTargetAtTime(L.sfx, t, 0.05);
  }

  // ── Music ──
  private pad(freqs: number[], at: number, len: number): void {
    const ac = this.ac!;
    for (const f of freqs)
      for (const det of [-7, 7]) {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const g = ac.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.035, at + len * 0.35);
        g.gain.linearRampToValueAtTime(0, at + len * 1.05);
        o.connect(g).connect(this.padFilter);
        o.start(at);
        o.stop(at + len * 1.1);
      }
  }

  private pluck(f: number, at: number, vol = 0.07): void {
    const ac = this.ac!;
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, at + 1.6);
    o.connect(g).connect(this.music);
    o.start(at);
    o.stop(at + 1.7);
  }

  /** Schedules the next bar(s) ahead of time (called at 4 Hz). */
  private scheduleMusic(): void {
    const ac = this.ac!;
    while (this.nextBar < ac.currentTime + 1) {
      const m = MOODS[this.mood];
      const chord = m.chords[this.chord % m.chords.length]!;
      this.pad(chord.map(midiHz), this.nextBar, m.bar);
      this.padFilter.frequency.setTargetAtTime(m.cutoff, this.nextBar, 1.5);
      for (let i = 0; i < m.notes; i++)
        if (this.rnd() < 0.8)
          this.pluck(
            midiHz(m.scale[Math.floor(this.rnd() * m.scale.length)]!),
            this.nextBar + (i / m.notes) * m.bar + this.rnd() * 0.2,
          );
      this.nextBar += m.bar;
      this.chord++;
    }
  }

  // ── Effects ──
  /** A short tone (sine/triangle) with an exponential decay; frequency may glide to `to`. */
  tone(f: number, len: number, vol = 0.2, type: OscillatorType = 'sine', to?: number, delay = 0): void {
    if (!this.ac || this.voices >= MAX_SFX || this.levels.muted) return;
    const ac = this.ac;
    const at = ac.currentTime + delay;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, at + len);
    o.connect(g).connect(this.sfx);
    this.voices++;
    o.onended = () => this.voices--;
    o.start(at);
    o.stop(at + len + 0.05);
  }

  /** Filtered noise burst (whoosh, crack, rumble, bang). */
  burst(len: number, vol: number, type: BiquadFilterType, f: number, to?: number, delay = 0): void {
    if (!this.ac || this.voices >= MAX_SFX || this.levels.muted) return;
    const ac = this.ac;
    const at = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ac.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f, at);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, at + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0005, at + len);
    src.connect(filter).connect(g).connect(this.sfx);
    this.voices++;
    src.onended = () => this.voices--;
    src.start(at, Math.random());
    src.stop(at + len + 0.05);
  }

  /** Seconds for sound to travel from (x, z) to the camera (1 tile ≈ 4 m), and a distance fade. */
  heard(x: number, z: number): { delay: number; vol: number } {
    const p = this.ctx.camera.position;
    const d = Math.hypot(p.x - x, p.z - z, p.y);
    return { delay: Math.min(2.5, (d * 4) / 343), vol: Math.max(0.08, Math.min(1, 60 / (d + 20))) };
  }

  // ── Per tick (4 Hz): mood, ambience beds ──
  update(dt: number): void {
    if (!this.ac || this.ac.state !== 'running') return;
    if ((this.timer += dt) < 0.25) return;
    this.timer = 0;
    const { city, cameraCtl } = this.ctx;
    const crisis = city.steward.crises.some((c) => c.phase === 'active') || city.steward.fires.length > 2;
    const mood = pickMood(city.timeOfDay, crisis);
    if (mood !== this.mood) {
      this.mood = mood;
      this.chord = 0;
    }
    this.scheduleMusic();
    const t = this.ac.currentTime;
    const b = this.beds!;
    const tg = cameraCtl.target;
    const height = cameraCtl.distance;
    const near = Math.max(0, 1 - height / 400);
    const shore =
      city.fields.shore[
        city.grid.index(
          Math.floor(Math.min(city.size - 1, Math.max(0, tg.x))),
          Math.floor(Math.min(city.size - 1, Math.max(0, tg.z))),
        )
      ] ?? 8;
    const surf = (1 - Math.min(1, shore / 8)) * 0.6 + 0.12;
    // Slow swell on the surf.
    b.surf.gain.gain.setTargetAtTime(surf * (0.55 + 0.45 * Math.sin(t * 0.5)) * 0.25, t, 0.4);
    b.hum.gain.gain.setTargetAtTime(near * (0.04 + 0.12 * city.pulse.nightlife), t, 0.5);
    const storm = U.storm.value;
    b.wind.gain.gain.setTargetAtTime(
      (Math.min(1, height / 500) * 0.05 + storm * 0.12) * (0.7 + 0.3 * Math.sin(t * 0.23)),
      t,
      0.6,
    );
    b.wind.filter.frequency.setTargetAtTime(420 + 260 * Math.sin(t * 0.11) + storm * 400, t, 0.8);
    b.rain.gain.gain.setTargetAtTime(U.rain.value * 0.09, t, 0.5);
    this.nearby(t);
    // Birdsong by day in Bloom, near the ground.
    if (seasonAt(city.tick).season.id === 'bloom' && U.night.value < 0.3 && near > 0.5 && t > this.birdAt) {
      this.birdAt = t + 2 + Math.random() * 5;
      const f = 2400 + Math.random() * 1600;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++)
        this.tone(f * (1 + i * 0.06), 0.12, 0.025, 'sine', f * 1.3, i * 0.14);
    }
  }

  /** Trains, pods and fires near the camera (part of the 4 Hz update). */
  private nearby(t: number): void {
    const b = this.beds!;
    const { services, city } = this.ctx;
    const cam = this.ctx.camera.position;
    // Aeroline: a low rush that opens up as a train closes in, and a whine that climbs with its speed.
    const train = services.tryGet('aeroline')?.nearest(cam) ?? { d: Infinity, v: 0 };
    const tn = nearness(train.d, TRAIN_EAR);
    const pace = Math.min(1, train.v / TRAIN_VMAX);
    b.rail.gain.gain.setTargetAtTime(tn * (0.05 + 0.2 * pace), t, 0.3);
    b.rail.filter.frequency.setTargetAtTime(220 + 900 * tn * pace, t, 0.3);
    this.whine.gain.gain.setTargetAtTime(tn * pace * 0.03, t, 0.3);
    this.whine.osc.frequency.setTargetAtTime(150 + 260 * pace, t, 0.4);
    // Sky-lane pods: a soft whoosh from the nearest one (sampled a slice of the fleet per tick).
    const sky = services.tryGet('skylanes');
    const n = sky?.pods ?? 0;
    if (n) {
      for (let k = 0; k < Math.min(n, POD_SAMPLES); k++) {
        const i = this.podCursor++ % n;
        this.podBest = Math.min(this.podBest, sky!.podAt(i, U.clock.value, _pod).distanceTo(cam));
      }
      if (this.podCursor >= n) {
        this.podCursor = 0;
        this.podNear = this.podBest;
        this.podBest = Infinity;
      }
    } else this.podNear = Infinity;
    const pn = nearness(this.podNear, POD_EAR) * (1 - 0.6 * U.night.value);
    b.pod.gain.gain.setTargetAtTime(pn * 0.07, t, 0.5);
    b.pod.filter.frequency.setTargetAtTime(900 + 900 * pn + 200 * Math.sin(t * 1.7), t, 0.3);
    // Fires: a roar by heat and nearness, and crackles (tiny bright noise ticks) scattered over the next tick.
    let heat = 0;
    for (const f of city.steward.fires)
      heat += f.intensity * nearness(Math.hypot(cam.x - f.x, cam.z - f.z, cam.y * 0.5), FIRE_EAR);
    heat = Math.min(1, heat);
    b.fire.gain.gain.setTargetAtTime(heat * 0.22, t, 0.4);
    if (heat > 0.02)
      for (let i = 0; i < 1 + Math.round(heat * 5); i++) {
        if (this.voices >= MAX_SFX - CRACKLE_HEADROOM) break;
        const f = 1800 + Math.random() * 3800;
        this.burst(0.02 + Math.random() * 0.05, (0.1 + Math.random() * 0.2) * heat, 'bandpass', f, undefined, Math.random() * 0.25);
      }
  }
}

export const audioModule: GameModule = {
  id: 'audio',
  deps: ['world'],
  init(ctx) {
    const s = new Sound(ctx);
    const begin = () => s.start();
    window.addEventListener('pointerdown', begin, { capture: true });
    window.addEventListener('keydown', begin, { capture: true });
    ctx.systems.add({ id: 'audio', phase: 'render', order: 150, update: (_c, f) => s.update(f.dt) });
    ctx.input.onKey((e) => {
      if (e.code !== 'Comma' || e.metaKey || e.ctrlKey) return false;
      s.levels.muted = !s.levels.muted;
      s.applyLevels();
      ctx.bus.emit('toast', { text: s.levels.muted ? 'Sound muted (,)' : 'Sound on (,)', tone: 'info' });
      return true;
    });

    // Effects on game events (never while a city loads in bulk).
    const bus = ctx.bus;
    const quiet = () => ctx.loading;
    document.addEventListener('click', (e) => {
      if ((e.target as HTMLElement | null)?.closest?.('button')) s.tone(1800, 0.05, 0.035, 'triangle');
    });
    bus.on('building:added', ({ eid }) => {
      if (quiet()) return;
      const r = ctx.city.buildingRecord(eid);
      const h = s.heard(r.x, r.z);
      s.tone(523, 0.5, 0.12 * h.vol, 'sine', undefined, 0);
      s.tone(784, 0.6, 0.09 * h.vol, 'sine', undefined, 0.08);
    });
    bus.on('building:removed', ({ record }) => {
      if (quiet()) return;
      const h = s.heard(record.x, record.z);
      s.burst(0.7, 0.25 * h.vol, 'lowpass', 2200, 200);
    });
    bus.on('buildings:level', ({ eids }) => {
      if (quiet() || !eids.length) return;
      [659, 784, 988, 1319].forEach((f, i) => s.tone(f, 0.7, 0.07, 'triangle', undefined, i * 0.09));
    });
    bus.on('building:tier', ({ tier, paid }) => {
      if (quiet() || tier <= 0) return;
      s.tone(587, 0.4, paid ? 0.12 : 0.06, 'triangle');
      s.tone(880, 0.6, paid ? 0.1 : 0.05, 'triangle', undefined, 0.12);
    });
    bus.on('lightning:strike', ({ x, z }) => {
      const h = s.heard(x, z);
      s.burst(0.25, 0.5 * h.vol, 'highpass', 3000);
      s.burst(2.2, 0.45 * h.vol, 'lowpass', 300, 60, h.delay);
    });
    // Storm lightning (crises/Weather) rolls in as thunder; strikes already crack above, so only ambient strokes rumble.
    bus.on('weather:flash', ({ x, z, power }) => {
      if (power >= 1) return;
      const h = s.heard(x, z);
      s.burst(3.2, 0.35 * power * Math.max(0.35, h.vol), 'lowpass', 220, 45, 0.4 + h.delay);
    });
    bus.on('quake:shock', ({ magnitude }) => s.burst(3, Math.min(0.6, 0.08 * magnitude), 'lowpass', 120, 40));
    bus.on('fireworks:volley', ({ show, kinds }) => {
      const h = s.heard(show.x, show.z);
      kinds.forEach((_k, i) => {
        s.tone(600, 1.2, 0.03 * h.vol, 'sine', 2400, i * 0.25);
        s.burst(0.9, 0.35 * h.vol, 'lowpass', 900, 120, 1.3 + i * 0.25 + h.delay);
      });
    });
    bus.on(
      'pulse:tier',
      // Not while a new city settles (the pulse panel holds its toasts for the same 8 s).
      ({ tier, prev }) =>
        ctx.city.tick >= 80 && tier > prev && tier >= 3 && s.tone(330, 0.5, 0.08, 'triangle', 247),
    );
    // City moments (D-094): each ceremony has its sound. Flora wakes (D-092): a low swell, then a rising major
    // arpeggio that blooms into a held chord and a shimmer.
    bus.on('moment', ({ sound }) => {
      if (sound === 'awake') {
        s.burst(2.4, 0.18, 'lowpass', 160, 900);
        [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => s.tone(f, 2.6 - i * 0.12, 0.07, 'triangle', undefined, 1.6 + i * 0.13));
        [523, 659, 784].forEach((f) => s.tone(f, 3.2, 0.05, 'sine', undefined, 2.6));
        s.tone(2093, 1.6, 0.025, 'sine', 3136, 2.5);
      } else if (sound === 'triumph') {
        // A fanfare: fifths climbing, then a bright held major chord.
        s.burst(1.8, 0.14, 'lowpass', 200, 700);
        [196, 294, 392, 587].forEach((f, i) => s.tone(f, 0.55, 0.08, 'sawtooth', undefined, 1.5 + i * 0.16));
        [392, 494, 587, 784].forEach((f) => s.tone(f, 2.8, 0.05, 'triangle', undefined, 2.2));
      } else if (sound === 'wonder') {
        // The sea: a deep swell, a slow rising glissando and a shimmer.
        s.burst(3.2, 0.22, 'lowpass', 90, 500);
        s.tone(220, 2.6, 0.06, 'sine', 440, 1.2);
        [440, 554, 659, 880].forEach((f, i) => s.tone(f, 2.4, 0.045, 'sine', undefined, 2 + i * 0.2));
        s.tone(1760, 1.8, 0.02, 'sine', 2637, 2.6);
      } else if (sound === 'milestone') {
        [523, 659, 784, 1047].forEach((f, i) => s.tone(f, 0.9, 0.06, 'triangle', undefined, 1.1 + i * 0.1));
      } else {
        // Weathered: a minor chord resolving to major.
        [220, 262, 330].forEach((f) => s.tone(f, 1.2, 0.05, 'triangle', undefined, 0.9));
        [220, 277, 330].forEach((f) => s.tone(f, 1.8, 0.05, 'triangle', undefined, 2));
      }
    });
    // Juice cues (D-118): tip pops climb a pentatonic step per combo, build chimes step up with a streak.
    const PENTA = [0, 2, 4, 7, 9, 12, 14];
    const up = (f: number, step = 0) => f * 2 ** (PENTA[Math.min(PENTA.length - 1, step)]! / 12);
    bus.on('juice', ({ sound, step = 0 }) => {
      if (quiet()) return;
      if (sound === 'tip') {
        s.burst(0.07, 0.12, 'highpass', 2400);
        s.tone(up(660, step), 0.16, 0.09, 'sine', up(1320, step));
        s.tone(up(1320, step), 0.25, 0.035, 'triangle', undefined, 0.06);
      } else if (sound === 'coin') {
        s.tone(1568, 0.12, 0.05, 'triangle');
        s.tone(2093, 0.3, 0.05, 'triangle', undefined, 0.07);
      } else if (sound === 'ready') {
        [523, 659, 784].forEach((f, i) => s.tone(up(f, step), 0.35, 0.06, 'triangle', undefined, i * 0.07));
        s.burst(0.35, 0.05, 'bandpass', 3000, 6000, 0.05);
      } else if (sound === 'claimable') {
        s.tone(784, 0.3, 0.06, 'sine');
        s.tone(1175, 0.5, 0.06, 'sine', undefined, 0.12);
      } else {
        // Claim: a quick rising run into a bright chord, with a shimmer.
        [523, 659, 784, 1047].forEach((f, i) => s.tone(f, 0.3, 0.07, 'triangle', undefined, i * 0.06));
        [784, 1047, 1319].forEach((f) => s.tone(f, 1.1, 0.045, 'sine', undefined, 0.26));
        s.burst(0.6, 0.06, 'highpass', 5000, undefined, 0.24);
      }
    });
    // Roadworks (D-128): a survey sweep, a soft paving thud per stretch climbing as it goes, pier splashes, a
    // two-note finish, and a bright chime run when a bridge opens.
    bus.on('roadworks', ({ cue, x, z, step = 0 }) => {
      if (quiet()) return;
      const h = s.heard(x, z);
      if (cue === 'start') s.tone(330, 0.5, 0.05 * h.vol, 'sine', 990);
      else if (cue === 'lay') {
        s.burst(0.12, 0.12 * h.vol, 'lowpass', 500, 120, h.delay);
        s.tone(up(196, Math.min(6, Math.floor(step / 8))), 0.12, 0.05 * h.vol, 'triangle', undefined, h.delay);
      } else if (cue === 'pier') s.burst(0.5, 0.14 * h.vol, 'bandpass', 900, 300, h.delay);
      else if (cue === 'done') {
        s.tone(523, 0.3, 0.06 * h.vol, 'triangle', undefined, h.delay);
        s.tone(784, 0.5, 0.06 * h.vol, 'triangle', undefined, h.delay + 0.1);
      } else [659, 784, 988, 1319, 1568].forEach((f, i) => s.tone(f, 0.6, 0.05 * Math.max(0.4, h.vol), 'sine', undefined, i * 0.07));
    });
    // Hands-on buildings (D-132): sliding glass doors hiss open (or shut), a light switch clicks with a rising (on)
    // or falling (off) blip.
    bus.on('building:interact', ({ kind, on, x, z }) => {
      if (quiet()) return;
      const h = s.heard(x, z);
      if (kind === 'door') {
        s.burst(0.45, 0.06 * h.vol, 'bandpass', on ? 1800 : 2600, on ? 2600 : 1400, h.delay);
        if (on) s.tone(880, 0.25, 0.03 * h.vol, 'sine', 1320, h.delay + 0.05);
      } else if (kind === 'motion') {
        // Rides and wheels (D-139): a motor winding up (start) or down (stop).
        s.tone(on ? 110 : 220, 1.4, 0.05 * h.vol, 'sawtooth', on ? 220 : 90, h.delay);
        s.burst(1.2, 0.03 * h.vol, 'bandpass', on ? 300 : 900, on ? 900 : 300, h.delay);
      } else {
        s.burst(0.03, 0.1 * h.vol, 'highpass', 3500, undefined, h.delay);
        s.tone(on ? 660 : 990, 0.14, 0.05 * h.vol, 'triangle', on ? 990 : 660, h.delay + 0.02);
      }
    });
    // The cruise ferry's horn (D-141): two low reeds a fifth apart, swelling and dying away over the water.
    bus.on('ferry:horn', ({ x, z }) => {
      const h = s.heard(x, z);
      const v = Math.max(0.35, h.vol);
      s.tone(98, 2.4, 0.11 * v, 'sawtooth', 96, h.delay);
      s.tone(147, 2.4, 0.07 * v, 'sawtooth', 145, h.delay + 0.05);
      s.burst(2.2, 0.03 * v, 'lowpass', 300, 200, h.delay);
    });
    // The Sky Guard jet roaring past (D-141): a swept noise roar, deeper and longer with the afterburner.
    bus.on('skyguard:pass', ({ x, z, burner }) => {
      const h = s.heard(x, z);
      const v = Math.max(0.3, h.vol);
      s.burst(burner ? 3.2 : 2.4, (burner ? 0.16 : 0.11) * v, 'lowpass', burner ? 1400 : 2200, burner ? 180 : 320, h.delay);
      s.burst(1.6, 0.05 * v, 'bandpass', 3200, 900, h.delay + 0.1);
    });
    bus.on('crisis:forecast', () => {
      s.tone(440, 0.35, 0.08, 'square', undefined, 0);
      s.tone(440, 0.35, 0.08, 'square', undefined, 0.5);
    });

    ctx.services.provide('audio', {
      get levels() {
        return s.levels;
      },
      set(l) {
        Object.assign(s.levels, l);
        s.applyLevels();
      },
      toggleMute() {
        s.levels.muted = !s.levels.muted;
        s.applyLevels();
      },
      get running() {
        return s.running;
      },
    });
  },
};
