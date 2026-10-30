import type { GameContext } from '@/game/context';
import type { AgentTool, JsonSchema, ToolEffect } from '@/core/AgentTools';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { CORE_TOOLS, PROMPTS, defaultPolicy } from '@/ai/agent';
import { cityBrief } from '@/ai/brief';
import type { EngineState, LlmEngine } from '@/ai/llm/engine';

const EFFECT: Record<ToolEffect, { icon: string; label: string; note: string }> = {
  read: { icon: 'search', label: 'Sense', note: 'reads the city, changes nothing' },
  view: { icon: 'locate', label: 'Guide', note: 'moves the camera or the HUD' },
  mutate: { icon: 'wrench', label: 'Act', note: 'changes the city: undoable, asks first' },
};
const POLICY: Record<string, string> = { auto: 'Autonomous', ask: 'Asks first', off: 'Standby' };

/** Status indicator icon per model-core state (colour comes from the state class around it). */
export const STATUS_ICON: Record<EngineState['status'], string> = {
  idle: 'st-off',
  loading: 'st-busy',
  ready: 'st-link',
  error: 'st-crit',
};
export const led = (name: string) => h('span', { class: 'ai-led', 'aria-hidden': 'true' }, icon(name));

/** Rough token count of a prompt (≈4 characters per token for English). */
const tokens = (text: string) => Math.round(text.length / 4);

export interface DossierHost {
  /** Runs a slash command in the console. */
  send(text: string): void;
  /** Puts text in the console's input and switches to it. */
  compose(text: string): void;
  autoApprove(): boolean;
  setAutoApprove(on: boolean): void;
  /** Turns and actions this session. */
  session(): { turns: number; actions: number };
  /** Tool name → calls this session. */
  readonly uses: Map<string, number>;
}

/**
 * Flora's dossier: the Profile tab (identity, model core, the exact system prompts of a turn, the live
 * context she reads, her protocols) and the Tools tab (every registered agent tool as a card: effect,
 * policy, parameters, keywords, calls this session, and a way to run it). Rebuilt when a tab opens, never
 * per frame; the tool list is read from the registry then, so tools modules add later still show.
 */
export class Dossier {
  readonly profile = h('div', { class: 'ai-dossier ai-profile' });
  readonly tools = h('div', { class: 'ai-dossier ai-arsenal' });
  private filter: ToolEffect | 'all' = 'all';
  private query = '';
  private grid = h('div', { class: 'ai-tgrid' });
  private count = h('span', { class: 'ai-tcount' });

  constructor(
    private ctx: GameContext,
    private engine: LlmEngine,
    private host: DossierHost,
  ) {}

  private list(): AgentTool<GameContext>[] {
    return this.ctx.services.get('agent').list();
  }

  /** Tool totals per effect. */
  census(): Record<ToolEffect | 'all', number> {
    const out = { all: 0, read: 0, view: 0, mutate: 0 };
    for (const t of this.list()) {
      out.all++;
      out[t.effect]++;
    }
    return out;
  }

  /** Autonomous mode: may Flora run city-changing tools without the steward authorizing each one? */
  private authorization(): HTMLElement {
    const sw = h('input', {
      type: 'checkbox',
      class: 'ai-switch',
      role: 'switch',
      'aria-label': 'Autonomous mode',
      onChange: () => this.host.setAutoApprove(sw.checked),
    }) as HTMLInputElement;
    sw.checked = this.host.autoApprove();
    return h(
      'label',
      { class: 'ai-auto' },
      h('span', { class: 'ai-auto-i' }, icon('wrench')),
      h(
        'span',
        { class: 'ai-auto-t' },
        h('b', {}, 'Autonomous mode'),
        h('span', {}, 'Run city-changing actions without asking first. Every action stays undoable (⌘Z).'),
      ),
      h('span', { class: 'ai-auto-s', 'aria-hidden': 'true' }),
      sw,
    );
  }

  renderProfile(): void {
    const c = this.census();
    const s = this.host.session();
    const core = this.engine.loaded;
    const st = this.engine.state;
    const tile = (k: string, v: string, sub = '') =>
      h('div', { class: 'ai-ptile' }, h('span', {}, k), h('b', {}, v), sub ? h('i', {}, sub) : null);
    const prompt = (code: string, title: string, role: string, text: string) => {
      const body = h('pre', { class: 'ai-prompt-t' }, text);
      const copy = h(
        'button',
        {
          class: 'ai-op',
          title: 'Copy the prompt',
          onClick: () => {
            void navigator.clipboard?.writeText(text).then(() => setText(copy, 'Copied'));
          },
        },
        'Copy',
      );
      return h(
        'article',
        { class: 'ai-directive' },
        h(
          'header',
          {},
          h('span', { class: 'ai-dir-code' }, code),
          h('div', {}, h('b', {}, title), h('span', {}, role)),
          h('span', { class: 'ai-dir-tok' }, `≈${tokens(text)} tok`),
          copy,
        ),
        body,
      );
    };
    const feed = h('pre', { class: 'ai-feed' }, cityBrief(this.ctx.city));
    this.profile.replaceChildren(
      h(
        'section',
        { class: 'ai-hero' },
        h('div', { class: 'ai-hero-orb' }, heroSigil()),
        h(
          'div',
          { class: 'ai-hero-id' },
          h('span', { class: 'ai-hero-k' }, 'Unit designation'),
          h('b', {}, 'FLORA'),
          h('span', { class: 'ai-hero-d' }, 'Civic intelligence · BG-01 · BloomGrid steward support'),
          h(
            'div',
            { class: `ai-hero-core ${st.status}` },
            led(STATUS_ICON[st.status]),
            core
              ? `${core.name} · ${st.info?.backend ?? core.engine}`
              : 'No model core loaded: slash commands only',
          ),
        ),
      ),
      h(
        'div',
        { class: 'ai-ptiles' },
        tile('Tools', String(c.all), `${c.read} sense · ${c.view} guide · ${c.mutate} act`),
        tile('Turns', String(s.turns), 'this session'),
        tile('Actions', String(s.actions), 'all undoable'),
        tile('Throughput', st.tokPerSec ? `${Math.round(st.tokPerSec)}` : '—', 'tokens / s'),
      ),
      this.authorization(),
      section('01', 'Directive stack', 'The exact system prompts of every turn, in order'),
      h(
        'div',
        { class: 'ai-directives' },
        prompt('Δ1', 'Planner', 'Picks the next step from a lettered tool menu', PROMPTS.planner),
        prompt('Δ2', 'Argument writer', 'Writes one call’s JSON, held to a grammar', PROMPTS.args),
        prompt('Δ3', 'Persona', 'Flora’s voice: the reply the steward reads', PROMPTS.reply),
      ),
      section('02', 'Live context feed', 'The city brief appended to every prompt, right now'),
      h(
        'div',
        { class: 'ai-feed-w' },
        feed,
        h('button', { class: 'ai-op', onClick: () => setText(feed, cityBrief(this.ctx.city)) }, '↻ Resample'),
      ),
      section('03', 'Protocols', 'Rules the loop enforces around the model'),
      h(
        'ol',
        { class: 'ai-protocols' },
        ...[
          'Look things up before acting; one city-changing action per turn.',
          'Every action runs an undoable command (⌘Z or ↶ Undo).',
          'Actions wait for your authorization unless Autonomous mode is on.',
          'Questions never act: asking “did you build it?” only reads.',
          'Arguments are checked against each tool’s schema; ids and districts are narrowed to real ones.',
          'Replies use only facts from this turn: no promises, no invented numbers.',
        ].map((p) => h('li', {}, p)),
      ),
    );
  }

  renderTools(): void {
    const c = this.census();
    const seg = h(
      'div',
      { class: 'ai-tfilter', role: 'tablist' },
      ...(['all', 'read', 'view', 'mutate'] as const).map((f) =>
        h(
          'button',
          {
            class: `ai-tf ${f}${this.filter === f ? ' on' : ''}`,
            onClick: () => {
              this.filter = f;
              this.renderTools();
            },
          },
          ...(f === 'all' ? ['All'] : [icon(EFFECT[f].icon), EFFECT[f].label]),
          h('span', {}, String(c[f])),
        ),
      ),
    );
    const search = h('input', {
      class: 'ai-tsearch',
      type: 'search',
      placeholder: 'Search tools, parameters, keywords…',
      value: this.query,
      onInput: (e: Event) => {
        this.query = (e.target as HTMLInputElement).value;
        this.fillGrid();
      },
    });
    this.tools.replaceChildren(
      h(
        'div',
        { class: 'ai-thead' },
        h('div', { class: 'ai-thead-t' }, h('b', {}, 'Tools'), this.count),
        h(
          'p',
          {},
          'Every function Flora can call. ',
          ...(['read', 'view', 'mutate'] as const).flatMap((e) => [
            h('span', { class: `ai-eff ${e}` }, icon(EFFECT[e].icon), EFFECT[e].label),
            ` ${EFFECT[e].note}. `,
          ]),
        ),
        seg,
        search,
      ),
      this.grid,
    );
    this.fillGrid();
  }

  private fillGrid(): void {
    const q = this.query.trim().toLowerCase();
    const shown = this.list().filter(
      (t) =>
        (this.filter === 'all' || t.effect === this.filter) &&
        (!q ||
          [t.name, t.description, ...(t.keywords ?? []), ...Object.keys(t.input.properties ?? {})]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
    setText(this.count, `${shown.length} / ${this.list().length}`);
    this.grid.replaceChildren(
      ...(shown.length
        ? shown.map((t, i) => this.card(t, i))
        : [h('div', { class: 'ai-dim' }, 'No tool matches.')]),
    );
  }

  private card(t: AgentTool<GameContext>, i: number): HTMLElement {
    const props = Object.entries(t.input.properties ?? {});
    const req = new Set(t.input.required ?? []);
    const policy = defaultPolicy(t as AgentTool<unknown>);
    const uses = this.host.uses.get(t.name) ?? 0;
    const offered = new Set(t.llmArgs ?? props.map(([k]) => k));
    const param = ([k, p]: [string, JsonSchema]) =>
      h(
        'div',
        { class: `ai-param${req.has(k) ? ' req' : ''}` },
        h('code', {}, k),
        h(
          'span',
          { class: 'ai-param-t' },
          p.enum ? 'enum' : (p.type ?? 'any'),
          req.has(k) ? ' · required' : '',
        ),
        offered.has(k)
          ? null
          : h('span', { class: 'ai-pill dim', title: 'Scripts and slash commands only' }, 'manual'),
        p.description ? h('p', {}, p.description) : null,
        p.enum
          ? h(
              'div',
              { class: 'ai-enum' },
              ...p.enum.slice(0, 14).map((v) => h('span', {}, String(v))),
              p.enum.length > 14 ? h('span', {}, `+${p.enum.length - 14}`) : null,
            )
          : null,
      );
    const run = req.size
      ? h(
          'button',
          {
            class: 'ai-op',
            onClick: (e: Event) => {
              e.stopPropagation();
              this.host.compose(`/${t.name} ${[...req].map((k) => `${k}=`).join(' ')}`);
            },
          },
          '› Compose',
        )
      : h(
          'button',
          {
            class: 'ai-op',
            onClick: (e: Event) => {
              e.stopPropagation();
              this.host.send(`/${t.name}`);
            },
          },
          t.effect === 'mutate' ? '⚒ Request' : '▶ Run',
        );
    const card = h(
      'article',
      {
        class: `ai-tcard ${t.effect}`,
        style: `--i:${Math.min(i, 20)}`,
        tabIndex: 0,
        onClick: () => card.classList.toggle('open'),
        onKeydown: (e: KeyboardEvent) => e.key === 'Enter' && card.classList.toggle('open'),
      },
      h(
        'header',
        {},
        h('span', { class: 'ai-thex' }, icon(EFFECT[t.effect].icon)),
        h(
          'div',
          { class: 'ai-tname' },
          h('b', {}, t.name),
          h('span', {}, t.option ?? t.description.split(/(?<=\.)\s/)[0]),
        ),
      ),
      h(
        'div',
        { class: 'ai-tmeta' },
        h('span', { class: `ai-eff ${t.effect}` }, EFFECT[t.effect].label),
        h('span', { class: `ai-pol ${policy}` }, POLICY[policy]),
        CORE_TOOLS.includes(t.name) ? h('span', { class: 'ai-pill rec' }, 'core') : null,
        h('span', { class: 'ai-tparams' }, `${props.length} param${props.length === 1 ? '' : 's'}`),
        uses ? h('span', { class: 'ai-tuses' }, `×${uses}`) : null,
      ),
      h(
        'div',
        { class: 'ai-tdetail' },
        h('p', { class: 'ai-tdesc' }, t.description),
        props.length
          ? h('div', { class: 'ai-params' }, ...props.map(param))
          : h('div', { class: 'ai-dim' }, 'No parameters.'),
        t.keywords?.length
          ? h(
              'div',
              { class: 'ai-tkw' },
              h('span', {}, 'Triggers'),
              ...t.keywords.map((k) => h('code', {}, k)),
            )
          : null,
        h('div', { class: 'ai-tact' }, h('code', {}, `/${t.name}`), run),
      ),
    );
    return card;
  }
}

function section(code: string, title: string, sub: string): HTMLElement {
  return h('div', { class: 'ai-psec' }, h('span', {}, code), h('b', {}, title), h('i', {}, sub));
}

/** The profile's large sigil: concentric rings, a hex frame and the bloom; rings turn while the tab is open. */
function heroSigil(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-50 -50 100 100');
  svg.setAttribute('class', 'ai-hero-sigil');
  svg.setAttribute('aria-hidden', 'true');
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(30 * Math.cos(a)).toFixed(2)},${(30 * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
  const petals = Array.from(
    { length: 6 },
    (_, i) => `<ellipse rx="5.4" ry="12.5" cx="0" cy="-11" transform="rotate(${i * 60})"/>`,
  ).join('');
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const a = (Math.PI / 18) * i;
    const r0 = i % 3 ? 44 : 41;
    return `<line x1="${(r0 * Math.cos(a)).toFixed(2)}" y1="${(r0 * Math.sin(a)).toFixed(2)}" x2="${(46 * Math.cos(a)).toFixed(2)}" y2="${(46 * Math.sin(a)).toFixed(2)}"/>`;
  }).join('');
  svg.innerHTML = `<g class="h-ticks">${ticks}</g><circle class="h-ring" r="38"/><circle class="h-orbit" r="34"/><polygon class="h-hex" points="${hex}"/><g class="h-petals">${petals}</g><circle class="h-core" r="4.5"/><circle class="h-sat" r="2" cx="34" cy="0"/>`;
  return svg;
}
