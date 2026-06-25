## 1. ConcurrencyQueue — ecl-core

- [x] 1.1 Add inline `ConcurrencyQueue` class to `packages/ecl-core/src/terminology/fhir-service.ts` (FIFO, configurable `max`, no external dependency)
- [x] 1.2 Add `maxConcurrency` option to `FhirTerminologyServiceOptions` (default `5`; throw `Error` if ≤ 0)
- [x] 1.3 Instantiate `ConcurrencyQueue` in `FhirTerminologyService` constructor
- [x] 1.4 Route every HTTP fetch inside the service through `queue.run(() => fetch(...))` — cover `getConceptInfo`, `validateConcepts`, `searchConcepts`, `evaluateEcl`, `getHistoricalAssociations`, and any other public methods that make network calls
- [x] 1.5 Write unit tests in `packages/ecl-core/src/test/` asserting: (a) at most N calls in flight simultaneously, (b) queued calls execute after a slot frees, (c) `maxConcurrency ≤ 0` throws at construction

## 2. Retry-with-backoff on 429 — ecl-core

- [x] 2.1 Add a private `fetchWithRetry` helper inside `FhirTerminologyService` that wraps a single HTTP call with up to 3 retry attempts on 429
- [x] 2.2 Implement exponential backoff: `baseDelay=500ms`, `maxDelay=10000ms`, random jitter 0–200 ms
- [x] 2.3 Read `Retry-After` response header (integer seconds) and use `max(retryAfterMs, computedBackoff)` as the wait
- [x] 2.4 Propagate rejection after 3 failed attempts (non-429 errors reject immediately, no retry)
- [x] 2.5 Replace direct `fetch()` calls inside `queue.run()` with `fetchWithRetry()` calls
- [x] 2.6 Write unit tests: (a) 429 → wait → success resolves, (b) 3× 429 → rejects, (c) 400 is not retried, (d) `Retry-After` header is honoured

## 3. Completion provider debounce — ecl-editor-core

- [x] 3.1 Add closure-scoped `debounceTimer` and `latestSearchResult` state inside `createCompletionProvider()` in `packages/ecl-editor-core/src/monaco/completion-provider.ts`
- [x] 3.2 On each `provideCompletionItems` call: cancel any pending timer, return static completions immediately (call `getCompletionItemsWithSearch` with `service = null`), then start a 200 ms timer for the concept-search path
- [x] 3.3 After the debounce fires, call `getCompletionItemsWithSearch` with the real service and update `latestSearchResult`; Monaco's `incomplete: true` flag will trigger a refresh
- [x] 3.4 Write tests asserting: (a) rapid successive calls fire only one search, (b) a single call after 200 ms idle fires exactly one search, (c) static completions appear immediately without waiting for search

## 4. Integration verification

- [ ] 4.1 Manually load a large ECL expression (≥ 20 concept IDs) in the VSCode extension dev host and confirm no 429 errors appear in the output channel
- [ ] 4.2 Verify that diagnostic markers still appear correctly for unknown/inactive concepts after the queue is in place
- [ ] 4.3 Verify completion search still works and operators appear without delay
- [x] 4.4 Run full test suite (`npm test`) and confirm no regressions
- [x] 4.5 Run lint and format checks (`npm run lint && npm run format:check`)

## 5. Branch and PR

- [x] 5.1 Create branch `fix/throttle-concept-fetches` from `main`
- [ ] 5.2 Commit changes with descriptive messages per logical unit (queue, retry, debounce)
- [ ] 5.3 Open PR referencing GitHub issue #52; include a brief description of the three changes and the test steps from task 4
