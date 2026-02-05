# ECL Platform Restructuring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract ecl-core library, slim down ecl-lsp-server, fix existing clients, and build MCP server + new clients.

**Architecture:** Monorepo with three packages (ecl-core, ecl-lsp-server, ecl-mcp-server) under `packages/`. Clients under `clients/` bundle the LSP server for self-contained distribution. ecl-core has zero LSP/MCP dependencies. See `openspec/changes/ecl-platform-restructuring/design.md` for full design.

**Tech Stack:** TypeScript, ANTLR4, vscode-languageserver, @modelcontextprotocol/sdk, Kotlin/Gradle (IntelliJ), Eclipse LSP4E (Eclipse)

---

## Phase 1: Extract ecl-core (Foundation)

The goal is to move all core logic out of `server/` into `packages/ecl-core/` with zero LSP dependencies. Currently these modules import LSP types:

- **Refactoring** (8 files): `CodeAction`, `CodeActionKind`, `TextEdit`
- **Completion** (4 files): `CompletionItem`, `CompletionItemKind`, `TextEdit`, `Range`, `InsertTextFormat`
- **Formatter**: `config.ts` takes `Connection`, `range.ts` uses `TextDocument`

These must be replaced with core-native types before moving.

### Task 1.1: Create packages/ecl-core scaffold

**Files:**

- Create: `packages/ecl-core/package.json`
- Create: `packages/ecl-core/tsconfig.json`
- Create: `packages/ecl-core/src/index.ts`
- Modify: `package.json` (root workspace)

**Step 1: Create the package directory**

```bash
mkdir -p packages/ecl-core/src
```

**Step 2: Create package.json**

Create `packages/ecl-core/package.json`:

```json
{
  "name": "ecl-core",
  "version": "1.0.0",
  "description": "Core ECL parsing, formatting, validation, and terminology library",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist/**", "!dist/test/"],
  "scripts": {
    "compile": "tsc -b",
    "test": "npm run compile && node --test dist/test/**/*.test.js"
  },
  "dependencies": {
    "antlr4ts": "^0.5.0-alpha.4",
    "node-fetch": "^2.7.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.6",
    "@types/node-fetch": "^2.6.9",
    "typescript": "^5.3.3"
  }
}
```

**Step 3: Create tsconfig.json**

Create `packages/ecl-core/tsconfig.json`:

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
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create empty index.ts**

Create `packages/ecl-core/src/index.ts`:

```typescript
// ECL Core Library — public API surface
// Modules will be re-exported here as they are moved in
```

**Step 5: Update root workspace**

Modify `package.json` (root) to add `packages/ecl-core` to workspaces:

```json
"workspaces": [
  "packages/ecl-core",
  "server",
  "clients/vscode"
]
```

**Step 6: Install dependencies and verify**

```bash
npm install
cd packages/ecl-core && npx tsc --noEmit
```

Expected: Clean compilation, no errors.

**Step 7: Commit**

```bash
git add packages/ecl-core/ package.json package-lock.json
git commit -m "feat: scaffold ecl-core package"
```

---

### Task 1.2: Define core-native types

The refactoring, completion, and formatter modules currently use LSP types (`CodeAction`, `CompletionItem`, `TextEdit`, `Range`). We need core equivalents.

**Files:**

- Create: `packages/ecl-core/src/types.ts`

**Step 1: Create core types**

Create `packages/ecl-core/src/types.ts`. These mirror the LSP types but with no LSP dependency:

```typescript
// Core types that replace LSP-specific types.
// The LSP server maps these to protocol types.

/** Position in a text document (0-based line and character). */
export interface CorePosition {
  line: number;
  character: number;
}

/** Range in a text document. */
export interface CoreRange {
  start: CorePosition;
  end: CorePosition;
}

/** A text edit to apply to a document. */
export interface CoreTextEdit {
  range: CoreRange;
  newText: string;
}

/** A text edit that inserts at a position (convenience). */
export function coreInsert(position: CorePosition, newText: string): CoreTextEdit {
  return { range: { start: position, end: position }, newText };
}

/** A code action (refactoring or quick fix). */
export interface CoreCodeAction {
  title: string;
  kind: 'quickfix' | 'refactor';
  edits?: CoreTextEdit[];
  /** URI of the document these edits apply to. */
  documentUri?: string;
  /** Opaque data for deferred resolution (e.g., FHIR lookups). */
  data?: unknown;
}

/** Insert text format for completions. */
export type CoreInsertTextFormat = 'plainText' | 'snippet';

/** Completion item kind. */
export type CoreCompletionItemKind =
  | 'keyword'
  | 'operator'
  | 'snippet'
  | 'value'
  | 'concept'
  | 'property'
  | 'text'
  | 'function';

/** A completion item. */
export interface CoreCompletionItem {
  label: string;
  kind: CoreCompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: CoreInsertTextFormat;
  /** Text edit to apply instead of insertText. */
  textEdit?: CoreTextEdit;
  /** Sort order string. */
  sortText?: string;
  /** Filter text for matching. */
  filterText?: string;
  /** Command to execute after insertion. */
  command?: { command: string; title: string; arguments?: unknown[] };
}

/** Diagnostic severity levels. */
export type CoreDiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint';

/** A diagnostic (error, warning, etc.). */
export interface CoreDiagnostic {
  range: CoreRange;
  message: string;
  severity: CoreDiagnosticSeverity;
  source?: string;
}
```

**Step 2: Export from index.ts**

Update `packages/ecl-core/src/index.ts`:

```typescript
// ECL Core Library — public API surface
export * from './types';
```

**Step 3: Verify compilation**

```bash
cd packages/ecl-core && npx tsc --noEmit
```

Expected: Clean.

**Step 4: Commit**

```bash
git add packages/ecl-core/src/types.ts packages/ecl-core/src/index.ts
git commit -m "feat(ecl-core): define core-native types replacing LSP types"
```

---

### Task 1.3: Move parser module to ecl-core

The parser has zero LSP dependencies — it's the cleanest module to move first.

**Files:**

- Move: `server/src/parser/` → `packages/ecl-core/src/parser/`
- Move: `server/grammar/ECL.g4` → `grammar/ECL.g4` (repo root)
- Modify: `packages/ecl-core/src/index.ts` (add parser exports)
- Modify: `packages/ecl-core/package.json` (add antlr4ts build script)
- Move: `server/src/test/parser.test.ts` (and related test files) → `packages/ecl-core/src/test/`

**Step 1: Move parser source files**

```bash
# Move parser module
cp -r server/src/parser/ packages/ecl-core/src/parser/

# Move grammar to repo root (shared between packages)
mkdir -p grammar
cp server/grammar/ECL.g4 grammar/ECL.g4
```

**Step 2: Update imports within parser files**

The parser files have internal imports (e.g., `./ast`, `./generated/grammar/ECLParser`). These should work as-is since relative paths are preserved. Verify no imports reference `../server` or LSP modules.

```bash
grep -r "vscode-languageserver" packages/ecl-core/src/parser/
```

Expected: No matches.

**Step 3: Copy parser test files**

```bash
mkdir -p packages/ecl-core/src/test
cp server/src/test/parser.test.ts packages/ecl-core/src/test/
cp server/src/test/parser-helpers.test.ts packages/ecl-core/src/test/
cp server/src/test/concept-extractor.test.ts packages/ecl-core/src/test/
cp server/src/test/ecl-spec.test.ts packages/ecl-core/src/test/
cp server/src/test/refinement-check.test.ts packages/ecl-core/src/test/
cp server/src/test/expression-grouper.test.ts packages/ecl-core/src/test/
cp server/src/test/error-analysis.test.ts packages/ecl-core/src/test/
cp server/src/test/position-detector.test.ts packages/ecl-core/src/test/
```

Update test imports from `'../parser'` to `'../parser'` (same relative path — should work).

**Step 4: Add ANTLR build script to ecl-core**

Update `packages/ecl-core/package.json` scripts:

```json
"scripts": {
  "antlr4ts": "antlr4ts -visitor -no-listener -o src/parser/generated ../../grammar/*.g4",
  "compile": "tsc -b",
  "test": "npm run compile && node --test dist/test/**/*.test.js"
}
```

Add antlr4ts devDependency:

```json
"devDependencies": {
  "antlr4ts-cli": "^0.5.0-alpha.4",
  ...
}
```

**Step 5: Export parser from index.ts**

Add to `packages/ecl-core/src/index.ts`:

```typescript
export { parseECL, type ParseResult, type ParseError } from './parser';
export * from './parser/ast';
export { extractConceptIds, type ConceptReference } from './parser/concept-extractor';
export { groupIntoExpressions } from './parser/expression-grouper';
export { checkMixedRefinementOperators } from './parser/refinement-check';
export { analyzeExpression } from './parser/error-analysis';
export { isConceptSearchTriggerPosition } from './parser/position-detector';
```

**Step 6: Run ecl-core tests**

```bash
cd packages/ecl-core && npm test
```

Expected: All parser-related tests pass.

**Step 7: Update server to import from ecl-core**

Modify `server/package.json` to add dependency:

```json
"dependencies": {
  "ecl-core": "file:../packages/ecl-core",
  ...
}
```

Update all server imports from `'./parser'` to `'ecl-core'` (or keep local copies temporarily with re-exports — decide based on whether we want a big-bang or incremental migration).

**Recommended approach:** Keep server's local parser files for now, but add `ecl-core` as dependency and verify the ecl-core package builds and tests independently. Replace server imports in a later task to avoid a massive single change.

**Step 8: Commit**

```bash
git add packages/ecl-core/ grammar/
git commit -m "feat(ecl-core): move parser module with tests"
```

---

### Task 1.4: Move terminology module to ecl-core

The terminology module is also LSP-free.

**Files:**

- Move: `server/src/terminology/` → `packages/ecl-core/src/terminology/`
- Move: `server/src/test/terminology-*.test.ts`, `server/src/test/verhoeff.test.ts`, `server/src/test/snomed-version.test.ts` → `packages/ecl-core/src/test/`

**Step 1: Copy terminology source**

```bash
cp -r server/src/terminology/ packages/ecl-core/src/terminology/
```

**Step 2: Verify no LSP imports**

```bash
grep -r "vscode-languageserver" packages/ecl-core/src/terminology/
```

Expected: No matches.

**Step 3: Copy terminology tests**

```bash
cp server/src/test/verhoeff.test.ts packages/ecl-core/src/test/
cp server/src/test/snomed-version.test.ts packages/ecl-core/src/test/
cp server/src/test/terminology-edge-cases.test.ts packages/ecl-core/src/test/
cp server/src/test/fhir-filter-cache.test.ts packages/ecl-core/src/test/
```

**Step 4: Export from index.ts**

Add to `packages/ecl-core/src/index.ts`:

```typescript
export { FhirTerminologyService } from './terminology/fhir-service';
export type { ITerminologyService, ConceptInfo, EvaluationResponse, SearchResponse } from './terminology/types';
export { isValidSnomedId, isValidConceptId, isValidDescriptionId } from './terminology/verhoeff';
```

**Step 5: Run tests**

```bash
cd packages/ecl-core && npm test
```

**Step 6: Commit**

```bash
git add packages/ecl-core/
git commit -m "feat(ecl-core): move terminology module with tests"
```

---

### Task 1.5: Move validation and semantic modules to ecl-core

Both are LSP-free.

**Files:**

- Move: `server/src/validation/` → `packages/ecl-core/src/validation/`
- Move: `server/src/semantic/` → `packages/ecl-core/src/semantic/`
- Move related tests

**Step 1: Copy modules**

```bash
cp -r server/src/validation/ packages/ecl-core/src/validation/
cp -r server/src/semantic/ packages/ecl-core/src/semantic/
```

**Step 2: Verify no LSP imports**

```bash
grep -r "vscode-languageserver" packages/ecl-core/src/validation/ packages/ecl-core/src/semantic/
```

Expected: No matches.

**Step 3: Copy tests**

```bash
cp server/src/test/error-refinement.test.ts packages/ecl-core/src/test/
cp server/src/test/semantic-validation.test.ts packages/ecl-core/src/test/
cp server/src/test/ecl-text.test.ts packages/ecl-core/src/test/
```

**Step 4: Export from index.ts**

```typescript
export { refineParseError } from './validation/error-refinement';
export { validateSemantics, type SemanticDiagnostic } from './semantic/validator';
export { extractText, extractRefinementInfo, extractCompoundOperands } from './semantic/ecl-text';
```

**Step 5: Run tests, commit**

```bash
cd packages/ecl-core && npm test
git add packages/ecl-core/
git commit -m "feat(ecl-core): move validation and semantic modules"
```

---

### Task 1.6: Move formatter to ecl-core (with LSP decoupling)

The formatter is mostly LSP-free except:

- `config.ts` takes a `Connection` parameter → stays in LSP server, ecl-core gets the pure formatting options type + defaults
- `range.ts` uses `TextDocument` → replace with a plain-text interface

**Files:**

- Move: `server/src/formatter/formatter.ts`, `rules.ts`, `comments.ts`, `options.ts` → `packages/ecl-core/src/formatter/`
- Create: `packages/ecl-core/src/formatter/range.ts` (adapted, no TextDocument)
- Keep: `server/src/formatter/config.ts` (LSP-specific config reading)
- Move tests

**Step 1: Copy LSP-free formatter files**

```bash
mkdir -p packages/ecl-core/src/formatter
cp server/src/formatter/formatter.ts packages/ecl-core/src/formatter/
cp server/src/formatter/rules.ts packages/ecl-core/src/formatter/
cp server/src/formatter/comments.ts packages/ecl-core/src/formatter/
cp server/src/formatter/options.ts packages/ecl-core/src/formatter/
```

**Step 2: Adapt range.ts**

The current `range.ts` imports `Range` from `vscode-languageserver/node` and `TextDocument` from `vscode-languageserver-textdocument`. Create a version that uses `CoreRange` and accepts plain text + line offsets instead.

Create `packages/ecl-core/src/formatter/range.ts` — adapt `getExpressionsInRange()` and `formatRangeExpressions()` to work with `CoreRange` and a simple text interface:

```typescript
import { CoreRange } from '../types';
// ... adapt functions to accept (fullText: string, range: CoreRange) instead of (document: TextDocument, range: Range)
```

The exact adaptation depends on what methods of TextDocument are used (`.getText()`, `.offsetAt()`). These are straightforward to replace with string operations.

**Step 3: Copy config validation functions only**

The pure validation functions (`validateIndentSize`, `validateBoolean`, etc.) from `config.ts` can move to ecl-core. The `getFormattingOptions(connection)` function stays in the LSP server.

Create `packages/ecl-core/src/formatter/config.ts` with only the pure validation functions (no `Connection` import).

**Step 4: Export, copy tests, run, commit**

```typescript
export { formatDocument } from './formatter/formatter';
export { getFormattingOptions as defaultFormattingOptions } from './formatter/options';
export { expandToExpressionBoundaries, getExpressionsInRange, formatRangeExpressions } from './formatter/range';
export { validateIndentSize, validateIndentStyle, validateMaxLineLength, validateBoolean } from './formatter/config';
```

```bash
cp server/src/test/formatter.test.ts packages/ecl-core/src/test/
cp server/src/test/range-formatter.test.ts packages/ecl-core/src/test/
cp server/src/test/config.test.ts packages/ecl-core/src/test/
cd packages/ecl-core && npm test
git commit -m "feat(ecl-core): move formatter module with LSP decoupling"
```

---

### Task 1.7: Move refactoring module to ecl-core (with LSP decoupling)

All 8 refactoring files import `CodeAction`, `CodeActionKind`, `TextEdit` from vscode-languageserver. Replace with `CoreCodeAction` and `CoreTextEdit`.

**Files:**

- Move + modify: all 8 files in `server/src/refactoring/` → `packages/ecl-core/src/refactoring/`
- Move: `server/src/test/refactoring.test.ts` → `packages/ecl-core/src/test/`

**Step 1: Copy refactoring files**

```bash
cp -r server/src/refactoring/ packages/ecl-core/src/refactoring/
```

**Step 2: Replace LSP imports with core types**

In each of the 8 refactoring files, replace:

```typescript
import { CodeAction, CodeActionKind, TextEdit } from 'vscode-languageserver/node';
```

With:

```typescript
import { CoreCodeAction, CoreTextEdit } from '../types';
```

And update return types and object construction:

- `CodeAction` → `CoreCodeAction`
- `CodeActionKind.QuickFix` → `'quickfix'`
- `CodeActionKind.Refactor` → `'refactor'`
- `TextEdit.replace(range, text)` → `{ range, newText: text }`
- `TextEdit.insert(pos, text)` → `coreInsert(pos, text)`

**Step 3: Replace TextDocument with plain text interface**

`refactoring/index.ts` uses `TextDocument` for `.getText()` and `.uri`. Replace `RefactoringContext.document` with:

```typescript
export interface RefactoringContext {
  /** Document URI for edit targeting. */
  documentUri: string;
  /** Full document text (for line extraction). */
  documentText: string;
  range: CoreRange;
  expressionText: string;
  expressionRange: CoreRange;
  ast?: ExpressionNode;
}
```

Update `getRefactoringActions()` to accept `(documentUri: string, documentText: string, range: CoreRange)` instead of `(document: TextDocument, range: Range)`.

**Step 4: Update tests**

The test file creates `TextDocument` via `TextDocument.create(...)`. Replace with plain string construction matching the new interface.

**Step 5: Export, run tests, commit**

```typescript
export { getRefactoringActions, type RefactoringContext, REFACTORING_RESOLVE_KIND } from './refactoring';
export { resolveAddDisplayTerms } from './refactoring/add-display-terms';
export { resolveUnifiedSimplify } from './refactoring/simplify-expression';
```

```bash
cd packages/ecl-core && npm test
git commit -m "feat(ecl-core): move refactoring module with core-native types"
```

---

### Task 1.8: Move completion module to ecl-core (with LSP decoupling)

The completion module imports `CompletionItem`, `CompletionItemKind`, `TextEdit`, `Range`, `InsertTextFormat`. Replace with core types.

**Files:**

- Move + modify: `server/src/completion/` → `packages/ecl-core/src/completion/`
- Move: completion tests

**Step 1: Copy and replace LSP types**

Similar to refactoring — replace `CompletionItem` with `CoreCompletionItem`, map `CompletionItemKind.Keyword` → `'keyword'`, etc.

The `filter-cache.ts` stores `CompletionItem[]` — update to `CoreCompletionItem[]`.

`context-detector.ts` is already LSP-free (operates on strings).

**Step 2: Export, test, commit**

```bash
cd packages/ecl-core && npm test
git commit -m "feat(ecl-core): move completion module with core-native types"
```

---

### Task 1.9: Final ecl-core verification

**Step 1: Verify zero LSP dependency**

```bash
grep -r "vscode-languageserver" packages/ecl-core/src/
```

Expected: No matches.

**Step 2: Verify no vscode-languageserver in package.json**

Check `packages/ecl-core/package.json` — should have no `vscode-languageserver` dependency.

**Step 3: Run full test suite**

```bash
cd packages/ecl-core && npm test
```

Expected: All tests pass (parser, terminology, semantic, validation, formatter, refactoring, completion).

**Step 4: Commit**

```bash
git commit -m "feat(ecl-core): verify zero LSP dependency and full test coverage"
```

---

## Phase 2: Slim ecl-lsp-server

Move the LSP server into `packages/ecl-lsp-server/` and make it a thin adapter over ecl-core.

### Task 2.1: Create packages/ecl-lsp-server scaffold

**Files:**

- Create: `packages/ecl-lsp-server/package.json`
- Create: `packages/ecl-lsp-server/tsconfig.json`
- Create: `packages/ecl-lsp-server/bin/ecl-lsp-server.js`

The package depends on `ecl-core` + `vscode-languageserver` + `vscode-languageserver-textdocument`.

**Step 1: Create scaffold**

```bash
mkdir -p packages/ecl-lsp-server/src packages/ecl-lsp-server/bin
```

Create `packages/ecl-lsp-server/package.json`:

```json
{
  "name": "ecl-lsp-server",
  "version": "1.0.0",
  "description": "LSP server for SNOMED CT Expression Constraint Language",
  "main": "dist/server.js",
  "bin": {
    "ecl-lsp-server": "bin/ecl-lsp-server.js"
  },
  "files": ["dist/**", "!dist/test/", "bin/"],
  "dependencies": {
    "ecl-core": "file:../ecl-core",
    "vscode-languageserver": "^9.0.1",
    "vscode-languageserver-textdocument": "^1.0.11"
  }
}
```

Create `packages/ecl-lsp-server/bin/ecl-lsp-server.js`:

```javascript
#!/usr/bin/env node
require('../dist/server.js');
```

**Step 2: Commit**

```bash
git commit -m "feat: scaffold ecl-lsp-server package"
```

---

### Task 2.2: Move server.ts to ecl-lsp-server as adapter

**Files:**

- Move: `server/src/server.ts` → `packages/ecl-lsp-server/src/server.ts`
- Move: `server/src/code-lens.ts` → `packages/ecl-lsp-server/src/code-lens.ts`
- Move: `server/src/semantic-tokens.ts` → `packages/ecl-lsp-server/src/semantic-tokens.ts`

**Step 1: Move files and update imports**

Replace all local module imports (e.g., `'./parser'`, `'./refactoring'`, `'./formatter'`) with imports from `'ecl-core'`.

Where the LSP server needs to map core types to LSP types, add adapter functions:

```typescript
import { CoreCodeAction, CoreTextEdit } from 'ecl-core';
import { CodeAction, CodeActionKind, TextEdit, Range } from 'vscode-languageserver/node';

function toLspCodeAction(action: CoreCodeAction, uri: string): CodeAction {
  return {
    title: action.title,
    kind: action.kind === 'quickfix' ? CodeActionKind.QuickFix : CodeActionKind.Refactor,
    edit: action.edits
      ? {
          changes: { [uri]: action.edits.map(toLspTextEdit) },
        }
      : undefined,
    data: action.data,
  };
}

function toLspTextEdit(edit: CoreTextEdit): TextEdit {
  return TextEdit.replace({ start: edit.range.start, end: edit.range.end }, edit.newText);
}
```

**Step 2: Add executeCommandProvider** (from semantic-safety proposal)

Add to server capabilities in `onInitialize`:

```typescript
executeCommandProvider: {
  commands: ['ecl.evaluateExpression'],
},
```

Add `onExecuteCommand` handler that delegates to the shared evaluation logic.

**Step 3: Add semantic safety fixes** (from semantic-safety proposal)

In the semantic validation code path, skip concept validation when `result.errors.length > 0`. Add null safety guards (`?.`) on `node.focus`, `node.source`, `node.expression` in `ecl-core/src/semantic/validator.ts` (this was done in Task 1.5 if not already).

**Step 4: Run server tests**

```bash
cd packages/ecl-lsp-server && npm test
```

**Step 5: Verify original server tests still pass from root**

```bash
npm test
```

**Step 6: Commit**

```bash
git commit -m "feat: move server to ecl-lsp-server as thin adapter over ecl-core"
```

---

### Task 2.3: Clean up old server/ directory

Once ecl-lsp-server is working:

**Step 1: Remove old server/src/ files** that have been moved to ecl-core or ecl-lsp-server. Keep `server/` directory only if needed for backward compatibility; otherwise remove and update root workspace.

**Step 2: Update root package.json workspaces**

```json
"workspaces": [
  "packages/ecl-core",
  "packages/ecl-lsp-server",
  "clients/vscode"
]
```

**Step 3: Run full test suite from root**

```bash
npm test
```

**Step 4: Commit**

```bash
git commit -m "refactor: remove old server/ directory, complete package restructuring"
```

---

## Phase 3: Fix VSCode client

Absorbs the `vscode-extension-fixes` proposal.

### Task 3.1: Update server path resolution

**Files:**

- Modify: `clients/vscode/src/extension.ts`

Update to find bundled server (in VSIX layout) with monorepo fallback:

```typescript
// Try VSIX-bundled layout first
let serverModule = context.asAbsolutePath(path.join('server', 'dist', 'server.js'));
if (!fs.existsSync(serverModule)) {
  // Fallback: monorepo layout
  serverModule = context.asAbsolutePath(path.join('..', '..', 'packages', 'ecl-lsp-server', 'dist', 'server.js'));
}
```

### Task 3.2: Fix TextMate grammar path

**Files:**

- Modify: `clients/vscode/package.json`
- Create: `clients/vscode/syntaxes/` (local copy for VSIX)

Copy grammar to local path, update package.json to reference `./syntaxes/ecl.tmLanguage.json`.

### Task 3.3: Fix activation events and command registration

**Files:**

- Modify: `clients/vscode/package.json` (remove `"*"` from activationEvents)
- Modify: `clients/vscode/src/extension.ts` (register commands before `client.start()`)

### Task 3.4: Create .vscodeignore and VSIX build script

**Files:**

- Create: `clients/vscode/.vscodeignore`
- Modify: `clients/vscode/package.json` (add vsce build script)

### Task 3.5: Commit

```bash
git commit -m "fix(vscode): grammar path, activation, command registration, VSIX packaging"
```

---

## Phase 4: Fix IntelliJ client

Absorbs the `intellij-bundle-server` proposal.

### Task 4.1: Bundle server in plugin ZIP

**Files:**

- Modify: `clients/intellij/build.gradle.kts` (copy server dist into plugin)

### Task 4.2: Update server descriptor to find bundled server

**Files:**

- Modify: `clients/intellij/src/main/kotlin/au/csiro/ecl/intellij/EclLspServerDescriptor.kt`

Try bundled path first (`ecl-server/dist/server.js` inside plugin), fall back to system PATH.

### Task 4.3: Add executeCommand support and dead file cleanup

Delete `EclFileType.kt`, `EclIcons.kt`. TextMate grammar handles file association.

### Task 4.4: Commit

```bash
git commit -m "fix(intellij): bundle server, update descriptor, clean dead files"
```

---

## Phase 5: Build MCP server

### Task 5.1: Scaffold ecl-mcp-server package

**Files:**

- Create: `packages/ecl-mcp-server/package.json` (depends on ecl-core + @modelcontextprotocol/sdk)
- Create: `packages/ecl-mcp-server/src/server.ts`
- Create: `packages/ecl-mcp-server/bin/ecl-mcp-server.js`

### Task 5.2: Implement mechanical tools

Implement tools one at a time with tests:

1. `validate_ecl` — parse + validate + return errors
2. `evaluate_ecl` — FHIR $expand with per-call edition override
3. `lookup_concept` — FHIR $lookup with per-call override
4. `search_concepts` — FHIR search with per-call override
5. `format_ecl` — format expression with options
6. `list_snomed_editions` — query available editions

All tools accept optional `fhirServer` and `snomedVersion` parameters.

### Task 5.3: Implement ECL literacy resources

Add MCP resources for ECL guides (operators, refinements, filters, patterns). Content lives in `ecl-core/src/knowledge/` so both LSP and MCP servers can use it.

### Task 5.4: Commit

```bash
git commit -m "feat: build MCP server with tools and ECL literacy resources"
```

---

## Phase 6: Build Eclipse client

### Task 6.1: Scaffold Eclipse plugin project

Create `clients/eclipse/` with Eclipse PDE/LSP4E project structure. Bundle ecl-lsp-server.

### Task 6.2: Implement LSP integration

Use Eclipse LSP4E for language server connection. Register `.ecl` file type with TextMate grammar.

### Task 6.3: Commit

---

## Phase 7: Build Claude Code plugin

### Task 7.1: Create plugin descriptor with bundled server

**Files:**

- Create: `clients/claude-code/marketplace.json`
- Bundle: server dist in `clients/claude-code/server/`

### Task 7.2: Commit

---

## Phase 8: Add knowledge module to ecl-core

### Task 8.1: Create knowledge module

**Files:**

- Create: `packages/ecl-core/src/knowledge/` — ECL construct descriptions, pattern guides

### Task 8.2: Integrate with LSP hover and completion

Update ecl-lsp-server to use knowledge module for richer hover docs and completion item documentation.

### Task 8.3: Integrate with MCP resources

Update ecl-mcp-server to serve knowledge content as MCP resources.

### Task 8.4: Commit

---

## Notes

- **Phases 1-2** are strictly sequential (foundation must be complete before anything else)
- **Phases 3-7** can be worked in parallel after the foundation
- **Phase 8** enriches all deliverables and can be done at any point after Phase 2
- Each phase should be a separate OpenSpec change for tracking
- The old `server/` directory is removed after Phase 2
- All 4 existing OpenSpec proposals are superseded by this plan
