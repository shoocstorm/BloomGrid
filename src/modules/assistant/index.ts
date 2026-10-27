import type { GameContext, GameModule } from '@/game/context';
import type { AgentTool, JsonSchema } from '@/core/AgentTools';
import { buildings } from '@/content';
import { SYSTEM_LABELS } from '@/modules/pulse/PulsePanel';
import { TIERS } from '@/sim/pulseState';
import { getCrisis } from '@/sim/crises';
import { actionTools } from '@/sim/actionTools';
import { ISSUES, inventoryKinds } from '@/sim/inventory';
import { cityBrief } from '@/ai/brief';
import { defaultPolicy, observe, runTurn, type Policy, type ToolCall } from '@/ai/agent';
import { LlmEngine, isAbort, type ChatMessage } from '@/ai/llm/engine';
import { AssistantPanel } from './Panel';
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
  /** Sends a request as if the steward typed it; resolves with the answer. */
  ask(text: string): Promise<string>;
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

  constructor(private ctx: GameContext) {
    try {
      this.autoApprove = localStorage.getItem(AUTO_KEY) === '1';
    } catch {
      /* ignore */
    }
    this.panel = new AssistantPanel(ctx, this.engine, {
      send: (text) => void this.ask(text),
      stop: () => this.busy?.abort(),
      setAutoApprove: (on) => {
        this.autoApprove = on;
        try {
          localStorage.setItem(AUTO_KEY, on ? '1' : '0');
        } catch {
          /* ignore */
        }
      },
      autoApprove: () => this.autoApprove,
    });
    this.watch();
  }

  /** Notices from the city's own events: no model needed, throttled per topic. */
  private watch(): void {
    const { bus } = this.ctx;
    const notice = (topic: string, text: string, ask?: string) => {
      const now = performance.now();
      if (now - (this.lastNotice.get(topic) ?? -Infinity) < 30_000) return;
      this.lastNotice.set(topic, now);
      this.panel.notice(text, ask);
    };
    bus.on('pulse:tier', ({ system, tier, prev }) => {
      if (tier <= prev || tier < 2 || !this.ctx.city.pulse.primed) return;
      const label = SYSTEM_LABELS[system];
      notice(
        `tier:${system}`,
        `${label} dropped to ${TIERS[tier]} (was ${TIERS[prev]}).`,
        `${label} dropped to ${TIERS[tier]}. What is causing it and what should we do?`,
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
    const r = ` ${request.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
    if (props.type && (tool.name === 'build' || tool.name === 'find_sites')) {
      const all = buildings.all();
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

  async ask(text: string): Promise<string> {
    const request = text.trim();
    if (!request || this.busy) return '';
    this.panel.user(request);
    if (request.startsWith('/')) return this.slash(request);
    if (this.engine.state.status !== 'ready') {
      const msg =
        'No model is loaded yet. Pick one under ⚙ Models (it downloads once and runs on this computer), or use slash commands: type /help.';
      this.panel.assistant().finish(msg);
      return msg;
    }
    const agent = this.ctx.services.get('agent');
    const bubble = this.panel.assistant();
    this.busy = new AbortController();
    this.panel.setBusy(true);
    try {
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
          else if (e.type === 'call') bubble.call(e.call);
          else if (e.type === 'result') bubble.result(e.record);
          else if (e.type === 'delta') bubble.delta(e.text);
        },
      });
      bubble.finish(out.answer);
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
      const msg = `Slash commands run a tool directly:\n${lines.join('\n')}\n\nExample: /build type=water-works district=Westbrook`;
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
    bubble.finish(msg, !r.ok);
    return msg;
  }
}

export const assistantModule: GameModule = {
  id: 'assistant',
  deps: ['inventory', 'pulse', 'hud'],
  init(ctx) {
    const agent = ctx.services.get('agent');
    for (const t of actionTools) agent.register(t);
    const a = new Assistant(ctx);
    ctx.services.provide('assistant', {
      toggle: (open) => a.panel.toggle(open),
      ask: (text) => a.ask(text),
      engine: a.engine,
    });
    ctx.input.onKey((e) => {
      if (e.code === 'KeyU' && !e.metaKey && !e.ctrlKey) return (a.panel.toggle(), true);
      return false;
    });
  },
};

declare module '@/core/Services' {
  interface GameServices {
    assistant: AssistantService;
  }
}
