## ADDED Requirements

### Requirement: Search concepts via FHIR ValueSet/$expand

The system SHALL provide a concept search interface that queries the FHIR terminology server using the `ValueSet/$expand` operation with a filter parameter.

#### Scenario: Search by display name

- **WHEN** user enters "diabetes" in the search box
- **THEN** system queries FHIR with filter="diabetes" and returns matching concepts

#### Scenario: Search by potential concept ID

- **WHEN** user enters a numeric string that matches SNOMED CT ID pattern (6-18 digits) like "404684003"
- **THEN** system performs `CodeSystem/$lookup` to check if it's a valid concept ID and includes it in results if found

#### Scenario: Search description when ID not valid

- **WHEN** user enters a numeric string like "7311" that is not a valid SNOMED CT ID
- **THEN** system uses "7311" as filter parameter in `ValueSet/$expand` to search concept descriptions containing that number

#### Scenario: Combine direct lookup with filter search

- **WHEN** user enters a valid SNOMED CT ID like "404684003"
- **THEN** system performs both direct `$lookup` and `$expand` with filter, showing direct match first if found followed by description matches

#### Scenario: Debounce search queries

- **WHEN** user types quickly in the search box
- **THEN** system waits 300ms after last keystroke before sending FHIR query

#### Scenario: Limit search results

- **WHEN** FHIR returns more than 20 results
- **THEN** system displays only the first 20 results with indication of more available

### Requirement: Display search results with concept details

The system SHALL display search results showing concept ID, Fully Specified Name (FSN), and Preferred Term (PT) for each matching concept.

#### Scenario: Format search result display

- **WHEN** search results are displayed
- **THEN** each result shows format: "SCTID | FSN (PT)" for clear identification

#### Scenario: Show empty state when no results

- **WHEN** search query returns zero results
- **THEN** system displays "No concepts found" message

### Requirement: Insert selected concept at cursor

The system SHALL insert the selected concept at the current cursor position in the format `SCTID |Term|`.

#### Scenario: Insert concept with term

- **WHEN** user selects concept "404684003 | Clinical finding"
- **THEN** system inserts "404684003 |Clinical finding|" at cursor position

#### Scenario: Insert concept ID only if term unavailable

- **WHEN** user selects a concept without a preferred term
- **THEN** system inserts only the concept ID without pipe delimiters

#### Scenario: Replace existing concept if cursor on concept ID

- **WHEN** cursor is positioned on an existing concept ID and user selects new concept
- **THEN** system replaces the existing concept ID with the new one

### Requirement: Invoke search via LSP command

The system SHALL register an LSP command `ecl.searchConcept` that can be invoked from the command palette or via keyboard shortcut.

#### Scenario: Invoke via command palette

- **WHEN** user runs "ECL: Search for Concept" from command palette
- **THEN** system opens concept search dialog at current cursor position

#### Scenario: Invoke via keyboard shortcut

- **WHEN** user presses configured keyboard shortcut (e.g., Ctrl+Space+S)
- **THEN** system opens concept search dialog

### Requirement: Cache search results for performance

The system SHALL cache recent search results to avoid redundant FHIR queries.

#### Scenario: Return cached results for repeated query

- **WHEN** user searches for "diabetes" twice within 5 minutes
- **THEN** second search returns cached results without FHIR query

#### Scenario: Clear cache after timeout

- **WHEN** 5 minutes elapse since last search
- **THEN** system clears cached results for that query

#### Scenario: Cache size limit

- **WHEN** cache exceeds 100 unique queries
- **THEN** system evicts least recently used queries using LRU strategy

### Requirement: Handle FHIR service unavailability gracefully

The system SHALL continue to function when the FHIR terminology server is unavailable, showing appropriate error messages.

#### Scenario: Show error when FHIR unavailable

- **WHEN** FHIR server is unreachable and user performs search
- **THEN** system displays "Terminology server unavailable" error message

#### Scenario: Timeout after 5 seconds

- **WHEN** FHIR query takes longer than 5 seconds
- **THEN** system cancels query and shows "Search timeout" message

#### Scenario: Allow retry on failure

- **WHEN** search fails due to network error
- **THEN** system provides "Retry" button in error message

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
