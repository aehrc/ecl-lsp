## Purpose

Configures SNOMED CT edition and version threading through the FHIR terminology service, allowing all FHIR operations to target a specific SNOMED CT edition (e.g., Australian) and/or pinned version date.

## Requirements

### Requirement: SNOMED URI constructor parameter

`FhirTerminologyService` SHALL accept an optional `snomedVersion?: string` constructor parameter. The value may be an edition-only URI (`http://snomed.info/sct/{moduleId}`) or a pinned version URI (`http://snomed.info/sct/{moduleId}/version/{date}`). When provided and non-empty, all FHIR URL construction methods SHALL use the configured URI as the SNOMED CT system base. When undefined or empty, URLs SHALL be constructed identically to current behaviour (using `http://snomed.info/sct` with no version qualifier).

#### Scenario: Constructor with pinned version

- **WHEN** `FhirTerminologyService` is constructed with `snomedVersion: "http://snomed.info/sct/32506021000036107/version/20260131"`
- **THEN** the instance stores the version and uses it in all subsequent FHIR URL construction

#### Scenario: Constructor with edition-only URI

- **WHEN** `FhirTerminologyService` is constructed with `snomedVersion: "http://snomed.info/sct/32506021000036107"`
- **THEN** the instance stores the URI and uses it in all subsequent FHIR URL construction (server resolves to latest version of that edition)

#### Scenario: Constructor without version

- **WHEN** `FhirTerminologyService` is constructed with no `snomedVersion` parameter (or empty string)
- **THEN** all FHIR URLs are built without version qualifiers, matching current behaviour exactly

### Requirement: Version in concept lookup

When `snomedVersion` is configured, the `getConceptInfo()` method SHALL add a `version` query parameter to the `CodeSystem/$lookup` URL. The value SHALL be the configured URI (either edition-only or pinned).

Format: `CodeSystem/$lookup?system=http://snomed.info/sct&code={id}&version={snomedVersion}`

#### Scenario: Lookup with pinned version

- **WHEN** `snomedVersion` is `http://snomed.info/sct/32506021000036107/version/20260131` and `getConceptInfo("404684003")` is called
- **THEN** the request URL includes `&version=http%3A%2F%2Fsnomed.info%2Fsct%2F32506021000036107%2Fversion%2F20260131`

#### Scenario: Lookup with edition-only

- **WHEN** `snomedVersion` is `http://snomed.info/sct/32506021000036107` and `getConceptInfo("404684003")` is called
- **THEN** the request URL includes `&version=http%3A%2F%2Fsnomed.info%2Fsct%2F32506021000036107`

#### Scenario: Lookup without version

- **WHEN** `snomedVersion` is not set and `getConceptInfo("404684003")` is called
- **THEN** the request URL has no `version` parameter (current behaviour)

### Requirement: Version in ECL evaluation

When `snomedVersion` is configured, the `evaluateEcl()` method SHALL replace the implicit ValueSet URL base from `http://snomed.info/sct` to the configured URI.

Pinned format: `ValueSet/$expand?url=http://snomed.info/sct/{moduleId}/version/{date}?fhir_vs=ecl/{ecl}&count={limit}`
Edition-only format: `ValueSet/$expand?url=http://snomed.info/sct/{moduleId}?fhir_vs=ecl/{ecl}&count={limit}`

#### Scenario: ECL evaluation with pinned version

- **WHEN** `snomedVersion` is `http://snomed.info/sct/32506021000036107/version/20260131` and `evaluateEcl("< 404684003", 5)` is called
- **THEN** the implicit ValueSet URL starts with `http://snomed.info/sct/32506021000036107/version/20260131?fhir_vs=ecl/`

#### Scenario: ECL evaluation with edition-only

- **WHEN** `snomedVersion` is `http://snomed.info/sct/32506021000036107` and `evaluateEcl("< 404684003", 5)` is called
- **THEN** the implicit ValueSet URL starts with `http://snomed.info/sct/32506021000036107?fhir_vs=ecl/`

#### Scenario: ECL evaluation without version

- **WHEN** `snomedVersion` is not set and `evaluateEcl("< 404684003", 5)` is called
- **THEN** the implicit ValueSet URL starts with `http://snomed.info/sct?fhir_vs=ecl/` (current behaviour)

### Requirement: Version in bulk expand

When `snomedVersion` is configured, the `bulkExpand()` method SHALL include a `version` field in the `ValueSet.compose.include` object of the POST body. The value SHALL be the configured URI (either edition-only or pinned).

Format: `{ system: "http://snomed.info/sct", version: "{snomedVersion}", concept: [...] }`

#### Scenario: Bulk expand with pinned version

- **WHEN** `snomedVersion` is `http://snomed.info/sct/32506021000036107/version/20260131` and `bulkExpand(["404684003", "363698007"])` is called
- **THEN** the POST body include object contains `version: "http://snomed.info/sct/32506021000036107/version/20260131"`

#### Scenario: Bulk expand with edition-only

- **WHEN** `snomedVersion` is `http://snomed.info/sct/32506021000036107` and `bulkExpand(["404684003"])` is called
- **THEN** the POST body include object contains `version: "http://snomed.info/sct/32506021000036107"`

#### Scenario: Bulk expand without version

- **WHEN** `snomedVersion` is not set and `bulkExpand(["404684003"])` is called
- **THEN** the POST body include object has no `version` field (current behaviour)

### Requirement: Version in concept search

When `snomedVersion` is configured, the `searchByFilter()` method SHALL replace the implicit ValueSet URL base from `http://snomed.info/sct` to the configured URI.

Pinned format: `ValueSet/$expand?url=http://snomed.info/sct/{moduleId}/version/{date}?fhir_vs&filter={f}&count=21`
Edition-only format: `ValueSet/$expand?url=http://snomed.info/sct/{moduleId}?fhir_vs&filter={f}&count=21`

#### Scenario: Search with pinned version

- **WHEN** `snomedVersion` is `http://snomed.info/sct/32506021000036107/version/20260131` and `searchByFilter("diabetes")` is called
- **THEN** the implicit ValueSet URL starts with `http://snomed.info/sct/32506021000036107/version/20260131?fhir_vs`

#### Scenario: Search with edition-only

- **WHEN** `snomedVersion` is `http://snomed.info/sct/32506021000036107` and `searchByFilter("diabetes")` is called
- **THEN** the implicit ValueSet URL starts with `http://snomed.info/sct/32506021000036107?fhir_vs`

#### Scenario: Search without version

- **WHEN** `snomedVersion` is not set and `searchByFilter("diabetes")` is called
- **THEN** the implicit ValueSet URL starts with `http://snomed.info/sct?fhir_vs` (current behaviour)

### Requirement: Server reads version from configuration

The `initTerminologyService()` function in `server.ts` SHALL read `ecl.terminology.snomedVersion` from workspace configuration and pass it to the `FhirTerminologyService` constructor. When the setting is empty or absent, no version SHALL be passed (preserving current behaviour).

#### Scenario: Version setting present

- **WHEN** `ecl.terminology.snomedVersion` is set to `http://snomed.info/sct/32506021000036107/version/20260131`
- **THEN** `FhirTerminologyService` is constructed with that version URI

#### Scenario: Version setting empty

- **WHEN** `ecl.terminology.snomedVersion` is `""` or not present in configuration
- **THEN** `FhirTerminologyService` is constructed without a version parameter

#### Scenario: Configuration change recreates service

- **WHEN** the user changes `ecl.terminology.snomedVersion` in settings
- **THEN** `initTerminologyService()` is called, creating a new `FhirTerminologyService` with the updated version (clearing all caches)

### Requirement: Edition list endpoint

The server SHALL handle the `ecl/getSnomedEditions` custom request by fetching `GET /CodeSystem?url=http://snomed.info/sct` from the configured FHIR server. The server SHALL parse the FHIR Bundle response, extract all `CodeSystem.version` values, group them by module ID (extracted from the version URI), and return a structured response.

The response format SHALL be:

```
{
  editions: [
    {
      moduleId: string,
      versions: [{ uri: string, date: string }]  // sorted newest-first
    }
  ]
}
```

#### Scenario: Parse FHIR Bundle with multiple CodeSystem resources

- **WHEN** the FHIR server returns a Bundle containing 5 CodeSystem resources with different version URIs
- **THEN** the handler groups them by module ID, extracts dates, sorts versions descending, and returns the structured response

#### Scenario: FHIR server returns error

- **WHEN** the FHIR server returns a non-200 status or a network error
- **THEN** the handler returns an error that the client can handle (triggering the manual entry fallback)

#### Scenario: Version URI parsing

- **WHEN** a CodeSystem resource has `version: "http://snomed.info/sct/32506021000036107/version/20260131"`
- **THEN** the handler extracts module ID `32506021000036107` and date `20260131`

### Requirement: Resolved version extraction

The server SHALL extract the resolved SNOMED CT version URI from FHIR responses. For `$expand` responses, the version SHALL be extracted from `ValueSet.expansion.parameter[]` where `name` is `"version"` and the value is in `valueUri`. For `$lookup` responses, the version SHALL be extracted from `Parameters.parameter[]` where `name` is `"version"` and the value is in `valueUri`.

The server SHALL store the first resolved version URI per `FhirTerminologyService` lifetime (cleared on service recreation). When a resolved version is captured, the server SHALL send an `ecl/resolvedSnomedVersion` notification to the client containing the resolved URI string.

#### Scenario: Resolved version from $expand response

- **WHEN** the server receives a `ValueSet/$expand` response containing `expansion.parameter: [{ name: "version", valueUri: "http://snomed.info/sct/900000000000207008/version/20250301" }]`
- **THEN** the server stores `http://snomed.info/sct/900000000000207008/version/20250301` as the resolved version and sends an `ecl/resolvedSnomedVersion` notification to the client

#### Scenario: Resolved version from $lookup response

- **WHEN** the server receives a `CodeSystem/$lookup` response containing `parameter: [{ name: "version", valueUri: "http://snomed.info/sct/900000000000207008/version/20250301" }]`
- **THEN** the server stores that URI as the resolved version and sends the notification

#### Scenario: Resolved version already captured

- **WHEN** the resolved version has already been captured from a previous response
- **THEN** subsequent responses do not overwrite it and no additional notification is sent

#### Scenario: Service recreation clears resolved version

- **WHEN** `initTerminologyService()` recreates the `FhirTerminologyService` (due to config change)
- **THEN** the resolved version is cleared and will be re-captured from the next FHIR response

#### Scenario: Response has no version parameter

- **WHEN** a FHIR response does not include a version parameter (non-standard server)
- **THEN** no resolved version is captured and no notification is sent; the status bar remains unchanged

### Requirement: Graceful fallback on invalid version

If the configured `snomedVersion` is malformed or the FHIR server rejects it, the FHIR operation SHALL fail gracefully through existing error handling. The server SHALL NOT crash or skip all operations — only the specific failing request is affected.

#### Scenario: Malformed version URI in lookup

- **WHEN** `snomedVersion` is `"not-a-valid-uri"` and a concept lookup is attempted
- **THEN** the FHIR server returns an error, which is handled by existing error handling (returns `null` for concept info), and the server continues operating

#### Scenario: Version not available on server

- **WHEN** `snomedVersion` specifies a version that doesn't exist on the FHIR server
- **THEN** FHIR operations return errors for that version, handled gracefully by existing try/catch patterns
