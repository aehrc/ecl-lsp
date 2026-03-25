## 1. Unified Engine Core

- [x] 1.1 Rewrite `simplify-expression.ts` with the unified engine: export `getUnifiedSimplifyAction` (sync check — does the AST contain any AND/OR compound with 2+ operands?) and `resolveUnifiedSimplify` (async resolve — runs the full bottom-up engine). Remove the old `getSimplifyExpressionAction`, `getSimplifyBySubsumptionAction`, and `resolveSimplifyBySubsumption` exports.
- [x] 1.2 Implement the bottom-up recursive simplification function: given expression text, parse it, find compound nodes, recursively simplify parenthesized operand sub-expressions first, then apply techniques at the current level. Re-parse after each inner simplification.
- [x] 1.3 Implement technique 1 — remove exact duplicate operands (text-identical comparison within a compound node).
- [x] 1.4 Implement technique 2 — same-concept operator ranking (existing logic from `findRedundantOperands`, adapted to work within the engine's per-node flow).
- [x] 1.5 Implement technique 3 — factor common focus from OR compounds (absorb logic from `factor-common-focus.ts`).
- [x] 1.6 Implement technique 4 — merge same-focus refinements in AND compounds (new: combine `(< X : a=v1) AND (< X : a=v2)` into `< X : a=v1 AND a=v2`).
- [x] 1.7 Implement technique 5 — FHIR subsumption via MINUS evaluation (existing logic from `resolveSimplifyBySubsumption`, including empty-operand pre-check and per-pair error handling).
- [x] 1.8 Implement the re-check loop: after any technique transforms the expression, restart the technique chain from the top on the new text.

## 2. Integration

- [x] 2.1 Delete `factor-common-focus.ts` and remove its import from `index.ts`.
- [x] 2.2 Update `index.ts`: replace the three simplification action calls (`getSimplifyExpressionAction`, `getSimplifyBySubsumptionAction`, `getFactorCommonFocusAction`) with the single `getUnifiedSimplifyAction` call. Remove sub-expression simplify actions from `collectActions` (the engine handles nesting internally). Keep sub-expression detection for non-simplify actions.
- [x] 2.3 Update `server.ts` resolve handler: replace `resolveSimplifyBySubsumption` dispatch with `resolveUnifiedSimplify`. Update the resolve kind check for the new action name.
- [x] 2.4 Update `index.ts` exports: export `resolveUnifiedSimplify` instead of `resolveSimplifyBySubsumption`.

## 3. Tests

- [x] 3.1 Rewrite the simplify test section in `refactoring.test.ts`: replace the separate "Simplify expression", "Simplify by subsumption", and "Factor common focus" describe blocks with a unified "Unified simplify" describe block. Cover all five techniques with individual test cases.
- [x] 3.2 Add bottom-up nesting tests: expressions with 2+ levels of parenthesized compounds where inner groups must simplify before outer.
- [x] 3.3 Add re-check cascade test: expression where one technique enables another (e.g., duplicate removal exposes operator ranking).
- [x] 3.4 Add merge same-focus AND tests: successful merge, different-focus rejection, non-refined operand rejection.
- [x] 3.5 Verify existing non-simplification refactoring tests still pass unchanged (strip/add display terms, add parentheses, history supplement, description filter, null-expression guards, sub-expression targeting).

## 4. Cleanup

- [x] 4.1 Run full test suite (`npm test`) and fix any failures.
- [x] 4.2 Update TEST_GUIDE.md refactoring test description to reflect unified simplify.
