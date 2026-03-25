## Why

The current refactoring system offers 3 separate simplification actions (simplify expression, simplify by subsumption, factor common focus) that each operate on the top-level compound expression only. Users must manually apply sub-expression refactoring for inner groups and mentally compose which actions to try. A single unified "Simplify" action that walks the expression tree bottom-up, applying all applicable techniques at each nesting level, would be more discoverable and more powerful.

## What Changes

- Replace the 3 separate simplification code actions with a single "Simplify" action
- Implement bottom-up tree walking: simplify innermost parenthesized sub-expressions first, then work outward
- Apply a chain of simplification techniques at each compound node:
  1. Remove exact duplicate operands
  2. Same-concept operator ranking (existing)
  3. FHIR subsumption via MINUS evaluation (existing)
  4. Factor common focus from OR compounds (existing)
  5. Merge same-focus refinements in AND compounds (new)
- Re-check after each transformation since one simplification may enable another
- Use the async resolve pattern (single FHIR batch) since subsumption needs the terminology server
- Keep non-simplification refactoring actions unchanged (strip/add display terms, add parentheses, add history supplement, add description filter)

## Capabilities

### New Capabilities

- `unified-simplify`: Bottom-up expression simplification engine that applies multiple techniques per compound node across all nesting levels

### Modified Capabilities

## Impact

- `server/src/refactoring/simplify-expression.ts` — rewrite: unified engine replacing the two current functions
- `server/src/refactoring/factor-common-focus.ts` — absorb into the unified engine, remove standalone module
- `server/src/refactoring/index.ts` — wire single action instead of three, remove sub-expression detection for simplify (the engine handles nesting internally)
- `server/src/server.ts` — update resolve handler (single resolve action replaces two)
- `server/src/test/refactoring.test.ts` — rewrite simplify + factor + subsumption test sections into unified tests
