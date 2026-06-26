## 1. ecl-editor-core — EclEditorConfig and register

- [x] 1.1 Add `maxConcurrency?: number` to `EclEditorConfig` in `packages/ecl-editor-core/src/types.ts`
- [x] 1.2 Add closure-scoped `let currentMaxConcurrency: number | undefined` in `registerEclLanguage()` initialised from `config.maxConcurrency`
- [x] 1.3 Pass `maxConcurrency: currentMaxConcurrency` to the initial `new FhirTerminologyService(...)` call in `registerEclLanguage()`
- [x] 1.4 In `updateConfig()`, update `currentMaxConcurrency` when `newConfig.maxConcurrency` is present
- [x] 1.5 Extend the `updateConfig()` service-recreation condition to also trigger when `newConfig.maxConcurrency !== undefined`, passing the updated `currentMaxConcurrency` to the new service
- [x] 1.6 Track the other service-defining options (`fhirServerUrl`, `snomedVersion`, `corsProxy`, `onResolvedSnomedVersion`) in closure state alongside `currentMaxConcurrency`, so a single-field `updateConfig` (e.g. `maxConcurrency` only) recreates the service without reverting previously-updated fields to their construction-time values

## 2. ecl-editor-react — EclEditor component

- [x] 2.1 Add `maxConcurrency?: number` to `EclEditorProps` in `packages/ecl-editor-react/src/EclEditor.tsx` with a JSDoc comment
- [x] 2.2 Destructure `maxConcurrency` from props alongside the other FHIR-related props
- [x] 2.3 Include `maxConcurrency` in the initial `registerEclLanguage()` call in `handleMount`
- [x] 2.4 Include `maxConcurrency` in the `updateConfig()` call inside the `useEffect` that handles prop changes
- [x] 2.5 Add `maxConcurrency` to both the `useCallback` and `useEffect` dependency arrays
- [x] 2.6 Add `EclEditorProvider` (`EclEditorContext.tsx`) supplying a context-level default `maxConcurrency`; resolve `maxConcurrencyProp ?? ctx.maxConcurrency` in `EclEditor`; export `EclEditorProvider`, `EclEditorProviderProps`, `EclEditorContextValue` from the package index

## 3. ecl-lsp-server — config pipeline

- [x] 3.1 Add `maxConcurrency?: number` to the return type of `extractTerminologyConfig()`
- [x] 3.2 Read `maxConcurrency` from the config object in `extractTerminologyConfig()` — accept it from both VSCode-style (`config.maxConcurrency`) and Eclipse-style (`initializationOptions.maxConcurrency`)
- [x] 3.3 Validate the extracted value: accept only positive integers; if invalid, set to `undefined` (do not throw)
- [x] 3.4 Update `applyTerminologyConfig()` to accept and pass `maxConcurrency` to `new FhirTerminologyService(...)`
- [x] 3.5 Include the active `maxConcurrency` value in the `connection.console.log` line in `applyTerminologyConfig()` (e.g. `maxConcurrency: ${cfg.maxConcurrency ?? 25}`)

## 4. clients/vscode — setting declaration

- [x] 4.1 Add `ecl.terminology.maxConcurrency` to `contributes.configuration` in `clients/vscode/package.json`: `type: integer`, `minimum: 1`, `default: 25`, with a description string
- [x] 4.2 Read `ecl.terminology.maxConcurrency` from workspace configuration in `clients/vscode/src/extension.ts` and include it in the config sent to the LSP server

## 5. ecl-slack-bot — config and env var

- [x] 5.1 Add `maxConcurrency?: number` to the bot's config type / interface in `packages/ecl-slack-bot/src/app.ts`
- [x] 5.2 Parse `ECL_MAX_CONCURRENCY` env var at app startup: convert to integer, validate it is > 0; log a warning and ignore if invalid
- [x] 5.3 Pass the resolved `maxConcurrency` to `new FhirTerminologyService(...)` in the request handler (when the config field is set)

## 6. Tests

- [x] 6.1 Add a test to `packages/ecl-editor-core/src/test/monaco-adapters.test.ts` asserting that `registerEclLanguage({ fhirServerUrl, maxConcurrency: 2 })` creates a service whose `maxConcurrency` is reflected (e.g. via concurrency-cap behaviour or by inspecting the service instance)
- [x] 6.2 Add a test asserting that calling `updateConfig({ maxConcurrency: 3 })` recreates the service with the new concurrency limit
- [x] 6.3 Add a unit test for `extractTerminologyConfig` in `packages/ecl-lsp-server/src/test/` asserting that valid and invalid `maxConcurrency` values are handled correctly

## 7. Branch, PR, and verification

- [x] 7.1 Create branch `feat/expose-max-concurrency` from `main`
- [x] 7.2 Run `npm run lint && npm run format:check` and fix any issues
- [x] 7.3 Run `npm test` and confirm no regressions
- [x] 7.4 Open PR referencing the GitHub issue; describe how to test each config surface (React prop, VSCode setting, env var)
