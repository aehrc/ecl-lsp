## Context

The ECL LSP server already has a `connection.onCodeAction` handler in `server.ts` (line ~524) that provides diagnostic-triggered quick fixes (remove duplicate operators, insert missing AND). These operate on raw text via regex replacements on single lines.

The eight new refactoring actions are fundamentally different: they operate on well-formed expressions and most require AST access. The existing code action handler will need to be extended to offer refactoring actions alongside diagnostic quick fixes.

The FHIR terminology service (`terminologyService`) is already available in the server scope and supports `getConceptInfo` for individual lookups and `validateConcepts` for bulk lookups. The AST and concept extractor provide typed node traversal with position information.

## Goals / Non-Goals

**Goals:**

- Provide eight refactoring code actions that work on syntactically valid ECL expressions
- Actions appear in the lightbulb menu when cursor is on a relevant expression
- All text-producing actions generate well-formed ECL
- Add display terms uses live FHIR lookups; works gracefully when offline (action hidden or no-op)

**Non-Goals:**

- Multi-expression refactorings (actions that span multiple top-level expressions)
- Undo/redo management beyond what VSCode provides natively
- Refactoring preview UI (VSCode doesn't support this for code actions)
- Modifying the existing diagnostic quick fixes

## Decisions

### 1. Module structure: one module per action vs single module

**Decision**: Create `server/src/refactoring/` directory with one file per action plus an `index.ts` that registers all actions. Each action exports a function `(document, range, ast?) → CodeAction[]`.

**Rationale**: Individual files keep each action's logic self-contained and independently testable. The index aggregates them for the server's onCodeAction handler.

**Alternative considered**: All actions in server.ts — rejected because 8 actions would bloat the already-large server file.

### 2. AST availability: re-parse vs cache

**Decision**: Re-parse the expression at the cursor position when a code action is requested. Use the same `parseECL` function already used in validation.

**Rationale**: Code actions are triggered on-demand (user clicks lightbulb), so the ~1ms parse cost is negligible. Caching would add complexity and staleness risks. The document text is the source of truth.

**Alternative considered**: Cache AST from last validation — rejected because document may have changed since last validation, and the caching infrastructure doesn't exist.

### 3. Add display terms: sync vs async code actions

**Decision**: Use `codeActionProvider` with `resolveProvider: true`. Return the code action shell synchronously, resolve the FHIR lookups in `onCodeActionResolve` only when the user selects the action.

**Rationale**: FHIR lookups take 100-2000ms per concept. Doing them eagerly on every lightbulb trigger would cause UI lag. The resolve pattern defers the work until the user actually selects the action.

**Alternative considered**: Eager lookup — rejected due to latency. Pre-cache from validation — rejected because validation cache may be stale.

### 4. Cycle constraint operator: single action vs multiple

**Decision**: Single code action "Cycle constraint operator" that advances to the next operator in the sequence. The action title shows the target: e.g., "Change to descendantOrSelfOf (`<<`)".

**Rationale**: Offering 9 separate actions would clutter the menu. A single cycle action is fast and discoverable. User can invoke repeatedly to reach desired operator.

### 5. Simplify and factor: AST-based pattern matching

**Decision**: Implement simplify and factor as AST pattern matchers. Simplify checks pairs of operands in a CompoundExpressionNode for subsumption relationships between constraint operators on the same concept. Factor checks for CompoundExpressionNodes where multiple operands share the same focus concept and are refined expressions.

**Rationale**: AST-level matching is precise and avoids regex fragility on structured expressions.

## Risks / Trade-offs

- **[Add display terms latency]** → Mitigated by resolve pattern; action is only resolved when selected. Offline: action still appears but resolve returns unchanged text with a warning.
- **[Simplify correctness]** → Only handles the clear cases (`<< X AND < X`, `<< X OR < X`). Does not attempt semantic subsumption via terminology server. Conservative approach avoids incorrect simplifications.
- **[Factor correctness]** → Only factors when focus concepts are textually identical (same ID). Does not attempt semantic equivalence.
- **[Cycle operator on nested expressions]** → Cycle only operates on the sub-expression directly under the cursor, not on the entire expression. User must position cursor precisely.

## Open Questions

_(none — scope is well-defined from the prioritised list)_
