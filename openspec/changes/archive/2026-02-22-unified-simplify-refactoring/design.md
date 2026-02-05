## Context

The current refactoring system has three separate simplification-related code actions:

1. **Simplify expression** (`simplify-expression.ts`) — synchronous same-concept-ID operator ranking
2. **Simplify by subsumption** (`simplify-expression.ts`) — async FHIR MINUS-based subset detection
3. **Factor common focus** (`factor-common-focus.ts`) — synchronous OR factoring of shared focus concepts

All three operate only on the top-level compound expression. Sub-expression simplification relies on the cursor-position-based sub-expression detection in `index.ts`, which only handles one nesting level.

The resolve handler in `server.ts` currently dispatches two async actions: `resolveAddDisplayTerms` and `resolveSimplifyBySubsumption`.

## Goals / Non-Goals

**Goals:**

- Replace the three simplification actions with a single "Simplify" action
- Implement bottom-up tree walking so inner compound groups are simplified first
- Apply five simplification techniques per compound node (duplicates, operator ranking, FHIR subsumption, factor focus OR, merge focus AND)
- Re-check after each transformation to catch cascading simplifications
- Maintain the async resolve pattern since FHIR subsumption requires it

**Non-Goals:**

- Modifying non-simplification refactoring actions
- Changing the AST structure or parser
- Adding new FHIR operations beyond the existing MINUS evaluation
- Handling MINUS compounds (set-difference semantics are not subsumption)

## Decisions

### 1. Single module replaces two

Rewrite `simplify-expression.ts` as the unified engine. Absorb `factor-common-focus.ts` logic into it and delete the standalone module.

**Rationale:** All five techniques operate on compound nodes and share the same traversal logic. A single module avoids coordination overhead between separate actions.

**Alternative considered:** Keep separate modules and compose them in `index.ts`. Rejected because bottom-up traversal with re-checking requires tight integration between techniques.

### 2. Bottom-up via recursive descent on the text

The engine works on the expression text (not the AST directly) using a recursive approach:

1. Find compound nodes via AST traversal
2. For compound nodes whose operands contain parenthesized sub-expressions, recursively simplify those sub-expressions first (by parsing the sub-text and running the full engine on it)
3. After inner groups are simplified, re-parse the updated text and apply techniques to the current level

**Rationale:** The AST is not mutable, so we can't simplify in place. Working on text segments and re-parsing after each level lets us use the existing parser without modification.

**Alternative considered:** Build a mutable AST. Rejected as too invasive — the ANTLR visitor produces an immutable snapshot, and a mutable AST would be a major new abstraction.

### 3. Technique application order

At each compound node, techniques run in this order:

1. **Remove exact duplicates** — cheapest check, text comparison
2. **Same-concept operator ranking** — synchronous, concept-ID based
3. **Factor common focus (OR) / Merge same-focus (AND)** — synchronous, structural
4. **FHIR subsumption** — async, most expensive

After any technique changes the node, restart from step 1 on the resulting expression.

**Rationale:** Cheaper techniques first avoids unnecessary FHIR calls. Re-checking catches cascades (e.g., duplicate removal might expose an operator-ranking opportunity).

### 4. Async resolve wraps the entire engine

The initial code action (offered synchronously) does a quick check: does the expression contain any AND/OR compound with 2+ operands? If yes, offer the action with metadata. The resolve handler runs the full bottom-up engine.

**Rationale:** The synchronous check is O(1) on the AST. Running the full engine (which may involve FHIR) only happens when the user actually selects the action, keeping the code action menu responsive.

### 5. Sub-expression detection removed from index.ts for simplify

Since the unified engine handles nesting internally, the `findInnermostParenContent` sub-expression detection in `index.ts` no longer needs to offer separate simplify actions for inner groups. Other refactoring actions (parentheses, etc.) still use sub-expression detection.

**Rationale:** Avoids duplicate simplify actions in the code action menu and ensures consistent bottom-up ordering.

## Risks / Trade-offs

**[Re-parsing overhead]** → Each nesting level re-parses its segment. For typical ECL expressions (2-3 levels deep), this is negligible. Deep nesting (5+ levels) is extremely rare in practice.

**[FHIR call volume]** → With N operands at each of M levels, worst case is O(M × N²) FHIR calls. Mitigated by: (1) cheaper techniques run first and may eliminate operands, (2) the early-exit when `removeSet.size >= n - 1`, (3) existing per-pair try/catch ensures one failure doesn't block others.

**[Merge same-focus is new logic]** → The AND-merge technique (combining `(< X : a=v1) AND (< X : a=v2)` → `< X : a=v1 AND a=v2`) is new and needs careful testing. The structural requirements are strict (same focus key, both must be parenthesized refined expressions) which limits false positives.

**[Test rewrite scope]** → The existing simplify + factor + subsumption test sections in `refactoring.test.ts` need to be rewritten as unified tests. The mock terminology service infrastructure (SubsumptionMockService) remains unchanged.
