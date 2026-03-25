## ADDED Requirements

### Requirement: Bulk concept validation via POST ValueSet/$expand

The system SHALL validate all concept IDs in an expression with a single POST `ValueSet/$expand` request instead of individual sequential `CodeSystem/$lookup` calls. The POST body SHALL contain a ValueSet resource with `compose.include` listing all concept codes for the `http://snomed.info/sct` system, and the `property=inactive` query parameter SHALL be included to retrieve inactive status.

#### Scenario: Validate multiple concepts in one request

- **WHEN** an expression contains concept IDs 404684003, 363698007, and 39057004
- **THEN** the system sends a single POST `ValueSet/$expand` with all three codes in `compose.include[0].concept[]` and the `property=inactive` parameter

#### Scenario: Detect unknown concept from bulk response

- **WHEN** the bulk expand response does not include concept 999999999 in `expansion.contains[]`
- **THEN** the system produces a warning diagnostic: "Concept 999999999 not found in terminology server"

#### Scenario: Detect inactive concept from bulk response

- **WHEN** the bulk expand response includes concept 123456001 with property `inactive` set to `true`
- **THEN** the system produces a warning diagnostic: "Concept 123456001 is INACTIVE"

#### Scenario: Active concept produces no warning

- **WHEN** the bulk expand response includes concept 404684003 without an `inactive=true` property
- **THEN** the system produces no diagnostic for that concept

#### Scenario: Single concept in expression

- **WHEN** an expression contains only one concept ID
- **THEN** the system still uses the bulk validation method (no special case for single concepts)

#### Scenario: Fallback on bulk request failure

- **WHEN** the POST `ValueSet/$expand` request fails with a 4xx or 5xx status
- **THEN** the system falls back to parallel individual `getConceptInfo` calls for each concept and logs a warning that bulk validation is unavailable

### Requirement: Parallel validation across expressions

The system SHALL validate concepts across multiple expressions in a document concurrently using parallel execution.

#### Scenario: Multi-expression document validated in parallel

- **WHEN** a document contains three expressions separated by `/* ECL-END */`
- **THEN** the system sends bulk validation requests for all three expressions concurrently rather than sequentially

#### Scenario: Independent expression failures do not block others

- **WHEN** validation fails for one expression but succeeds for others
- **THEN** the system still reports diagnostics for the successful expressions

### Requirement: Populate concept cache from bulk results

The system SHALL populate the existing concept info cache with results from bulk validation so that subsequent single-concept lookups (hover, completion) benefit from cached data.

#### Scenario: Hover after validation uses cached data

- **WHEN** bulk validation has already retrieved info for concept 404684003
- **AND** user hovers over concept 404684003
- **THEN** the system returns cached concept info without an additional FHIR request

#### Scenario: Cache respects size limit

- **WHEN** bulk validation returns concepts and the cache is near its 10,000 entry limit
- **THEN** the system does not exceed the cache size limit

### Requirement: Diagnostic output unchanged

The system SHALL produce identical diagnostic messages and positions as the previous sequential validation. The change is an internal optimization only.

#### Scenario: Warning message text unchanged

- **WHEN** concept 999999999 is not found
- **THEN** the diagnostic message text is identical to the previous sequential implementation

#### Scenario: Warning position unchanged

- **WHEN** a concept has an inline comment before it on the same line
- **THEN** the diagnostic range points to the concept ID's position in the original document line, not the comment-stripped position
