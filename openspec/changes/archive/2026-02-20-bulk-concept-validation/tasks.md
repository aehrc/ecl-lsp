## 1. Interface and Types

- [x] 1.1 Add `validateConcepts(conceptIds: string[]): Promise<Map<string, ConceptInfo | null>>` to `ITerminologyService` interface in `types.ts`

## 2. FHIR Service Implementation

- [x] 2.1 Implement `validateConcepts` in `FhirTerminologyService` — build POST body with `ValueSet.compose.include[].concept[]`, send to `$expand?property=inactive`, parse response
- [x] 2.2 Parse `inactive` property from expansion contains entries (handle missing property gracefully, default to active)
- [x] 2.3 Map response: concepts in `expansion.contains[]` → `ConceptInfo`, concepts not in response → `null`
- [x] 2.4 Populate existing concept info cache from bulk results (respect 10,000 entry limit)
- [x] 2.5 Implement fallback: on 4xx/5xx, fall back to parallel individual `getConceptInfo` calls via `Promise.all`

## 3. Mock Service Implementation

- [x] 3.1 Implement `validateConcepts` in `MockTerminologyService` — iterate `mockData` map, return matching entries

## 4. Server Integration

- [x] 4.1 Replace sequential `for` loop in `server.ts` concept validation with call to `validateConcepts`
- [x] 4.2 Wrap per-expression validation in `Promise.all` for parallel execution across expressions in a document
- [x] 4.3 Verify diagnostic messages and positions are identical to previous implementation

## 5. Tests

- [x] 5.1 Unit test: `validateConcepts` returns correct `ConceptInfo` for known concepts
- [x] 5.2 Unit test: `validateConcepts` returns `null` for unknown concepts
- [x] 5.3 Unit test: `validateConcepts` detects inactive concepts
- [x] 5.4 Unit test: `validateConcepts` with empty array returns empty map
- [x] 5.5 Unit test: cache is populated after bulk validation (subsequent `getConceptInfo` returns cached data)
- [x] 5.6 Integration test: multi-expression document produces correct diagnostics using bulk validation
- [x] 5.7 Verify all existing tests still pass (691 tests — 684 original + 7 new)
