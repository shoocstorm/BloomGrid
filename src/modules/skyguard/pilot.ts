import { Vector3 } from 'three/webgpu';

/**
 * Flying the Sky Guard yourself (D-233): an arcade flight model for the explore mode `pilot`. Heading, pitch and bank
 * with a throttle and an afterburner; banking turns the jet (pulling while banked turns it harder), dives gain speed
 * and climbs lose it. Assists keep it pleasant rather than a simulator: the wings level themselves when the stick is
 * let go, the jet will not fly into the ground, a building or the sea (it pulls up and warns), there is a ceiling,
 * and past the edge of the archipelago it turns itself back toward the island. Units are tiles (1 tile ≈ 11 m) and
 * seconds. Render-only: nothing here is sim state.
 */

export interface StickInput {
  /** −1 dive … 1 climb. */
  pitch: number;
  /** −1 bank left … 1 bank right. */
  roll: number;
  /** −1 throttle down, 1 up. */
  throttle: number;
  /** Afterburner held. */
  boost: boolean;
}

/** Cruise range (tiles/s): throttle 0 → `MIN_CRUISE`, 1 → `MAX_CRUISE`; the afterburner's factor; the stall floor. */
const MIN_CRUISE = 24;
const MAX_CRUISE = 58;
const BOOST = 1.6;
const FLOOR_SPEED = 16;
/** Rates (rad/s): bank, pitch, the turn at a full 90° bank. */
const BANK_RATE = 2.4;
const PITCH_RATE = 1.05;
const TURN_RATE = 1.25;
const MAX_BANK = 1.45;
const MAX_PITCH = 1.3;
/** Height the jet keeps above whatever is under it (tiles), the ceiling, and how far out it may roam. */
const CLEARANCE = 2.5;
const CEILING = 320;
const RANGE = 340;

export class JetPilot {
  readonly pos = new Vector3();
  /** Heading in the xz plane: forward is (cos ψ, ·, sin ψ); +x east, +z south. */
  heading = 0;
  pitch = 0;
  bank = 0;
  speed = 50;
  throttle = 0.75;
  burner = 0;
  /** Warnings for the HUD. */
  pullUp = false;
  far = false;
  /** Vertical speed (tiles/s) and load factor (g), for the HUD. */
  climb = 0;
  load = 1;
  readonly fwd = new Vector3(1, 0, 0);
  readonly up = new Vector3(0, 1, 0);
  readonly right = new Vector3(0, 0, 1);

  constructor(
    /** Island centre (x, z): the jet turns back toward it past `RANGE`. */
    private centre: readonly [number, number],
  ) {}

  /** Takes over from wherever the jet is: position, and a forward direction. */
  start(at: Vector3, fwd: Vector3): void {
    this.pos.copy(at);
    this.heading = Math.atan2(fwd.z, fwd.x);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
    this.bank = 0;
    this.speed = 50;
    this.throttle = 0.75;
    this.update();
  }

  /**
   * One step. `floor(x, z)` is the top of whatever is under a point (ground, building, sea); the jet keeps
   * `CLEARANCE` over it.
   */
  step(dt: number, k: StickInput, floor: (x: number, z: number) => number): void {
    // Bank: toward the stick, levelling itself when the stick is centred.
    const wantBank = k.roll * MAX_BANK;
    this.bank += Math.max(-BANK_RATE * dt, Math.min(BANK_RATE * dt, (k.roll ? wantBank : 0) - this.bank)) * (k.roll ? 1 : 0.9);
    // Pitch: the stick (less of it when steeply banked), easing back toward level when let go and nearly level.
    const p = k.pitch * PITCH_RATE * (0.55 + 0.45 * Math.cos(this.bank));
    this.pitch += p * dt;
    if (!k.pitch && Math.abs(this.pitch) < 0.25) this.pitch *= 1 - Math.min(1, dt * 0.6);
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    // Turn from the bank; pulling while banked tightens it.
    const pull = Math.max(0, k.pitch);
    const turn = Math.sin(this.bank) * TURN_RATE * (1 + pull * 0.7);
    this.heading += turn * dt;

    // Range: past the edge, the jet banks itself home.
    const [cx, cz] = this.centre;
    const out = Math.hypot(this.pos.x - cx, this.pos.z - cz);
    this.far = out > RANGE * 0.85;
    if (out > RANGE) {
      const home = Math.atan2(cz - this.pos.z, cx - this.pos.x);
      const d = Math.atan2(Math.sin(home - this.heading), Math.cos(home - this.heading));
      this.heading += Math.sign(d) * Math.min(Math.abs(d), dt * 0.9);
      if (!k.roll) this.bank += (Math.sign(d) * 0.9 - this.bank) * Math.min(1, dt * 2);
    }

    // Speed: throttle and afterburner set the target; gravity along the path adds or takes away.
    this.throttle = Math.max(0, Math.min(1, this.throttle + k.throttle * dt * 0.6));
    this.burner += ((k.boost ? 1 : 0) - this.burner) * Math.min(1, dt * 2.5);
    const target = (MIN_CRUISE + (MAX_CRUISE - MIN_CRUISE) * this.throttle) * (1 + (BOOST - 1) * this.burner);
    this.speed += (target - this.speed) * Math.min(1, dt * 0.7) - Math.sin(this.pitch) * 14 * dt;
    this.speed = Math.max(FLOOR_SPEED, Math.min(MAX_CRUISE * BOOST * 1.15, this.speed));

    this.update();
    const y0 = this.pos.y;
    this.pos.addScaledVector(this.fwd, this.speed * dt);

    // Ground, buildings and sea: look a little ahead too, so a tower is cleared rather than clipped.
    const ahead = Math.min(40, this.speed * 0.8);
    const under = Math.max(floor(this.pos.x, this.pos.z), floor(this.pos.x + this.fwd.x * ahead, this.pos.z + this.fwd.z * ahead));
    const min = under + CLEARANCE;
    this.pullUp = this.pos.y < min + 6 && this.fwd.y < 0.05;
    if (this.pos.y < min) {
      this.pos.y += Math.min(min - this.pos.y, dt * 30);
      this.pitch = Math.max(this.pitch, 0.18);
    }
    if (this.pos.y > CEILING) {
      this.pos.y = CEILING;
      this.pitch = Math.min(this.pitch, 0);
    }
    this.climb = (this.pos.y - y0) / Math.max(dt, 1e-4);
    // Load factor as the pilot feels it: a level turn's 1 / cos(bank), plus the pull on the stick (a display figure:
    // the arcade turn rates would be dozens of g for real).
    this.load += (1 / Math.max(0.22, Math.cos(this.bank)) + pull * 2.2 - this.load) * Math.min(1, dt * 4);
  }

  /** Forward, up and right from heading, pitch and bank. */
  private update(): void {
    const [ch, sh, cp, sp] = [Math.cos(this.heading), Math.sin(this.heading), Math.cos(this.pitch), Math.sin(this.pitch)];
    this.fwd.set(ch * cp, sp, sh * cp);
    // Level right (+z when heading east), then up from it; the bank turns the lift toward the right.
    const rx = -sh;
    const rz = ch;
    const ux = -ch * sp;
    const uy = cp;
    const uz = -sh * sp;
    const [cb, sb] = [Math.cos(this.bank), Math.sin(this.bank)];
    this.up.set(ux * cb + rx * sb, uy * cb, uz * cb + rz * sb);
    this.right.set(rx * cb - ux * sb, -uy * sb, rz * cb - uz * sb);
  }

  /** Compass heading in degrees (0 = north, −z; 90 = east). */
  get compass(): number {
    return ((Math.atan2(this.fwd.x, -this.fwd.z) * 180) / Math.PI + 360) % 360;
  }
}
