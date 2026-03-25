## Context

The completion system currently has three layers:

1. **Position detector** (`position-detector.ts`) — regex-based context analysis on `textBeforeCursor`. Returns which operators are valid and whether concept search applies. Currently recognises 7 contexts: after concept, after constraint operator, after logical operator, start of expression, after `(`, after `:`, after `=`.

2. **Completion provider** (`provider.ts`) — pure function `getCompletionItems()` that filters a flat `allOperatorCompletions` list based on position detector output. Also decides whether to include snippets and concept search. Async wrapper adds inline concept search results.

3. **Snippets** (`snippets.ts`) — 8 expression-level snippet templates offered at expression start or after logical operators.

### Investigation: ANTLR partial AST viability

We tested ANTLR4's error recovery on 20+ incomplete ECL expressions. Key findings:

- **ANTLR error recovery is highly effective for core grammar structures.** The AST is never null; partial structures like `RefinedExpression` with empty refinement, `DottedExpression` with empty attributes, and `CompoundExpression` with zero-width wildcard placeholder reliably indicate cursor context.
- **Filter constructs (`{{ D }}`, `{{ C }}`, `{{ M }}`, `{{ + }}`) are invisible to the AST.** ANTLR treats `{{` as two `{` tokens and doesn't parse filter internals. The AST only shows the concept before `{{`.
- **Cardinality `[N..M]` is not captured in the AST** — it appears only in the token stream.

This dictates a **hybrid approach**: AST-based detection for refinements, compounds, dots, and continuation points; text-based detection for filter blocks and cardinality.

## Goals / Non-Goals

**Goals:**

- Add context-aware completion for all remaining ECL 2.2 constructs: filters, cardinality, attribute groups, comparison operators, member-of, child/parent operators, reverse flag, wildcard, dot notation, top/bottom
- Use AST-based context detection where ANTLR error recovery produces reliable partial trees (refinements, compounds, dots)
- Use text-based detection as fallback for constructs opaque to the AST (filter blocks, cardinality)
- Keep the pure-function architecture (no LSP dependencies in detection/filtering logic)
- All new completions are testable via unit tests

**Non-Goals:**

- Semantic attribute name/value suggestions (e.g., "valid attributes for Clinical finding") — future work
- Filter value autocompletion from terminology server (e.g., language codes, dialect aliases) — future work
- Acceptability tokens inside dialect filters (accept/prefer) — too deep for first pass

## Decisions

### 1. Hybrid context detection: AST primary, text fallback

**Decision:** Replace the current pure-regex position detector with a new `detectCursorContext()` function that:

1. Checks for filter block context first via text scan (filters are opaque to AST)
2. Parses with `parseECL(textUpToCursor)` and inspects the partial AST for everything else

**Rationale:** Investigation proved ANTLR error recovery produces useful partial ASTs for 8/11 context categories. AST-based detection is more accurate than regex for nested structures (e.g., "inside a refinement inside parentheses"). Text fallback handles the filter blind spot.

**Alternatives considered:**

- Pure regex (original approach) — fragile for nested contexts, hard to detect "after attribute name in refinement" vs "after concept at top level"
- Full AST only — impossible, filter blocks are invisible to ANTLR

### 2. Context enum with discriminated return type

**Decision:** Define a `CursorContext` discriminated union:

```typescript
type CursorContext =
  | { kind: 'expression-start' }
  | { kind: 'after-operator'; operator: string }
  | { kind: 'after-concept' } // continuation point
  | { kind: 'after-logical-operator'; operator: string }
  | { kind: 'refinement-start' } // after :
  | { kind: 'after-attribute-name' } // awaiting = or !=
  | { kind: 'after-comparison-operator' } // awaiting value
  | { kind: 'after-cardinality' } // [N..M] typed
  | { kind: 'dotted-awaiting-attribute' } // after .
  | { kind: 'filter-block'; filterType: 'D' | 'C' | 'M' | '+'; subContext: FilterSubContext }
  | { kind: 'unknown' }; // fail open
```

**Rationale:** The current system returns operator label arrays, which doesn't scale to context-specific items (filter keywords, cardinality snippets, value tokens). A discriminated union lets the provider do a simple switch to build the right completion list per context.

### 3. Filter block detection via text scan

**Decision:** Before parsing, scan `textBeforeCursor` for an unmatched `{{`:

1. Track `{{`/`}}` pairs, skipping content inside `/* */` comments and `| |` terms
2. If inside an open `{{`, extract the filter type prefix character after `{{` (D, C, M, +, or none → default D)
3. Within the filter block, detect sub-context: after opening, after keyword, after `=`, after value

**Rationale:** ANTLR can't help here — filters are completely opaque. The scanner is lightweight (~30 lines) and only runs when `{{` exists in the text.

### 4. AST context detection algorithm

**Decision:** After parsing with `parseECL()`, walk the AST:

```
if ast.expression is null → 'expression-start' or 'after-operator' (check last token)
if ast.expression is RefinedExpression:
  if refinement is empty → 'refinement-start'
  if last attribute has no comparison operator → 'after-attribute-name'
  if last token is = or != → 'after-comparison-operator'
if ast.expression is DottedExpression with empty attributes → 'dotted-awaiting-attribute'
if ast.expression is CompoundExpression with placeholder operand → 'after-logical-operator'
if no errors (valid parse) → 'after-concept' (continuation point)
else → 'unknown' (fail open)
```

**Rationale:** Each AST shape maps directly to a grammar position. The investigation confirmed these shapes are stable across incomplete inputs.

### 5. New file: `completion/context-detector.ts`

**Decision:** Create a new module `completion/context-detector.ts` that exports `detectCursorContext(textBeforeCursor: string): CursorContext`. This replaces the three functions in `position-detector.ts`.

**Rationale:** The position detector's three functions (`isConceptPositionValid`, `getConceptSearchPriority`, `getValidOperatorsAtPosition`) are all answering pieces of the same question: "what's valid at the cursor?". A single function returning a discriminated union is cleaner. The old functions remain for backward compatibility but can be deprecated.

### 6. New file: `completion/context-items.ts`

**Decision:** Create a new file for context-specific completion item constants (filter openers, filter keywords, cardinality snippets, comparison operators, etc.) rather than adding them all to `provider.ts`.

**Rationale:** `provider.ts` already has 219 lines. The new items total ~100+ CompletionItem definitions. Separating constants from routing logic keeps both files focused. Pattern matches `snippets.ts` which already holds snippet definitions separately.

### 7. Completion item organisation

**Decision:** Use consistent `CompletionItemKind` and `sortText` prefixes:

- Operators: `CompletionItemKind.Operator`, sortText `a-` (highest priority)
- Keywords: `CompletionItemKind.Keyword`, sortText `b-`
- Filter openers: `CompletionItemKind.Struct`, sortText `c-`
- Filter keywords: `CompletionItemKind.Property`, sortText `d-`
- Value tokens: `CompletionItemKind.EnumMember`, sortText `e-`
- Concept search: `CompletionItemKind.Function`, sortText `f-` (after operators)
- Snippets: `CompletionItemKind.Snippet`, sortText `z-` (lowest priority, unchanged)

**Rationale:** VS Code sorts by `sortText` then label. Alphabetical prefixes ensure consistent ordering.

### 8. Preserve existing position-detector.ts

**Decision:** Keep `position-detector.ts` with its existing exports. The new `context-detector.ts` is the replacement, but existing tests and the provider call the old functions. Migrate `provider.ts` to use the new detector, and keep the old module until tests are migrated.

**Rationale:** Avoids a big-bang refactor. The old tests validate current behavior; new tests validate new behavior. Eventually the old module can be removed.

## Risks / Trade-offs

- **[Parse overhead on every completion]** → Calling `parseECL()` on each keystroke adds latency. Mitigated: parsing a single expression (typically <500 chars) is sub-millisecond. The ANTLR parser is already used for validation on every document change, which is a heavier operation.

- **[Filter text scanner edge cases]** → `{{` could appear in comments or terms. Mitigated by the scanner skipping content inside `/* */` comments and `| |` terms.

- **[AST shape stability]** → ANTLR error recovery is best-effort and could change between antlr4ts versions. Mitigated by comprehensive tests on each partial AST shape. The current antlr4ts version (0.5.0-alpha.4) is pinned.

- **[Completion list size]** → After `:` the list could show ~15+ items (operators, cardinality, R, {, ^, concept search). This is acceptable — VS Code handles large completion lists well with type-ahead filtering.

- **[Two detection systems]** → Having both text-based (filters) and AST-based detection increases complexity. Mitigated by clear separation: text scan runs first and short-circuits for filter contexts; AST detection handles everything else.
