> **SUPERSEDED** — Absorbed into `ecl-platform-restructuring` (Phase 2: ecl-lsp-server adapter + ecl-core semantic safety). Archived 2026-02-28.

## Why

Two issues: (1) IntelliJ and other standard LSP clients need `workspace/executeCommand` to trigger Code Lens actions — the server only had a custom `ecl/evaluateExpression` request which VSCode's client knows about but standard LSP clients don't. (2) The semantic validator crashes on partial/malformed ASTs produced by the parser when there are syntax errors — `node.focus` can be undefined.

## What Changes

- **Add `executeCommandProvider`**: Server capabilities now include `executeCommandProvider: { commands: ['ecl.evaluateExpression'] }` — standard LSP clients can invoke Code Lens evaluate actions
- **`onExecuteCommand` handler**: New `connection.onExecuteCommand()` that handles `ecl.evaluateExpression` by finding the document containing the expression and delegating to shared evaluation logic
- **Extract `evaluateExpressionImpl()`**: Shared evaluation function used by both `onExecuteCommand` (for IntelliJ) and the custom `ecl/evaluateExpression` request (for VSCode)
- **Skip concept validation on syntax errors**: `collectSyntaxDiagnostics` now only queues concept validation when `result.errors.length === 0` — avoids sending partial/corrupt ASTs to the terminology service
- **Null safety in semantic validator**: Add `if (!node) return` guard in `walkExpression()`, and optional chaining (`?.`) on `node.focus`, `node.source`, `node.expression` accesses throughout `validator.ts` and `ecl-text.ts`
- **Partial AST safety tests**: 6 new tests verifying the semantic validator doesn't crash on expressions with syntax errors (duplicate operator, incomplete, missing operator, empty, incomplete refinement, nested incomplete)
- **Executable bit**: `server/bin/ecl-lsp-server.js` gets `chmod +x`

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

_(none — these are bug fixes and robustness improvements, not spec-level changes)_

## Impact

- **Files**: `server/src/server.ts`, `server/src/semantic/validator.ts`, `server/src/semantic/ecl-text.ts`, `server/src/test/semantic-validation.test.ts`, `server/bin/ecl-lsp-server.js`
- **Protocol**: Adds `executeCommandProvider` to server capabilities — standard LSP feature, non-breaking
- **Behavior**: Concept validation now skipped for lines with syntax errors (reduces noise)

## Reference

The full diff is saved in `reference/changes.diff`.
