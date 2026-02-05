## 1. Context Detector — Types and Filter Scanner

- [x] 1.1 Create `server/src/completion/context-detector.ts` with `CursorContext` discriminated union type and `FilterSubContext` type
- [x] 1.2 Implement `detectFilterContext()` text scanner: scan backwards for unmatched `{{`, extract filter type prefix (D/C/M/+/none), detect sub-context (after-opening, after-keyword, after-equals, after-value)
- [x] 1.3 Handle edge cases in filter scanner: skip `/* */` comments and `| |` terms when tracking `{{`/`}}` pairs

## 2. Context Detector — AST-Based Detection

- [x] 2.1 Implement `detectCursorContext(textBeforeCursor: string): CursorContext` — call filter scanner first, then `parseECL()` and inspect AST
- [x] 2.2 Detect `expression-start`: AST expression is null or text is empty/whitespace
- [x] 2.3 Detect `after-operator`: AST expression is null but last token is a constraint operator (`<`, `<<`, `>`, `>>`, `<!`, `<<!`, `>!`, `>>!`, `^`, `!!>`, `!!<`)
- [x] 2.4 Detect `refinement-start`: AST is `RefinedExpression` with empty refinement (no attributes)
- [x] 2.5 Detect `after-attribute-name`: AST is `RefinedExpression` with attribute(s), last attribute has no comparison operator (use text scan for `=` after last concept ID)
- [x] 2.6 Detect `after-comparison-operator`: AST is `RefinedExpression`, text ends with `=` or `!=` followed by optional whitespace
- [x] 2.7 Detect `after-cardinality`: text ends with `[N..M]` or `[N..*]` pattern (regex fallback, not in AST)
- [x] 2.8 Detect `dotted-awaiting-attribute`: AST is `DottedExpression` with empty attributes array
- [x] 2.9 Detect `after-logical-operator`: AST is `CompoundExpression` with last operand being a zero-width wildcard placeholder
- [x] 2.10 Detect `after-concept`: valid parse with no errors, AST is `SubExpressionConstraint` — continuation point for `:`, `.`, `AND`, `OR`, `MINUS`, filters
- [x] 2.11 Fallback `unknown` context: return fail-open when no pattern matches

## 3. Context Detector — Tests

- [x] 3.1 Create `server/src/test/context-detector.test.ts`
- [x] 3.2 Test filter block detection: `{{ D `, `{{ C `, `{{ M `, `{{ + `, `{{ ` (default D), after comma inside filter, nested filters
- [x] 3.3 Test filter sub-context: after opening, after keyword (term, type, active, etc.), after `=`, after value
- [x] 3.4 Test AST-based contexts: expression-start, after-operator (all variants), refinement-start, after-attribute-name, after-comparison-operator, after-cardinality, dotted-awaiting-attribute, after-logical-operator, after-concept
- [x] 3.5 Test edge cases: `{{` inside comments, `:` inside pipe-delimited terms, empty input, multi-line expressions
- [x] 3.6 Test unknown/ambiguous contexts return fail-open

## 4. Completion Items — Constants

- [x] 4.1 Create `server/src/completion/context-items.ts` with all new completion item constants
- [x] 4.2 Add extended constraint operators: `<!` (child of), `<<!` (child or self of), `>!` (parent of), `>>!` (parent or self of), `!!>` (top), `!!<` (bottom)
- [x] 4.3 Add member-of operator: `^` with detail "Member of (reference set)"
- [x] 4.4 Add dot notation: `.` with detail "Dot notation (attribute traversal)"
- [x] 4.5 Add comparison operators: `=` (equals), `!=` (not equals)
- [x] 4.6 Add refinement items: `R` (reverse flag), `*` (wildcard/any value), `{ }` (attribute group snippet with cursor inside)
- [x] 4.7 Add cardinality snippets: `[0..0]`, `[0..1]`, `[0..*]`, `[1..1]`, `[1..*]` with tab-stop fields
- [x] 4.8 Add filter openers: `{{ D` (description filter), `{{ C` (concept filter), `{{ M` (member filter), `{{ +` (history supplement)
- [x] 4.9 Add description filter keywords: `term`, `type`, `typeId`, `language`, `dialect`, `dialectId`, `moduleId`, `effectiveTime`, `active`, `id`
- [x] 4.10 Add concept filter keywords: `definitionStatus`, `definitionStatusId`, `moduleId`, `effectiveTime`, `active`
- [x] 4.11 Add member filter keywords: `moduleId`, `effectiveTime`, `active`
- [x] 4.12 Add history supplement completions: `HISTORY }}`, `HISTORY-MIN }}`, `HISTORY-MOD }}`, `HISTORY-MAX }}`
- [x] 4.13 Add value tokens: `syn`, `fsn`, `def` (type tokens); `primitive`, `defined` (definition status tokens); `true`, `false`, `1`, `0` (boolean values)
- [x] 4.14 Apply consistent `sortText` prefixes: `a-` operators, `b-` keywords, `c-` filter openers, `d-` filter keywords, `e-` value tokens, `f-` concept search

## 5. Provider Integration

- [x] 5.1 Refactor `provider.ts` `getCompletionItems()` to call `detectCursorContext()` and switch on `context.kind`
- [x] 5.2 Map `expression-start` → constraint operators (extended set including `<!`, `<<!`, `>!`, `>>!`, `^`, `!!>`, `!!<`) + snippets + concept search
- [x] 5.3 Map `after-operator` → concept search only (no operators)
- [x] 5.4 Map `after-concept` → `AND`, `OR`, `MINUS`, `:`, `.`, filter openers (`{{ D`, `{{ C`, `{{ +`)
- [x] 5.5 Map `after-logical-operator` → constraint operators (extended) + `^` + snippets + concept search
- [x] 5.6 Map `refinement-start` → constraint operators + `^` + cardinality snippets + `{ }` + `R` + concept search
- [x] 5.7 Map `after-attribute-name` → `=`, `!=`
- [x] 5.8 Map `after-comparison-operator` → constraint operators + `^` + `*` + concept search
- [x] 5.9 Map `after-cardinality` → `{ }` + `R` + constraint operators + `^` + concept search
- [x] 5.10 Map `dotted-awaiting-attribute` → constraint operators + concept search
- [x] 5.11 Map `filter-block` → route to filter keywords based on `filterType` (D/C/M/+) and `subContext`
- [x] 5.12 Map `unknown` → all operators (fail open, unchanged behaviour)
- [x] 5.13 Update `getCompletionItemsWithSearch()` to pass `textBeforeCursor` to new detector

## 6. Provider Tests

- [x] 6.1 Add tests to `server/src/test/completion.test.ts` for each new context → completion mapping
- [x] 6.2 Test filter block completions: keywords offered inside `{{ D `, `{{ C `, `{{ M `; value tokens after `type = `, `active = `, `definitionStatus = `
- [x] 6.3 Test history supplement completions after `{{ + `
- [x] 6.4 Test refinement completions: cardinality, `{ }`, `R`, `*` at correct positions
- [x] 6.5 Test extended operators: `<!`, `<<!`, `>!`, `>>!`, `^`, `!!>`, `!!<` appear at expression start and after logical operators
- [x] 6.6 Test `.` and filter openers appear after complete concepts but not at expression start
- [x] 6.7 Test `=`/`!=` appear after attribute names but not after constraint operators
- [x] 6.8 Verify existing completion tests still pass (backward compatibility)

## 7. Verification

- [x] 7.1 Run `npm run compile` — server and client build cleanly
- [x] 7.2 Run `npm test` — all existing + new tests pass
- [x] 7.3 Run `npm run lint` — no new warnings
- [ ] 7.4 Manual F5 test: verify completions appear in correct contexts in a real ECL file
