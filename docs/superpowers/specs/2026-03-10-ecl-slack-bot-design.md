# ECL Slack Bot Design

## Overview

A Slack bot that listens for ECL expressions, formats them, adds display terms, and reports errors/warnings inline. Lives in the monorepo as `packages/ecl-slack-bot/`, consuming `ecl-core` directly.

## Triggers

- **Slash command** (`/ecl <expression>`) — response is ephemeral (private to user)
- **@mention** (`@ECL Bot <expression>`) — response is a thread reply (visible to all)
- Both support `--eval` flag for evaluation and `--edition <code|uri>` for edition override
- Empty input or `help` → ephemeral help message showing usage

## Package Structure

```
packages/ecl-slack-bot/
├── src/
│   ├── app.ts              # Bolt.js setup, slash command + mention handlers
│   ├── ecl-processor.ts    # Orchestrates ecl-core: parse → format → lookup → validate
│   ├── message-builder.ts  # Builds Slack mrkdwn output
│   └── config.ts           # Env var loading + edition alias map
├── test/
│   ├── ecl-processor.test.ts
│   └── message-builder.test.ts
├── package.json
└── tsconfig.json
```

## Dependencies

- `ecl-core` (workspace)
- `@slack/bolt`
- `dotenv`

## Deployment

Uses Bolt.js Socket Mode (`SLACK_APP_TOKEN`), requiring a long-lived process. Run as a Docker container or systemd service. No HTTP endpoint needed — Socket Mode uses WebSocket.

## ECL Processor Pipeline

Given raw ECL text and options (`{ evaluate: boolean, edition?: string }`), returns:

```typescript
interface ProcessResult {
  formatted: string;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  evaluation?: EvaluationResult;
  edition: string; // Resolved edition label or "Server default"
}

// Presentation type — mapped from ecl-core's ParseError/CoreDiagnostic types
interface Diagnostic {
  line: number; // 1-indexed (matches user-facing display)
  column: number; // 1-indexed
  endColumn: number; // 1-indexed
  message: string;
  severity: 'error' | 'warning';
}

interface EvaluationResult {
  count: number;
  sample: string[]; // First ~5 concept terms
}
```

**Pipeline steps (in order):**

1. **Parse** — `parseECL(text)` → AST + syntax errors (`ParseError[]`)
2. **Refine errors** — `refineParseError(ctx: ErrorContext)` for user-friendly messages. Construct `ErrorContext` with `error` from step 1, `lines: [text]` (single expression), `docLineIndex: 0`, `lineOffsets: [0]`, `startLine: 0`. For multi-line expressions, split by `\n` and compute line offsets accordingly.
3. **Extract concepts** — `extractConceptIds(ast)` → all concept IDs
4. **FHIR batch lookup** — `terminologyService.validateConcepts(conceptIds)` → `Map<string, ConceptInfo | null>` with FSN/PT and active status. Uses bulk `$expand` with fallback to individual `$lookup`, respects LRU cache.
5. **Add display terms** — Use the refactoring module's `resolveAddDisplayTerms()` pattern: iterate concept references from the AST, for each bare concept ID (no existing display term), look up FSN from step 4's results, and inject `|term|` via string replacement. Implemented directly in `ecl-processor.ts` (not via the `CoreCodeAction` mechanism, which is editor-oriented).
6. **Format** — `formatDocument(text, options: FormattingOptions)` with default config. Runs _after_ display term injection so the formatter can properly space the `|term|` pipes.
7. **Concept warnings** — from step 4's results, flag inactive concepts (with replacement suggestion if available) and unknown concepts
8. **Semantic validation** — `validateSemantics()` for attribute scope, empty sub-expressions. Note: this makes additional FHIR calls per attribute, adding latency. Acceptable for a bot (users expect a few seconds), and results are cached.
9. **Evaluate (opt-in)** — `terminologyService.evaluateEcl(expression)` for concept count + sample terms via `$expand`. Only when `--eval` flag is used. Up to 15s timeout.

Steps 1-3 are instant. Steps 4-8 depend on FHIR (cached after first call). Step 9 up to 15s, only with `--eval`.

## FhirTerminologyService Instantiation

```typescript
const service = new FhirTerminologyService(
  config.fhirServerUrl,    // baseUrl (default: 'https://tx.ontoserver.csiro.au/fhir')
  2000,                    // timeout (ms per concept lookup)
  'ecl-slack-bot/1.0.0',  // userAgent (third param, NOT snomedVersion)
  config.snomedEdition,    // snomedVersion (optional, fourth param)
  (versionUri) => { ... }, // onResolvedVersion callback (capture resolved edition for display)
);
```

## Edition Aliases

ecl-core fetches editions dynamically via `getSnomedEditions()`, but the bot needs instant shorthand resolution. Define a static alias map in `config.ts`:

```typescript
const EDITION_ALIASES: Record<string, string> = {
  int: 'http://snomed.info/sct/900000000000207008',
  au: 'http://snomed.info/sct/32506021000036107',
  us: 'http://snomed.info/sct/731000124108',
  uk: 'http://snomed.info/sct/83821000000107',
  nz: 'http://snomed.info/sct/21000210109',
};
```

If `--edition` value is a key in this map, resolve to the URI. If it looks like a full URI (`http://...`), use it directly. Otherwise, return an error.

## Message Format

**Pointer-style for syntax errors + emoji list for warnings.**

Error pointers are generated by: computing column offset from the `ParseError`'s `column` in the _original_ input (before formatting), then generating `^` characters spanning `column` to `endColumn`. Since formatting may shift columns, pointers are generated against the _formatted_ output by mapping error positions through the formatter. If mapping is unreliable, fall back to listing errors without pointers (emoji-list only). This is a v2 enhancement — **v1 uses emoji-list only for all diagnostics** to keep the initial implementation simple.

Clean expression:

````
*Formatted ECL*
```< 404684003 |Clinical finding|
  AND < 19829001 |Disorder of lung|```
✅ No issues found
📖 Edition: SNOMED CT Australian (http://snomed.info/sct/32506021000036107)
````

Syntax errors:

````
*Formatted ECL*
```< 404684003 |Clinical finding| AND AND < 19829001```
🔴 *Errors*
• Line 1:37 — Duplicate operator `AND`
📖 Edition: Server default
````

Concept warnings:

````
*Formatted ECL*
```< 404684003 |Clinical finding|
  AND < 399144008 |Bronze diabetes|```
⚠️ *Warnings*
• `399144008 |Bronze diabetes|` — Inactive concept
📖 Edition: SNOMED CT International
````

With evaluation:

```
📊 *Evaluation* — 1,247 concepts matched
  `73211009 |Diabetes mellitus|`, `44054006 |Type 2 diabetes|`, `46635009 |Type 1 diabetes|` …
```

**Slack limits:** Block text is 3,000 chars. If the formatted ECL exceeds this, truncate with `… (truncated)` and still show all diagnostics. Total message payload may use multiple blocks if needed.

## Multi-line Expression Handling

Slack preserves newlines in both slash command text and message text. Multi-line ECL is parsed as-is. The `parseECL()` function and `formatDocument()` both handle multi-line input natively.

## Flag Parsing

Hand-roll simple flag extraction in `ecl-processor.ts` — scan for `--eval` and `--edition <value>` at the start of the input string, strip them, and pass the remainder as ECL. No library needed. ECL syntax never starts with `--`, so there is no ambiguity. If `--edition` has no value after it, return an error.

## Help Message

Triggered by empty input, `help`, or bare @mention. Always ephemeral (private).

```
*ECL Bot Usage*

*Slash command (private response):*
• `/ecl < 404684003 |Clinical finding|`
• `/ecl --eval < 404684003` — include evaluation
• `/ecl --edition au < 404684003` — specify edition

*@mention (thread reply):*
• `@ECL Bot < 404684003 AND < 19829001`
• `@ECL Bot --eval --edition us < 404684003`

*Options:*
• `--eval` — evaluate expression and show concept count
• `--edition <code|uri>` — override SNOMED edition (au, us, uk, nz, int, or full URI)
• `help` — show this message

Shorthand editions: int, au, us, uk, nz
```

## Configuration

| Variable           | Required | Default                               |
| ------------------ | -------- | ------------------------------------- |
| `SLACK_BOT_TOKEN`  | yes      | —                                     |
| `SLACK_APP_TOKEN`  | yes      | —                                     |
| `FHIR_SERVER_URL`  | no       | `https://tx.ontoserver.csiro.au/fhir` |
| `SNOMED_EDITION`   | no       | not specified (server default)        |
| `MAX_EVAL_RESULTS` | no       | `5`                                   |

Socket Mode only — no `SLACK_SIGNING_SECRET` needed.

Per-request `--edition` overrides `SNOMED_EDITION` env var. Supports shorthand aliases or full SNOMED URI.

## Error Handling

- FHIR unavailable → returns formatted ECL + syntax errors, adds note: "⚠️ Terminology server unavailable — concept validation and display terms skipped"
- Empty input → help message
- Slack API errors → logged to `console.error` (consistent with ecl-mcp-server), Bolt.js handles transient retries

## Rate Limiting

Relies on ecl-core's LRU concept cache (10,000 entries) and `validateConcepts`' bulk expansion. Slack's own rate limits provide natural ceiling. No additional rate limiting initially.

## Testing (~20-25 tests)

**ecl-processor.test.ts** (mock `ITerminologyService`):

- Valid ECL → formatted output with display terms
- Invalid ECL → errors in result (refined messages)
- Inactive concept → warning
- FHIR unavailable → graceful degradation (format + syntax only)
- `--eval` → evaluation result with count + samples
- Edition passed through correctly to FhirTerminologyService
- Multi-line expression handled

**message-builder.test.ts** (pure function, no mocks):

- Clean expression → code block + checkmark + edition footer
- Syntax errors → 🔴 list
- Concept warnings → ⚠️ list
- Evaluation → 📊 line with count + samples
- Edition footer always present
- Truncation at 3000 chars per block
- Mixed errors + warnings → correct ordering

No tests for `app.ts` — Bolt.js wiring verified by manual testing.
