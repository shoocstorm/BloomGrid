import { Group, Vector3, type Object3D } from 'three/webgpu';
import type { GameContext, GameModule } from '@/game/context';
import { buildings } from '@/content';
import { CATEGORY_LABELS, type BuildingDef } from '@/content/types';
import { isHero } from '@/content/heroes';
import { Building } from '@/ecs/components';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { buildingTemplate, designPieces } from '@/modules/construction/BuildingRenderer';
import { Studio, type StageModel } from './Studio';
import { GalleryView } from './GalleryView';
import './gallery.css';

/** A module's own model on the gallery stage (built once per level and kept). */
export interface GalleryModel {
  object: Object3D;
  /** Framing when the geometry's bounds don't show where its shader puts it. */
  frame?: { center: Vector3; radius: number };
  /** Per-frame motion (`t` = seconds on stage). */
  update?(t: number, dt: number): void;
}

/** One exhibit in the gallery. Buildings are listed from the content registry; modules add the rest. */
export interface GalleryEntry {
  id: string;
  name: string;
  /** Hall it hangs in (`GROUP_ORDER` lists the known ones first). */
  group: string;
  blurb: string;
  facts?: [string, string][];
  /** Labels of its levels (Level 1..3, or a line's rolling stock); one look if unset. */
  levels?: string[];
  /** Stands in the sea (a water plane instead of the floor). */
  water?: boolean;
  /** A 3D model on the stage (or `panel`). */
  build?(level: number): GalleryModel;
  /**
   * A 2D exhibit instead (D-183): a DOM panel over the empty stage, for things that are not meshes (the island's
   * cat, cutscenes). Built afresh each time it is shown; stop any timers once it is no longer `isConnected`.
   */
  panel?(level: number): HTMLElement;
}

export interface GalleryService {
  /** Adds a module's model (vehicles, wonders, sea life). */
  add(entry: GalleryEntry): void;
  /** Extra parts a module draws on a building type in the city (a turbine's nacelle and rotor). */
  dress(defId: string, fn: (level: number) => GalleryModel): void;
  /** Opens the gallery, on exhibit `id` (a building type is `b:<def id>`) at `level` (0-based). */
  open(id?: string, level?: number): void;
  /**
   * A module's model by exhibit id (`pod`, `ferry`, `drone`, `wonder:lotus`…), built afresh for a film (D-197): the
   * caller owns it (its own object, never the one on the gallery's stage). Null for an unknown or 2D exhibit.
   */
  exhibitModel(id: string, level?: number): GalleryModel | null;
  close(): void;
  toggle(): void;
  readonly isOpen: boolean;
}

declare module '@/core/Services' {
  interface GameServices {
    gallery: GalleryService;
  }
}

/** Halls in the order the gallery lists them; building categories follow Landmarks. */
export const GROUP_ORDER = ['Landmarks', ...Object.values(CATEGORY_LABELS), 'Transit', 'Sky & sea', 'Sea wonders', 'Sea life', 'Charms', 'Film cast', 'Cutscenes'];

/** Resolved exhibit: what the list and the info card read. */
export interface Exhibit {
  id: string;
  name: string;
  group: string;
  blurb: string;
  facts: [string, string][];
  levels: string[];
  hero: boolean;
  water: boolean;
  /** A 2D exhibit (no model: the 3D controls hide). */
  flat: boolean;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
/** The stage's model for a 2D exhibit: nothing. */
const EMPTY = new Group();

function buildingFacts(def: BuildingDef): [string, string][] {
  const s = def.stats;
  const out: [string, string][] = [
    ['Category', CATEGORY_LABELS[def.category]],
    ['Footprint', `${def.footprint[0]} × ${def.footprint[1]} tiles`],
    ['Cost', `${fmt(s.cost)} credits`],
  ];
  if (s.population) out.push(['Residents', fmt(s.population)]);
  if (s.jobs) out.push(['Jobs', fmt(s.jobs)]);
  if (s.energy) out.push([s.energy > 0 ? 'Energy made' : 'Energy used', fmt(Math.abs(s.energy))]);
  if (s.water) out.push([s.water > 0 ? 'Water made' : 'Water used', fmt(Math.abs(s.water))]);
  if (s.food) out.push(['Food', fmt(s.food)]);
  if (s.eco) out.push(['Ecology', `+${fmt(s.eco)}`]);
  return out;
}

/**
 * Model gallery: a full-screen showroom for every model in the game, one at a time on a lit studio stage. Building
 * types come from the content registry (each designed level, moving parts turning); modules add their own models
 * through `gallery.add` (Aeroline trains, the Sky Guard jet, the Tidesong, drones, pods, hover cars, sea wonders,
 * whales and dolphins) and parts they draw onto buildings through `dress`. While it is open the studio replaces the
 * city frame (`render.stage`), the clock holds, and the city's tools and camera rest.
 */
class Gallery implements GalleryService {
  private extra: GalleryEntry[] = [];
  private dressings = new Map<string, (level: number) => GalleryModel>();
  private built = new Map<string, GalleryModel>();
  private studio: Studio;
  private view: GalleryView;
  private shown = false;
  private current = '';
  private level = 0;
  private resume = { speed: 1, suspended: false, camera: true };
  private exhibits: Exhibit[] | null = null;

  constructor(private ctx: GameContext) {
    this.studio = new Studio(ctx);
    this.view = new GalleryView(ctx, this.studio, {
      select: (id) => this.select(id, 0),
      level: (lv) => this.select(this.current, lv),
      step: (d) => this.step(d),
      close: () => this.close(),
    });
    // Above dialogs' Esc (priority > 0): while open the gallery takes every key it knows.
    ctx.input.onKey((e) => this.shown && this.view.key(e), 50);
    ctx.input.onKey((e) => {
      if (e.code !== 'KeyG' || e.metaKey || e.ctrlKey || e.altKey || this.shown) return false;
      if (document.querySelector('.modal-scrim') || document.body.classList.contains('chapter-open')) return false;
      this.open();
      return true;
    });
  }

  get isOpen(): boolean {
    return this.shown;
  }

  add(entry: GalleryEntry): void {
    this.extra.push(entry);
    this.exhibits = null;
  }

  dress(defId: string, fn: (level: number) => GalleryModel): void {
    this.dressings.set(defId, fn);
  }

  private list(): Exhibit[] {
    if (this.exhibits) return this.exhibits;
    const out: Exhibit[] = [];
    for (const def of buildings.all()) {
      const recipe = typeof def.recipe === 'function' ? def.recipe : def.recipe.fallback;
      if (!recipe) continue;
      const levelled = buildingTemplate(def, 0).ranged.length > 0;
      const hero = isHero(def);
      out.push({
        id: `b:${def.id}`,
        name: def.name,
        group: hero ? 'Landmarks' : CATEGORY_LABELS[def.category],
        blurb: def.description,
        facts: buildingFacts(def),
        levels: levelled ? ['Level 1', 'Level 2', 'Level 3'] : [],
        hero,
        water: false,
        flat: false,
      });
    }
    for (const e of this.extra)
      out.push({ id: e.id, name: e.name, group: e.group, blurb: e.blurb, facts: e.facts ?? [], levels: e.levels ?? [], hero: false, water: !!e.water, flat: !!e.panel });
    const rank = (g: string) => {
      const i = GROUP_ORDER.indexOf(g);
      return i < 0 ? GROUP_ORDER.length : i;
    };
    out.sort((a, b) => rank(a.group) - rank(b.group) || (a.group === b.group ? 0 : a.group.localeCompare(b.group)) || a.name.localeCompare(b.name));
    return (this.exhibits = out);
  }

  private model(id: string, level: number): StageModel {
    if (id.startsWith('b:')) {
      const def = buildings.get(id.slice(2));
      const dressing = this.dressings.get(def.id);
      const extra = dressing ? this.keep(`${id}#${level}`, () => dressing(level)) : null;
      // At the island's heart, on its real ground height: night lighting reads the city's activity there.
      const { city } = this.ctx;
      const c = city.size / 2;
      const at = new Vector3(c, Math.max(0, city.grid.heightAt(c, c)), c);
      return { pieces: designPieces(def, level), object: extra?.object, update: extra?.update, at };
    }
    const entry = this.extra.find((e) => e.id === id)!;
    // A 2D exhibit stands on an empty stage.
    if (!entry.build) return { object: EMPTY, frame: { center: new Vector3(0, 1, 0), radius: 2 } };
    const build = entry.build;
    const m = this.keep(`${id}#${level}`, () => build(level));
    return { object: m.object, frame: m.frame, update: m.update, water: entry.water };
  }

  private keep(key: string, make: () => GalleryModel): GalleryModel {
    let m = this.built.get(key);
    if (!m) this.built.set(key, (m = make()));
    return m;
  }

  private select(id: string, level: number): void {
    const ex = this.list().find((e) => e.id === id) ?? this.list()[0];
    if (!ex) return;
    const lv = Math.max(0, Math.min(level, Math.max(0, ex.levels.length - 1)));
    const same = ex.id === this.current;
    this.current = ex.id;
    this.level = lv;
    // A new level keeps the view (to compare levels); a new exhibit opens on the default framing.
    const keep = same ? { yaw: this.studio.yaw, pitch: this.studio.pitch, zoom: this.studio.zoom } : null;
    this.studio.show(this.model(ex.id, lv));
    if (keep) Object.assign(this.studio, keep);
    else this.studio.reset();
    const entry = ex.flat ? this.extra.find((e) => e.id === ex.id) : undefined;
    this.view.showExhibit(ex, lv, this.list(), entry?.panel?.(lv) ?? null);
  }

  private step(d: number): void {
    const all = this.view.visible(this.list());
    if (!all.length) return;
    const i = all.findIndex((e) => e.id === this.current);
    const next = all[(((i < 0 ? 0 : i + d) % all.length) + all.length) % all.length]!;
    this.select(next.id, 0);
  }

  open(id?: string, level = 0): void {
    const { ctx } = this;
    if (!this.shown) {
      this.shown = true;
      this.resume = { speed: ctx.engine.speed, suspended: ctx.tools.suspended, camera: ctx.cameraCtl.enabled };
      ctx.engine.speed = 0;
      ctx.tools.suspended = true;
      ctx.cameraCtl.enabled = false;
      document.body.classList.add('gallery-open');
      ctx.services.get('render').stage = this.studio;
      this.view.open(this.list());
    }
    this.select(id ?? (this.current || this.list()[0]!.id), id ? level : this.level);
  }

  exhibitModel(id: string, level = 0): GalleryModel | null {
    const entry = this.extra.find((e) => e.id === id);
    return entry?.build ? entry.build(level) : null;
  }

  close(): void {
    if (!this.shown) return;
    const { ctx } = this;
    this.shown = false;
    this.current = '';
    ctx.services.get('render').stage = null;
    this.studio.close();
    this.view.close();
    document.body.classList.remove('gallery-open');
    ctx.engine.speed = this.resume.speed;
    ctx.tools.suspended = this.resume.suspended;
    ctx.cameraCtl.enabled = this.resume.camera;
  }

  toggle(): void {
    if (this.shown) this.close();
    else this.open();
  }

  update(dt: number): void {
    if (!this.shown) return;
    this.studio.update(dt);
    this.view.update();
  }
}

/** The model gallery (see `Gallery`): **G**, the top bar's gallery button, or View in gallery in the inspector. */
export const galleryModule: GameModule = {
  id: 'gallery',
  deps: ['construction', 'hud'],
  init(ctx: GameContext) {
    const g = new Gallery(ctx);
    ctx.services.provide('gallery', g);
    const hud = ctx.services.get('hud');
    hud.lead.append(
      h('button', { class: 'icon-btn gal-btn', title: 'Model gallery (G)', 'aria-label': 'Open the model gallery', onClick: () => g.open() }, icon('gallery')),
    );
    hud.buildingActions((eid) => {
      const def = ctx.city.buildingDef(eid);
      return [
        h(
          'button',
          { class: 'tool', title: 'See this building type up close in the model gallery, at its current level', onClick: () => g.open(`b:${def.id}`, Building.tier[eid]!) },
          h('span', { class: 'g' }, icon('gallery')),
          'Gallery',
        ),
      ];
    });
    // After the city's render systems: the studio poses its camera and model before `core.render` draws it.
    ctx.systems.add({ id: 'gallery', phase: 'sync', order: 120, update: (_c, f) => g.update(f.dt) });
  },
};
