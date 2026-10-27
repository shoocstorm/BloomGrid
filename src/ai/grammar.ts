import type { JsonSchema } from '@/core/AgentTools';

/**
 * GBNF grammars for the assistant's constrained steps (after Andai's `agent/tools/validate.ts`). Small local
 * models can't be trusted to write tool calls free-form, so the model never names a tool: it picks a letter
 * (`choiceGrammar`), and the only free text, the arguments, is held to the tool's shape (`argsGrammar`).
 * Both engines honour them: llama.cpp in wllama, and the native engine's DFA (`src-tauri/src/llm/grammar.rs`),
 * which takes a choice of literals or any grammar without recursion. A grammar is a UX aid, not a
 * guarantee: arguments are still validated (`checkArgs`) before a tool runs.
 */

export const LETTERS = 'ABCDEFGHIJKLMNOP';

const lit = (s: string) => JSON.stringify(s);
/** A GBNF literal matching the JSON text of `s`, e.g. "\"Westbrook\"". */
const jsonLit = (s: string | number) => lit(JSON.stringify(s));

/** `root ::= "A" | "B" | …` for `n` options. */
export function choiceGrammar(n: number): string {
  return `root ::= ${LETTERS.slice(0, n)
    .split('')
    .map((l) => lit(l))
    .join(' | ')}`;
}

function propGrammar(p: JsonSchema): string {
  if (p.enum) return `(${p.enum.map(jsonLit).join(' | ')})`;
  switch (p.type) {
    case 'integer':
      return p.minimum !== undefined && p.minimum >= 0 ? 'uint' : 'int';
    case 'number':
      return 'num';
    case 'boolean':
      return '("true" | "false")';
    default:
      return 'string';
  }
}

/**
 * GBNF for one JSON object with every property of `schema`: required ones first, then the optional ones,
 * each of which may be `null` (dropped before validation, `dropNulls`). Fixing the key order keeps the
 * grammar free of recursion and the model on rails.
 */
export function argsGrammar(schema: JsonSchema): string {
  const props = orderedProps(schema);
  if (!props.length) return 'root ::= "{}"';
  const req = new Set(schema.required ?? []);
  const fields = props.map(
    ([k, p]) => `${jsonLit(k)} ws ":" ws ${req.has(k) ? propGrammar(p) : `("null" | ${propGrammar(p)})`}`,
  );
  return [
    `root ::= "{" ws ${fields.join(' ws "," ws ')} ws "}"`,
    'string ::= "\\"" ( [^"\\\\\\x7F\\x00-\\x1F] | "\\\\" ["\\\\/bfnrt] ){0,200} "\\""',
    'uint ::= [0-9]{1,7}',
    'int ::= "-"? [0-9]{1,7}',
    'num ::= "-"? [0-9]{1,6} ("." [0-9]{1,3})?',
    'ws ::= [ \\t\\n]{0,3}',
  ].join('\n');
}

/** Properties in grammar order: required first, then optional, each in declaration order. */
export function orderedProps(schema: JsonSchema): [string, JsonSchema][] {
  const all = Object.entries(schema.properties ?? {});
  const req = new Set(schema.required ?? []);
  return [...all.filter(([k]) => req.has(k)), ...all.filter(([k]) => !req.has(k))];
}

/** Arguments as the model wrote them, minus the optional ones it set to null. */
export function dropNulls(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  );
}
