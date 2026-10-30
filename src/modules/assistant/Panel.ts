import type { GameContext } from '@/game/context';
import { h, setText } from '@/ui/dom';
import { icon } from '@/ui/icons';
import { stripThink, type StepRecord, type ToolCall } from '@/ai/agent';
import type { EngineState, LlmEngine } from '@/ai/llm/engine';
import { availableModels, memoryFit, recommendedModel, type ModelDef } from '@/ai/llm/models';
import { SYSTEMS, TIERS } from '@/sim/pulseState';
import { SYSTEM_LABELS } from '@/modules/pulse/PulsePanel';
import { getCrisis } from '@/sim/crises';
import { listObjects, summarize } from '@/sim/inventory';
import { Dossier } from './Dossier';

const ID_SPLIT = /(\b(?:LIV|NRG|UTL|TEC|WRK|IND|SPT|NAT|FOD|HWY|BRG|SKY|CHN|DST|LMK)-[0-9A-Z][0-9A-Z.-]*[0-9A-Z]\b)/g;
const gb = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
const fmt = (n: number) => Math.round(n).toLocaleString();
const PHASES: Record<string, string> = {
  deciding: 'Planning next step',
  filling: 'Composing the call',
  running: 'Executing',
  answering: 'Transmitting reply',
};
const TOOL_ICON: Record<string, string> = { read: 'search', view: 'locate', mutate: 'wrench' };
const stamp = () => {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
};
const MAX_KEY = 'bloomgrid.ai.max';
type View = 'console' | 'profile' | 'tools';

export interface PanelActions {
  send(text: string): void;
  stop(): void;
  setAutoApprove(on: boolean): void;
  autoApprove(): boolean;
}

/** One assistant reply as it happens: the process log (tool calls), then the streamed answer. */
export interface Bubble {
  phase(p: string): void;
  call(c: ToolCall): void;
  result(r: StepRecord): void;
  delta(text: string): void;
  /** The final reply; `data` (a tool result) renders as telemetry rows instead of text. */
  finish(text: string, error?: boolean, data?: unknown): void;
  /** Places an element (an approval card) under the reply's process log. */
  attach(el: HTMLElement): void;
}

/** The sigil: a hex frame round a six-petal bloom, with an orbit ring that turns only while Flora works. */
function sigil(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-20 -20 40 40');
  svg.setAttribute('class', 'ai-sigil');
  svg.setAttribute('aria-hidden', 'true');
  const hex = Array.from(
    { length: 6 },
    (_, i) =>
      `${(17 * Math.cos((Math.PI / 3) * i + Math.PI / 6)).toFixed(2)},${(17 * Math.sin((Math.PI / 3) * i + Math.PI / 6)).toFixed(2)}`,
  ).join(' ');
  const petals = Array.from(
    { length: 6 },
    (_, i) => `<ellipse rx="3.1" ry="7.2" cx="0" cy="-6.2" transform="rotate(${i * 60})"/>`,
  ).join('');
  svg.innerHTML = `<polygon class="s-hex" points="${hex}"/><circle class="s-orbit" r="13.2"/><g class="s-petals">${petals}</g><circle class="s-core" r="2.6"/>`;
  return svg;
}

/**
 * Flora's console (U): docked beside the right column, or maximized (⤢, Shift+U) into a wide command console
 * with a live telemetry rail: system health LEDs, vitals, alerts, session stats, recent actions with undo,
 * and quick operations. Model picker and download progress, the conversation as a mission log (process
 * lines per tool call, authorization cards, clickable object ids), city notices and the input. Text updates
 * on events; the rail refreshes at 2 Hz only while maximized and open; motion (orbit, scan line) only while
 * Flora is working.
 */
export class AssistantPanel {
  readonly el: HTMLElement;
  private log = h('div', { class: 'ai-log', role: 'log', 'aria-live': 'polite' });
  private input: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private link = h('span', { class: 'ai-link' });
  private linkText = h('span', {});
  private models = h('div', { class: 'ai-models hidden' });
  private badge = h('span', { class: 'ai-badge hidden' });
  private launcher: HTMLButtonElement;
  private maxBtn: HTMLButtonElement;
  private rail: Record<'systems' | 'vitals' | 'alerts' | 'session' | 'actions', HTMLElement>;
  private open = false;
  private max = false;
  private busy = false;
  private unread = 0;
  private lastStatus: EngineState['status'] = 'idle';
  private turns = 0;
  private actionsRun: { at: string; text: string }[] = [];
  private timer = 0;
  private slowTimer = 99;
  private objects = { critical: 0, warning: 0, total: 0 };
  private view: View = 'console';
  private tabs = new Map<View, HTMLElement>();
  private main!: HTMLElement;
  private dossier: Dossier;
  private booted = false;
  /** Tool name → calls this session (shown on the tool cards). */
  private uses = new Map<string, number>();

  constructor(
    private ctx: GameContext,
    private engine: LlmEngine,
    private actions: PanelActions,
  ) {
    this.input = h('textarea', {
      class: 'ai-input',
      rows: 2,
      placeholder:
        'Transmit to Flora… “what needs fixing?”, “build 3 pocket parks in Hillcrest”, “pause”, or /help',
      'aria-label': 'Message the city assistant',
      onKeydown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.submit();
        } else if (e.key === 'Escape') this.input.blur();
      },
    }) as HTMLTextAreaElement;
    this.sendBtn = h(
      'button',
      {
        class: 'ai-send',
        title: 'Transmit (Enter)',
        'aria-label': 'Transmit',
        onClick: () => (this.busy ? this.actions.stop() : this.submit()),
      },
      icon('send'),
    ) as HTMLButtonElement;
    const auto = h('input', {
      type: 'checkbox',
      class: 'ai-switch',
      role: 'switch',
      onChange: (e: Event) => this.actions.setAutoApprove((e.target as HTMLInputElement).checked),
    }) as HTMLInputElement;
    auto.checked = this.actions.autoApprove();
    const quick = (label: string, text: string) =>
      h('button', { class: 'ai-chip', onClick: () => this.actions.send(text) }, label);
    this.maxBtn = h(
      'button',
      {
        class: 'icon-btn ai-hbtn',
        title: 'Maximize console (Shift+U)',
        onClick: () => this.setMax(!this.max),
      },
      icon('maximize'),
    ) as HTMLButtonElement;
    this.link.append(h('i', { class: 'ai-led' }), this.linkText);
    this.dossier = new Dossier(ctx, engine, {
      send: (text) => (this.setView('console'), this.actions.send(text)),
      compose: (text) => {
        this.setView('console');
        this.input.value = text;
        this.input.focus();
      },
      autoApprove: () => this.actions.autoApprove(),
      session: () => ({ turns: this.turns, actions: this.actionsRun.length }),
      uses: this.uses,
    });
    const tab = (v: View, glyph: string, label: string) => {
      const b = h(
        'button',
        { class: 'ai-tab', role: 'tab', onClick: () => this.setView(v) },
        h('span', { class: 'g' }, icon(glyph)),
        label,
      );
      this.tabs.set(v, b);
      return b;
    };
    const tabs = h(
      'nav',
      { class: 'ai-tabs', role: 'tablist' },
      tab('console', 'console', 'Console'),
      tab('profile', 'profile', 'Profile'),
      tab('tools', 'wrench', 'Tools'),
    );

    const section = (title: string, body: HTMLElement) =>
      h('div', { class: 'ai-rail-sec' }, h('div', { class: 'ai-rail-h' }, title), body);
    this.rail = {
      systems: h('div', { class: 'ai-sys' }),
      vitals: h('div', { class: 'ai-kv' }),
      alerts: h('div', { class: 'ai-alerts' }),
      session: h('div', { class: 'ai-kv' }),
      actions: h('div', { class: 'ai-acts' }),
    };
    const ops = h(
      'div',
      { class: 'ai-ops' },
      ...(
        [
          ['Status report', 'Give me a short status report of the city.'],
          ['Fix the worst', 'Find the most critical problem and fix it.'],
          ['Budget', 'How is our budget?'],
          ['Crises', 'Are there any crises coming, and how do we prepare?'],
          ['Advice', 'What does the advisor recommend?'],
          ['Best for water', 'Which building is best for water?'],
          ['Overview', '/camera_overview'],
          ['Pause', '/set_speed speed=pause'],
          ['Resume', '/set_speed speed=normal'],
          ['Power lens', '/show_lens lens=power'],
          ['Water lens', '/show_lens lens=water'],
          ['Clear lens', '/show_lens lens=none'],
        ] as const
      ).map(([l, t]) => h('button', { class: 'ai-op', onClick: () => this.actions.send(t) }, l)),
    );
    const side = h(
      'aside',
      { class: 'ai-rail' },
      section('Systems', this.rail.systems),
      section('Vitals', this.rail.vitals),
      section('Alerts', this.rail.alerts),
      section('Session', this.rail.session),
      section(
        'Actions log',
        h(
          'div',
          {},
          this.rail.actions,
          h(
            'button',
            { class: 'ai-op ai-undo', onClick: () => this.ctx.commands.undo() },
            '↶ Undo last action',
          ),
        ),
      ),
      section('Quick ops', ops),
    );

    this.el = h(
      'section',
      { class: 'ai panel hidden', role: 'dialog', 'aria-label': 'City assistant' },
      h(
        'header',
        { class: 'ai-head' },
        sigil(),
        h(
          'div',
          { class: 'ai-title' },
          h('b', {}, 'FLORA'),
          h('span', { class: 'ai-sub' }, 'City intelligence · local core'),
        ),
        h(
          'span',
          { class: 'ai-wave', 'aria-hidden': 'true' },
          ...Array.from({ length: 7 }, (_, i) => h('i', { style: `--i:${i}` })),
        ),
        this.link,
        h(
          'button',
          {
            class: 'icon-btn ai-hbtn',
            title: 'Model core',
            onClick: () => this.models.classList.toggle('hidden'),
          },
          icon('chip'),
        ),
        this.maxBtn,
        h(
          'button',
          { class: 'icon-btn ai-hbtn', title: 'Close (U)', onClick: () => this.toggle(false) },
          icon('close'),
        ),
      ),
      h('div', { class: 'ai-scan' }),
      tabs,
      h(
        'div',
        { class: 'ai-body' },
        (this.main = h(
          'div',
          { class: 'ai-main', 'data-view': 'console' },
          this.dossier.profile,
          this.dossier.tools,
          this.models,
          this.log,
          h(
            'div',
            { class: 'ai-quick' },
            quick('Status report', 'Give me a short status report of the city.'),
            quick('What needs fixing?', 'What are the most urgent problems, and where?'),
            quick('Fix the worst', 'Find the most critical problem and fix it.'),
          ),
          h('div', { class: 'ai-compose' }, h('span', { class: 'ai-prompt' }, '›'), this.input, this.sendBtn),
          h(
            'label',
            { class: 'ai-auto' },
            auto,
            h(
              'span',
              { class: 'ai-auto-t' },
              h('b', {}, 'Autonomous mode'),
              h('span', {}, 'Act without asking · every action stays undoable (⌘Z)'),
            ),
            h('span', { class: 'ai-auto-s', 'aria-hidden': 'true' }),
          ),
        )),
        side,
      ),
    );
    // Flora's orb sits beside the build toolbar (desktop and phone), with the unread badge.
    this.launcher = h(
      'button',
      { class: 'ai-fab ai-launch panel', title: 'Flora, city assistant (U)', 'aria-label': 'Open Flora', onClick: () => this.toggle() },
      sigil(),
      this.badge,
    ) as HTMLButtonElement;
    ctx.services.get('hud').dockRow.append(this.launcher);
    ctx.hud.append(this.el);
    engine.onChange((s) => this.sync(s));
    this.sync(engine.state);
    try {
      this.max = localStorage.getItem(MAX_KEY) === '1';
    } catch {
      /* ignore */
    }
  }

  setView(v: View): void {
    this.view = v;
    this.main.dataset.view = v;
    for (const [k, b] of this.tabs) b.classList.toggle('on', k === v);
    if (v === 'profile') this.dossier.renderProfile();
    if (v === 'tools') this.dossier.renderTools();
    if (v === 'console' && this.open) this.log.scrollTop = this.log.scrollHeight;
  }

  /** First open: a short boot sequence (staggered one-shot reveal), then the welcome. */
  private boot(): void {
    if (this.booted) return;
    this.booted = true;
    const c = this.dossier.census();
    const lines: [string, string][] = [
      ['FLORA civic intelligence', 'BG-01'],
      ['Handshake · city grid', `${fmt(this.ctx.city.stats.population)} residents`],
      ['Agent tools registered', `${c.all} · ${c.read} sense · ${c.view} guide · ${c.mutate} act`],
      ['Directive stack', 'planner · argument writer · persona'],
      ['Model core', this.engine.loaded?.name ?? 'standby (load one under ⚙)'],
    ];
    this.push(
      h(
        'div',
        { class: 'ai-boot' },
        ...lines.map(([k, v], i) =>
          h('div', { class: 'ai-boot-l', style: `--i:${i}` }, h('span', {}, `› ${k}`), h('i'), h('b', {}, v)),
        ),
      ),
    );
    this.system(
      'Flora online. I watch the city with you, look things up, and build, demolish, connect, tax and more, asking before I change anything. See ◈ Profile for my directives and ⚒ Tools for everything I can do; type /help for direct commands.',
    );
  }

  get isMax(): boolean {
    return this.max && this.open;
  }

  toggle(open = !this.open): void {
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    this.launcher.classList.toggle('on', open);
    document.body.classList.toggle('flora-open', open);
    this.applyMax();
    if (open) {
      this.boot();
      this.setView(this.view);
      this.renderModels(this.engine.state);
      this.unread = 0;
      this.badge.classList.add('hidden');
      this.log.scrollTop = this.log.scrollHeight;
      if (this.engine.state.status !== 'ready' && this.engine.state.status !== 'loading')
        this.models.classList.remove('hidden');
      // Focusing would raise a phone's keyboard over the console.
      if (!document.body.classList.contains('touch')) setTimeout(() => this.input.focus());
      this.slowTimer = 99;
      this.timer = 99;
      // wllama and the model listing load on first open, never at boot; then the last model comes back.
      void this.engine.refresh().then(() => {
        const last = this.engine.lastUsed();
        if (last && this.engine.state.status === 'idle') void this.engine.load(last.id);
      });
    }
  }

  setMax(on: boolean): void {
    this.max = on;
    try {
      localStorage.setItem(MAX_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!this.open) this.toggle(true);
    else this.applyMax();
    this.timer = 99;
  }

  private applyMax(): void {
    const on = this.max && this.open;
    this.el.classList.toggle('max', on);
    document.body.classList.toggle('flora-max', on);
    this.maxBtn.replaceChildren(icon(on ? 'restore' : 'maximize'));
    this.maxBtn.title = on ? 'Restore (Shift+U)' : 'Maximize console (Shift+U)';
    if (this.open) this.log.scrollTop = this.log.scrollHeight;
  }

  setBusy(on: boolean): void {
    this.busy = on;
    this.el.classList.toggle('busy', on);
    this.sendBtn.replaceChildren(icon(on ? 'stop' : 'send'));
    this.sendBtn.title = on ? 'Abort (stop Flora)' : 'Transmit (Enter)';
    this.sendBtn.setAttribute('aria-label', on ? 'Abort' : 'Transmit');
    if (on) this.turns++;
  }

  /** Telemetry rail refresh (2 Hz while maximized and open; the inventory roll-up every 4 s). */
  update(dt: number): void {
    if (!this.isMax) return;
    this.timer += dt;
    this.slowTimer += dt;
    if (this.timer < 0.5) return;
    this.timer = 0;
    const { city } = this.ctx;
    const s = city.stats;
    const p = city.pulse;
    this.rail.systems.replaceChildren(
      ...SYSTEMS.map((k) =>
        h(
          'div',
          { class: `ai-sys-row t${p.tiers[k]}` },
          h('i', { class: 'ai-led' }),
          h('span', {}, SYSTEM_LABELS[k]),
          h('b', {}, TIERS[p.tiers[k]]),
        ),
      ),
    );
    if (this.slowTimer >= 4) {
      this.slowTimer = 0;
      const sum = summarize(listObjects(city, ['building', 'network']));
      this.objects = { critical: sum.status.critical, warning: sum.status.warning, total: sum.total };
    }
    const net = s.income - s.upkeep - s.debtService;
    const kv = (k: string, v: string, tone = '') =>
      h('div', { class: `row ${tone}` }, h('span', {}, k), h('b', {}, v));
    this.rail.vitals.replaceChildren(
      kv('Treasury', fmt(city.credits), city.credits < 0 ? 'bad' : ''),
      kv('Net / s', `${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(1)}`, net < 0 ? 'bad' : 'good'),
      kv('Residents', `${fmt(s.population)} / ${fmt(s.capacity)}`),
      kv('Harmony', `${Math.round(s.happiness)}`),
      kv(
        'Objects',
        `${fmt(this.objects.total)} · ${this.objects.critical} crit · ${this.objects.warning} warn`,
        this.objects.critical ? 'bad' : '',
      ),
    );
    const crises = city.steward.crises;
    this.rail.alerts.replaceChildren(
      ...(crises.length
        ? crises.map((c) =>
            h(
              'div',
              { class: `ai-alert ${c.phase}` },
              h('span', {}, `${getCrisis(c.def).icon} ${getCrisis(c.def).name}`),
              h('b', {}, c.phase),
            ),
          )
        : [h('div', { class: 'ai-dim' }, 'No crises. All quiet.')]),
    );
    const e = this.engine.state;
    this.rail.session.replaceChildren(
      kv('Core', this.engine.loaded?.name ?? 'offline'),
      kv('Backend', e.info?.backend ?? '—'),
      kv('Throughput', e.tokPerSec ? `${Math.round(e.tokPerSec)} tok/s` : '—'),
      kv('Turns', String(this.turns)),
      kv('Actions', String(this.actionsRun.length)),
      kv('Mode', this.actions.autoApprove() ? 'Autonomous' : 'Ask first'),
    );
    this.rail.actions.replaceChildren(
      ...(this.actionsRun.length
        ? this.actionsRun
            .slice(-6)
            .reverse()
            .map((a) => h('div', { class: 'ai-act' }, h('time', {}, a.at), this.rich(a.text)))
        : [h('div', { class: 'ai-dim' }, 'No actions yet.')]),
    );
  }

  private submit(): void {
    const text = this.input.value;
    if (!text.trim()) return;
    this.input.value = '';
    this.actions.send(text);
  }

  private push(el: HTMLElement): void {
    this.log.append(el);
    while (this.log.children.length > 150) this.log.firstElementChild!.remove();
    // Reading scrollHeight forces layout: only while visible (the welcome message is pushed at boot).
    if (this.open) this.log.scrollTop = this.log.scrollHeight;
    else if (this.log.children.length > 1) {
      this.unread++;
      setText(this.badge, String(this.unread));
      this.badge.classList.remove('hidden');
    }
  }

  /** Text with object ids turned into links that show the object. */
  private rich(text: string): HTMLElement {
    const out = h('span', { class: 'ai-text' });
    for (const part of text.split(ID_SPLIT)) {
      if (!part) continue;
      if (ID_SPLIT.test(part))
        out.append(
          h(
            'button',
            {
              class: 'ai-id',
              title: 'Show it',
              onClick: () => this.ctx.services.get('inventory').select(part),
            },
            part,
          ),
        );
      else out.append(part);
      ID_SPLIT.lastIndex = 0;
    }
    return out;
  }

  private tag(who: string, cls: string): HTMLElement {
    return h('div', { class: `ai-tag ${cls}` }, h('span', {}, who), h('time', {}, stamp()));
  }

  user(text: string): void {
    this.push(
      h('div', { class: 'ai-msg user' }, this.tag('Steward', 'u'), h('div', { class: 'ai-text' }, text)),
    );
  }

  system(text: string): void {
    this.push(h('div', { class: 'ai-msg sys' }, this.tag('System', 's'), this.rich(text)));
  }

  /** A city notice from the monitor, with a button to ask about it. */
  notice(text: string, ask?: string): void {
    this.push(
      h(
        'div',
        { class: 'ai-msg notice' },
        this.tag('Alert', 'a'),
        h(
          'div',
          { class: 'ai-notice-b' },
          h('span', {}, text),
          ask ? h('button', { class: 'ai-chip', onClick: () => this.actions.send(ask) }, 'Analyse') : null,
        ),
      ),
    );
  }

  assistant(): Bubble {
    const steps = h('div', { class: 'ai-steps' });
    const phase = h('div', { class: 'ai-phase' });
    const body = h('div', { class: 'ai-reply' });
    this.push(h('div', { class: 'ai-msg bot' }, this.tag('Flora', 'f'), steps, body, phase));
    let text = '';
    let pending = 0;
    const lines = new Map<number, { el: HTMLElement; t0: number }>();
    const line = (c: ToolCall) => {
      const el = h(
        'div',
        { class: `ai-tool ${c.effect}` },
        h('time', {}, stamp()),
        h('span', { class: 'ai-tool-i' }, icon(TOOL_ICON[c.effect] ?? '·')),
        h('b', {}, c.tool),
        h('code', {}, JSON.stringify(c.args)),
      );
      lines.set(c.step, { el, t0: performance.now() });
      steps.append(el);
      return el;
    };
    return {
      phase: (p) => setText(phase, PHASES[p] ? `${PHASES[p]}…` : ''),
      call: (c) => void line(c),
      result: (r) => {
        const l = lines.get(r.call.step) ?? { el: line(r.call), t0: performance.now() };
        l.el.classList.add(r.ok ? 'ok' : 'bad');
        this.uses.set(r.call.tool, (this.uses.get(r.call.tool) ?? 0) + 1);
        l.el.title = r.ok ? r.observation.slice(0, 600) : (r.error ?? '');
        l.el.append(
          h(
            'span',
            { class: 'ai-tool-r' },
            r.ok ? `✓ ${Math.round(performance.now() - l.t0)} ms` : `✗ ${r.error}`,
          ),
        );
        if (r.ok && r.call.effect === 'mutate') {
          const ids = Object.values((r.result as Record<string, unknown> | undefined) ?? {})
            .flat()
            .filter((v): v is string => typeof v === 'string' && /^[A-Z]{3}-/.test(v));
          this.actionsRun.push({
            at: stamp(),
            text: `${r.call.tool} ${ids.join(' ') || JSON.stringify(r.call.args)}`,
          });
          this.timer = 99;
        }
        if (this.open) this.log.scrollTop = this.log.scrollHeight;
      },
      delta: (t) => {
        text += t;
        // Coalesce streamed pieces: one DOM write per ~60 ms batch.
        if (pending) return;
        pending = window.setTimeout(() => {
          pending = 0;
          setText(body, stripThink(text));
          if (this.open) this.log.scrollTop = this.log.scrollHeight;
        }, 60);
      },
      attach: (el) => {
        steps.append(el);
        if (this.open) this.log.scrollTop = this.log.scrollHeight;
      },
      finish: (final, error = false, data?: unknown) => {
        if (pending) clearTimeout(pending);
        body.replaceChildren(data !== undefined ? this.resultView(data) : this.rich(final));
        body.classList.toggle('bad', error);
        setText(phase, '');
        if (this.open) this.log.scrollTop = this.log.scrollHeight;
      },
    };
  }

  /** A tool result as telemetry: one labelled row per field, nested values flattened, ids clickable. */
  resultView(value: unknown): HTMLElement {
    const show = (v: unknown): string =>
      Array.isArray(v)
        ? v
            .map((x) =>
              typeof x === 'object' && x !== null
                ? Object.values(x).slice(0, 4).map(String).join(' · ')
                : String(x),
            )
            .join('\n')
        : typeof v === 'object' && v !== null
          ? Object.entries(v)
              .map(([k, x]) => `${k}: ${typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x)}`)
              .join('\n')
          : typeof v === 'number' && !Number.isInteger(v)
            ? String(Math.round(v * 100) / 100)
            : String(v);
    if (typeof value !== 'object' || value === null) return this.rich(String(value));
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i + 1), v] as const)
      : Object.entries(value);
    const label = (k: string) => k.replace(/([A-Z])/g, ' $1');
    return h(
      'div',
      { class: 'ai-result' },
      ...entries
        .slice(0, 30)
        .flatMap(([k, v]) => [h('span', {}, label(k)), h('div', {}, this.rich(show(v)))]),
    );
  }

  /** An authorization card (in `into`, the reply asking for it); resolves when the steward decides. */
  approval(call: ToolCall, into?: Bubble): Promise<boolean> {
    if (!this.open) this.toggle(true);
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        card.classList.add(ok ? 'ok' : 'bad');
        buttons.replaceChildren(h('span', { class: 'ai-verdict' }, ok ? '✓ Authorized' : '✗ Denied'));
        resolve(ok);
      };
      const buttons = h(
        'div',
        { class: 'ai-approve-btns' },
        h('button', { class: 'ai-auth yes', onClick: () => done(true) }, 'Authorize'),
        h('button', { class: 'ai-auth no', onClick: () => done(false) }, 'Deny'),
      );
      const args = Object.entries(call.args);
      const card = h(
        'div',
        { class: 'ai-approve' },
        h('div', { class: 'ai-approve-h' }, '⚠ Authorization required'),
        h('div', { class: 'ai-approve-t' }, 'Flora requests ', h('b', {}, call.tool)),
        args.length
          ? h(
              'div',
              { class: 'ai-kv ai-approve-a' },
              ...args.map(([k, v]) =>
                h(
                  'div',
                  { class: 'row' },
                  h('span', {}, k),
                  h('b', {}, typeof v === 'string' ? v : JSON.stringify(v)),
                ),
              ),
            )
          : null,
        buttons,
      );
      if (into) into.attach(card);
      else this.push(card);
    });
  }

  private sync(s: EngineState): void {
    // A model just became ready: fold the model list away so the conversation has the room.
    if (s.status === 'ready' && this.lastStatus !== 'ready') this.models.classList.add('hidden');
    this.lastStatus = s.status;
    const def = this.engine.loaded;
    setText(
      this.linkText,
      s.status === 'ready' && def
        ? `Link · ${def.name}${s.tokPerSec ? ` · ${Math.round(s.tokPerSec)} tok/s` : ''}`
        : s.status === 'loading' && s.progress
          ? `${s.progress.phase} ${s.progress.total ? Math.round((s.progress.loaded / s.progress.total) * 100) : 0}%`
          : s.status === 'error'
            ? 'Core fault'
            : 'No core loaded',
    );
    this.link.className = `ai-link ${s.status}`;
    if (this.open) this.renderModels(s);
  }

  private renderModels(s: EngineState): void {
    const mlx = s.native.supported;
    const rec = recommendedModel(mlx);
    const row = (m: ModelDef) => {
      const cached = s.cached.has(m.id);
      const loaded = s.loadedId === m.id;
      const loading = s.loadingId === m.id;
      const fit = m.engine === 'mlx' ? memoryFit(m.bytes, s.native.memory) : null;
      const btn = loaded
        ? h('button', { class: 'ai-op', onClick: () => void this.engine.unload() }, 'Unload')
        : h(
            'button',
            {
              class: 'ai-op',
              disabled: s.status === 'loading' || undefined,
              onClick: () => void this.engine.load(m.id),
            },
            cached ? 'Load core' : `Download ${m.size}`,
          );
      const remove =
        cached && !loading
          ? h(
              'button',
              {
                class: 'ai-op',
                title: 'Delete the downloaded model',
                onClick: () =>
                  confirm(`Delete the downloaded ${m.name} (${m.size})?`) && void this.engine.remove(m.id),
              },
              'Delete',
            )
          : null;
      return h(
        'div',
        { class: `ai-model${loaded ? ' on' : ''}` },
        h(
          'div',
          { class: 'ai-model-h' },
          h('b', {}, m.name),
          h(
            'span',
            { class: `ai-pill${m.engine === 'mlx' ? '' : ' dim'}` },
            m.engine === 'mlx' ? 'native' : 'web',
          ),
          m.id === rec.id ? h('span', { class: 'ai-pill rec' }, 'recommended') : null,
          cached ? h('span', { class: 'ai-pill ok' }, 'on disk') : null,
        ),
        h(
          'div',
          { class: 'ai-model-n' },
          `${m.family} · ${m.note}${fit?.fits === false ? ` Needs ≈${fit.needGb} GB: likely too big for this Mac.` : ''}`,
        ),
        loading && s.progress
          ? h(
              'div',
              { class: 'ai-progress' },
              h('i', {
                style: `width:${s.progress.total ? (s.progress.loaded / s.progress.total) * 100 : 0}%`,
              }),
              h(
                'span',
                {},
                `${s.progress.phase} ${gb(s.progress.loaded)} / ${gb(s.progress.total)}${s.progress.speed ? ` · ${gb(s.progress.speed)}/s` : ''}`,
              ),
            )
          : h('div', { class: 'ai-model-a' }, btn, remove),
      );
    };
    this.models.replaceChildren(
      h('div', { class: 'ai-rail-h' }, 'Model core'),
      h(
        'div',
        { class: 'ai-models-h' },
        mlx
          ? 'Native cores run on this Mac’s GPU (MLX); web cores run in the page (wllama).'
          : `Cores run in this page with wllama${s.isolated ? '' : ' (single-threaded here: slower)'}. On the macOS app they run natively.`,
      ),
      ...availableModels(mlx).map(row),
      ...(s.error ? [h('div', { class: 'ai-model-err' }, s.error)] : []),
      h(
        'div',
        { class: 'ai-models-f' },
        'Downloaded once from Hugging Face (pinned, checksum-verified); runs entirely on this computer. Nothing you type leaves it.',
      ),
    );
  }
}
