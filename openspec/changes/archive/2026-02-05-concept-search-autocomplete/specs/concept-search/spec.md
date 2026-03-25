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
