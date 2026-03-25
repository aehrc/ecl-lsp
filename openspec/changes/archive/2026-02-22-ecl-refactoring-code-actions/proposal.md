## Why

The ECL LSP currently offers only diagnostic-triggered quick fixes (remove duplicate operators, insert missing AND). There are no proactive refactoring actions for well-formed expressions. Terminologists spend significant time on repetitive mechanical edits — adding display terms to bare concept IDs, stripping terms for compact sharing, adjusting constraint operators, and restructuring compound expressions. Eight refactoring code actions will eliminate this manual work and make the editor a productive ECL authoring tool, not just an error checker.

## What Changes

- **Add display terms**: Code action on any expression to look up preferred terms via FHIR and insert `|term|` after each bare concept ID
- **Strip display terms**: Code action to remove all `|term|` annotations for compact form
- **Simplify redundant constraints**: Detect and reduce logically redundant compound operands (e.g., `<< X AND < X` → `< X`)
- **Factor out common focus**: Merge compound expressions that share the same focus concept into a single refined expression
- **Cycle constraint operator**: Quick action to cycle a sub-expression's constraint operator through `<` → `<<` → `<!` → `<<!` → `>` → `>>` → `>!` → `>>!` → (none)
- **Add explicit parentheses**: Wrap AND/OR operands in parentheses to make precedence explicit
- **Add history supplement**: Append `{{ + HISTORY-MIN }}` to a sub-expression
- **Add description filter**: Append `{{ D term = "" }}` to a sub-expression with cursor positioned inside quotes

## Capabilities

### New Capabilities

- `refactoring-code-actions`: All eight refactoring code actions — add/strip display terms, simplify redundant constraints, factor common focus, cycle constraint operator, add parentheses, add history supplement, add description filter

### Modified Capabilities

_(none — existing code actions for diagnostic quick fixes are unchanged)_

## Impact

- **Server code**: `server/src/server.ts` (onCodeAction handler) and new modules under `server/src/refactoring/`
- **FHIR integration**: Add display terms requires bulk concept lookups via existing `terminologyService`
- **AST dependency**: Simplify, factor, cycle, and parenthesise actions require parsed AST — actions only available when parse succeeds
- **Tests**: New test file(s) for each refactoring action
- **No breaking changes**: All actions are additive; existing quick fixes unchanged
