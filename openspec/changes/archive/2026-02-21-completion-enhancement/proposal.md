## Why

The ECL completion system currently covers ~5% of the ECL 2.2 grammar — only constraint operators (`<`, `<<`, `>`, `>>`), logical operators (`AND`, `OR`, `MINUS`), refinement separator (`:`), snippets, and concept search. All advanced constructs (filters, cardinality, member-of, child/parent operators, comparison operators, attribute groups, history supplements, dotted expressions, reverse flag, wildcard) offer no completion support. Users writing real-world ECL expressions must type these constructs from memory, which slows authoring and increases errors.

## What Changes

- Add completion for **filter constraints** (`{{ D ... }}`, `{{ C ... }}`, `{{ M ... }}`) with context-aware keyword suggestions (term, type, language, dialect, module, active, effectiveTime, definitionStatus)
- Add completion for **history supplements** (`{{ + HISTORY }}`, `{{ + HISTORY-MIN }}`, `{{ + HISTORY-MOD }}`, `{{ + HISTORY-MAX }}`)
- Add completion for **cardinality** (`[0..0]`, `[1..1]`, `[0..*]`, etc.) in refinement attribute/group positions
- Add completion for **member-of** (`^`) operator at constraint positions
- Add completion for **child/parent operators** (`<!`, `<<!`, `>!`, `>>!`) alongside existing constraint operators
- Add completion for **comparison operators** (`=`, `!=`) after attribute names in refinements
- Add completion for **attribute groups** (`{ }`) after `:` or cardinality in refinements
- Add completion for **reverse flag** (`R`) in attribute name position within refinements
- Add completion for **wildcard** (`*`) in attribute value position
- Add completion for **dot notation** (`.`) after complete expressions
- Extend position detector to recognise these new contexts via regex patterns on text-before-cursor

## Capabilities

### New Capabilities

- `filter-completion`: Completion for description filters (`{{ D }}`), concept filters (`{{ C }}`), member filters (`{{ M }}`), and history supplements (`{{ + HISTORY }}`), including filter keyword suggestions inside filter blocks
- `refinement-completion`: Completion for cardinality (`[N..M]`), attribute groups (`{ }`), comparison operators (`=`, `!=`), reverse flag (`R`), and wildcard (`*`) within refinement contexts
- `operator-completion-extended`: Completion for member-of (`^`), child/parent operators (`<!`, `<<!`, `>!`, `>>!`), and dot notation (`.`) — extending the existing constraint operator set

### Modified Capabilities

- `completion`: Extend position detector and provider to route to new completion contexts; add the new operator labels to the operator completion item list

## Impact

- `server/src/completion/provider.ts` — add new completion item constants, extend `getCompletionItems()` routing
- `server/src/completion/snippets.ts` — add filter/refinement snippet templates
- `server/src/parser/position-detector.ts` — add regex patterns for filter, refinement, cardinality, and dotted contexts
- `server/src/test/completion.test.ts` — new tests for all new completion contexts
- `server/src/test/completion-context.test.ts` — new position detector tests for new patterns
- No new dependencies; no breaking changes to existing completions
