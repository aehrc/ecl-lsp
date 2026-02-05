## Why

Currently, the completion provider shows all ECL operators (AND, OR, MINUS, <, <<, >, >>) regardless of cursor context. This creates a poor user experience because many operators are syntactically invalid at certain positions. For example, after a complete constraint like `< 404684003`, only logical operators (AND, OR, MINUS) and the refinement separator (:) are valid, but the completion menu shows constraint operators (<, <<, >, >>) which would cause syntax errors if used. Context-aware filtering will improve usability by showing only valid operators, reducing errors and cognitive load.

## What Changes

- Enhance completion provider to analyze ECL expression context before cursor
- Filter operator suggestions based on syntactic validity at cursor position
- Add context detection logic to determine what token types are expected next
- Maintain existing concept search integration (show search option when concepts are valid)
- Preserve operator prioritization logic (existing behavior for search vs operators)

## Capabilities

### Modified Capabilities

- `completion`: Add requirement for context-aware operator filtering. Completion provider must analyze expression context and show only syntactically valid operators at each position, while preserving existing concept search and prioritization behavior.

## Impact

**Affected Code:**

- `server/src/server.ts` - Update `onCompletion` handler to add context analysis before filtering operators
- `server/src/parser/position-detector.ts` - Add context detection functions:
  - `getValidOperatorsAtPosition(line: string, position: number): string[]`
  - Detect context patterns (after complete constraint, after operator, in refinement, etc.)
- `server/src/test/position-detector.test.ts` - Add tests for context detection
- `server/src/test/completion-context.test.ts` - New test suite for completion filtering

**No Breaking Changes:**

- Purely additive - narrows completion suggestions without removing existing functionality
- Concept search integration unchanged
- All existing completion items still available, just shown at appropriate times

**Performance:**

- Minimal impact - regex-based context detection (similar to existing position detection)
- No additional FHIR queries or async operations

**User Experience:**

- Reduced cognitive load - fewer irrelevant suggestions
- Fewer syntax errors from selecting invalid operators
- Clearer guidance on what's syntactically valid at each position
