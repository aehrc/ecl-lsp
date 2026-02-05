## Context

The language server validates every concept ID in an ECL expression by calling `CodeSystem/$lookup` individually and sequentially. A refinement like `< 404684003 : 363698007 = < 39057004` triggers 3 serial HTTP requests, each waiting for the previous to complete. With a 2-second timeout per request, worst case is 6 seconds for a single expression.

The `ITerminologyService` interface currently exposes `getConceptInfo(conceptId: string)` which maps to one `$lookup` call. The server loops through extracted concepts and awaits each call in sequence (`server.ts` line ~316). Results are cached in a 10,000-entry LRU map, so subsequent validations are fast — but the first validation of a document is always slow.

FHIR `ValueSet/$expand` supports POST with a ValueSet resource body containing `compose.include[].concept[]`, which can list any number of concept codes. The `property` parameter can request additional properties like `inactive` in the expansion output. This provides a single-request alternative.

## Goals / Non-Goals

**Goals:**

- Replace N sequential `$lookup` calls with 1 POST `ValueSet/$expand` per expression
- Populate the existing concept info cache from bulk results (so hover, etc. still work)
- Execute validation across multiple expressions in parallel
- Maintain identical diagnostic output (same warnings, same positions)
- Keep `getConceptInfo` for single-concept use cases (hover, inline completion)

**Non-Goals:**

- Semantic validation (attribute scope, value constraints) — separate change
- Changing the concept info cache strategy
- Modifying the `searchConcepts` or `evaluateEcl` methods

## Decisions

### 1. New `validateConcepts` method on `ITerminologyService`

Add `validateConcepts(conceptIds: string[]): Promise<Map<string, ConceptInfo | null>>` to the interface. Returns a map from concept ID to info (or null if unknown).

**Why a new method instead of modifying `getConceptInfo`:** The existing method is used by hover and completion for single concepts and has its own caching. The bulk method serves a different purpose (batch validation) and has different request mechanics (POST vs GET). Keeping both avoids changing callers that only need one concept.

**Alternative considered:** Making `getConceptInfo` accept an array — rejected because it changes the interface for all callers and mixes single/batch semantics.

### 2. POST `ValueSet/$expand` with `compose.include`

Request body:

```json
POST /ValueSet/$expand?property=inactive
Content-Type: application/fhir+json

{
  "resourceType": "ValueSet",
  "compose": {
    "include": [{
      "system": "http://snomed.info/sct",
      "concept": [
        { "code": "404684003" },
        { "code": "363698007" },
        { "code": "39057004" }
      ]
    }]
  }
}
```

Response `expansion.contains[]` lists concepts that exist. Each entry may include a `property` array with `inactive` status. Concepts not in the response are unknown.

**Why POST with compose instead of GET with ECL:** POST body has no URL length limit. ECL-based GET (`?fhir_vs=ecl/(id1 OR id2 OR ...)`) would hit URL limits with many concepts. The compose approach is also more explicit — it asks "do these specific codes exist?" rather than "evaluate this ECL".

**Why `$expand` instead of `$validate-code`:** `$validate-code` checks one code at a time. `$expand` with compose returns all matching codes in one call.

### 3. Parallel execution across expressions

A document may contain multiple expressions separated by `/* ECL-END */`. Each expression's concept validation is independent. Use `Promise.all` to validate all expressions concurrently.

Within a single expression, there is only one bulk call, so no further parallelism is needed.

### 4. Populate cache from bulk results

After a bulk validation call, populate the existing `this.cache` map with all returned `ConceptInfo` entries. This means subsequent `getConceptInfo` calls (e.g., hover) will hit the cache instead of making individual requests.

For unknown concepts (not in response), cache a sentinel or simply don't cache — the next individual lookup will confirm the concept is unknown.

### 5. Mock service implementation

`MockTerminologyService.validateConcepts` simply iterates its `mockData` map and returns results. No HTTP involved. Existing tests that use the mock continue to work; new tests verify bulk behaviour.

## Risks / Trade-offs

**[Risk] Server doesn't support POST `$expand` with compose** → Unlikely for Ontoserver (the default), but possible for other FHIR servers. Mitigation: Fall back to parallel individual `getConceptInfo` calls if the bulk request fails with 4xx/5xx. Log a warning so users know bulk validation is unavailable.

**[Risk] Large expansion response for many concepts** → If an expression references 50+ concepts, the response is large. Mitigation: This is bounded by the number of unique concept IDs in one expression, which is rarely more than ~20 in practice.

**[Risk] `property=inactive` not supported by all servers** → Some servers may ignore the property parameter. Mitigation: If the `inactive` property is absent from a concept's response, default to active (current behaviour when property is missing).

**[Trade-off] Two code paths (bulk + individual)** → Slightly more code to maintain. Acceptable because they serve different use cases and the individual path is needed regardless for hover/completion.
