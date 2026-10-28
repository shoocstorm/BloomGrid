import {
  checkArgs,
  type AgentTool,
  type JsonSchema,
  type ToolEffect,
  type ToolResult,
} from '@/core/AgentTools';
import { LETTERS, argsGrammar, choiceGrammar, dropNulls, orderedProps } from './grammar';
import type { ChatMessage, GenOptions } from './llm/engine';

/**
 * The city assistant's agent loop (after Andai's `agent/loop.ts`), engine-agnostic and free of DOM so tests
 * drive it with a scripted model. One turn: [decide → fill arguments → policy gate → run → observe] × up to
 * `maxSteps`, then answer.
 *
 * - **Decide:** the model picks a letter from a menu of tools plus "reply now", held to `choiceGrammar`, so
 *   the choice is always valid. Anything unreadable ends the loop with a reply.
 * - **Fill:** the model writes the tool's arguments as JSON held to `argsGrammar`; `id`-like arguments are
 *   narrowed to the object ids the turn has seen (free names were the commonest failed call in Andai), and
 *   `checkArgs` validates before anything runs. One retry with the errors, then the failure is observed.
 * - **Gate:** `mutate` tools ask the steward first (policy `ask`) unless they allowed it (`auto`).
 * - **Observe:** a compact JSON of the result (or the error) joins the state for the next decision.
 * - **Answer:** streamed, from the state; it must only report actions that actually ran. A turn takes at most
 *   one successful action (`mutate`), then answers.
 */

export interface Llm {
  generate(messages: ChatMessage[], opts: GenOptions, onText?: (piece: string) => void): Promise<string>;
}

export type Policy = 'auto' | 'ask' | 'off';

export interface ToolHost {
  list(): AgentTool<unknown>[];
  call(name: string, args: unknown): Promise<ToolResult>;
}

export interface ToolCall {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  effect: ToolEffect;
}

export interface StepRecord {
  call: ToolCall;
  ok: boolean;
  /** What the model saw of the result. */
  observation: string;
  result?: unknown;
  error?: string;
}

export type AgentEvent =
  | { type: 'phase'; step: number; phase: 'deciding' | 'filling' | 'running' | 'answering' }
  | {
      type: 'decision';
      step: number;
      chosen: string;
      /** Picked by `plainIntent`, not the model. */ routed: boolean;
    }
  | { type: 'call'; call: ToolCall }
  | { type: 'approval'; call: ToolCall; approved: boolean }
  | { type: 'result'; record: StepRecord }
  | { type: 'delta'; text: string };

export interface TurnOptions {
  llm: Llm;
  tools: ToolHost;
  request: string;
  /** Earlier turns of the conversation (user / assistant), most recent last. */
  history?: ChatMessage[];
  /** A short text brief of the city now (refreshed every step). */
  brief: () => string;
  policy?: (tool: AgentTool<unknown>) => Policy;
  /** Asks the steward before a `mutate` tool runs under policy `ask`. */
  approve?: (call: ToolCall) => Promise<boolean>;
  /**
   * Narrows a tool's schema before its arguments are written: building types to an enum, and arguments the
   * request names outright (a district, a type) pinned to that value.
   */
  narrow?: (tool: AgentTool<unknown>, schema: JsonSchema, request: string) => JsonSchema;
  onEvent?: (e: AgentEvent) => void;
  maxSteps?: number;
  signal?: AbortSignal;
}

export interface TurnResult {
  answer: string;
  steps: StepRecord[];
}

export const REPLY = '__reply__';

/**
 * The three system prompts of a turn, exported so the console's profile view shows exactly what the model
 * is told: `planner` picks each step from a letter menu, `args` writes one call's JSON, `reply` is Flora's voice.
 */
export const PROMPTS = {
  planner:
    'You are the planner of a city-management assistant. Pick the next step from the options. Follow the output format exactly.',
  args: 'You write the JSON arguments of one tool call for a city-management assistant. Reply with the JSON object only. Fill an optional argument only when the request asks for it; set every other optional argument to null.',
  reply:
    'You are Flora, the city assistant of BloomGrid, a solarpunk island city. You help the human steward run the city: you watch its systems, look things up and carry out actions they approve. Reply to the steward directly in at most 3 short sentences of plain words, no headings or labels: say what you found or did, with the key numbers and ids. Name city objects by id and name (e.g. LIV-0042 Garden Residence) and say where they are. Only say you did something if it is an ACTION below that did not fail; if an action failed or was declined, say so. Never promise to do or monitor anything later, and never invent numbers or states that are not in the facts. Use only the facts below.',
} as const;
/**
 * Tools kept off the menu by default: the brief already carries the overview and the vocabulary, and
 * `object_select` covers focusing. Small models favour the first options, so a redundant one there costs a step.
 */
export const HIDDEN_BY_DEFAULT = new Set(['city_overview', 'inventory_catalog', 'camera_focus']);
const OBSERVATION_CHARS = 1400;
const ID_RE = /\b(?:LIV|NRG|UTL|TEC|WRK|NAT|FOD|HWY|BRG|SKY|CHN|DST|LMK)-[0-9A-Z][0-9A-Z.-]*\b/g;

export const defaultPolicy = (t: AgentTool<unknown>): Policy =>
  HIDDEN_BY_DEFAULT.has(t.name) ? 'off' : t.effect === 'mutate' ? 'ask' : 'auto';

/**
 * The tool a request plainly asks for, or null (after Andai's `searchFirst`). Small models picked the
 * first option or "reply" for clear commands ("build a water works in Westbrook"), so the first step of
 * such a turn skips the decision. Kept conservative: a false match costs a wrong first call that the
 * loop observes and recovers from, a missed one only a decision.
 */
/** A question ("what needs fixing?", "did you build it?"), as opposed to a command. */
export const isQuestion = (request: string) => {
  const r = request.toLowerCase().trim();
  return (
    /\?$/.test(r) ||
    /^(what|why|how|which|where|when|who|did|do|does|is|are|was|were|can|could|should|would)\b/.test(r)
  );
};

export function plainIntent(request: string): string | null {
  const r = request.toLowerCase().trim();
  // A question about an action ("what did you build?") is not a command to repeat it.
  const question = isQuestion(r);
  const rules: [RegExp, string][] = [
    [/^\s*undo\b/, 'undo'],
    [/\b(fix|repair|solve|resolve|sort out)\b/, 'fix_issue'],
    [/\b(pause|unpause|resume|speed up|slow down|fast forward)\b/, 'set_speed'],
    [/\b(lens|overlay)\b/, 'show_lens'],
    [/\bsave (the )?(game|city)\b/, 'save_game'],
    [/\brepay\b|\bpay (back|off)\b/, 'repay_loan'],
    [/\bmist\b|\bwater the (soil|gardens|farms)\b/, 'mist_soil'],
    [/\b(build|construct|place|add)\b.*\b([2-6]|two|three|four|five|six|several|a few)\b/, 'build_many'],
    [/\b(build|construct|place|add|erect)\b/, 'build'],
    [/\b(demolish|bulldoze|tear down|knock down)\b/, 'demolish'],
    [/\b(connect|link|hook up)\b/, 'connect_highway'],
    [/\bretrofit\b/, 'bloom_retrofit'],
    [/\b(tax|taxes)\b.*\d|\d.*\b(tax|taxes)\b/, 'set_tax'],
    [/\b(take|get) (a )?loan\b|\bborrow\b/, 'take_loan'],
    [/\b(where is|show me|locate|take me to)\b/, 'object_select'],
    [/\b(budget|money|spending|income|upkeep|afford)\b/, 'budget_breakdown'],
    [/\b(crisis|crises|storm|flood|heatwave|drought|forecast)\b/, 'crisis_status'],
    [/\b(trend|over time|improving|getting (better|worse))\b/, 'city_trends'],
    [/\b(best|cheapest|which building|what (should|can) (i|we) build)\b/, 'building_types'],
    [/\b(advice|advise|suggest|recommend)\b/, 'advisor_tips'],
    [/\b(find|list|which|how many|search)\b/, 'inventory_search'],
  ];
  const lookups = new Set([
    'object_select',
    'inventory_search',
    'budget_breakdown',
    'crisis_status',
    'city_trends',
    'building_types',
    'advisor_tips',
  ]);
  const hits = rules.filter(([re, t]) => re.test(r) && (!question || lookups.has(t))).map(([, t]) => t);
  return hits.length ? hits[0]! : null;
}

/** Always on the menu when offered: the lookups and the general remedies most requests need. */
export const CORE_TOOLS = [
  'inventory_search',
  'inventory_inspect',
  'advisor_tips',
  'fix_issue',
  'build',
  'object_select',
];
const STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'what',
  'how',
  'can',
  'you',
  'our',
  'are',
  'this',
  'that',
  'there',
  'please',
  'city',
  'some',
  'any',
  'all',
  'show',
  'tell',
  'about',
  'from',
  'into',
  'more',
  'less',
  'make',
  'need',
  'want',
]);
const words = (t: string) =>
  t
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => w.replace(/(ies|es|s|ing|ed)$/, ''));

/**
 * The tools a menu offers (at most `max`, one letter each): the core lookups and remedies, then the tools
 * whose name, option, description or keywords share the most words with the request. Registry order is kept,
 * so the same tools keep their letters: Andai found a reshuffled menu moves a small model's other choices.
 */
export function selectMenu<T extends AgentTool<unknown>>(
  request: string,
  tools: T[],
  max = LETTERS.length - 1,
): T[] {
  if (tools.length <= max) return tools;
  const want = new Set(words(request));
  const score = (t: T) => {
    const own = new Set(
      words(`${t.name.replace(/_/g, ' ')} ${optionText(t)} ${t.description} ${(t.keywords ?? []).join(' ')}`),
    );
    let n = 0;
    for (const w of want) if (own.has(w)) n++;
    return n + (t.keywords ?? []).filter((k) => want.has(words(k)[0] ?? '')).length * 2;
  };
  const core = tools.filter((t) => CORE_TOOLS.includes(t.name));
  const rest = tools
    .filter((t) => !CORE_TOOLS.includes(t.name))
    .map((t, i) => ({ t, s: score(t), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, Math.max(0, max - core.length))
    .map((x) => x.t);
  const keep = new Set([...core, ...rest]);
  return tools.filter((t) => keep.has(t));
}

/** A tool's one-line menu text. */
export const optionText = (t: AgentTool<unknown>) => t.option ?? t.description.split(/(?<=\.)\s/)[0]!;

/** Removes Qwen3 `<think>` blocks (empty ones appear even with thinking off). */
export const stripThink = (s: string) => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();

/** Compact JSON of a result for the model: long arrays cut, whole thing capped. */
export function observe(value: unknown, max = OBSERVATION_CHARS): string {
  const json = JSON.stringify(value, (_k, v: unknown) => {
    if (Array.isArray(v) && v.length > 8) return [...v.slice(0, 8), `…${v.length - 8} more`];
    if (typeof v === 'number' && !Number.isInteger(v)) return Math.round(v * 1000) / 1000;
    return v;
  });
  return json.length > max ? `${json.slice(0, max)}…(cut)` : json;
}

function stateText(o: TurnOptions, steps: StepRecord[]): string {
  const recent = (o.history ?? [])
    .slice(-4)
    .map((m) => `${m.role === 'user' ? 'Steward' : 'Assistant'}: ${m.content.slice(0, 300)}`)
    .join('\n');
  const done = steps.length
    ? steps
        .map(
          (s, i) =>
            `${i + 1}. ${s.call.tool} ${JSON.stringify(s.call.args)} → ${s.ok ? s.observation : `FAILED: ${s.error}`}`,
        )
        .join('\n')
    : '(nothing yet)';
  return [
    `Steward's request: ${o.request}`,
    recent && `Earlier in the conversation:\n${recent}`,
    `City now:\n${o.brief()}`,
    `Done so far this turn:\n${done}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function decisionMessages(state: string, options: string[]): ChatMessage[] {
  const block = options.map((t, i) => `${LETTERS[i]}. ${t}`).join('\n');
  return [
    {
      role: 'system',
      content: PROMPTS.planner,
    },
    {
      role: 'user',
      content: `${state}\n\nWhat should the assistant do next to fulfil the steward's request? Look things up before acting; reply once the request is done or you need the steward.\n\nOptions:\n${block}\n\nReply with exactly one option letter from: ${LETTERS.slice(0, options.length).split('').join(', ')}.`,
    },
  ];
}

function describeArgs(schema: JsonSchema): string {
  const req = new Set(schema.required ?? []);
  return orderedProps(schema)
    .map(([k, p]) => {
      const kind = p.enum
        ? `one of ${p.enum.slice(0, 24).join(', ')}${p.enum.length > 24 ? ', …' : ''}`
        : p.type;
      return `- ${k} (${kind}${req.has(k) ? ', required' : ', optional: null if not needed'})${p.description ? `: ${p.description}` : ''}`;
    })
    .join('\n');
}

/** Ids of city objects mentioned in text. */
export const idsIn = (text: string) => [...new Set(text.match(ID_RE) ?? [])];

/**
 * `id` arguments held to the ids the turn knows (when any are); an optional `near` only to ids this turn
 * itself has named (request and results), else left out: small models filled it with whatever id the brief
 * showed, and building "near" it overrode the district they were asked for.
 */
function narrowIds(schema: JsonSchema, known: string[], named: string[]): JsonSchema {
  const props = { ...schema.properties };
  const id = props.id;
  if (id?.type === 'string' && !id.enum && known.length)
    props.id = { ...id, enum: [...new Set([...named, ...known])].slice(0, 24) };
  const near = props.near;
  if (near?.type === 'string' && !near.enum && !(schema.required ?? []).includes('near')) {
    if (named.length) props.near = { ...near, enum: named.slice(-24) };
    else delete props.near;
  }
  return { ...schema, properties: props };
}

const parseJson = (text: string): unknown => {
  const t = stripThink(text);
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? t.slice(start, end + 1) : t);
};

/** Runs one steward request to an answer. */
export async function runTurn(o: TurnOptions): Promise<TurnResult> {
  const policy = o.policy ?? defaultPolicy;
  const emit = o.onEvent ?? (() => {});
  const steps: StepRecord[] = [];
  // Ids the turn may name: the request's (`named`, growing with results), then recent history's and the brief's.
  const named = idsIn(o.request);
  const known = [
    ...new Set([
      ...named,
      ...idsIn(
        (o.history ?? [])
          .slice(-2)
          .map((m) => m.content)
          .join(' '),
      ),
      ...idsIn(o.brief()),
    ]),
  ];
  // A question is answered, not acted on: actions leave the menu (Qwen3 1.7B "fixed" things when asked what was wrong).
  const question = isQuestion(o.request);
  const offered = o.tools.list().filter((t) => policy(t) !== 'off' && !(question && t.effect === 'mutate'));
  const menu = selectMenu(o.request, offered);
  const maxSteps = o.maxSteps ?? 4;

  for (let step = 1; step <= maxSteps; step++) {
    o.signal?.throwIfAborted();
    emit({ type: 'phase', step, phase: 'deciding' });
    const state = stateText(o, steps);
    const options = [
      ...menu.map(optionText),
      "Reply to the steward now (the request is done, it's a question I can answer, or I need their input)",
    ];
    let chosen: AgentTool<unknown> | null = null;
    const intent = step === 1 ? plainIntent(o.request) : null;
    const routed = intent ? (menu.find((t) => t.name === intent) ?? null) : null;
    if (routed) chosen = routed;
    else
      try {
        const letter = stripThink(
          await o.llm.generate(decisionMessages(state, options), {
            maxTokens: 4,
            temperature: 0,
            grammar: choiceGrammar(options.length),
            signal: o.signal,
          }),
        ).trim();
        const i = LETTERS.indexOf(letter.charAt(0).toUpperCase());
        chosen = i >= 0 && i < menu.length ? menu[i]! : null;
      } catch (e) {
        // An unreadable decision falls back to replying (chosen stays null).
        if (o.signal?.aborted) throw e;
      }
    emit({ type: 'decision', step, chosen: chosen?.name ?? REPLY, routed: !!routed });
    if (!chosen) break;

    // Fill the arguments.
    emit({ type: 'phase', step, phase: 'filling' });
    const offeredArgs = chosen.llmArgs
      ? {
          ...chosen.input,
          properties: Object.fromEntries(
            Object.entries(chosen.input.properties ?? {}).filter(([k]) => chosen!.llmArgs!.includes(k)),
          ),
        }
      : chosen.input;
    const base = o.narrow ? o.narrow(chosen, offeredArgs, o.request) : offeredArgs;
    const schema = narrowIds(base, known, named);
    let args: Record<string, unknown> | null = null;
    let errors: string[] = [];
    const props = Object.keys(schema.properties ?? {});
    for (let attempt = 0; attempt < 2 && props.length; attempt++) {
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: PROMPTS.args,
        },
        {
          role: 'user',
          content: `${state}\n\nTool: ${chosen.name}: ${chosen.description}\nArguments:\n${describeArgs(schema)}${errors.length ? `\n\nYour last try was rejected: ${errors.join('; ')}. Fix it.` : ''}\n\nWrite the arguments for this call.`,
        },
      ];
      try {
        const raw = await o.llm.generate(messages, {
          maxTokens: 160,
          temperature: 0,
          grammar: argsGrammar(schema),
          signal: o.signal,
        });
        const parsed = parseJson(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
          throw new Error('not a JSON object');
        const candidate = dropNulls(parsed as Record<string, unknown>);
        const err = checkArgs(schema, candidate);
        if (!err) {
          args = candidate;
          break;
        }
        errors = [err];
      } catch (e) {
        if (o.signal?.aborted) throw e;
        errors = [(e as Error).message];
      }
    }
    if (!props.length) args = {};
    const call: ToolCall = { step, tool: chosen.name, args: args ?? {}, effect: chosen.effect };
    if (!args) {
      const record: StepRecord = {
        call,
        ok: false,
        observation: '',
        error: `Could not write valid arguments (${errors.join('; ')})`,
      };
      steps.push(record);
      emit({ type: 'result', record });
      continue;
    }
    // The same call twice in a turn adds nothing: answer instead.
    if (
      steps.some(
        (s) => s.ok && s.call.tool === call.tool && JSON.stringify(s.call.args) === JSON.stringify(call.args),
      )
    )
      break;
    emit({ type: 'call', call });

    if (chosen.effect === 'mutate' && policy(chosen) === 'ask') {
      const approved = o.approve ? await o.approve(call) : false;
      emit({ type: 'approval', call, approved });
      if (!approved) {
        const record: StepRecord = {
          call,
          ok: false,
          observation: '',
          error: 'The steward declined this action.',
        };
        steps.push(record);
        emit({ type: 'result', record });
        break;
      }
    }

    emit({ type: 'phase', step, phase: 'running' });
    const r = await o.tools.call(chosen.name, args);
    const record: StepRecord = r.ok
      ? { call, ok: true, observation: observe(r.result), result: r.result }
      : { call, ok: false, observation: '', error: r.error };
    steps.push(record);
    for (const id of idsIn(record.observation)) {
      if (!named.includes(id)) named.push(id);
      if (!known.includes(id)) known.unshift(id);
    }
    emit({ type: 'result', record });
    // One action per request: after it succeeds the turn answers, and the steward asks for the next one.
    // Small models otherwise kept "fixing" what the action had just created.
    if (record.ok && chosen.effect === 'mutate') break;
    // The tool the request plainly asked for has answered it ("where is it?" → object_select).
    if (record.ok && routed === chosen && chosen.effect !== 'read') break;
  }

  o.signal?.throwIfAborted();
  emit({ type: 'phase', step: steps.length + 1, phase: 'answering' });
  const results = steps.length
    ? steps
        .map(
          (s, i) =>
            `${i + 1}. ${s.call.effect === 'mutate' ? 'ACTION' : s.call.effect === 'view' ? 'Did' : 'Looked up'} ${s.call.tool} ${JSON.stringify(s.call.args)}: ${s.ok ? s.observation : `FAILED (${s.error})`}`,
        )
        .join('\n')
    : 'No tools were used.';
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: PROMPTS.reply,
    },
    {
      role: 'user',
      content: `${o.request}${
        o.history?.length
          ? `\n\n[Earlier]\n${o.history
              .slice(-2)
              .map((m) => `${m.role === 'user' ? 'Steward' : 'You'}: ${m.content.slice(0, 200)}`)
              .join('\n')}`
          : ''
      }\n\n[City now]\n${o.brief()}\n\n[What you did this turn]\n${results}`,
    },
  ];
  let streamed = '';
  const raw = await o.llm.generate(
    messages,
    { maxTokens: 220, temperature: 0.2, signal: o.signal },
    (piece) => {
      streamed += piece;
      emit({ type: 'delta', text: piece });
    },
  );
  return { answer: stripThink(raw || streamed), steps };
}
