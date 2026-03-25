## Context

The language server now validates syntax (ANTLR parser) and concept existence/active status (bulk `ValueSet/$expand`). The expanded AST visitor produces `RefinedExpressionNode` with `AttributeNode[]`, each containing an `AttributeNameNode` (concept or ECL) and `AttributeValueNode` (expression, wildcard, or raw value). The FHIR terminology server can evaluate arbitrary ECL expressions via `ValueSet/$expand`, which means we can build validation queries that check whether attributes and values are semantically appropriate.

Three validation checks are proposed:

1. **Attribute scope** — is the attribute a valid SNOMED linkage concept?
2. **Value constraint** — are the specified values compatible with the attribute on the focus concept?
3. **Empty sub-expression** — does any part of the expression match zero concepts?

Each check requires one or more FHIR `$expand` calls. A refinement with 3 attributes could require up to 7 calls (3 attribute checks + 3 value checks + 1 empty check). These must be parallel and the feature must be configurable.

## Goals / Non-Goals

**Goals:**

- Warn on attributes that are not descendants of `106237007 |Linkage concept|`
- Warn on value constraints that are completely disjoint from the valid range (`A.B`)
- Warn on sub-expressions that evaluate to 0 results
- Skip all checks when the value is `*` (wildcard)
- Execute all independent FHIR requests in parallel
- Make the feature configurable (on by default, `ecl.semanticValidation.enabled`)
- Show the first few out-of-scope concepts in attribute warnings

**Non-Goals:**

- Full MRCM (Machine Readable Concept Model) validation — checking cardinality, mandatory attributes, or attribute group constraints
- Validating string/numeric/boolean comparison values (only ECL expression values)
- Caching ECL evaluation results across document changes (each change re-validates)
- Validating filter constraints (`{{ D ... }}`, `{{ C ... }}`)

## Decisions

### 1. ECL text reconstruction from source text, not AST

Semantic validation needs to build ECL query strings like `<attribute-ecl> MINUS < 106237007` or `<value-ecl> AND <focus>.B`. Rather than reconstructing ECL from AST nodes (lossy, fragile), extract the original ECL text from the source document using the AST node's `range` (start/end offsets).

Given `< 404684003 : 363698007 |Finding site| = < 39057004`:

- Focus ECL: `< 404684003` (from `RefinedExpressionNode.expression.range`)
- Attribute name ECL: `363698007` (from `AttributeNameNode.range` — bare concept ID, so the validation query is `363698007 MINUS < 106237007`)
- Value ECL: `< 39057004` (from `AttributeValueNode.expression.range`)

This preserves the exact text the user wrote, including constraint operators, terms, and nested expressions.

**Alternative considered:** Building ECL strings from AST node fields — rejected because the AST doesn't store constraint operators on AttributeNameNode, and reconstructing compound expressions would be error-prone.

### 2. Validation query patterns

**Attribute scope check:**

```
(<attribute-ecl>) MINUS (< 106237007 |Linkage concept|)
```

If `total > 0`, some attribute concepts are not valid linkage concepts. Report the first 5 from the result for the warning message.

For a simple concept ID attribute (most common case), this is:

```
<id> MINUS (< 106237007)
```

**Value constraint check:**

```
(<value-ecl>) AND (<focus-ecl>.<attribute-name-ecl>)
```

If `total === 0`, the value and valid range are completely disjoint — warn. If `total > 0`, at least some values are valid — no warning.

Skip this check when:

- Value is wildcard (`*`)
- Value is a raw value (string/numeric comparison, not ECL)
- Focus concept is wildcard

**Empty sub-expression check:**

```
<sub-expression-ecl>
```

Evaluate each sub-expression operand in compound expressions. If `total === 0`, warn that this part matches nothing. Also check the focus concept in refinements.

**Individual refinement check:**
For a refined expression with multiple attributes `A : B1 = C1, B2 = C2`, evaluate each attribute's refinement independently:

```
<focus-ecl> : <attr1-name-ecl> = <attr1-value-ecl>
<focus-ecl> : <attr2-name-ecl> = <attr2-value-ecl>
```

If any individual refinement evaluates to 0 results, warn on that specific attribute-value pair. This pinpoints which refinement is impossible rather than just reporting that the whole expression is empty. Skip this check when the value is wildcard (`*`).

### 3. New `semantic-validator.ts` module

Create `server/src/semantic/validator.ts` with a pure function:

```typescript
async function validateSemantics(
  ast: ExpressionNode,
  sourceText: string,
  terminologyService: ITerminologyService,
): Promise<SemanticDiagnostic[]>;
```

Returns an array of diagnostics with range, message, and severity. The server.ts integration just maps these to LSP diagnostics. This keeps the logic testable without LSP dependencies.

The module walks the AST looking for:

- `RefinedExpressionNode` → check attributes and values
- `CompoundExpressionNode` → check each operand for empty results
- `SubExpressionNode` → check for empty results when part of a compound

**Alternative considered:** Putting validation logic directly in server.ts — rejected because it's already ~800 lines and the validation logic is complex enough to warrant its own module.

### 4. Parallel execution within validation

For a single refined expression `A : B1 = C1, B2 = C2`:

- Attribute checks for B1 and B2 are independent → parallel
- Value checks for C1 and C2 are independent → parallel
- Attribute checks and value checks are independent → all 4 in parallel

Use `Promise.all` to batch all checks for a single expression, then `Promise.all` again across expressions in a document (already done by bulk-concept-validation change).

### 5. Debouncing

Semantic validation runs on the same `onDidChangeContent` event as syntax validation. The existing debounce (document change → re-validate) already prevents rapid-fire validation. No additional debouncing needed — but semantic validation should be skipped if a newer document version arrives before the FHIR requests complete (use document version tracking).

### 6. Configuration

Add `ecl.semanticValidation.enabled` (boolean, default `true`) to the client's `package.json` contribution. Server reads this in `initTerminologyService` alongside existing config. When disabled, skip the entire semantic validation pass.

**Alternative considered:** Separate toggles for each check type — rejected as premature. A single toggle is sufficient; finer control can be added later if needed.

### 7. `evaluateEcl` with count=1 for existence checks

Most semantic checks only need to know if a result set is empty or non-empty. Use `count=1` for these (attribute scope and value disjointness checks) to minimize response size. Only the attribute scope warning needs `count=5` to show the first few out-of-scope concepts.

## Risks / Trade-offs

**[Risk] FHIR server rate limiting or slowness** → All checks use `Promise.all` but a document with 10 refinements could trigger 20+ parallel requests. Mitigation: The 15-second timeout per request already exists. Could add a concurrency limiter later if needed, but start without one.

**[Risk] Dotted attribute ECL (`A.B`) not supported by all servers** → Dotted attributes are ECL 2.0+. Mitigation: Ontoserver supports them. If the query fails, catch the error and skip the value constraint check for that attribute (graceful degradation).

**[Risk] False positives on attribute scope** → Some valid attributes may not be under `106237007` in all editions/versions. Mitigation: The warning message should be informational, not an error. Users can disable semantic validation if their edition differs.

**[Risk] Validation latency visible to user** → Multiple FHIR round-trips add latency. Mitigation: Semantic diagnostics appear asynchronously after syntax diagnostics (which are instant). The user sees syntax errors immediately; semantic warnings arrive when ready. Document version check prevents stale results from overwriting newer syntax-only diagnostics.

**[Trade-off] No caching of ECL evaluation results** → Each document edit re-evaluates. This is acceptable because ECL text changes on each edit, so cached results would rarely be reusable. The concept info cache (from bulk validation) is unaffected.
