import type { GameContext, GameModule } from '@/game/context';
import { U } from '@/render/uniforms';
import { seasonAt } from '@/sim/seasons';
import { MOODS, makeRandom, midiHz, pickMood, type Mood } from './music';

const KEY = 'bloomgrid.audio';
/** Most sound effects playing at once (music and ambience are separate). */
const MAX_SFX = 14;

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
 * quakes, fireworks (the bang arrives later with distance), alerts and UI clicks. Parameters update at 4 Hz on the
 * main thread; everything else runs on the audio thread.
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
    'surf' | 'hum' | 'wind' | 'rain',
    { gain: GainNode; filter: BiquadFilterNode }
  > | null = null;
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
    };
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
    // Birdsong by day in Bloom, near the ground.
    if (seasonAt(city.tick).season.id === 'bloom' && U.night.value < 0.3 && near > 0.5 && t > this.birdAt) {
      this.birdAt = t + 2 + Math.random() * 5;
      const f = 2400 + Math.random() * 1600;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++)
        this.tone(f * (1 + i * 0.06), 0.12, 0.025, 'sine', f * 1.3, i * 0.14);
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
