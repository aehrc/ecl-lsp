## ADDED Requirements

### Requirement: Implement FHIR CodeSystem/$lookup for concept information

The system SHALL implement FHIR terminology service integration using CodeSystem/$lookup operation to retrieve concept details.

#### Scenario: Retrieve concept information via FHIR

- **WHEN** `getConceptInfo("404684003")` is called
- **THEN** system makes HTTP GET to `{baseUrl}/CodeSystem/$lookup?system=http://snomed.info/sct&code=404684003`

#### Scenario: Transform FHIR Parameters response to ConceptInfo

- **WHEN** FHIR server returns Parameters resource with concept details
- **THEN** system extracts FSN, PT, and concept ID into ConceptInfo type

#### Scenario: Default to Ontoserver CSIRO endpoint

- **WHEN** terminology service is initialized without configuration
- **THEN** system uses `https://tx.ontoserver.csiro.au/fhir` as default base URL

#### Scenario: Support configurable FHIR endpoints

- **WHEN** LSP server is configured with custom FHIR base URL
- **THEN** system uses configured URL for all FHIR requests

#### Scenario: Include User-Agent header in all requests

- **WHEN** making FHIR request
- **THEN** system includes User-Agent header identifying the service (e.g., "ecl-lsp/1.0.0")

#### Scenario: No authentication in MVP

- **WHEN** making FHIR requests
- **THEN** system does not include authentication headers (OAuth, API keys deferred to post-MVP)

### Requirement: Implement aggressive caching for concept lookups

The system SHALL cache all concept lookups to minimize network calls and improve performance.

#### Scenario: Cache concept on first lookup

- **WHEN** concept is retrieved from FHIR for the first time
- **THEN** system stores ConceptInfo in memory cache with concept ID as key

#### Scenario: Return cached concept on subsequent lookups

- **WHEN** previously looked-up concept is requested again
- **THEN** system returns cached ConceptInfo without making FHIR request

#### Scenario: Cache persists for LSP server lifetime

- **WHEN** LSP server is running
- **THEN** cache remains in memory until server restarts or cache is cleared

#### Scenario: LRU eviction for large caches

- **WHEN** cache exceeds 10,000 concepts
- **THEN** system evicts least recently used concepts to maintain memory limits

### Requirement: Implement graceful degradation for network failures

The system SHALL handle FHIR server errors gracefully without blocking LSP functionality.

#### Scenario: Return null on network error

- **WHEN** FHIR request fails due to network error
- **THEN** system returns `null` and logs warning, LSP continues working

#### Scenario: Timeout after 2 seconds

- **WHEN** FHIR request takes longer than 2 seconds
- **THEN** system aborts request, returns `null`, and logs timeout warning

#### Scenario: Return null on HTTP error response

- **WHEN** FHIR server returns 404, 500, or other error status
- **THEN** system returns `null` and logs HTTP error code

#### Scenario: LSP works without terminology server

- **WHEN** FHIR server is completely unavailable
- **THEN** LSP provides all other features (parsing, diagnostics, completion, operator hover) without concept lookups

### Requirement: Provide mock terminology service for testing

The system SHALL include a mock terminology service implementation for unit tests and offline development.

#### Scenario: Mock returns hardcoded common concepts

- **WHEN** `MockTerminologyService.getConceptInfo("404684003")` is called
- **THEN** mock returns hardcoded ConceptInfo with id "404684003", fsn "Clinical finding (finding)", pt "Clinical finding"

#### Scenario: Mock includes frequently used concepts

- **WHEN** mock service is initialized
- **THEN** mock includes at least 10 common SNOMED CT concepts (clinical finding, disorder, disease, procedure, etc.)

#### Scenario: Mock returns null for unknown concepts

- **WHEN** mock is queried for concept ID not in hardcoded list
- **THEN** mock returns `null`

#### Scenario: Unit tests use mock service

- **WHEN** running unit tests
- **THEN** tests inject MockTerminologyService instead of FhirTerminologyService to avoid network dependencies

### Requirement: Define TypeScript interface for terminology operations

The system SHALL define a TypeScript interface that both FHIR and mock implementations satisfy.

#### Scenario: Interface defines getConceptInfo method

- **WHEN** code references terminology service
- **THEN** interface defines `getConceptInfo(conceptId: string): Promise<ConceptInfo | null>` method

#### Scenario: Interface supports dependency injection

- **WHEN** LSP server is initialized
- **THEN** terminology service is injected as ITerminologyService dependency, allowing easy swapping of implementations

#### Scenario: ConceptInfo type includes FHIR-aligned fields

- **WHEN** ConceptInfo type is defined
- **THEN** type includes fields: `id: string`, `fsn: string` (Fully Specified Name), `pt: string` (Preferred Term), `active: boolean` (concept status)

### Requirement: Handle FHIR response format correctly

The system SHALL correctly parse FHIR Parameters resources returned by CodeSystem/$lookup.

#### Scenario: Extract display from FHIR Parameters

- **WHEN** FHIR returns Parameters with parameter name="display" valueString="Clinical finding (finding)"
- **THEN** system uses this as FSN

#### Scenario: Extract designation for preferred term

- **WHEN** FHIR returns Parameters with designation use={"system":"http://snomed.info/sct","code":"900000000000548007"}
- **THEN** system extracts this designation value as PT

#### Scenario: Extract active status from FHIR Parameters

- **WHEN** FHIR returns Parameters with parameter name="active" valueBoolean=false
- **THEN** system sets ConceptInfo.active to false

#### Scenario: Default active to true if missing

- **WHEN** FHIR response does not include active status parameter
- **THEN** system defaults active to true (assume active if not specified)

#### Scenario: Handle missing or incomplete FHIR data

- **WHEN** FHIR response is missing PT or other optional fields
- **THEN** system uses FSN as fallback for PT and continues without error
