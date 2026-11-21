import type { FilmBed, FilmHit } from '@/modules/moments/score';

/** Most film voices at once (beds don't count; the game's own effects have their own budget). */
const FILM_VOICES = 32;
/** Each bed's loudness at level 1. */
const BED_GAIN: Record<FilmBed, number> = {
  sea: 0.24,
  wind: 0.1,
  rain: 0.09,
  deep: 0.34,
  drone: 0.07,
  choir: 0.05,
  hum: 0.05,
};

interface Bed {
  level: GainNode;
  stop(): void;
}

/**
 * The films' score (D-195), synthesised like everything else (D-077): beds are looped noise and oscillators shaped by
 * filters and slow LFOs, built when a film first asks for them and torn down after it ends; hits are scheduled
 * envelopes on the film bus. The key (semitones from A3) is the film's, so each wonder's episode sits in its own.
 */
export class FilmScore {
  private beds = new Map<FilmBed, Bed>();
  private voices = 0;
  private key = 0;
  private teardown = 0;

  constructor(
    private ac: AudioContext,
    private out: AudioNode,
    private noise: AudioBuffer,
  ) {}

  private get now(): number {
    return this.ac.currentTime;
  }

  /** The key's root, `semis` above it, `oct` octaves from A3. */
  private hz(semis = 0, oct = 0): number {
    return 220 * 2 ** ((this.key + semis) / 12 + oct);
  }

  begin(key = 0): void {
    clearTimeout(this.teardown);
    this.key = key;
  }

  /** Fades every bed out, then frees them. */
  end(): void {
    for (const b of this.beds.values()) b.level.gain.setTargetAtTime(0, this.now, 0.45);
    clearTimeout(this.teardown);
    this.teardown = window.setTimeout(() => {
      for (const b of this.beds.values()) b.stop();
      this.beds.clear();
    }, 3500);
  }

  bed(name: FilmBed, level: number, fade = 1.5): void {
    let b = this.beds.get(name);
    if (!b) {
      b = this.makeBed(name);
      this.beds.set(name, b);
    }
    b.level.gain.setTargetAtTime(Math.max(0, level) * BED_GAIN[name], this.now, Math.max(0.03, fade / 3));
  }

  // ── Beds ──
  private loop(rate = 1): AudioBufferSourceNode {
    const s = this.ac.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(0, Math.random() * 1.5);
    return s;
  }

  private filter(type: BiquadFilterType, f: number, q = 0.8): BiquadFilterNode {
    const n = this.ac.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q;
    return n;
  }

  private gain(v: number): GainNode {
    const g = this.ac.createGain();
    g.gain.value = v;
    return g;
  }

  /** A slow wobble added to `target`. */
  private lfo(freq: number, amount: number, target: AudioParam): OscillatorNode {
    const o = this.ac.createOscillator();
    o.frequency.value = freq;
    o.connect(this.gain(amount)).connect(target);
    o.start();
    return o;
  }

  private osc(type: OscillatorType, f: number, detune = 0): OscillatorNode {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.start();
    return o;
  }

  private makeBed(name: FilmBed): Bed {
    const level = this.gain(0);
    level.connect(this.out);
    const run: AudioScheduledSourceNode[] = [];
    if (name === 'sea') {
      // Surf: low noise that swells and breaks, with a second, brighter wash on another rhythm.
      const swell = this.gain(0.6);
      const f = this.filter('lowpass', 520);
      const wash = this.gain(0.25);
      const fw = this.filter('bandpass', 1400, 0.6);
      const a = this.loop();
      const b = this.loop(0.9);
      a.connect(f).connect(swell).connect(level);
      b.connect(fw).connect(wash).connect(level);
      run.push(a, b, this.lfo(0.12, 0.4, swell.gain), this.lfo(0.07, 180, f.frequency), this.lfo(0.19, 0.22, wash.gain));
    } else if (name === 'wind') {
      const f = this.filter('bandpass', 650, 1.4);
      const g = this.gain(0.8);
      const a = this.loop(0.7);
      a.connect(f).connect(g).connect(level);
      run.push(a, this.lfo(0.09, 360, f.frequency), this.lfo(0.15, 0.3, g.gain));
    } else if (name === 'rain') {
      const a = this.loop();
      const b = this.loop(0.6);
      a.connect(this.filter('highpass', 2800)).connect(level);
      b.connect(this.filter('lowpass', 900)).connect(this.gain(0.5)).connect(level);
      run.push(a, b);
    } else if (name === 'deep') {
      // Under the sea: a muffled roar and a sub-bass that breathes.
      const f = this.filter('lowpass', 210);
      const a = this.loop(0.5);
      a.connect(f).connect(level);
      const sub = this.osc('sine', 46);
      const sg = this.gain(0.45);
      sub.connect(sg).connect(level);
      run.push(a, sub, this.lfo(0.05, 70, f.frequency), this.lfo(0.11, 0.2, sg.gain));
    } else if (name === 'drone') {
      // Tension: the key's root and fifth, low, detuned saws under a slowly opening filter.
      const f = this.filter('lowpass', 380, 1.2);
      f.connect(level);
      for (const [semis, det] of [
        [0, -6],
        [0, 6],
        [7, -4],
        [12, 3],
      ] as const) {
        const o = this.osc('sawtooth', this.hz(semis, -2), det);
        o.connect(this.gain(semis === 12 ? 0.3 : 0.5)).connect(f);
        run.push(o);
      }
      run.push(this.lfo(0.08, 140, f.frequency));
    } else if (name === 'choir') {
      // Voices on "ah": a minor chord of detuned saws with vibrato, through vowel formants.
      const voice = this.gain(1);
      const swell = this.gain(0.75);
      for (const [fq, q, v] of [
        [760, 7, 1],
        [1150, 9, 0.7],
        [2600, 12, 0.25],
      ] as const)
        voice.connect(this.filter('bandpass', fq, q)).connect(this.gain(v * 3)).connect(swell);
      swell.connect(level);
      for (const semis of [0, 3, 7, 12])
        for (const det of [-9, 9]) {
          const o = this.osc('sawtooth', this.hz(semis, -1), det);
          o.connect(this.gain(0.18)).connect(voice);
          run.push(o, this.lfo(4.6 + Math.random(), 7, o.detune));
        }
      run.push(this.lfo(0.1, 0.25, swell.gain));
    } else {
      // A machine room: mains hum and fans.
      const f = this.filter('lowpass', 260);
      f.connect(level);
      for (const fq of [60, 120, 180]) {
        const o = this.osc('sawtooth', fq);
        o.connect(this.gain(fq === 60 ? 0.6 : 0.25)).connect(f);
        run.push(o);
      }
      const fan = this.loop();
      fan.connect(this.filter('bandpass', 5200, 0.7)).connect(this.gain(0.35)).connect(level);
      run.push(fan);
    }
    return {
      level,
      stop: () => {
        for (const n of run)
          try {
            n.stop();
          } catch {
            /* already stopped */
          }
        level.disconnect();
      },
    };
  }

  // ── Hits ──
  /** A tone with an attack and a decay; the frequency may glide to `to`. */
  private tone(f: number, len: number, vol: number, type: OscillatorType = 'sine', to?: number, delay = 0, attack = 0.01, out: AudioNode = this.out): void {
    if (this.voices >= FILM_VOICES) return;
    const ac = this.ac;
    const at = this.now + delay;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, at + Math.max(len, attack + 0.02));
    o.connect(g).connect(out);
    this.voices++;
    o.onended = () => this.voices--;
    o.start(at);
    o.stop(at + Math.max(len, attack) + 0.05);
  }

  /** Filtered noise with an attack and a decay; the filter may sweep to `to`. */
  private wash(len: number, vol: number, type: BiquadFilterType, f: number, to?: number, delay = 0, attack = 0.005, q = 0.8): void {
    if (this.voices >= FILM_VOICES) return;
    const ac = this.ac;
    const at = this.now + delay;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const fl = ac.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f, at);
    if (to) fl.frequency.exponentialRampToValueAtTime(to, at + Math.max(len, attack));
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, at + Math.max(len, attack + 0.02));
    src.connect(fl).connect(g).connect(this.out);
    this.voices++;
    src.onended = () => this.voices--;
    src.start(at, Math.random());
    src.stop(at + Math.max(len, attack) + 0.05);
  }

  /** Chord voices through one low-pass that opens over the swell. */
  private swell(semis: number[], dur: number, vol: number, delay = 0): void {
    const at = this.now + delay;
    const lp = this.filter('lowpass', 320, 1.1);
    lp.frequency.setValueAtTime(320, at);
    lp.frequency.exponentialRampToValueAtTime(2600, at + dur * 0.85);
    lp.connect(this.out);
    for (const s of semis)
      for (const k of [0.996, 1.004]) this.tone(this.hz(s, -1) * k, dur + 1.4, vol, 'sawtooth', undefined, delay, dur * 0.8, lp);
    window.setTimeout(() => lp.disconnect(), (delay + dur + 2) * 1000);
  }

  hit(h: FilmHit, delay = 0, dur = 2): void {
    const d = delay;
    switch (h) {
      case 'iris':
        // Breath in (a reversed swell), then the drop into black: a sub boom and a low tail.
        this.wash(1.1, 0.12, 'bandpass', 300, 2600, d, 1.0, 1.2);
        this.tone(this.hz(0, -1), 1.15, 0.04, 'triangle', this.hz(12, -1), d, 1.0);
        this.tone(68, 1.8, 0.4, 'sine', 30, d + 1.08, 0.01);
        this.wash(1.6, 0.18, 'lowpass', 260, 60, d + 1.08, 0.01);
        this.tone(this.hz(0, -2), 2.4, 0.05, 'sawtooth', undefined, d + 1.08, 0.05);
        break;
      case 'open':
        for (const s of [0, 7, 12, 16]) this.tone(this.hz(s), 2.8, 0.03, 'sine', undefined, d, 0.7);
        this.wash(2.2, 0.03, 'highpass', 5000, undefined, d, 0.8);
        break;
      case 'riser':
        this.wash(dur, 0.16, 'bandpass', 220, 3600, d, dur * 0.95, 1.6);
        this.tone(this.hz(0, -1), dur, 0.05, 'sawtooth', this.hz(12, 0), d, dur * 0.9);
        this.tone(this.hz(7, -1), dur, 0.03, 'sine', this.hz(7, 1), d, dur * 0.9);
        break;
      case 'boom':
        this.tone(64, 2.6, 0.5, 'sine', 26, d, 0.01);
        this.wash(2.4, 0.42, 'lowpass', 900, 60, d, 0.02);
        this.wash(0.35, 0.18, 'bandpass', 1100, 400, d, 0.005, 1.4);
        for (const s of [0, 7, 12]) this.tone(this.hz(s, -1), 3, 0.05, 'triangle', undefined, d + 0.02, 0.03);
        this.wash(3.4, 0.12, 'bandpass', 700, 2600, d + 0.3, 0.4);
        break;
      case 'splash':
        this.wash(0.6, 0.2, 'bandpass', 2200, 500, d, 0.01, 0.9);
        for (let i = 0; i < 6; i++) this.tone(1200 + Math.random() * 1600, 0.07, 0.03, 'sine', 700 + Math.random() * 500, d + 0.15 + Math.random() * 0.5);
        break;
      case 'plunge':
        this.wash(1.4, 0.32, 'lowpass', 1200, 140, d, 0.01);
        this.tone(95, 0.9, 0.22, 'sine', 45, d, 0.01);
        this.hit('bubbles', d + 0.1, 1.6);
        break;
      case 'bubbles':
        for (let i = 0; i < Math.round(dur * 6); i++) {
          const f = 280 + Math.random() * 520;
          this.tone(f, 0.07, 0.035, 'sine', f * 1.9, d + Math.random() * dur, 0.004);
        }
        break;
      case 'heartbeat':
        for (let i = 0; i < Math.max(1, Math.round(dur / 0.9)); i++) {
          this.tone(58, 0.22, 0.32, 'sine', 40, d + i * 0.9, 0.005);
          this.tone(52, 0.26, 0.24, 'sine', 36, d + i * 0.9 + 0.27, 0.005);
        }
        break;
      case 'thunder':
        this.wash(0.25, 0.25, 'highpass', 1800, undefined, d, 0.003);
        this.wash(4, 0.34, 'lowpass', 420, 70, d + 0.05, 0.08);
        this.wash(2.6, 0.18, 'lowpass', 200, 60, d + 0.8, 0.3);
        break;
      case 'swell':
        this.swell([0, 7, 12, 16, 19], dur, 0.022, d);
        this.tone(this.hz(0, -2), dur + 1.5, 0.08, 'sine', undefined, d, dur * 0.7);
        break;
      case 'choir': {
        // A brief choir chord: voices on "ah" swelling and fading.
        const at = this.now + d;
        const voice = this.gain(1);
        const env = this.gain(0.0001);
        env.gain.setValueAtTime(0.0001, at);
        env.gain.linearRampToValueAtTime(0.9, at + Math.min(1.6, dur * 0.4));
        env.gain.exponentialRampToValueAtTime(0.0005, at + dur + 1);
        for (const [fq, q, v] of [
          [760, 7, 1],
          [1150, 9, 0.7],
          [2600, 12, 0.25],
        ] as const)
          voice.connect(this.filter('bandpass', fq, q)).connect(this.gain(v * 0.16)).connect(env);
        env.connect(this.out);
        for (const s of [0, 4, 7, 12, 16])
          for (const det of [-9, 9]) {
            const o = this.ac.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = this.hz(s, -1);
            o.detune.value = det;
            const vib = this.ac.createOscillator();
            vib.frequency.value = 5 + Math.random();
            const va = this.gain(6);
            vib.connect(va).connect(o.detune);
            o.connect(voice);
            o.start(at);
            vib.start(at);
            o.stop(at + dur + 1.1);
            vib.stop(at + dur + 1.1);
          }
        window.setTimeout(() => env.disconnect(), (d + dur + 1.5) * 1000);
        break;
      }
      case 'shimmer':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(this.hz(s, 2), 1.2, 0.018, 'sine', undefined, d + i * 0.07 + Math.random() * 0.03, 0.01));
        this.wash(1.6, 0.04, 'highpass', 6500, undefined, d, 0.3);
        break;
      case 'dolphins':
        for (let k = 0; k < 2; k++)
          for (let i = 0; i < 4; i++) {
            const f = 2400 + Math.random() * 900;
            this.tone(f, 0.09, 0.025, 'sine', f * 1.5, d + k * 0.7 + i * 0.1, 0.005);
          }
        break;
      case 'gulls':
        for (let i = 0; i < 3; i++) {
          const f = 1500 + Math.random() * 500;
          const at = d + i * (0.35 + Math.random() * 0.3);
          this.tone(f, 0.16, 0.035, 'triangle', f * 1.25, at, 0.01);
          this.tone(f * 1.2, 0.32, 0.03, 'triangle', f * 0.7, at + 0.14, 0.01);
        }
        break;
      case 'reel':
        for (let i = 0; i < 16; i++) this.wash(0.018, 0.12, 'highpass', 4200, undefined, d + i * 0.045, 0.002);
        break;
      case 'nibble':
        for (const t of [0.2, 0.8, 1.24, 1.64]) this.tone(900 + Math.random() * 200, 0.09, 0.035, 'sine', 560, d + t, 0.004);
        break;
      case 'shutter':
        this.wash(0.02, 0.2, 'highpass', 3500, undefined, d, 0.002);
        this.wash(0.05, 0.14, 'bandpass', 1500, undefined, d + 0.06, 0.002, 2);
        this.tone(2600, 0.5, 0.02, 'sine', 6000, d + 0.1, 0.05);
        break;
      case 'sneeze':
        this.wash(0.55, 0.06, 'bandpass', 700, 1500, d, 0.45, 2);
        this.wash(0.28, 0.24, 'bandpass', 2600, 700, d + 0.55, 0.005, 1.2);
        break;
      case 'thud':
        this.tone(92, 0.35, 0.3, 'sine', 50, d, 0.005);
        this.wash(0.3, 0.2, 'lowpass', 380, 90, d, 0.005);
        break;
      case 'sting':
        this.tone(this.hz(0), 1.4, 0.05, 'triangle', undefined, d, 0.01);
        this.tone(this.hz(1), 1.4, 0.045, 'triangle', undefined, d, 0.01);
        this.tone(this.hz(13, 1), 1.1, 0.02, 'sawtooth', undefined, d + 0.02, 0.05);
        this.tone(60, 1, 0.2, 'sine', 40, d, 0.005);
        break;
      case 'wings':
        for (let i = 0; i < 9; i++) this.wash(0.04, 0.06, 'bandpass', 900, 500, d + i * 0.075, 0.005, 1.5);
        break;
      case 'crowd':
        this.wash(2.4, 0.12, 'bandpass', 1300, 1700, d, 0.35, 0.5);
        for (let i = 0; i < 26; i++) this.wash(0.025, 0.06, 'highpass', 2200, undefined, d + 0.2 + Math.random() * 1.8, 0.002);
        this.hit('gulls', d + 0.9);
        break;
      case 'resolve':
        for (const s of [0, 4, 7, 12]) this.tone(this.hz(s), 3.8, 0.045, 'triangle', undefined, d, 0.03);
        this.tone(this.hz(0, -2), 4, 0.1, 'sine', undefined, d, 0.05);
        [24, 28, 31].forEach((s, i) => this.tone(this.hz(s), 2.2, 0.015, 'sine', undefined, d + 0.15 + i * 0.12, 0.005));
        this.wash(2.4, 0.03, 'highpass', 6000, undefined, d + 0.1, 0.4);
        break;
    }
  }
}
