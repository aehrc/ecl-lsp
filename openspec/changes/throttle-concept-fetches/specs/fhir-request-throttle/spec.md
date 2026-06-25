## ADDED Requirements

### Requirement: Bounded concurrency for FHIR requests

The FHIR service layer SHALL enforce a configurable cap on the number of concurrent in-flight FHIR requests. When the cap is reached, additional requests SHALL be queued and dispatched as slots become available. The default cap SHALL be 5 concurrent requests. The queue implementation SHALL introduce no external npm dependencies.

#### Scenario: Requests beyond the cap are queued

- **WHEN** more than 5 FHIR requests are initiated simultaneously
- **THEN** only 5 execute concurrently and the rest are held in a FIFO queue until a slot frees

#### Scenario: Queue drains as requests complete

- **WHEN** a queued request's slot becomes available
- **THEN** the next queued request begins immediately without delay

#### Scenario: Concurrency cap is configurable

- **WHEN** a consumer constructs the FHIR service with a custom `maxConcurrency` option
- **THEN** the service enforces that value instead of the default of 5

#### Scenario: Cap of 0 or negative is rejected

- **WHEN** a consumer supplies `maxConcurrency` ≤ 0
- **THEN** the service throws an `Error` at construction time

---

### Requirement: Retry with exponential backoff on 429 responses

The FHIR service SHALL detect HTTP 429 (Too Many Requests) responses and retry the failed request using exponential backoff with jitter. The service SHALL retry up to 3 times before propagating the error. Retries SHALL be transparent to callers — the returned `Promise` resolves or rejects as if it were a single call.

#### Scenario: 429 triggers a retry

- **WHEN** a FHIR request receives a 429 response
- **THEN** the service waits (baseDelay × 2^attempt + jitter) ms and retries the request

#### Scenario: Success after retry resolves the promise normally

- **WHEN** a FHIR request receives a 429 on attempt 1 and a 200 on attempt 2
- **THEN** the caller's promise resolves with the successful response data

#### Scenario: Exhausted retries reject the promise

- **WHEN** a FHIR request receives 429 on all 3 retry attempts
- **THEN** the caller's promise rejects with a `TooManyRequestsError` (or equivalent)

#### Scenario: Non-429 errors are not retried

- **WHEN** a FHIR request fails with a 400, 404, or 500 response
- **THEN** the service rejects immediately without retrying

#### Scenario: Retry respects Retry-After header when present

- **WHEN** a 429 response includes a `Retry-After` header (integer seconds)
- **THEN** the service waits at least that many seconds before the next attempt
