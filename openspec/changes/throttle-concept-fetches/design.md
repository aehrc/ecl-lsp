## Context

The ECL editor makes FHIR terminology calls in three places:

1. **`diagnostics-engine.ts`** — on each debounced text change, fires two bare `Promise.all()` loops: one over all `conceptValidationTasks` (one `validateConcepts()` per expression) and one over all `semanticValidationTasks` (one `validateSemantics()` per expression). Both run completely uncapped.

2. **`completion-provider.ts`** — `provideCompletionItems` is called synchronously by Monaco on every trigger character. It immediately calls `getCompletionItemsWithSearch()`, which in turn calls `searchConcepts()` on the FHIR service. There is no debounce; rapid typing fires N searches.

3. **`toggle-terms-action.ts` / `resolveAddDisplayTerms()`** — walks all bare concept IDs in the document and resolves them, potentially as N parallel `getConceptInfo()` calls.

All FHIR calls flow through `FhirTerminologyService` in `ecl-core`. The service already has response-level caching for concept lookups and a 5-minute search cache, but has no concurrency cap and no 429 handling.

**Constraint**: `ecl-core` must remain zero-dependency (no npm imports in production code).

## Goals / Non-Goals

**Goals:**

- Cap in-flight FHIR requests to at most N (default 5) across the whole service instance
- Retry 429 responses with exponential backoff + jitter, up to 3 attempts
- Debounce concept search calls in the completion provider to the last keystroke in a 200 ms window
- Honour `Retry-After` response header when present

**Non-Goals:**

- Global rate-limiting across multiple `FhirTerminologyService` instances (each instance manages its own queue)
- Persistent request deduplication beyond what the existing caches already provide
- Changing the public `ITerminologyService` interface — queue and retry are internal to `FhirTerminologyService`
- Timeout changes or circuit-breaking beyond backoff

## Decisions

### 1. Queue lives inside `FhirTerminologyService`, not in callers

**Decision**: Add a `ConcurrencyQueue` class (inline, no import) to `fhir-service.ts`. Every public method that makes an HTTP request routes through `queue.run(() => fetch(...))` instead of calling `fetch(...)` directly.

**Rationale**: All three call-sites (diagnostics, completion, display terms) funnel through the same service instance. Centralising the queue in the service means every caller is protected automatically without touching diagnostics-engine or toggle-terms-action. The alternative — a queue per call-site — would require three separate implementations and leave new call-sites unprotected by default.

**Alternative considered**: Wrap at the `diagnostics-engine.ts` level only (the most impactful site). Rejected because it leaves completion searches and display-term resolution uncapped, and would duplicate logic.

### 2. Hand-rolled FIFO queue — no external dependency

**Decision**: Implement the concurrency cap as a lightweight inline class:

```
class ConcurrencyQueue {
  private running = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly max: number) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        this.running++;
        fn().then(resolve, reject).finally(() => {
          this.running--;
          if (this.queue.length > 0) this.queue.shift()!();
        });
      };
      if (this.running < this.max) attempt();
      else this.queue.push(attempt);
    });
  }
}
```

**Rationale**: ecl-core has a hard zero-dependency constraint. p-limit (the canonical alternative) is a 0-dependency ESM-only package that would add complexity to the build. The pattern above is ~15 lines and covers the full spec requirement: FIFO ordering, slot release on completion or error, configurable cap.

### 3. Retry-with-backoff wraps the inner fetch, outside the queue slot

**Decision**: `queue.run()` wraps a retry loop, not the raw fetch. The retry loop calls `fetch`, checks the response status, and on 429: reads `Retry-After` (if present), waits `max(retryAfter, baseDelay × 2^attempt) + jitter`, then retries — still consuming the same queue slot. After 3 failures the slot is released with rejection.

**Rationale**: Holding the slot during retry is correct — the server told us it's overloaded; releasing the slot and letting another request in immediately would make things worse. The alternative (releasing the slot on 429 and re-queuing) could starve the retried request if the queue is long.

**Backoff parameters**: `baseDelay = 500 ms`, `maxDelay = 10 000 ms`, jitter = random 0–200 ms. These are constants, not configurable (YAGNI — configuring retry policy adds surface area without a concrete use case yet).

### 4. Completion debounce in `completion-provider.ts`, not in ecl-core

**Decision**: Add a 200 ms debounce inside `createCompletionProvider()` using a closure-scoped `pendingSearch` timer. `provideCompletionItems` returns static items (operators, snippets) immediately and kicks off a debounced search; if Monaco calls again before the timer fires, the previous timer is cancelled.

```
// Inside createCompletionProvider():
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let searchPromise: Promise<CoreCompletionItem[]> = Promise.resolve([]);

provideCompletionItems: async (model, position) => {
  // ... compute static items synchronously via getCompletionItemsWithSearch(service = null) ...
  if (service && isConceptSearchPosition) {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    searchPromise = new Promise(resolve => {
      debounceTimer = setTimeout(async () => {
        resolve(await getCompletionItemsWithSearch(..., service));
      }, 200);
    });
  }
  const items = await searchPromise;
  return { incomplete: true, suggestions: items.map(mapCompletionItem) };
}
```

**Rationale**: Monaco's completion API is synchronous at the call-site — we can't debounce at the Monaco registration level. Debouncing inside the provider callback, per provider instance, is the standard pattern. The alternative of debouncing inside `getCompletionItemsWithSearch` in ecl-core was rejected because ecl-core is environment-agnostic and should not own UI timing concerns.

**Note**: `getCompletionItemsWithSearch` already separates static items (no service needed) from search items. We can call it with `service = null` for the immediate return and with the real service for the debounced path — this keeps the UX responsive (operators appear instantly) while searches are throttled.

### 5. `resolveAddDisplayTerms` relies on queue, no additional change needed

**Decision**: No structural change to `resolveAddDisplayTerms` or `toggle-terms-action.ts`. Once the FHIR service queue is in place, any parallel `getConceptInfo()` calls from display-term resolution will automatically be capped.

**Rationale**: The toggle action is user-initiated (not automatic on load) so it is lower priority. The queue in the service layer provides the protection without requiring a separate batching pass. If profiling shows it still causes problems post-queue, a dedicated batch endpoint call can be added then.

## Risks / Trade-offs

**Increased latency for large documents** → The queue will serialise some calls that previously ran in parallel, adding wall-clock time to full-document validation. Mitigation: the default cap of 5 still allows good parallelism while preventing server overload; the 500 ms diagnostic debounce means the queue only engages after the user has stopped typing.

**Retry-while-holding-slot can delay other requests** → If a request hits the 429 retry cycle, its slot is occupied for up to ~11 s (3 retries × max backoff). Mitigation: with a cap of 5, at most 5 slots can be stuck simultaneously; the others drain normally. Increasing the cap or reducing `maxDelay` can be tuned if needed.

**Debounce drops intermediate search results** → A user typing quickly will see a stale or empty concept list for 200 ms. Mitigation: static completions (operators, snippets) are returned immediately without waiting for search, so the dropdown is never empty.

**`ConcurrencyQueue` is not shared across service instances** → Each `FhirTerminologyService` instance owns its queue; if multiple instances are created (e.g. in tests), they do not coordinate. This is acceptable because the editor creates one service instance per editor session.

## Open Questions

- Should `maxConcurrency` be exposed as a prop on `EclEditor` / `EclEditorConfig`, or kept as a constructor-only option on `FhirTerminologyService`? Currently leaning toward constructor-only (internal concern, not user-facing).
- Is 200 ms the right debounce window for completion search? Could be too short on slow connections (search returns after the debounce fires, causing a second render). Could expose as `completionDebounceMs` prop if feedback warrants it.
