# ECL Slack Bot Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Slack bot (`packages/ecl-slack-bot/`) that processes ECL expressions via slash commands and @mentions, returning formatted ECL with display terms, diagnostics, and optional evaluation.

**Architecture:** Bolt.js Socket Mode bot consuming `ecl-core` directly. Three source modules: `config.ts` (env + edition aliases), `ecl-processor.ts` (parse → format → validate pipeline), `message-builder.ts` (Slack mrkdwn output). `app.ts` wires Bolt.js handlers to the processor and builder.

**Tech Stack:** TypeScript, `@slack/bolt`, `dotenv`, `ecl-core` (workspace dep), Node.js `node:test` for testing.

**Design Spec:** `docs/superpowers/specs/2026-03-10-ecl-slack-bot-design.md`

---

## Chunk 1: Package Scaffolding + Config Module

### Task 1: Package scaffolding

**Files:**

- Create: `packages/ecl-slack-bot/package.json`
- Create: `packages/ecl-slack-bot/tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "ecl-slack-bot",
  "version": "1.0.0",
  "license": "Apache-2.0",
  "author": "Commonwealth Scientific and Industrial Research Organisation (CSIRO)",
  "repository": {
    "type": "git",
    "url": "https://github.com/aehrc/ecl-lsp.git",
    "directory": "packages/ecl-slack-bot"
  },
  "description": "Slack bot for SNOMED CT Expression Constraint Language",
  "main": "dist/app.js",
  "scripts": {
    "prepack": "node -e \"require('fs').copyFileSync('../../LICENSE','LICENSE')\"",
    "compile": "tsc -b",
    "watch": "tsc -b --watch",
    "clean": "rimraf dist",
    "test": "npm run compile && node --test dist/test/*.test.js",
    "start": "node dist/app.js"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "dependencies": {
    "ecl-core": "file:../ecl-core",
    "@slack/bolt": "^4.3.0",
    "dotenv": "^16.4.7"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "@types/node": "^20.10.6",
    "rimraf": "^5.0.5"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Register in root package.json**

Add `"packages/ecl-slack-bot"` to the `workspaces` array. Add these scripts:

```
"compile:slack-bot": "cd packages/ecl-slack-bot && npm run compile",
"test:slack-bot": "cd packages/ecl-slack-bot && npm test",
```

Add `npm run compile:slack-bot` to the end of the `compile` script chain (after `compile:client`).
Add `npm run test:slack-bot` to the end of the `test` script chain (after `test:editor`).

- [ ] **Step 4: Install dependencies**

Run: `npm install`

- [ ] **Step 5: Verify compilation (empty project compiles)**

Create a minimal `packages/ecl-slack-bot/src/config.ts` placeholder:

```typescript
// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

export {};
```

Run: `npm run compile:slack-bot`
Expected: Success (no errors)

- [ ] **Step 6: Commit**

```bash
git add packages/ecl-slack-bot/package.json packages/ecl-slack-bot/tsconfig.json packages/ecl-slack-bot/src/config.ts package.json package-lock.json
git commit -m "feat(slack-bot): scaffold ecl-slack-bot package"
```

---

### Task 2: Config module

**Files:**

- Create: `packages/ecl-slack-bot/src/config.ts`
- Create: `packages/ecl-slack-bot/src/test/config.test.ts`

- [ ] **Step 1: Write config tests**

```typescript
// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { resolveEdition, EDITION_ALIASES } from '../config';

describe('resolveEdition', () => {
  it('should resolve shorthand alias "au" to full URI', () => {
    const result = resolveEdition('au');
    assert.strictEqual(result, 'http://snomed.info/sct/32506021000036107');
  });

  it('should resolve shorthand alias "int" to full URI', () => {
    const result = resolveEdition('int');
    assert.strictEqual(result, 'http://snomed.info/sct/900000000000207008');
  });

  it('should resolve case-insensitive alias "AU"', () => {
    const result = resolveEdition('AU');
    assert.strictEqual(result, 'http://snomed.info/sct/32506021000036107');
  });

  it('should pass through a full URI unchanged', () => {
    const uri = 'http://snomed.info/sct/731000124108';
    const result = resolveEdition(uri);
    assert.strictEqual(result, uri);
  });

  it('should return null for unknown alias', () => {
    const result = resolveEdition('xx');
    assert.strictEqual(result, null);
  });

  it('should return undefined edition label when no edition configured', () => {
    // When SNOMED_EDITION is not set, edition is undefined
    assert.strictEqual(EDITION_ALIASES['int'], 'http://snomed.info/sct/900000000000207008');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:slack-bot`
Expected: FAIL — `resolveEdition` not defined

- [ ] **Step 3: Implement config.ts**

Replace the placeholder `config.ts` with:

```typescript
// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

export const EDITION_ALIASES: Record<string, string> = {
  int: 'http://snomed.info/sct/900000000000207008',
  au: 'http://snomed.info/sct/32506021000036107',
  us: 'http://snomed.info/sct/731000124108',
  uk: 'http://snomed.info/sct/83821000000107',
  nz: 'http://snomed.info/sct/21000210109',
};

/**
 * Resolve an edition alias or URI to a SNOMED CT edition URI.
 * Returns null if the value is neither a known alias nor a valid URI.
 */
export function resolveEdition(value: string): string | null {
  const lower = value.toLowerCase();
  if (EDITION_ALIASES[lower]) {
    return EDITION_ALIASES[lower];
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return null;
}

export interface AppConfig {
  slackBotToken: string;
  slackAppToken: string;
  fhirServerUrl: string;
  snomedEdition?: string;
  maxEvalResults: number;
}

export function loadConfig(): AppConfig {
  return {
    slackBotToken: process.env.SLACK_BOT_TOKEN ?? '',
    slackAppToken: process.env.SLACK_APP_TOKEN ?? '',
    fhirServerUrl: process.env.FHIR_SERVER_URL ?? 'https://tx.ontoserver.csiro.au/fhir',
    snomedEdition: process.env.SNOMED_EDITION || undefined,
    maxEvalResults: Number.parseInt(process.env.MAX_EVAL_RESULTS ?? '5', 10) || 5,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:slack-bot`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ecl-slack-bot/src/config.ts packages/ecl-slack-bot/src/test/config.test.ts
git commit -m "feat(slack-bot): add config module with edition aliases"
```

---

## Chunk 2: ECL Processor

### Task 3: Flag parsing + processor types

**Files:**

- Create: `packages/ecl-slack-bot/src/ecl-processor.ts`
- Create: `packages/ecl-slack-bot/src/test/ecl-processor.test.ts`

The processor is the core module. It parses flags from the input, runs the ECL through ecl-core, and returns a structured result. We'll build it incrementally: first the flag parser, then the processing pipeline.

- [ ] **Step 1: Write flag parsing tests**

```typescript
// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { parseInput } from '../ecl-processor';

describe('parseInput', () => {
  it('should extract bare ECL with no flags', () => {
    const result = parseInput('< 404684003 |Clinical finding|');
    assert.strictEqual(result.ecl, '< 404684003 |Clinical finding|');
    assert.strictEqual(result.evaluate, false);
    assert.strictEqual(result.edition, undefined);
  });

  it('should extract --eval flag', () => {
    const result = parseInput('--eval < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.evaluate, true);
  });

  it('should extract --edition flag with value', () => {
    const result = parseInput('--edition au < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.edition, 'au');
  });

  it('should extract both flags together', () => {
    const result = parseInput('--eval --edition us < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.evaluate, true);
    assert.strictEqual(result.edition, 'us');
  });

  it('should handle flags in any order', () => {
    const result = parseInput('--edition nz --eval < 404684003');
    assert.strictEqual(result.ecl, '< 404684003');
    assert.strictEqual(result.evaluate, true);
    assert.strictEqual(result.edition, 'nz');
  });

  it('should detect help input', () => {
    const result = parseInput('help');
    assert.strictEqual(result.ecl, '');
    assert.strictEqual(result.help, true);
  });

  it('should detect empty input as help', () => {
    const result = parseInput('');
    assert.strictEqual(result.ecl, '');
    assert.strictEqual(result.help, true);
  });

  it('should detect whitespace-only input as help', () => {
    const result = parseInput('   ');
    assert.strictEqual(result.ecl, '');
    assert.strictEqual(result.help, true);
  });

  it('should return error when --edition has no value', () => {
    const result = parseInput('--edition');
    assert.strictEqual(result.error, '--edition requires a value (e.g. --edition au)');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:slack-bot`
Expected: FAIL — `parseInput` not defined

- [ ] **Step 3: Implement parseInput and types in ecl-processor.ts**

```typescript
// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import {
  parseECL,
  formatDocument,
  defaultFormattingOptions,
  extractConceptIds,
  refineParseError,
  validateSemantics,
} from 'ecl-core';
import type { ITerminologyService, ConceptInfo } from 'ecl-core';

// ── Types ───────────────────────────────────────────────────────────────

export interface Diagnostic {
  line: number;
  column: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface EvaluationResult {
  count: number;
  sample: string[];
}

export interface ProcessResult {
  formatted: string;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  evaluation?: EvaluationResult;
  edition: string;
}

export interface ParsedInput {
  ecl: string;
  evaluate: boolean;
  edition?: string;
  help?: boolean;
  error?: string;
}

// ── Flag parsing ────────────────────────────────────────────────────────

export function parseInput(raw: string): ParsedInput {
  const trimmed = raw.trim();

  if (!trimmed || trimmed.toLowerCase() === 'help') {
    return { ecl: '', evaluate: false, help: true };
  }

  let evaluate = false;
  let edition: string | undefined;
  let rest = trimmed;

  // Consume flags from the beginning
  while (rest.startsWith('--')) {
    if (rest.startsWith('--eval')) {
      evaluate = true;
      rest = rest.slice('--eval'.length).trimStart();
    } else if (rest.startsWith('--edition')) {
      rest = rest.slice('--edition'.length).trimStart();
      if (!rest || rest.startsWith('--')) {
        return { ecl: '', evaluate: false, error: '--edition requires a value (e.g. --edition au)' };
      }
      // Extract next word as edition value
      const spaceIdx = rest.search(/\s/);
      if (spaceIdx === -1) {
        return { ecl: '', evaluate: false, error: '--edition requires a value (e.g. --edition au)' };
      }
      edition = rest.slice(0, spaceIdx);
      rest = rest.slice(spaceIdx).trimStart();
    } else {
      break; // Unknown flag — treat rest as ECL
    }
  }

  return { ecl: rest, evaluate, edition };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:slack-bot`
Expected: All flag parsing tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ecl-slack-bot/src/ecl-processor.ts packages/ecl-slack-bot/src/test/ecl-processor.test.ts
git commit -m "feat(slack-bot): add flag parsing for ECL input"
```

---

### Task 4: Process pipeline — syntax-only path (no FHIR)

**Files:**

- Modify: `packages/ecl-slack-bot/src/ecl-processor.ts`
- Modify: `packages/ecl-slack-bot/src/test/ecl-processor.test.ts`

- [ ] **Step 1: Add process pipeline tests (syntax-only)**

Append to `ecl-processor.test.ts`:

```typescript
import { processEcl } from '../ecl-processor';
import type { ITerminologyService, ConceptInfo, EvaluationResponse } from 'ecl-core';

// ── Mock terminology service ────────────────────────────────────────────

function createMockService(overrides?: Partial<ITerminologyService>): ITerminologyService {
  return {
    getConceptInfo: async () => null,
    validateConcepts: async () => new Map(),
    searchConcepts: async () => ({ results: [], hasMore: false }),
    evaluateEcl: async (): Promise<EvaluationResponse> => ({ total: 0, concepts: [], truncated: false }),
    ...overrides,
  };
}

describe('processEcl', () => {
  it('should format valid ECL and return no errors', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003', service);
    assert.strictEqual(result.errors.length, 0);
    assert.ok(result.formatted.includes('404684003'));
  });

  it('should return syntax errors for invalid ECL', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003 AND AND < 19829001', service);
    assert.ok(result.errors.length > 0);
    assert.strictEqual(result.errors[0].severity, 'error');
  });

  it('should format multi-line ECL', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003\n  AND < 19829001', service);
    assert.strictEqual(result.errors.length, 0);
    assert.ok(result.formatted.includes('404684003'));
    assert.ok(result.formatted.includes('19829001'));
  });

  it('should include default edition label', async () => {
    const service = createMockService();
    const result = await processEcl('< 404684003', service);
    assert.strictEqual(result.edition, 'Server default');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:slack-bot`
Expected: FAIL — `processEcl` not defined

- [ ] **Step 3: Implement processEcl (syntax + format path)**

Add to `ecl-processor.ts`:

```typescript
// ── Process pipeline ────────────────────────────────────────────────────

export async function processEcl(
  ecl: string,
  terminologyService: ITerminologyService,
  options?: { evaluate?: boolean; edition?: string },
): Promise<ProcessResult> {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  let editionLabel = 'Server default';

  // Step 1: Parse
  const parseResult = parseECL(ecl);

  // Step 2: Refine syntax errors
  const lines = ecl.split('\n');
  // lineOffsets maps expression-local line indices to document line indices.
  // Since the bot input IS the full document, this is an identity mapping.
  const lineOffsets = lines.map((_line, i) => i);
  for (const err of parseResult.errors) {
    const ctx = {
      error: err,
      lines,
      docLineIndex: err.line - 1,
      lineOffsets,
      startLine: 0,
    };
    const refined = refineParseError(ctx);
    errors.push({
      line: refined.docLineIndex + 1,
      column: refined.startChar + 1,
      endColumn: refined.endChar + 1,
      message: refined.message,
      severity: 'error',
    });
  }

  // Step 3: Extract concepts
  const conceptIds = parseResult.ast ? extractConceptIds(parseResult.ast) : [];

  // Step 4: FHIR batch lookup (graceful on failure)
  let conceptMap = new Map<string, ConceptInfo | null>();
  try {
    if (conceptIds.length > 0) {
      conceptMap = await terminologyService.validateConcepts(conceptIds.map((c) => c.id));
    }
  } catch {
    warnings.push({
      line: 1,
      column: 1,
      endColumn: 1,
      message: 'Terminology server unavailable — concept validation and display terms skipped',
      severity: 'warning',
    });
  }

  // Step 5: Add display terms (inject FSN for bare concept IDs)
  // AST Position has { line, column, offset } where offset is the byte offset
  // from the start of the input string. Process in reverse offset order to
  // preserve earlier positions when inserting text.
  let withTerms = ecl;
  if (conceptMap.size > 0 && parseResult.ast) {
    const refs = extractConceptIds(parseResult.ast);
    const sortedRefs = [...refs].sort((a, b) => b.range.start.offset - a.range.start.offset);
    for (const ref of sortedRefs) {
      if (!ref.term) {
        const info = conceptMap.get(ref.id);
        if (info) {
          // Replace bare concept ID with ID + display term
          const startOffset = ref.range.start.offset;
          const endOffset = ref.range.end.offset;
          const replacement = `${ref.id} |${info.fsn}|`;
          withTerms = withTerms.slice(0, startOffset) + replacement + withTerms.slice(endOffset);
        }
      }
    }
  }

  // Step 6: Format
  const formatted = formatDocument(withTerms, defaultFormattingOptions);

  // Step 7: Concept warnings
  // AST Position.line is 1-indexed (from ANTLR), column is 0-indexed
  for (const ref of conceptIds) {
    const info = conceptMap.get(ref.id);
    if (info && !info.active) {
      warnings.push({
        line: ref.range.start.line,
        column: ref.range.start.column + 1,
        endColumn: ref.range.end.column + 1,
        message: `${ref.id}${ref.term ? ` |${ref.term}|` : ''} — Inactive concept`,
        severity: 'warning',
      });
    } else if (conceptMap.has(ref.id) && info === null) {
      warnings.push({
        line: ref.range.start.line,
        column: ref.range.start.column + 1,
        endColumn: ref.range.end.column + 1,
        message: `${ref.id}${ref.term ? ` |${ref.term}|` : ''} — Unknown concept`,
        severity: 'warning',
      });
    }
  }

  // Step 8: Semantic validation (graceful on failure)
  if (parseResult.ast) {
    try {
      const semanticDiags = await validateSemantics(parseResult.ast, ecl, terminologyService);
      for (const diag of semanticDiags) {
        warnings.push({
          line: diag.range.start.line,
          column: diag.range.start.column + 1,
          endColumn: diag.range.end.column + 1,
          message: diag.message,
          severity: 'warning',
        });
      }
    } catch {
      // Semantic validation failure is non-fatal
    }
  }

  // Step 9: Evaluate (opt-in)
  let evaluation: EvaluationResult | undefined;
  if (options?.evaluate && parseResult.errors.length === 0) {
    try {
      const evalResponse = await terminologyService.evaluateEcl(ecl);
      evaluation = {
        count: evalResponse.total,
        sample: evalResponse.concepts.slice(0, 5).map((c) => `${c.code} |${c.display}|`),
      };
    } catch {
      warnings.push({
        line: 1,
        column: 1,
        endColumn: 1,
        message: 'Evaluation failed — terminology server error or timeout',
        severity: 'warning',
      });
    }
  }

  // Edition label
  if (options?.edition) {
    editionLabel = options.edition;
  }

  return { formatted, errors, warnings, evaluation, edition: editionLabel };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:slack-bot`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ecl-slack-bot/src/ecl-processor.ts packages/ecl-slack-bot/src/test/ecl-processor.test.ts
git commit -m "feat(slack-bot): add ECL processor pipeline"
```

---

### Task 5: Process pipeline — FHIR-dependent paths

**Files:**

- Modify: `packages/ecl-slack-bot/src/test/ecl-processor.test.ts`

- [ ] **Step 1: Add FHIR-dependent tests**

Append to the `processEcl` describe block in `ecl-processor.test.ts`:

```typescript
it('should add display terms from FHIR lookup', async () => {
  const service = createMockService({
    validateConcepts: async (ids: string[]) => {
      const map = new Map<string, ConceptInfo | null>();
      if (ids.includes('404684003')) {
        map.set('404684003', {
          id: '404684003',
          fsn: 'Clinical finding (finding)',
          pt: 'Clinical finding',
          active: true,
        });
      }
      return map;
    },
  });
  const result = await processEcl('< 404684003', service);
  assert.ok(result.formatted.includes('Clinical finding'));
});

it('should warn about inactive concepts', async () => {
  const service = createMockService({
    validateConcepts: async () => {
      const map = new Map<string, ConceptInfo | null>();
      map.set('399144008', {
        id: '399144008',
        fsn: 'Bronze diabetes (disorder)',
        pt: 'Bronze diabetes',
        active: false,
      });
      return map;
    },
  });
  const result = await processEcl('< 399144008 |Bronze diabetes|', service);
  assert.ok(result.warnings.some((w) => w.message.includes('Inactive concept')));
});

it('should degrade gracefully when FHIR is unavailable', async () => {
  const service = createMockService({
    validateConcepts: async () => {
      throw new Error('Connection refused');
    },
  });
  const result = await processEcl('< 404684003', service);
  // Still formats successfully
  assert.ok(result.formatted.includes('404684003'));
  // Adds a warning about unavailability
  assert.ok(result.warnings.some((w) => w.message.includes('Terminology server unavailable')));
});

it('should include evaluation results when --eval is used', async () => {
  const service = createMockService({
    evaluateEcl: async () => ({
      total: 3,
      concepts: [
        { code: '73211009', display: 'Diabetes mellitus' },
        { code: '44054006', display: 'Type 2 diabetes mellitus' },
        { code: '46635009', display: 'Type 1 diabetes mellitus' },
      ],
      truncated: false,
    }),
  });
  const result = await processEcl('< 404684003', service, { evaluate: true });
  assert.ok(result.evaluation);
  assert.strictEqual(result.evaluation!.count, 3);
  assert.strictEqual(result.evaluation!.sample.length, 3);
});

it('should not evaluate when there are syntax errors', async () => {
  const service = createMockService({
    evaluateEcl: async () => {
      throw new Error('should not be called');
    },
  });
  const result = await processEcl('< 404684003 AND AND', service, { evaluate: true });
  assert.ok(result.errors.length > 0);
  assert.strictEqual(result.evaluation, undefined);
});

it('should pass edition label through to result', async () => {
  const service = createMockService();
  const result = await processEcl('< 404684003', service, { edition: 'SNOMED CT Australian' });
  assert.strictEqual(result.edition, 'SNOMED CT Australian');
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm run test:slack-bot`
Expected: All tests PASS (the implementation from Task 4 already handles these paths)

- [ ] **Step 3: Commit**

```bash
git add packages/ecl-slack-bot/src/test/ecl-processor.test.ts
git commit -m "test(slack-bot): add FHIR-dependent processor tests"
```

---

## Chunk 3: Message Builder

### Task 6: Message builder

**Files:**

- Create: `packages/ecl-slack-bot/src/message-builder.ts`
- Create: `packages/ecl-slack-bot/src/test/message-builder.test.ts`

The message builder is a pure function — takes a `ProcessResult` and produces Slack mrkdwn text. No mocks needed.

- [ ] **Step 1: Write message builder tests**

````typescript
// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { buildMessage, buildHelpMessage } from '../message-builder';
import type { ProcessResult } from '../ecl-processor';

describe('buildMessage', () => {
  it('should show formatted ECL in a code block', () => {
    const result: ProcessResult = {
      formatted: '< 404684003 |Clinical finding (finding)|',
      errors: [],
      warnings: [],
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes('```'));
    assert.ok(msg.includes('404684003'));
  });

  it('should show checkmark when no issues', () => {
    const result: ProcessResult = {
      formatted: '< 404684003',
      errors: [],
      warnings: [],
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes('No issues found'));
  });

  it('should show errors with red circle emoji', () => {
    const result: ProcessResult = {
      formatted: '< 404684003 AND AND < 19829001',
      errors: [{ line: 1, column: 17, endColumn: 20, message: 'Duplicate operator `AND`', severity: 'error' }],
      warnings: [],
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes(':red_circle:'));
    assert.ok(msg.includes('Duplicate operator'));
    assert.ok(msg.includes('Line 1:17'));
  });

  it('should show warnings with warning emoji', () => {
    const result: ProcessResult = {
      formatted: '< 399144008 |Bronze diabetes|',
      errors: [],
      warnings: [
        {
          line: 1,
          column: 3,
          endColumn: 12,
          message: '399144008 |Bronze diabetes| — Inactive concept',
          severity: 'warning',
        },
      ],
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes(':warning:'));
    assert.ok(msg.includes('Inactive concept'));
  });

  it('should show evaluation results with chart emoji', () => {
    const result: ProcessResult = {
      formatted: '< 404684003',
      errors: [],
      warnings: [],
      evaluation: { count: 1247, sample: ['73211009 |Diabetes mellitus|', '44054006 |Type 2 diabetes|'] },
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes(':bar_chart:'));
    assert.ok(msg.includes('1,247'));
    assert.ok(msg.includes('Diabetes mellitus'));
  });

  it('should always show edition footer', () => {
    const result: ProcessResult = {
      formatted: '< 404684003',
      errors: [],
      warnings: [],
      edition: 'SNOMED CT Australian',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes(':book:'));
    assert.ok(msg.includes('SNOMED CT Australian'));
  });

  it('should show both errors and warnings in correct order', () => {
    const result: ProcessResult = {
      formatted: '< 404684003',
      errors: [{ line: 1, column: 1, endColumn: 5, message: 'Syntax error', severity: 'error' }],
      warnings: [{ line: 1, column: 3, endColumn: 12, message: 'Inactive concept', severity: 'warning' }],
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    const errorIdx = msg.indexOf(':red_circle:');
    const warnIdx = msg.indexOf(':warning:');
    assert.ok(errorIdx < warnIdx, 'Errors should appear before warnings');
  });

  it('should truncate formatted ECL exceeding 2900 chars', () => {
    const longEcl = '< ' + '404684003 '.repeat(400);
    const result: ProcessResult = {
      formatted: longEcl,
      errors: [],
      warnings: [],
      edition: 'Server default',
    };
    const msg = buildMessage(result);
    assert.ok(msg.includes('… (truncated)'));
  });
});

describe('buildHelpMessage', () => {
  it('should include slash command usage', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('/ecl'));
  });

  it('should include @mention usage', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('@ECL Bot'));
  });

  it('should include --eval flag documentation', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('--eval'));
  });

  it('should include --edition flag documentation', () => {
    const msg = buildHelpMessage();
    assert.ok(msg.includes('--edition'));
  });
});
````

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:slack-bot`
Expected: FAIL — `buildMessage` and `buildHelpMessage` not defined

- [ ] **Step 3: Implement message-builder.ts**

```typescript
// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { ProcessResult } from './ecl-processor';

const MAX_CODE_BLOCK_LENGTH = 2900;

export function buildMessage(result: ProcessResult): string {
  const sections: string[] = [];

  // Formatted ECL code block
  let ecl = result.formatted;
  if (ecl.length > MAX_CODE_BLOCK_LENGTH) {
    ecl = ecl.slice(0, MAX_CODE_BLOCK_LENGTH) + '\n… (truncated)';
  }
  sections.push(`*Formatted ECL*\n\`\`\`${ecl}\`\`\``);

  // Errors
  if (result.errors.length > 0) {
    const lines = result.errors.map((e) => `\u2022 Line ${e.line}:${e.column} \u2014 ${e.message}`);
    sections.push(`:red_circle: *Errors*\n${lines.join('\n')}`);
  }

  // Warnings
  if (result.warnings.length > 0) {
    const lines = result.warnings.map((w) => `\u2022 ${w.message}`);
    sections.push(`:warning: *Warnings*\n${lines.join('\n')}`);
  }

  // No issues
  if (result.errors.length === 0 && result.warnings.length === 0) {
    sections.push(':white_check_mark: No issues found');
  }

  // Evaluation
  if (result.evaluation) {
    const count = result.evaluation.count.toLocaleString('en-US');
    let evalText = `:bar_chart: *Evaluation* \u2014 ${count} concepts matched`;
    if (result.evaluation.sample.length > 0) {
      const samples = result.evaluation.sample.map((s) => `\`${s}\``).join(', ');
      evalText += `\n  ${samples} \u2026`;
    }
    sections.push(evalText);
  }

  // Edition footer
  sections.push(`:book: Edition: ${result.edition}`);

  return sections.join('\n');
}

export function buildHelpMessage(): string {
  return `*ECL Bot Usage*

*Slash command (private response):*
\u2022 \`/ecl < 404684003 |Clinical finding|\`
\u2022 \`/ecl --eval < 404684003\` \u2014 include evaluation
\u2022 \`/ecl --edition au < 404684003\` \u2014 specify edition

*@mention (thread reply):*
\u2022 \`@ECL Bot < 404684003 AND < 19829001\`
\u2022 \`@ECL Bot --eval --edition us < 404684003\`

*Options:*
\u2022 \`--eval\` \u2014 evaluate expression and show concept count
\u2022 \`--edition <code|uri>\` \u2014 override SNOMED edition (au, us, uk, nz, int, or full URI)
\u2022 \`help\` \u2014 show this message

Shorthand editions: int, au, us, uk, nz`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:slack-bot`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ecl-slack-bot/src/message-builder.ts packages/ecl-slack-bot/src/test/message-builder.test.ts
git commit -m "feat(slack-bot): add Slack message builder"
```

---

## Chunk 4: Bolt.js App + Wiring

### Task 7: Bolt.js application

**Files:**

- Create: `packages/ecl-slack-bot/src/app.ts`

This is the Bolt.js wiring file. No tests — verified by manual testing per the design spec.

- [ ] **Step 1: Implement app.ts**

```typescript
// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import 'dotenv/config';
import { App } from '@slack/bolt';
import { FhirTerminologyService } from 'ecl-core';
import { loadConfig, resolveEdition } from './config';
import { parseInput, processEcl } from './ecl-processor';
import { buildMessage, buildHelpMessage } from './message-builder';

const config = loadConfig();

if (!config.slackBotToken || !config.slackAppToken) {
  console.error('Missing SLACK_BOT_TOKEN or SLACK_APP_TOKEN environment variables');
  process.exit(1);
}

const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  socketMode: true,
});

// ── Shared handler logic ────────────────────────────────────────────────

async function handleEcl(raw: string): Promise<{ text: string; isHelp: boolean; isError: boolean }> {
  const parsed = parseInput(raw);

  if (parsed.help) {
    return { text: buildHelpMessage(), isHelp: true, isError: false };
  }

  if (parsed.error) {
    return { text: `:red_circle: ${parsed.error}`, isHelp: false, isError: true };
  }

  // Resolve edition
  let snomedEdition = config.snomedEdition;
  let editionLabel = snomedEdition ?? 'Server default';

  if (parsed.edition) {
    const resolved = resolveEdition(parsed.edition);
    if (!resolved) {
      return {
        text: `:red_circle: Unknown edition: \`${parsed.edition}\`. Use one of: int, au, us, uk, nz, or a full URI.`,
        isHelp: false,
        isError: true,
      };
    }
    snomedEdition = resolved;
    editionLabel = `${parsed.edition} (${resolved})`;
  }

  const terminologyService = new FhirTerminologyService(
    config.fhirServerUrl,
    2000,
    'ecl-slack-bot/1.0.0',
    snomedEdition,
  );

  const result = await processEcl(parsed.ecl, terminologyService, {
    evaluate: parsed.evaluate,
    edition: editionLabel,
  });

  return { text: buildMessage(result), isHelp: false, isError: false };
}

// ── Slash command: /ecl ─────────────────────────────────────────────────

app.command('/ecl', async ({ command, ack, respond }) => {
  await ack();
  try {
    const { text } = await handleEcl(command.text);
    await respond({ text, response_type: 'ephemeral' });
  } catch (error) {
    console.error('Error handling /ecl command:', error);
    await respond({ text: ':red_circle: An unexpected error occurred.', response_type: 'ephemeral' });
  }
});

// ── @mention ────────────────────────────────────────────────────────────

app.event('app_mention', async ({ event, say }) => {
  // Strip the bot mention from the text
  const raw = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  try {
    const { text } = await handleEcl(raw);
    await say({ text, thread_ts: event.ts });
  } catch (error) {
    console.error('Error handling @mention:', error);
    await say({ text: ':red_circle: An unexpected error occurred.', thread_ts: event.ts });
  }
});

// ── Start ───────────────────────────────────────────────────────────────

(async () => {
  await app.start();
  console.log('ECL Slack Bot is running');
})();
```

- [ ] **Step 2: Verify compilation**

Run: `npm run compile:slack-bot`
Expected: Success (no type errors)

- [ ] **Step 3: Commit**

```bash
git add packages/ecl-slack-bot/src/app.ts
git commit -m "feat(slack-bot): add Bolt.js app with slash command and @mention handlers"
```

---

### Task 8: Final integration + lint + format

**Files:**

- Potentially modify: any files that need lint/format fixes

- [ ] **Step 1: Run full compile**

Run: `npm run compile`
Expected: All packages compile successfully

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass (including the new slack-bot tests)

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors. Fix any issues.

- [ ] **Step 4: Run format check**

Run: `npm run format:check`
Expected: No issues. Fix with `npx prettier --write packages/ecl-slack-bot/` if needed.

- [ ] **Step 5: Commit any lint/format fixes**

```bash
git add -A packages/ecl-slack-bot/
git commit -m "chore(slack-bot): fix lint and formatting"
```

---

### Task 9: Create .env.example

**Files:**

- Create: `packages/ecl-slack-bot/.env.example`

- [ ] **Step 1: Create .env.example**

```env
# Required: Slack tokens (Socket Mode)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token

# Optional: FHIR terminology server
# FHIR_SERVER_URL=https://tx.ontoserver.csiro.au/fhir

# Optional: Default SNOMED CT edition (shorthand or full URI)
# SNOMED_EDITION=au

# Optional: Max concepts shown in evaluation results
# MAX_EVAL_RESULTS=5
```

- [ ] **Step 2: Verify .env.example is not gitignored**

Run: `git check-ignore packages/ecl-slack-bot/.env.example`
Expected: No output (not ignored). If ignored, ensure `.gitignore` excludes `.env` but not `.env.example`.

- [ ] **Step 3: Commit**

```bash
git add packages/ecl-slack-bot/.env.example
git commit -m "docs(slack-bot): add .env.example with configuration reference"
```
