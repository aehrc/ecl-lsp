## Why

`maxConcurrency` was added to `FhirTerminologyService` to cap parallel FHIR requests and prevent 429 errors on large ECL documents, but the option is only reachable at the constructor level. Every higher-level instantiation site — the React component, the raw Monaco registration API, the LSP server, and the Slack bot — creates `FhirTerminologyService` internally with no way for the consumer to override the default of 5. Deployments that hit slow or strict FHIR servers cannot tune this without forking the library.

## What Changes

- Add `maxConcurrency?: number` to `RegisterOptions` in `ecl-editor-core` and thread it through to the internally-created `FhirTerminologyService`
- Add `maxConcurrency?: number` to `EclEditor` React component props in `ecl-editor-react` and forward it to `RegisterOptions`
- Add an `EclEditorProvider` React context to `ecl-editor-react` that supplies a default `maxConcurrency` to every nested `EclEditor`, so apps can configure it once instead of prop-drilling; an explicit prop always overrides the provider value
- Add `maxConcurrency?: number` to the LSP server's config extraction (`extractTerminologyConfig`) and construction (`applyTerminologyConfig`) in `ecl-lsp-server`
- Add `ecl.terminology.maxConcurrency` as a VSCode workspace setting in the extension's `package.json` and `contributes.configuration`
- Add `maxConcurrency` to the Slack bot's config object and forward it to `FhirTerminologyService`
- Raise the built-in `FhirTerminologyService` default from 5 to 25 to better match the throughput of typical FHIR terminology servers; all exposed config surfaces inherit this default when unset

## Capabilities

### New Capabilities

- `editor-concurrency-config`: Expose `maxConcurrency` in `RegisterOptions` (ecl-editor-core) and the `EclEditor` React props (ecl-editor-react), so Monaco/React consumers can set it without constructing `FhirTerminologyService` manually
- `lsp-concurrency-config`: Expose `maxConcurrency` in the LSP server config pipeline and as a named setting in the VSCode extension (and equivalents for IntelliJ/Eclipse where applicable)
- `slack-concurrency-config`: Expose `maxConcurrency` in the Slack bot's runtime config so bot operators can tune it via environment variable or config file

### Modified Capabilities

_(none — existing specs do not govern config-surface requirements at these layers)_

## Impact

- **`packages/ecl-editor-core`** — `RegisterOptions` interface and `registerEclLanguage()` function signature gain an optional field; the internal `new FhirTerminologyService(...)` call gains `maxConcurrency`
- **`packages/ecl-editor-react`** — `EclEditor` component props type gains `maxConcurrency?: number`; forwarded to `RegisterOptions`. New `EclEditorProvider` / `EclEditorContextValue` exports supply a context-level default
- **`packages/ecl-lsp-server`** — `extractTerminologyConfig()` reads the new key; `applyTerminologyConfig()` passes it to the service constructor
- **`clients/vscode`** — `package.json` `contributes.configuration` gains `ecl.terminology.maxConcurrency` (integer, minimum 1, default 25); synced to the LSP server via the existing `ecl.terminology` configuration section
- **`packages/ecl-slack-bot`** — App config interface gains `maxConcurrency?: number`; forwarded to service constructor
- **`packages/ecl-core`** — `FhirTerminologyService` default `maxConcurrency` raised from 5 to 25; `ITerminologyService` is unchanged (the option already exists on `FhirTerminologyServiceOptions`)
- No breaking API changes — all new fields are optional; the only behavioural change is the higher default concurrency for consumers that set nothing
