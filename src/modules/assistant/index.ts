import type { GameContext, GameModule } from '@/game/context';
import type { AgentTool, JsonSchema } from '@/core/AgentTools';
import { buildings } from '@/content';
import { SYSTEM_LABELS } from '@/modules/pulse/PulsePanel';
import { TIERS } from '@/sim/pulseState';
import { getCrisis } from '@/sim/crises';
import { actionTools } from '@/sim/actionTools';
import { insightTools } from '@/sim/insightTools';
import { hazardTools } from '@/sim/hazardTools';
import { fireworksTools } from '@/sim/fireworksTools';
import { happeningTools } from '@/sim/happeningTools';
import { levelTools } from '@/sim/levelTools';
import { consequenceTools } from '@/sim/consequenceTools';
import { switchTools } from '@/sim/switchTools';
import { riskTools } from '@/sim/riskTools';
import { growthTools } from '@/sim/growthTools';
import { proposalTools } from '@/sim/proposalTools';
import { bulkTools } from '@/sim/bulkTools';
import { roadTools } from '@/sim/roadTools';
import { proposeBuilds, type ProposalFocus } from '@/sim/proposals';
import { floraBilled, floraBlocker, floraLocked, floraWake, type FloraPhase } from '@/sim/flora';
import { diagnose } from '@/sim/proposals';
import { Building } from '@/ecs/components';
import { PROJECTS } from '@/sim/projects';
import { allOverlays, getOverlay } from '@/sim/overlays';
import { ISSUES, inventoryKinds } from '@/sim/inventory';
import { cityBrief } from '@/ai/brief';
import { defaultPolicy, observe, runTurn, type Policy, type ToolCall } from '@/ai/agent';
import { LlmEngine, isAbort, type ChatMessage } from '@/ai/llm/engine';
import { availableModels } from '@/ai/llm/models';
import { device } from '@/ai/llm/device';
import { AssistantPanel, type ProposalCard } from './Panel';
import './assistant.css';

/**
 * Flora, the city assistant (U): a local LLM (wllama in the browser, MLX natively on Apple Silicon desktop;
 * `src/ai/llm/`) that works beside the steward. It answers questions about the city, watches its systems
 * (notices on tier drops, crises and the fail clock, no model needed), and carries out requested actions
 * through the agent tools (`ctx.services.get('agent')`), asking before anything that changes the city.
 * Slash commands (`/build type=water-works district=Westbrook`) run tools directly, with or without a model.
 */
export interface AssistantService {
  toggle(open?: boolean): void;
  /** Opens the console maximized (or restores it docked). */
  maximize(on: boolean): void;
  /** Sends a request as if the steward typed it; resolves with the answer. */
  ask(text: string): Promise<string>;
  /** Turns Autonomous mode (act without asking) on or off, as the Profile tab's switch does. */
  autonomous(on: boolean): void;
  readonly engine: LlmEngine;
}

const AUTO_KEY = 'bloomgrid.ai.autoApprove';

class Assistant {
  readonly engine = new LlmEngine();
  readonly panel: AssistantPanel;
  private history: ChatMessage[] = [];
  private busy: AbortController | null = null;
  private autoApprove = false;
  private lastNotice = new Map<string, number>();
  /** A question asked before any core was downloaded: sent as soon as one comes online. */
  private pending: string | null = null;
  /** Fresh islands (D-092): her wake state as last shown (null right after a city change: no toasts then). */
  private phase: FloraPhase | null = null;
  private wakeTimer = 99;

  constructor(private ctx: GameContext) {
    try {
      this.autoApprove = localStorage.getItem(AUTO_KEY) === '1';
    } catch {
      /* ignore */
    }
    this.panel = new AssistantPanel(ctx, this.engine, {
      send: (text) => void this.ask(text),
      stop: () => this.busy?.abort(),
      clear: () => this.clear(),
      setAutoApprove: (on) => this.setAutoApprove(on),
      autoApprove: () => this.autoApprove,
      wake: () => this.startWaking(),
    });
    this.watch();
    // A new or loaded city starts a new conversation: the last city's history, ids and notices mean nothing here,
    // and the undo stack they pointed at is gone. A turn in flight is stopped.
    ctx.bus.on('city:reset', () => this.newCity());
    ctx.bus.on('project:done', ({ id }) => id === 'flora' && !ctx.loading && this.awaken());
    this.engine.onChange((s) => {
      if (s.status !== 'ready' || !this.pending || this.busy) return;
      const request = this.pending;
      this.pending = null;
      void this.turn(request);
    });
  }

  setAutoApprove(on: boolean): void {
    this.autoApprove = on;
    try {
      localStorage.setItem(AUTO_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  /** Notices from the city's own events: no model needed, throttled per topic. */
  private watch(): void {
    const { bus } = this.ctx;
    const notice = (topic: string, text: string, ask?: string, proposals?: ProposalCard[]) => {
      // Asleep, she says nothing (D-092): the City Pulse toasts carry the news until she is woken.
      if (floraLocked(this.ctx.city)) return;
      const now = performance.now();
      if (now - (this.lastNotice.get(topic) ?? -Infinity) < 30_000) return;
      this.lastNotice.set(topic, now);
      this.panel.notice(text, ask, proposals);
    };
    // A failing system comes with what to build about it (D-089): worked out by the planner, no model needed.
    // Only once Flora is awake on a fresh island (she is an unlock).
    const FOCUS: Partial<Record<string, ProposalFocus>> = { energy: 'energy', water: 'water', food: 'food', jobs: 'jobs', mobility: 'traffic', ecology: 'ecology', harmony: 'any' };
    const proposalsFor = (system: string): ProposalCard[] | undefined => {
      const focus = FOCUS[system];
      if (!focus || floraLocked(this.ctx.city)) return undefined;
      return proposeBuilds(this.ctx.city, { focus, limit: 2 }).map((p) => ({ build: `${p.count}× ${p.name}`, type: p.type, count: p.count, where: p.district, why: p.why, gain: p.gain, cost: p.cost, site: p.site }));
    };
    bus.on('pulse:tier', ({ system, tier, prev }) => {
      if (tier <= prev || tier < 2 || !this.ctx.city.pulse.primed) return;
      const label = SYSTEM_LABELS[system];
      notice(
        `tier:${system}`,
        `${label} dropped to ${TIERS[tier]} (was ${TIERS[prev]}).`,
        `${label} dropped to ${TIERS[tier]}. What is causing it and what should we do?`,
        proposalsFor(system),
      );
    });
    bus.on('crisis:forecast', ({ crisis }) => {
      const def = getCrisis(crisis.def);
      notice(
        `crisis:${crisis.id}`,
        `Forecast: ${def.name} ahead. ${def.prep}`,
        `A ${def.name} is forecast. How should we prepare?`,
      );
    });
    bus.on('crisis:start', ({ crisis }) =>
      notice(
        `crisis-start:${crisis.id}`,
        `${getCrisis(crisis.def).name} has begun.`,
        `The ${getCrisis(crisis.def).name} has begun. What is affected and what should we do?`,
      ),
    );
    // Hazards (D-050): fires, ruins and quakes, each with a prompt that leads to incident_status / respond_incident.
    bus.on('fire:start', ({ fire, eid }) => {
      const where = this.ctx.city.districtAt(Math.floor(fire.x), Math.floor(fire.z)) ?? 'the outskirts';
      notice(
        'fire',
        `🔥 Fire at ${this.ctx.city.buildingDef(eid).name} in ${where} (fire ${fire.id}, cause: ${fire.cause}).`,
        'What is burning right now, and which fires need crews?',
      );
    });
    bus.on('building:ruined', ({ eid, cause }) =>
      notice(
        'ruin',
        `${this.ctx.city.buildingDef(eid).name} is a ruin (${cause}).`,
        'Which buildings are ruined or damaged, and what would repairs cost?',
      ),
    );
    bus.on('quake:shock', ({ x, z, magnitude, aftershock }) => {
      if (aftershock) return;
      notice(
        'quake',
        `🌋 Magnitude ${magnitude.toFixed(1)} earthquake near ${this.ctx.city.districtAt(Math.floor(x), Math.floor(z)) ?? 'the outskirts'}.`,
        'An earthquake hit. Which buildings are damaged or burning, and what should we do first?',
      );
    });
    bus.on('steward:warning', ({ secondsLeft }) => {
      if (secondsLeft !== null)
        notice(
          'fail',
          `The council is losing patience: ${Math.round(secondsLeft)} s to turn things around.`,
          'The fail clock is running. What are the most urgent fixes?',
        );
    });
  }

  /** Building types and districts as enums, so the model can only name real ones; pinned when the request names one. */
  private narrow = (tool: AgentTool<unknown>, schema: JsonSchema, request: string): JsonSchema => {
    const props = { ...schema.properties };
    // Plurals name types too ("all canopy towers", "every factory").
    const r = ` ${request
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/(\w{3,})ies\b/g, '$1y $1ies')
      .replace(/(\w{3,}[^s])s\b/g, '$1 $1s')} `;
    if (props.type && (tool.name === 'build' || tool.name === 'find_sites' || tool.name === 'act_on_buildings')) {
      // Acting on buildings: only types the city has.
      const present = new Set(this.ctx.city.buildingEntities().map((e) => this.ctx.city.buildingDef(e).id));
      const all = tool.name === 'act_on_buildings' ? buildings.all().filter((d) => present.has(d.id)) : buildings.all();
      const words = (s: string) =>
        ` ${s
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim()} `;
      const named = all.filter((d) => r.includes(words(d.id)) || r.includes(words(d.name)));
      props.type = { ...props.type, enum: (named.length ? named : all).map((d) => d.id) };
    }
    if (props.kind) props.kind = { ...props.kind, enum: inventoryKinds().map((k) => k.kind) };
    if (props.issue) props.issue = { ...props.issue, enum: Object.keys(ISSUES) };
    if (props.sort && tool.name === 'inventory_search')
      props.sort = {
        ...props.sort,
        enum: ['status', 'id', 'name', 'district', 'residents', 'condition', 'tiles'],
      };
    const districts = this.ctx.city.districts.map((d) => d.name);
    if (props.district && districts.length) {
      const named = districts.filter((n) => r.includes(` ${n.toLowerCase()} `));
      props.district = { ...props.district, enum: named.length === 1 ? named : districts };
    }
    return { ...schema, properties: props };
  };

  private policy = (t: AgentTool<unknown>): Policy => {
    const p = defaultPolicy(t);
    return p === 'ask' && this.autoApprove ? 'auto' : p;
  };

  /** Switching city: stops any turn, forgets the conversation, alerts and recent actions, and says so. */
  private newCity(): void {
    this.phase = null;
    this.wakeTimer = 99;
    this.busy?.abort();
    this.pending = null;
    this.history = [];
    this.lastNotice.clear();
    // The city's name is set after the reset (new island or loaded save): greet once it is.
    setTimeout(() => this.panel.reset(this.ctx.city.growth.name));
  }

  /** 2 Hz: the console and orb follow her wake state; becoming wakeable is news. */
  update(dt: number): void {
    this.panel.update(dt);
    if ((this.wakeTimer += dt) < 0.5) return;
    this.wakeTimer = 0;
    this.syncWake();
  }

  private syncWake(): void {
    const w = floraWake(this.ctx.city);
    if (this.ctx.services.tryGet('moments')?.playing) return;
    if (this.phase === 'asleep' && w.phase === 'ready')
      this.ctx.bus.emit('toast', { text: '✧ Flora can be woken: every condition is met. Open her orb (U) and wake her.', tone: 'ok' });
    this.phase = w.phase;
    this.panel.setWake(w);
  }

  /** The Wake button: starts the "Wake Flora" project. */
  private startWaking(): void {
    const w = floraWake(this.ctx.city);
    if (w.phase !== 'ready') return;
    if (!this.ctx.commands.execute('startProject', { id: 'flora' }))
      return void this.ctx.bus.emit('toast', { text: 'Flora could not be woken: check the credits.', tone: 'bad' });
    this.ctx.bus.emit('toast', { text: '✧ Flora is waking on the Data Spire…', tone: 'ok' });
    this.wakeTimer = 99;
  }

  /** The project finished: the ceremony, then her console opens with the welcome. */
  private awaken(): void {
    const { city } = this.ctx;
    const fmtN = (n: number) => Math.round(n).toLocaleString();
    const docs = this.ctx.services.tryGet('knowledge')?.base.all().length ?? 0;
    const tools = this.ctx.services.get('agent').list().length;
    const lines = [
      `Linking the city grid · ${fmtN(city.stats.population)} residents`,
      `Indexing ${fmtN(city.buildingEntities().length)} buildings in ${city.districts.length || 1} district${city.districts.length === 1 ? '' : 's'}`,
      ...(docs ? [`Reading the Seedvault · ${docs} docs`] : []),
      `Binding ${tools} agent tools`,
      'Data Spire core · stable',
    ];
    const trouble = diagnose(city)[0];
    const greeting = `Hello, steward. I'm Flora, and I'm awake. ${city.growth.name || 'The city'} has ${fmtN(city.stats.population)} residents${
      trouble ? `, and ${trouble.replace(/ \(.*$/, '').replace(/^(\w+) /, '$1 is ')}` : ', and every system is holding'
    }. Ask me anything, or tell me what to build.`;
    const spire = city.buildingEntities().find((e) => city.buildingDef(e).id === 'data-spire');
    const opened = () => {
      this.syncWake();
      this.panel.flash();
      this.panel.toggle(true);
    };
    this.panel.toggle(false);
    // A city moment (D-094): her sigil assembles, the column rises from the Data Spire, the sigil flies into her orb.
    const moments = this.ctx.services.tryGet('moments');
    if (!moments) return opened();
    moments.play(
      {
        id: 'flora',
        scale: 'grand',
        tone: 'bloom',
        emblem: 'flora',
        eyebrow: 'Civic intelligence · BG-01 · online',
        title: 'Flora',
        lines,
        sub: greeting,
        ...(spire !== undefined
          ? { at: { x: Building.x[spire]! + Building.w[spire]! / 2, z: Building.z[spire]! + Building.d[spire]! / 2, height: 40 } }
          : {}),
        flyTo: this.panel.orb,
        sound: 'awake',
      },
      opened,
    );
  }

  /** Forgets the conversation: the log and the history the next turn would send to the model. */
  clear(): void {
    if (this.busy) return;
    this.history = [];
    this.panel.clear();
  }

  async ask(text: string): Promise<string> {
    const request = text.trim();
    if (!request || this.busy) return '';
    if (request.toLowerCase() === '/clear') return (this.clear(), '');
    // Asleep (D-092): show what waking her needs instead of a reply nobody can see.
    if (floraLocked(this.ctx.city)) {
      this.syncWake();
      this.panel.toggle(true);
      const msg = floraBlocker(this.ctx.city) ?? 'Flora is asleep.';
      this.ctx.bus.emit('toast', { text: `✧ ${msg}`, tone: 'info' });
      return msg;
    }
    this.panel.user(request);
    // On a fresh island Flora must be woken first, and requests need credits (D-072).
    const why = floraBlocker(this.ctx.city);
    if (why && !(request.startsWith('/') && floraBilled(this.ctx.city) && !floraLocked(this.ctx.city))) {
      const crit = floraLocked(this.ctx.city)
        ? `\n${PROJECTS.flora.criteria(this.ctx.city)
            .map((c) => `${c.ok ? '✓' : '✗'} ${c.label}`)
            .join('\n')}\nThen start "Wake Flora" (◈${PROJECTS.flora.cost.toLocaleString()}) on the Build panel's Goals tab.`
        : '';
      const msg = `${why}${crit}`;
      this.panel.assistant().finish(msg, true);
      return msg;
    }
    if (request.startsWith('/')) return this.slash(request);
    return this.turn(request);
  }

  /**
   * Brings a model core up for a question asked before one is ready (e.g. Ask Flora from the inspector, which
   * opens the console and asks at once): waits for a load in progress, or loads the last-used (else any)
   * downloaded core. False when nothing is downloaded yet; downloading stays the steward's choice.
   */
  private async ensureCore(): Promise<boolean> {
    const e = this.engine;
    // Read fresh each time: the engine changes state across the awaits.
    const status = (): string => e.state.status;
    if (status() === 'ready') return true;
    if (status() !== 'loading') {
      await e.refresh();
      if (status() !== 'loading' && status() !== 'ready') {
        const def =
          e.lastUsed() ??
          availableModels(e.state.native.supported, device.mobile).find((m) => e.state.cached.has(m.id) && e.autoloadable(m.id));
        if (!def) return false;
        void e.load(def.id);
      }
    }
    await new Promise<void>((done) => {
      if (status() !== 'loading') return done();
      const off = e.onChange((st) => st.status !== 'loading' && (off(), done()));
    });
    return status() === 'ready';
  }

  private async turn(request: string): Promise<string> {
    if (this.busy) return '';
    const agent = this.ctx.services.get('agent');
    const bubble = this.panel.assistant();
    this.busy = new AbortController();
    this.panel.setBusy(true);
    try {
      if (this.engine.state.status !== 'ready') {
        bubble.phase('core');
        if (!(await this.ensureCore())) {
          if (this.engine.state.status === 'error') {
            const msg = `The model core failed to start: ${this.engine.state.error ?? 'unknown error'}. Try another core under Model core.`;
            bubble.finish(msg, true);
            this.panel.showModels();
            return msg;
          }
          this.pending = request;
          const msg =
            'I need a model core first. Pick one in Model core above: it downloads once and runs on this computer. I will answer this as soon as it is online (or type /help for direct commands).';
          bubble.finish(msg);
          this.panel.showModels();
          return msg;
        }
        if (this.busy.signal.aborted) throw new DOMException('Stopped', 'AbortError');
      }
      let generated = 0;
      let calls = 0;
      const out = await runTurn({
        llm: this.engine,
        tools: agent,
        request,
        history: this.history,
        brief: () => cityBrief(this.ctx.city),
        policy: this.policy,
        narrow: this.narrow,
        approve: (call: ToolCall) => this.panel.approval(call, bubble),
        signal: this.busy.signal,
        maxSteps: 5,
        onEvent: (e) => {
          if (e.type === 'phase') bubble.phase(e.phase);
          else if (e.type === 'call') {
            bubble.call(e.call);
            calls++;
          } else if (e.type === 'result') bubble.result(e.record);
          else if (e.type === 'delta') {
            bubble.delta(e.text);
            generated += e.text.length;
          }
        },
      });
      bubble.finish(out.answer);
      this.bill(request, generated + out.answer.length, calls);
      this.history.push({ role: 'user', content: request }, { role: 'assistant', content: out.answer });
      this.history = this.history.slice(-8);
      return out.answer;
    } catch (e) {
      const msg = isAbort(e) ? 'Stopped.' : `Something went wrong: ${(e as Error).message}`;
      bubble.finish(msg, !isAbort(e));
      return msg;
    } finally {
      this.busy = null;
      this.panel.setBusy(false);
    }
  }

  /**
   * Charges a finished turn (fresh islands only, D-072): tokens are estimated from the request and what the model
   * wrote, plus the prompt each model call reads (~300 tokens), at ◈ per token on top of a base fee.
   */
  private bill(request: string, generatedChars: number, calls: number): void {
    const { city, commands, bus } = this.ctx;
    if (!floraBilled(city)) return;
    const tokens = Math.ceil((request.length + generatedChars) / 4) + 300 * (1 + calls);
    const before = city.credits;
    if (commands.execute('floraBill', { tokens }, false))
      bus.emit('toast', { text: `Flora · ${tokens.toLocaleString()} tokens · −◈${(before - city.credits).toFixed(1)}`, tone: 'info' });
  }

  /** `/tool key=value …` or `/tool {json}`: runs a tool directly (the steward typed it, so no approval). */
  private async slash(text: string): Promise<string> {
    const agent = this.ctx.services.get('agent');
    const bubble = this.panel.assistant();
    const [head, ...rest] = text.slice(1).split(/\s+/);
    const name = (head ?? '').toLowerCase();
    if (!name || name === 'help') {
      const lines = agent.list().map(
        (t) =>
          `/${t.name}${
            Object.keys(t.input.properties ?? {}).length
              ? ` ${Object.keys(t.input.properties ?? {})
                  .slice(0, 4)
                  .map((k) => `${k}=…`)
                  .join(' ')}`
              : ''
          }  ${t.option ?? ''}`,
      );
      const msg = `Slash commands run a tool directly:\n${lines.join('\n')}\n\n/clear  forget this conversation (the model starts fresh)\n\nExample: /build type=water-works district=Westbrook`;
      bubble.finish(msg);
      return msg;
    }
    const tool = agent.get(name);
    if (!tool) {
      bubble.finish(`No tool /${name}. Type /help.`, true);
      return '';
    }
    const raw = rest.join(' ').trim();
    let args: Record<string, unknown> = {};
    try {
      if (raw.startsWith('{')) args = JSON.parse(raw) as Record<string, unknown>;
      else
        for (const m of raw.matchAll(/(\w+)=("([^"]*)"|\S+)/g)) {
          const key = m[1]!;
          const value = m[3] ?? m[2]!;
          const type = tool.input.properties?.[key]?.type;
          args[key] =
            type === 'number' || type === 'integer'
              ? Number(value)
              : type === 'boolean'
                ? value === 'true'
                : value;
        }
    } catch (e) {
      bubble.finish(`Couldn't read the arguments: ${(e as Error).message}`, true);
      return '';
    }
    const call: ToolCall = { step: 1, tool: name, args, effect: tool.effect };
    bubble.call(call);
    const r = await agent.call(name, args);
    bubble.result(
      r.ok
        ? { call, ok: true, observation: JSON.stringify(r.result), result: r.result }
        : { call, ok: false, observation: '', error: r.error },
    );
    const msg = r.ok ? observe(r.result, 900) : r.error;
    bubble.finish(msg, !r.ok, r.ok ? r.result : undefined);
    return msg;
  }
}

const SPEEDS = { pause: 0, normal: 1, fast: 3, fastest: 8 } as const;
const EXPLORE = ['city', 'tour', 'walk', 'board', 'drone', 'follow', 'train'] as const;

/** Tools over the game rather than the city: time, lenses, camera, panels, explore modes, saving. */
function gameTools(): AgentTool<GameContext, never>[] {
  return [
    {
      name: 'set_speed',
      option: 'Pause the game or change its speed',
      description: 'Sets the simulation speed: pause, normal (1×), fast (3×) or fastest (8×).',
      keywords: ['pause', 'resume', 'speed', 'time', 'faster', 'slower'],
      input: {
        type: 'object',
        properties: { speed: { type: 'string', enum: Object.keys(SPEEDS) } },
        required: ['speed'],
      },
      effect: 'view',
      run(c, { speed }: { speed: keyof typeof SPEEDS }) {
        c.engine.speed = SPEEDS[speed];
        return { speed, multiplier: SPEEDS[speed] };
      },
    },
    {
      name: 'show_lens',
      option: 'Show a data lens over the city (power, water, pollution, traffic…)',
      description: `Colours the city by one measure so the steward can see it (or "none" to clear). Lenses: ${allOverlays()
        .map((o) => o.id)
        .join(', ')}.`,
      keywords: ['lens', 'overlay', 'map', 'heatmap', 'visualize', 'pollution', 'traffic', 'coverage'],
      input: {
        type: 'object',
        properties: { lens: { type: 'string', enum: ['none', ...allOverlays().map((o) => o.id)] } },
        required: ['lens'],
      },
      effect: 'view',
      run(c, { lens }: { lens: string }) {
        c.services.get('overlays').set(lens === 'none' ? null : lens);
        const o = getOverlay(lens);
        return o
          ? { lens, label: o.label, legend: { low: o.legend[0], high: o.legend[1] } }
          : { lens: 'none' };
      },
    },
    {
      name: 'camera_overview',
      option: 'Pull the camera back to see the whole island',
      description: 'Flies the camera up to the overview of the whole island.',
      keywords: ['overview', 'zoom out', 'whole', 'island', 'everything'],
      input: { type: 'object', properties: {} },
      effect: 'view',
      run(c) {
        c.cameraCtl.overview();
        return { camera: 'overview' };
      },
    },
    {
      name: 'open_dashboard',
      option: 'Open the city dashboard (charts) or the inventory',
      description:
        'Opens the city dashboard on its Overview (trend charts, budget, land use) or the Inventory (every object, searchable), optionally on one object id.',
      keywords: ['dashboard', 'charts', 'graphs', 'inventory', 'statistics', 'stats'],
      input: {
        type: 'object',
        properties: { tab: { type: 'string', enum: ['overview', 'inventory'] }, id: { type: 'string' } },
        required: ['tab'],
      },
      effect: 'view',
      run(c, { tab, id }: { tab: 'overview' | 'inventory'; id?: string }) {
        const db = c.services.get('dashboard');
        if (tab === 'inventory') db.openInventory(id);
        else db.toggle();
        return { opened: tab };
      },
    },
    {
      name: 'explore_mode',
      option: 'Explore the city: a city tour, walk, hoverboard, drone, ride a pod or the Aeroline',
      description:
        'Switches the camera to an explore mode: tour (an automatic flight round the landmarks, districts and wonders), walk (first person), board (hoverboard), drone, follow (ride a pod), train (ride the Aeroline), or city (back to the normal view).',
      keywords: ['walk', 'explore', 'drone', 'hoverboard', 'ride', 'train', 'aeroline', 'tour', 'fly'],
      input: { type: 'object', properties: { mode: { type: 'string', enum: EXPLORE } }, required: ['mode'] },
      effect: 'view',
      run(c, { mode }: { mode: (typeof EXPLORE)[number] }) {
        c.services.get('explore').setMode(mode);
        return { mode };
      },
    },
    {
      name: 'save_game',
      option: 'Save the city',
      description: 'Saves the city to its save slot (replacing the previous save).',
      keywords: ['save', 'store', 'backup'],
      input: { type: 'object', properties: {} },
      effect: 'mutate',
      async run(c) {
        await c.services.get('save').save();
        return { saved: true, day: c.city.day };
      },
    },
  ];
}

export const assistantModule: GameModule = {
  id: 'assistant',
  deps: ['inventory', 'pulse', 'hud'],
  init(ctx) {
    const agent = ctx.services.get('agent');
    for (const t of [...insightTools, ...actionTools, ...hazardTools, ...fireworksTools, ...happeningTools, ...levelTools, ...consequenceTools, ...switchTools, ...riskTools, ...growthTools, ...proposalTools, ...bulkTools, ...roadTools, ...gameTools()]) agent.register(t);
    const a = new Assistant(ctx);
    ctx.services.provide('assistant', {
      toggle: (open) => a.panel.toggle(open),
      maximize: (on) => a.panel.setMax(on),
      ask: (text) => a.ask(text),
      autonomous: (on) => a.setAutoApprove(on),
      engine: a.engine,
    });
    ctx.input.onKey((e) => {
      if (e.code === 'KeyU' && !e.metaKey && !e.ctrlKey)
        return (e.shiftKey ? a.panel.setMax(!a.panel.isMax) : a.panel.toggle(), true);
      if (e.code === 'Escape' && a.panel.isMax) return (a.panel.setMax(false), true);
      // Esc closes the console, unless it should cancel an active tool first.
      if (e.code === 'Escape' && a.panel.isOpen && (ctx.tools.active?.id ?? 'select') === 'select')
        return (a.panel.toggle(false), true);
      return false;
    });
    ctx.systems.add({
      id: 'assistant',
      phase: 'render',
      order: 135,
      update: (_c, f) => a.update(f.dt),
    });
  },
};

declare module '@/core/Services' {
  interface GameServices {
    assistant: AssistantService;
  }
}

