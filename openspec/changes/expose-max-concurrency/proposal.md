## Why

`maxConcurrency` was added to `FhirTerminologyService` to cap parallel FHIR requests and prevent 429 errors on large ECL documents, but the option is only reachable at the constructor level. Every higher-level instantiation site — the React component, the raw Monaco registration API, the LSP server, and the Slack bot — creates `FhirTerminologyService` internally with no way for the consumer to override the default of 5. Deployments that hit slow or strict FHIR servers cannot tune this without forking the library.

## What Changes

- Add `maxConcurrency?: number` to `RegisterOptions` in `ecl-editor-core` and thread it through to the internally-created `FhirTerminologyService`
- Add `maxConcurrency?: number` to `EclEditor` React component props in `ecl-editor-react` and forward it to `RegisterOptions`
- Add `maxConcurrency?: number` to the LSP server's config extraction (`extractTerminologyConfig`) and construction (`applyTerminologyConfig`) in `ecl-lsp-server`
- Add `ecl.terminology.maxConcurrency` as a VSCode workspace setting in the extension's `package.json` and `contributes.configuration`
- Add `maxConcurrency` to the Slack bot's config object and forward it to `FhirTerminologyService`

## Capabilities

### New Capabilities

- `editor-concurrency-config`: Expose `maxConcurrency` in `RegisterOptions` (ecl-editor-core) and the `EclEditor` React props (ecl-editor-react), so Monaco/React consumers can set it without constructing `FhirTerminologyService` manually
- `lsp-concurrency-config`: Expose `maxConcurrency` in the LSP server config pipeline and as a named setting in the VSCode extension (and equivalents for IntelliJ/Eclipse where applicable)
- `slack-concurrency-config`: Expose `maxConcurrency` in the Slack bot's runtime config so bot operators can tune it via environment variable or config file

### Modified Capabilities

_(none — existing specs do not govern config-surface requirements at these layers)_

## Impact

- **`packages/ecl-editor-core`** — `RegisterOptions` interface and `registerEclLanguage()` function signature gain an optional field; the internal `new FhirTerminologyService(...)` call gains `maxConcurrency`
- **`packages/ecl-editor-react`** — `EclEditor` component props type gains `maxConcurrency?: number`; forwarded to `RegisterOptions`
- **`packages/ecl-lsp-server`** — `extractTerminologyConfig()` reads the new key; `applyTerminologyConfig()` passes it to the service constructor
- **`clients/vscode`** — `package.json` `contributes.configuration` gains `ecl.terminology.maxConcurrency` (integer, default 5); `extension.ts` reads and passes it through
- **`packages/ecl-slack-bot`** — App config interface gains `maxConcurrency?: number`; forwarded to service constructor
- No changes to `ecl-core` or `ITerminologyService` — the option already exists on `FhirTerminologyServiceOptions`
- No breaking changes — all new fields are optional with the existing default of 5
