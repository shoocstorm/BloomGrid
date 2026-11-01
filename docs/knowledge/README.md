# Seedvault knowledge docs

The guides shipped with BloomGrid's in-game knowledge base, **Seedvault** (press **?** or F1 in the game, or the
book in the top bar). Every `.md` file under this folder is bundled into the game and readable by Flora through
her `knowledge_catalog` / `knowledge_read` tools (D-088). This README and files or folders starting with `_` are
not bundled.

## Adding a doc

1. Create `docs/knowledge/<category>/<name>.md` with front matter:

   ```markdown
   ---
   id: runbook-fires # kebab-case, unique; other docs link to it as kb:runbook-fires
   title: Fire response
   category: runbooks # basics | systems | cause-effect | runbooks | playbooks
   summary: One or two sentences: what this doc answers (shown in search and to Flora).
   tags: [fire, ember watch, crews]
   related: [runbook-earthquake, reference-crises]
   covers: [fire, industrial-fire] # runbooks only: incident kinds; field logs link back here
   order: 10 # position inside the category (lower first)
   ---
   ```

2. Write the body in plain Markdown: `##` sections (Flora reads one section at a time, so give each a clear
   heading and keep it under ~800 characters), lists, tables, `> **Tip:**` / `> **Warning:**` / `> **Do:**` callouts.
3. Link other docs with `[text](kb:<id>)` (or a relative `.md` path). Don't copy numbers that live in code:
   link the live reference instead (`kb:reference-rules`, `kb:reference-crises`, `kb:reference-buildings-energy`…),
   which is generated from the game's registries.
4. `bun run test` checks every doc parses, has a known category and links only to docs that exist.

## Sources at a glance

| Source         | Where                                        | Written by                                 |
| -------------- | -------------------------------------------- | ------------------------------------------ |
| Guide          | this folder                                  | us (shipped with the game)                 |
| Live reference | `src/sim/knowledgeRefs.ts`                   | generated from the game's rules at runtime |
| Journal        | IndexedDB (web) / app data `knowledge/` (desktop) | the steward, Flora, and the city's field logs |
