## 1. ECL Text Extraction Utility

- [x] 1.1 Create `server/src/semantic/ecl-text.ts` with `extractText(sourceText: string, range: Range): string` that extracts original ECL text from source using AST node ranges
- [x] 1.2 Add helper to reconstruct ECL for `SubExpressionNode` (handles constraint operator + concept/nested expression)
- [x] 1.3 Add helper to extract focus ECL, attribute name ECL, and value ECL from a `RefinedExpressionNode`
- [x] 1.4 Unit tests for ECL text extraction from various AST node types

## 2. Semantic Validator Module

- [x] 2.1 Create `server/src/semantic/validator.ts` with `validateSemantics(ast, sourceText, terminologyService): Promise<SemanticDiagnostic[]>`
- [x] 2.2 Define `SemanticDiagnostic` interface (range, message, severity)
- [x] 2.3 Implement AST walker that finds `RefinedExpressionNode` and `CompoundExpressionNode` nodes

## 3. Attribute Scope Validation

- [x] 3.1 Implement attribute scope check: evaluate `(<attr-ecl>) MINUS (< 106237007)` with `count=5`
- [x] 3.2 Build warning message including up to 5 out-of-scope concept IDs with display terms
- [x] 3.3 Position diagnostic range on the attribute name node
- [x] 3.4 Handle attribute groups (same check applies inside `{ }`)
- [x] 3.5 Unit tests for attribute scope validation (valid, invalid, ECL-valued attribute, wildcard value)

## 4. Value Constraint Validation

- [x] 4.1 Implement value constraint check: evaluate `(<value-ecl>) AND (<focus-ecl>.<attr-name-ecl>)` with `count=1`
- [x] 4.2 Warn when result total is 0 (complete disjointness)
- [x] 4.3 Skip when value is wildcard (`*`) or raw value (string/numeric)
- [x] 4.4 Skip when focus concept is wildcard
- [x] 4.5 Position diagnostic range on the value node
- [x] 4.6 Unit tests for value constraint validation (compatible, disjoint, wildcard skip, wildcard focus)

## 5. Empty Sub-Expression Detection

- [x] 5.1 Implement empty sub-expression check: evaluate each operand in `CompoundExpressionNode` with `count=1`
- [x] 5.2 Check focus expression in `RefinedExpressionNode`
- [x] 5.3 Warn when result total is 0
- [x] 5.4 Position diagnostic range on the sub-expression
- [x] 5.5 Unit tests for empty sub-expression detection (AND, OR, refinement focus)

## 6. Individual Refinement Validation

- [x] 6.1 For multi-attribute refinements `A : B1 = C1, B2 = C2`, build and evaluate each individual refinement ECL: `<focus-ecl> : <attr-name-ecl> = <attr-value-ecl>` with `count=1`
- [x] 6.2 Warn when an individual refinement evaluates to 0 results, positioning diagnostic on the attribute-value pair
- [x] 6.3 Skip individual refinement check when value is wildcard (`*`)
- [x] 6.4 Unit tests for individual refinement validation (one impossible among multiple, all valid, wildcard skip)

## 7. Parallel Execution

- [x] 7.1 Collect all independent validation queries (attribute checks, value checks, empty checks, refinement checks) and execute via `Promise.all`
- [x] 7.2 Ensure failure of one check does not prevent others from completing
- [x] 7.3 Unit test verifying parallel execution pattern (independent checks don't block each other)

## 8. Configuration

- [x] 8.1 Add `ecl.semanticValidation.enabled` to `client/package.json` configuration contribution
- [x] 8.2 Read configuration in `server.ts` and pass to validation function
- [x] 8.3 Skip semantic validation when disabled
- [x] 8.4 Re-validate on configuration change

## 9. Server Integration

- [x] 9.1 Import and call `validateSemantics` in `server.ts` after concept validation
- [x] 9.2 Map `SemanticDiagnostic[]` to LSP `Diagnostic[]`
- [x] 9.3 Handle document version tracking to prevent stale results
- [x] 9.4 Integration test: full document with refinements produces correct semantic diagnostics

## 10. Graceful Degradation

- [x] 10.1 Catch FHIR errors per-check (not per-expression) so partial results are still reported
- [x] 10.2 Log warnings for failed semantic checks
- [x] 10.3 Ensure syntax and concept diagnostics are unaffected by semantic failures
- [x] 10.4 Unit test: FHIR failure for one check doesn't suppress others

## 11. Verification

- [x] 11.1 All existing tests still pass (722 tests — 691 + 27 unit + 4 integration)
- [x] 11.2 Integration test with real FHIR server: valid refinement produces no warnings
- [x] 11.3 Integration test with real FHIR server: invalid attribute produces warning
- [x] 11.4 Integration test with real FHIR server: disjoint value produces warning
- [x] 11.5 Integration test with real FHIR server: impossible individual refinement produces warning
