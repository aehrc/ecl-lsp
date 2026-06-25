## Why

When the ECL editor renders a large expression containing many concept IDs, all FHIR concept lookups fire simultaneously — the diagnostics engine dispatches `Promise.all()` across every expression at once, and display-term resolution calls `getConceptInfo()` in parallel for every bare concept ID. This produces hundreds of concurrent requests against the terminology server, consistently triggering HTTP 429 (Too Many Requests) responses. The issue is now tracked in GitHub #52.

## What Changes

- **Concurrency cap in diagnostics engine** — replace the bare `Promise.all()` over all expressions with a bounded concurrency queue (max N parallel FHIR calls). Implemented inside `ecl-editor-core`; zero new dependencies (hand-rolled queue to preserve ecl-core's zero-dependency constraint).
- **Completion provider debounce** — add a short debounce (≈200 ms) before firing `searchConcepts()` in the Monaco completion provider so rapid keystrokes coalesce into a single request.
- **Batched display-term resolution** — ensure `resolveAddDisplayTerms()` in ecl-core routes all bare concept IDs through a single batched FHIR call (or a queued series) rather than N parallel `getConceptInfo()` calls.
- **429 retry with backoff in FHIR service** — detect 429 responses in `fhir-service.ts` and apply exponential backoff + jitter before retrying, so transient overloads self-heal without surfacing errors to the user.

## Capabilities

### New Capabilities

- `fhir-request-throttle`: Concurrency cap and retry-with-backoff for FHIR requests — governs how many FHIR calls may be in-flight at once and what happens on 429. Lives in ecl-core's FHIR service layer.

### Modified Capabilities

- `semantic-validation`: The concurrent dispatch behaviour changes — validation requests are now queued through the concurrency cap rather than all fired at once via `Promise.all()`.
- `completion`: The search trigger path gains a debounce, changing the observable timing of `searchConcepts()` calls.

## Impact

- `packages/ecl-core/src/terminology/fhir-service.ts` — retry/backoff logic and optional request queue integration
- `packages/ecl-core/src/refactoring/` (or wherever `resolveAddDisplayTerms` lives) — batch concept lookup instead of parallel individual calls
- `packages/ecl-editor-core/src/diagnostics-engine.ts` — replace `Promise.all()` with bounded-concurrency dispatch
- `packages/ecl-editor-core/src/monaco/completion-provider.ts` — add debounce to search trigger
- No changes to public APIs or LSP protocol surface
- No new npm dependencies (queue implemented inline; ecl-core must remain zero-dependency)
