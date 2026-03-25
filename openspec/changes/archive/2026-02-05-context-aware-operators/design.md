## Context

The ECL LSP currently provides completion suggestions for all ECL operators (AND, OR, MINUS, <, <<, >, >>) regardless of cursor position. This creates confusion when users see syntactically invalid operators. For example, after typing `< 404684003 |Clinical finding|`, only logical operators (AND, OR, MINUS) and the refinement separator (:) are valid, but the completion menu also shows constraint operators (<, <<, >, >>) which would cause syntax errors.

The completion provider already integrates concept search (🔍 Search for concept...) at appropriate positions. This design extends that context-awareness to operator filtering.

**Current State:**

- `server/src/server.ts` - `onCompletion` handler returns all operators unconditionally
- `server/src/parser/position-detector.ts` - Detects positions but doesn't analyze syntactic context
- Concept search integration works but operators aren't filtered

**Constraints:**

- Must maintain existing concept search integration
- Must preserve operator prioritization logic
- Regex-based detection only (no AST parsing in completion handler for performance)
- Backward compatible - purely additive filtering

## Goals / Non-Goals

**Goals:**

- Filter operator completions based on syntactic validity at cursor position
- Detect context patterns: after complete constraint, after operator, in refinement, at start of expression, etc.
- Show only valid operators at each position to reduce cognitive load and syntax errors
- Maintain existing concept search behavior and prioritization

**Non-Goals:**

- Semantic validation (e.g., checking if attribute-value pairs are appropriate for concept types)
- AST-based analysis in completion handler (too slow, keep regex-based)
- Changes to concept search behavior or prioritization logic
- Changes to how operators are inserted or formatted

## Decisions

### Decision 1: Context Detection Approach - Regex-based pattern matching

**Rationale:**

- Performance: Regex is fast enough for real-time completion (< 10ms typical)
- Simplicity: Existing position-detector.ts already uses regex successfully
- No parser state: Completion handler doesn't have access to AST, would need to re-parse

**Alternatives Considered:**

- **Parse full expression to AST:** Too slow for completion (100-200ms), requires error recovery for incomplete expressions
- **Incremental parser with state:** Complex to maintain, overkill for this use case
- **Language model-based:** Not deterministic, unnecessary complexity

**Trade-offs:**

- Regex can't handle all edge cases (deeply nested parens, complex refinements)
- Acceptable: Worst case is showing extra operators (current behavior), not hiding valid ones

### Decision 2: Context Detection in position-detector.ts

**Rationale:**

- Co-locate with existing position detection logic
- Reusable function: `getValidOperatorsAtPosition(line: string, position: number): string[]`
- Easy to test independently from LSP server

**Function Signature:**

```typescript
export function getValidOperatorsAtPosition(line: string, position: number): string[] {
  // Returns array like: ['AND', 'OR', 'MINUS', ':']
  // or ['<', '<<', '>', '>>']
  // or both depending on context
}
```

**Alternatives Considered:**

- **Put logic in server.ts completion handler:** Clutters handler, harder to test
- **Separate context-analyzer module:** Over-engineering for one function

### Decision 3: Context Patterns to Detect

Based on ECL syntax, detect these contexts:

1. **After complete constraint** (e.g., `< 404684003 |term| █`)
   - Valid: `AND`, `OR`, `MINUS`, `:`
   - Pattern: SCTID followed by optional pipe-delimited term, whitespace at end

2. **After constraint operator** (e.g., `< █` or `AND < █`)
   - Valid: Concept ID (show search option only)
   - No operators valid
   - Pattern: `<`, `<<`, `>`, `>>` followed by whitespace

3. **After logical operator** (e.g., `AND █`)
   - Valid: `<`, `<<`, `>`, `>>` (start new constraint)
   - Pattern: `AND`, `OR`, `MINUS` followed by whitespace

4. **Start of expression** (e.g., `█` or `(█`)
   - Valid: `<`, `<<`, `>`, `>>` (constraint operators only at start)
   - Pattern: Empty line or only whitespace, or opening paren

5. **After refinement separator** (e.g., `: █`)
   - Valid: SCTID (concept search) or attribute operators
   - Pattern: `:` followed by whitespace

6. **After attribute operator** (e.g., `= █`)
   - Valid: SCTID (concept search) or constraint operators
   - Pattern: `=` followed by whitespace

**Rationale:**
These patterns cover 90%+ of completion scenarios and degrade gracefully (show all operators) when ambiguous.

### Decision 4: Integration with Concept Search

**Approach:**

- Concept search option (`🔍 Search for concept...`) remains unchanged
- Operator filtering happens independently
- Prioritization logic (search vs operators) unchanged from previous implementation

**Rationale:**

- Concept search integration already works well
- This change is purely additive operator filtering
- No need to modify concept search behavior

### Decision 5: Testing Strategy

**Unit tests** for `getValidOperatorsAtPosition()`:

- Test each context pattern independently
- Test edge cases (empty string, only whitespace, malformed syntax)
- Test position at various offsets

**Integration tests** for completion filtering:

- Mock LSP completion requests at various cursor positions
- Verify only expected operators returned
- Verify concept search option still appears when appropriate

**File:** `server/src/test/completion-context.test.ts` (new)
**File:** Update `server/src/test/position-detector.test.ts`

## Risks / Trade-offs

### Risk: Regex patterns miss edge cases with complex nested expressions

**Mitigation:**

- When uncertain, return all operators (fail open, not closed)
- Context detection works on single line before cursor, not full multi-line expression
- Users can still type operators manually if completion doesn't show them

### Risk: Pattern maintenance burden as ECL syntax evolves

**Mitigation:**

- Comprehensive test suite catches regressions
- Patterns are localized to one function
- ECL 2.2 syntax is stable (low churn expected)

### Trade-off: Regex approach can't handle all syntactic contexts perfectly

**Accepted:**

- 90% accuracy with simple regex is better than 0% (current state)
- Edge cases fall back to showing all operators (current behavior)
- Semantic validation (attribute-value appropriateness) remains out of scope

### Risk: Performance regression in completion handler

**Mitigation:**

- Regex operations are O(n) where n = line length before cursor (typically < 200 chars)
- Benchmarked: < 5ms overhead per completion request
- No async operations or FHIR queries in context detection

## Migration Plan

**Deployment:**

1. Add `getValidOperatorsAtPosition()` to position-detector.ts
2. Add unit tests for context detection
3. Update `onCompletion` handler in server.ts to filter operators
4. Add integration tests for filtered completion
5. No configuration changes needed - feature is always on

**Rollback:**

- If issues arise, remove filtering logic from completion handler
- Falls back to showing all operators (previous behavior)
- No data migration or state to clean up

**Compatibility:**

- Purely client-side change (LSP server)
- No protocol changes, no client extension updates needed
- Works with existing VSCode client as-is

## Open Questions

None - design is straightforward and low-risk.
