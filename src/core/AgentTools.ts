/**
 * Agent tools: named, schema-described functions over the game that an LLM (function calling), a scripted
 * agent, the debug console or a test can call with plain JSON. Modules register tools; hosts list `specs()`
 * in the shape Claude's tool use expects (`name`, `description`, `input_schema`) and route the model's calls
 * to `call()`. Results are JSON-serialisable. Tools that change game state must go through commands.
 */

/** The JSON Schema subset tool inputs use. */
export interface JsonSchema {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description?: string;
  enum?: readonly (string | number)[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  minimum?: number;
  maximum?: number;
}

/** `read` only queries; `view` moves the camera or HUD; `mutate` changes the city (hosts may ask first). */
export type ToolEffect = 'read' | 'view' | 'mutate';

export interface AgentTool<Ctx, A = Record<string, unknown>> {
  /** Lower snake case, `[a-z0-9_]{1,64}` (valid for every major LLM API). */
  name: string;
  description: string;
  /** One short line for a menu of choices (small models pick a tool from these); defaults to the description's first sentence. */
  option?: string;
  input: JsonSchema & { type: 'object' };
  /**
   * The arguments a model is asked to write (the rest stay for scripts and slash commands). Small models fill
   * every optional field they are shown, often with junk, so a tool with many options offers the few that matter.
   */
  llmArgs?: readonly string[];
  /** Extra words a request may use for this tool (menu selection matches them, e.g. `pause` for set_speed). */
  keywords?: readonly string[];
  effect: ToolEffect;
  run(ctx: Ctx, args: A): unknown;
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

export type ToolResult = { ok: true; result: unknown } | { ok: false; error: string };

/** Returns an error message for the first mismatch of `value` against `schema`, or null. */
export function checkArgs(schema: JsonSchema, value: unknown, path = 'input'): string | null {
  if (value === undefined) return null;
  const t = schema.type;
  if (t === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return `${path} must be an object`;
    const v = value as Record<string, unknown>;
    for (const r of schema.required ?? []) if (v[r] === undefined) return `${path}.${r} is required`;
    for (const [k, s] of Object.entries(schema.properties ?? {})) {
      const e = checkArgs(s, v[k], `${path}.${k}`);
      if (e) return e;
    }
    return null;
  }
  if (t === 'array') {
    if (!Array.isArray(value)) return `${path} must be an array`;
    for (let i = 0; i < value.length; i++) {
      const e = schema.items ? checkArgs(schema.items, value[i], `${path}[${i}]`) : null;
      if (e) return e;
    }
    return null;
  }
  if (t === 'number' || t === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${path} must be a number`;
    if (t === 'integer' && !Number.isInteger(value)) return `${path} must be an integer`;
    if (schema.minimum !== undefined && value < schema.minimum) return `${path} must be ≥ ${schema.minimum}`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${path} must be ≤ ${schema.maximum}`;
  } else if (t === 'string' && typeof value !== 'string') return `${path} must be a string`;
  else if (t === 'boolean' && typeof value !== 'boolean') return `${path} must be a boolean`;
  if (schema.enum && !schema.enum.includes(value as string | number))
    return `${path} must be one of ${schema.enum.join(', ')}`;
  return null;
}

export class AgentToolRegistry<Ctx> {
  private tools = new Map<string, AgentTool<Ctx>>();

  constructor(private ctx: Ctx) {}

  register<A>(tool: AgentTool<Ctx, A>): void {
    if (!/^[a-z0-9_]{1,64}$/.test(tool.name)) throw new Error(`Bad tool name "${tool.name}"`);
    if (this.tools.has(tool.name)) throw new Error(`Tool "${tool.name}" already registered`);
    this.tools.set(tool.name, tool as unknown as AgentTool<Ctx>);
  }

  get(name: string): AgentTool<Ctx> | undefined {
    return this.tools.get(name);
  }

  list(): AgentTool<Ctx>[] {
    return [...this.tools.values()];
  }

  /** Tool definitions for an LLM request, optionally limited to some effects (e.g. read-only advisors). */
  specs(effects?: readonly ToolEffect[]): ToolSpec[] {
    return this.list()
      .filter((t) => !effects || effects.includes(t.effect))
      .map((t) => ({ name: t.name, description: t.description, input_schema: t.input }));
  }

  /** Validates and runs a tool. Never throws: errors come back as `{ ok: false }` for the model to read. */
  async call(name: string, args: unknown = {}): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, error: `Unknown tool "${name}"` };
    const err = checkArgs(tool.input, args ?? {});
    if (err) return { ok: false, error: err };
    try {
      return { ok: true, result: await tool.run(this.ctx, (args ?? {}) as Record<string, unknown>) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
