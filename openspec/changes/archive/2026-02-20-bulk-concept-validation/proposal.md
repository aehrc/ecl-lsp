## Why

The language server currently validates each concept ID with a separate sequential `CodeSystem/$lookup` request. For an expression with 5 concepts, that's 5 serial round-trips to the terminology server, each waiting for the previous to complete. This is slow and scales poorly — especially as semantic validation (planned separately) will add further FHIR requests. A single bulk request can check all concepts at once.

## What Changes

- **Bulk concept validation**: Replace the N sequential `CodeSystem/$lookup` calls with a single `POST ValueSet/$expand` request. The POST body contains a ValueSet with `compose.include` listing all concept IDs. The `property=inactive` parameter returns the inactive flag for each concept in the expansion. Concepts missing from the response are unknown; concepts present with `inactive=true` get the existing inactive warning.
- **POST instead of GET**: Using POST with a ValueSet resource body avoids URL length limits that would occur with GET-based ECL queries containing many concept IDs.
- **Parallel execution pattern**: Where multiple independent FHIR requests exist (e.g., validating concepts across separate expressions in a multi-expression document), execute them in parallel using `Promise.all`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `concept-search`: Concept existence and inactive status checking changes from sequential individual lookups to bulk validation via `ValueSet/$expand`

## Impact

- `server/src/server.ts` — Replace sequential `for` loop (line ~316) with single bulk call + parallel execution across expressions
- `server/src/terminology/fhir-service.ts` — Add `validateConcepts(ids: string[])` method using POST `ValueSet/$expand` with `compose.include` and `property=inactive`
- `server/src/terminology/types.ts` — Add return type for bulk validation results
- Existing concept info cache (`this.cache`) still populated from bulk results for hover/other uses
- All existing tests must continue to pass; mock service needs matching bulk method
