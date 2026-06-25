## ADDED Requirements

### Requirement: RegisterOptions exposes maxConcurrency

`RegisterOptions` in `ecl-editor-core` SHALL include an optional `maxConcurrency?: number` field. When `registerEclLanguage` creates a `FhirTerminologyService` internally (i.e. `fhirServerUrl` is provided and `terminologyService` is not), it MUST pass the `maxConcurrency` value to the service constructor. If `maxConcurrency` is omitted, the service's own default (5) applies.

#### Scenario: maxConcurrency set in RegisterOptions

- **WHEN** `registerEclLanguage` is called with `{ fhirServerUrl: '...', maxConcurrency: 10 }`
- **THEN** the internally-created `FhirTerminologyService` is constructed with `maxConcurrency: 10`

#### Scenario: maxConcurrency omitted from RegisterOptions

- **WHEN** `registerEclLanguage` is called with `{ fhirServerUrl: '...' }` and no `maxConcurrency`
- **THEN** the internally-created `FhirTerminologyService` uses its own default of 5

#### Scenario: terminologyService provided directly

- **WHEN** `registerEclLanguage` is called with a pre-built `terminologyService` object and `maxConcurrency` is also set
- **THEN** the `maxConcurrency` prop is ignored — the caller-supplied service owns its own concurrency settings

### Requirement: RegisterOptions maxConcurrency survives hot-reconfiguration

When `updateConfig` is called on the returned `EclEditorDisposable`, any new `fhirServerUrl` MUST respect the `maxConcurrency` provided in that update call, not the original construction call.

#### Scenario: maxConcurrency updated via updateConfig

- **WHEN** `updateConfig({ fhirServerUrl: '...', maxConcurrency: 3 })` is called
- **THEN** the newly-created `FhirTerminologyService` is constructed with `maxConcurrency: 3`

### Requirement: EclEditor React component exposes maxConcurrency

The `EclEditor` React component in `ecl-editor-react` SHALL accept an optional `maxConcurrency?: number` prop and forward it to `RegisterOptions`. The prop MUST be documented in the component's TypeScript props type.

#### Scenario: maxConcurrency set as React prop

- **WHEN** `<EclEditor fhirServerUrl="..." maxConcurrency={10} />` is rendered
- **THEN** the underlying `registerEclLanguage` call receives `maxConcurrency: 10` in its config

#### Scenario: maxConcurrency not set as React prop

- **WHEN** `<EclEditor fhirServerUrl="..." />` is rendered without `maxConcurrency`
- **THEN** no `maxConcurrency` is forwarded and the service uses its default of 5

#### Scenario: maxConcurrency prop change triggers service recreation

- **WHEN** `maxConcurrency` prop changes between renders (e.g. from 5 to 10)
- **THEN** `updateConfig` is called with the new value and a new `FhirTerminologyService` is created with the updated concurrency limit
