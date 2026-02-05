## ADDED Requirements

### Requirement: validate_ecl tool

The MCP server SHALL provide a `validate_ecl` tool that accepts an ECL string and returns syntax errors and warnings using ecl-core's parser and validation modules.

#### Scenario: Valid ECL returns no errors

- **WHEN** calling `validate_ecl` with `"< 404684003 |Clinical finding|"`
- **THEN** the result contains an empty errors array and no warnings

#### Scenario: Invalid ECL returns syntax errors

- **WHEN** calling `validate_ecl` with `"< 404684003 AND AND < 19829001"`
- **THEN** the result contains at least one error with message and position information

#### Scenario: Per-call FHIR override accepted

- **WHEN** calling `validate_ecl` with `fhirServer: "https://custom.server/fhir"` and `snomedVersion: "http://snomed.info/sct/32506021000036107"`
- **THEN** validation uses the specified server and edition for any FHIR-dependent checks

### Requirement: evaluate_ecl tool

The MCP server SHALL provide an `evaluate_ecl` tool that accepts an ECL string and returns matching SNOMED CT concepts via FHIR `ValueSet/$expand`.

#### Scenario: Valid ECL returns matching concepts

- **WHEN** calling `evaluate_ecl` with a valid ECL expression
- **THEN** the result contains an array of matching concepts with SCTID, display term, and total count

#### Scenario: Invalid ECL returns error

- **WHEN** calling `evaluate_ecl` with syntactically invalid ECL
- **THEN** the result contains an error message explaining the syntax issue

#### Scenario: Per-call edition override

- **WHEN** calling `evaluate_ecl` with `snomedVersion: "http://snomed.info/sct/32506021000036107"`
- **THEN** evaluation uses the Australian SNOMED CT edition

### Requirement: lookup_concept tool

The MCP server SHALL provide a `lookup_concept` tool that accepts a SNOMED CT concept ID and returns concept information (FSN, PT, active status) via FHIR `CodeSystem/$lookup`.

#### Scenario: Active concept returns full info

- **WHEN** calling `lookup_concept` with SCTID `404684003`
- **THEN** the result contains the fully specified name, preferred term, and `active: true`

#### Scenario: Inactive concept returns inactive flag

- **WHEN** calling `lookup_concept` with an inactive concept ID
- **THEN** the result contains `active: false` with the concept's terms

#### Scenario: Unknown concept returns not found

- **WHEN** calling `lookup_concept` with a non-existent SCTID
- **THEN** the result indicates the concept was not found

### Requirement: search_concepts tool

The MCP server SHALL provide a `search_concepts` tool that accepts a search term and returns matching SNOMED CT concepts.

#### Scenario: Search returns matching concepts

- **WHEN** calling `search_concepts` with term `"paracetamol"`
- **THEN** the result contains concepts with matching display terms and their SCTIDs

#### Scenario: Search with no matches returns empty

- **WHEN** calling `search_concepts` with a nonsense term
- **THEN** the result contains an empty array

### Requirement: format_ecl tool

The MCP server SHALL provide a `format_ecl` tool that accepts an ECL string and optional formatting options, returning the formatted ECL string.

#### Scenario: Format with default options

- **WHEN** calling `format_ecl` with `"<<404684003|Clinical finding|"`
- **THEN** the result contains `"<< 404684003 |Clinical finding|"` with normalized spacing

#### Scenario: Format with custom indent

- **WHEN** calling `format_ecl` with `indentSize: 4`
- **THEN** nested structures use 4-space indentation

### Requirement: list_snomed_editions tool

The MCP server SHALL provide a `list_snomed_editions` tool that returns available SNOMED CT editions and their versions from the configured FHIR server.

#### Scenario: Returns available editions

- **WHEN** calling `list_snomed_editions`
- **THEN** the result contains an array of editions with module ID, name, and available versions

#### Scenario: Per-call FHIR server override

- **WHEN** calling `list_snomed_editions` with `fhirServer: "https://other.server/fhir"`
- **THEN** editions are queried from the specified server

### Requirement: Per-call configuration overrides

All MCP tools SHALL accept optional `fhirServer` and `snomedVersion` parameters to override the default configuration for that specific call.

#### Scenario: Default configuration used when no overrides

- **WHEN** calling any tool without `fhirServer` or `snomedVersion` parameters
- **THEN** the server uses its configured defaults (from env vars or config file)

#### Scenario: fhirServer override changes endpoint

- **WHEN** calling a tool with `fhirServer: "https://custom.server/fhir"`
- **THEN** that call uses the specified FHIR endpoint while other calls continue using defaults

#### Scenario: snomedVersion override changes edition

- **WHEN** calling a tool with `snomedVersion: "http://snomed.info/sct/32506021000036107"`
- **THEN** that call uses the Australian edition while other calls use the default edition

### Requirement: ECL literacy resources

The MCP server SHALL expose ECL reference documentation as MCP resources that agents can read to understand ECL syntax and patterns.

#### Scenario: Operators guide available

- **WHEN** agent reads resource `ecl://guide/operators`
- **THEN** content describes all ECL constraint operators with meanings, examples, and usage guidance

#### Scenario: Refinements guide available

- **WHEN** agent reads resource `ecl://guide/refinements`
- **THEN** content describes attribute refinement syntax, purpose, and common attributes

#### Scenario: Filters guide available

- **WHEN** agent reads resource `ecl://guide/filters`
- **THEN** content describes description, concept, and member filters

#### Scenario: Patterns guide available

- **WHEN** agent reads resource `ecl://guide/patterns`
- **THEN** content describes common ECL patterns for typical clinical terminology tasks

#### Scenario: Grammar reference available

- **WHEN** agent reads resource `ecl://reference/grammar`
- **THEN** content provides an ECL 2.2 grammar summary

#### Scenario: History supplements guide available

- **WHEN** agent reads resource `ecl://guide/history-supplements`
- **THEN** content describes history supplement profiles and their usage

### Requirement: Static defaults with environment configuration

The MCP server SHALL read default FHIR server URL, timeout, and SNOMED edition from environment variables or a config file at startup.

#### Scenario: Defaults from environment variables

- **WHEN** `ECL_FHIR_SERVER`, `ECL_FHIR_TIMEOUT`, and `ECL_SNOMED_VERSION` environment variables are set
- **THEN** the server uses these as default values for all tool calls

#### Scenario: Reasonable defaults when no config

- **WHEN** no environment variables or config file is present
- **THEN** the server uses `https://tx.ontoserver.csiro.au/fhir` as the default FHIR server and international edition as the default SNOMED version
