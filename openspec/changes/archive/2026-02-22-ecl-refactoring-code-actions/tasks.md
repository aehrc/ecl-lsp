## 1. Infrastructure

- [x] 1.1 Create `server/src/refactoring/` directory and `index.ts` that exports a `getRefactoringActions(document, range, ast?)` function
- [x] 1.2 Wire `getRefactoringActions` into the existing `onCodeAction` handler in `server.ts` so refactoring actions appear alongside diagnostic quick fixes
- [x] 1.3 Register `codeActionProvider` with `resolveProvider: true` in server capabilities and implement `onCodeActionResolve` handler for async actions (add display terms)

## 2. Add display terms

- [x] 2.1 Create `server/src/refactoring/add-display-terms.ts` — parse expression, extract concept IDs from AST, identify bare IDs (no existing term), return a CodeAction shell with `data` payload for resolve
- [x] 2.2 Implement resolve handler — bulk FHIR lookup for bare concept IDs, build text edit that inserts `|term|` after each bare ID preserving existing whitespace
- [x] 2.3 Add tests: bare IDs get terms, already-termed IDs skipped, offline graceful degradation

## 3. Strip display terms

- [x] 3.1 Create `server/src/refactoring/strip-display-terms.ts` — regex replacement of `\s*\|[^|]*\|` after concept IDs, only offered when expression contains at least one term
- [x] 3.2 Add tests: all terms stripped, no-term expression not offered, whitespace normalised

## 4. Simplify redundant constraints

- [x] 4.1 Create `server/src/refactoring/simplify-expression.ts` — AST pattern matcher for CompoundExpressionNode operands sharing same concept ID with subsumption-related operators
- [x] 4.2 Implement AND simplification rules (`<< X AND < X` → `< X`, `<< X AND X` → `X`, `< X AND X` → `X`)
- [x] 4.3 Implement OR simplification rules (`<< X OR < X` → `<< X`, `<< X OR X` → `<< X`)
- [x] 4.4 Add tests: each AND/OR rule, no-match not offered, different concepts not offered

## 5. Factor out common focus

- [x] 5.1 Create `server/src/refactoring/factor-common-focus.ts` — detect OR compound where multiple RefinedExpressionNode operands share identical focus (same concept ID + constraint operator), merge refinements
- [x] 5.2 Add tests: two same-focus refined expressions factored, different focus not offered, three-way factoring

## 6. Cycle constraint operator

- [x] 6.1 Create `server/src/refactoring/cycle-constraint-operator.ts` — detect sub-expression under cursor, determine current operator, compute next in cycle, return CodeAction with descriptive title
- [x] 6.2 Add tests: each transition in cycle (< → << → <! → <<! → > → >> → >! → >>! → none → <), title includes target name

## 7. Add explicit parentheses

- [x] 7.1 Create `server/src/refactoring/add-parentheses.ts` — detect compound expression with mixed AND/OR, wrap AND groups in parentheses according to ECL precedence
- [x] 7.2 Add tests: mixed AND/OR parenthesised, single operator type not offered, already parenthesised not offered

## 8. Add history supplement

- [x] 8.1 Create `server/src/refactoring/add-history-supplement.ts` — append `{{ + HISTORY-MIN }}` to sub-expression, only offered when no history supplement exists
- [x] 8.2 Add tests: supplement added, already-supplemented not offered

## 9. Add description filter

- [x] 9.1 Create `server/src/refactoring/add-description-filter.ts` — append `{{ D term = "" }}` to sub-expression, only offered when no description filter exists
- [x] 9.2 Add tests: filter added, already-filtered not offered

## 10. Integration and verification

- [x] 10.1 Run full test suite — all existing 1262 tests plus new refactoring tests pass
- [x] 10.2 Update CLAUDE.md with refactoring code actions documentation
