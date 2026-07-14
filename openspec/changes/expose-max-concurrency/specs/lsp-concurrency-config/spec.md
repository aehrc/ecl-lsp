## ADDED Requirements

### Requirement: LSP server reads maxConcurrency from configuration

`extractTerminologyConfig` in `ecl-lsp-server` SHALL read a `maxConcurrency` field from the configuration object received from clients. It MUST handle both VSCode-style keys (under `ecl.terminology` namespace) and Eclipse-style flat `initializationOptions` keys. The extracted value MUST be passed to `applyTerminologyConfig` and used when constructing `FhirTerminologyService`.

#### Scenario: VSCode workspace setting present

- **WHEN** the LSP client sends configuration with `ecl.terminology.maxConcurrency: 10`
- **THEN** `FhirTerminologyService` is constructed with `maxConcurrency: 10`

#### Scenario: Eclipse initializationOptions present

- **WHEN** the LSP client sends `initializationOptions` with `{ maxConcurrency: 3 }`
- **THEN** `FhirTerminologyService` is constructed with `maxConcurrency: 3`

#### Scenario: maxConcurrency absent from config

- **WHEN** neither VSCode settings nor `initializationOptions` include `maxConcurrency`
- **THEN** `FhirTerminologyService` is constructed without the option and uses its default of 25

#### Scenario: Invalid maxConcurrency value rejected

- **WHEN** the config provides `maxConcurrency: 0` or a non-integer value
- **THEN** the value is ignored and the service default of 25 is used (construction SHALL NOT throw; the LSP server logs a warning instead)

### Requirement: VSCode extension declares ecl.terminology.maxConcurrency setting

The VSCode extension MUST declare `ecl.terminology.maxConcurrency` in its `contributes.configuration` section in `package.json`. The setting SHALL have type `integer`, minimum `1`, default `25` (matching the `FhirTerminologyService` default), and a clear description explaining its purpose. The extension MUST read this setting and include it in the configuration sent to the LSP server.

#### Scenario: User sets maxConcurrency in VSCode settings

- **WHEN** a user sets `ecl.terminology.maxConcurrency` to `10` in VS Code settings
- **THEN** the LSP server receives the value and creates a `FhirTerminologyService` with `maxConcurrency: 10`

#### Scenario: Setting not configured by user

- **WHEN** `ecl.terminology.maxConcurrency` is not set in VS Code settings
- **THEN** the setting resolves to its declared default of `25`

### Requirement: LSP server logs the active maxConcurrency value

When `applyTerminologyConfig` creates a new `FhirTerminologyService`, it MUST include the active `maxConcurrency` value in the log line it sends to the client connection console, so operators can confirm the setting is in effect.

#### Scenario: Config applied with custom maxConcurrency

- **WHEN** a config with `maxConcurrency: 3` is applied
- **THEN** the connection console log includes "maxConcurrency: 3" (or equivalent readable form)
