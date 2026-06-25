## Context

`FhirTerminologyService` gained a `maxConcurrency` option in the `throttle-concept-fetches` change, but the option is only reachable at the raw constructor level. Three higher-level layers each create `FhirTerminologyService` internally and expose no way to pass this through:

1. **`ecl-editor-core`** — `registerEclLanguage()` creates the service when `fhirServerUrl` is provided. The config type is `EclEditorConfig` (in `packages/ecl-editor-core/src/types.ts`), which `RegisterOptions` extends.
2. **`ecl-editor-react`** — `EclEditor` reads `EclEditorProps` and forwards them to `registerEclLanguage()` and then to `updateConfig()` on prop changes.
3. **`ecl-lsp-server`** — `applyTerminologyConfig()` constructs the service from settings extracted by `extractTerminologyConfig()`. VSCode sends `workspace.getConfiguration('ecl.terminology')` — a flat object keyed by setting names.
4. **`ecl-slack-bot`** — Constructs the service per-request from a runtime config object.

**Key constraint**: `ConcurrencyQueue` is created once in the service constructor and cannot be resized. Any config update that changes `maxConcurrency` must recreate the `FhirTerminologyService`.

## Goals / Non-Goals

**Goals:**

- Thread `maxConcurrency` through `EclEditorConfig` → `EclEditorProps` → `updateConfig()` so React/Monaco consumers can set it without constructing the service manually
- Expose `maxConcurrency` in the LSP server config pipeline and as a named VSCode workspace setting
- Expose `maxConcurrency` in the Slack bot config and via environment variable
- Recreate the service when `maxConcurrency` changes, consistent with how other service-level options are handled

**Non-Goals:**

- Resizing a live `ConcurrencyQueue` without service recreation
- Exposing `maxConcurrency` through IntelliJ or Eclipse client configuration (these pass `initializationOptions` to the LSP server which already handles it)
- Adding `maxConcurrency` to `ITerminologyService` — it remains internal to `FhirTerminologyService`

## Decisions

### 1. Add `maxConcurrency` to `EclEditorConfig`, not just `RegisterOptions`

**Decision**: Add `maxConcurrency?: number` to `EclEditorConfig` in `packages/ecl-editor-core/src/types.ts`. Since `RegisterOptions` extends `EclEditorConfig`, it inherits the field automatically. `updateConfig(Partial<EclEditorConfig>)` can then carry `maxConcurrency` through without a separate parameter.

**Rationale**: `updateConfig` already takes `Partial<EclEditorConfig>`, so putting `maxConcurrency` on `EclEditorConfig` is the least-friction path. The alternative — keeping it only on `RegisterOptions` and adding a parallel `updateMaxConcurrency()` method — would break the consistent update model and require callers to know about two separate APIs.

**Alternative considered**: Add `maxConcurrency` only to `RegisterOptions`. Rejected because `updateConfig` would have no way to receive a concurrency change, violating the spec requirement that prop changes recreate the service.

### 2. Track `maxConcurrency` in the `registerEclLanguage` closure alongside other mutable state

**Decision**: In `registerEclLanguage()`, add a closure-scoped `let currentMaxConcurrency: number | undefined = config.maxConcurrency`. Update it in `updateConfig` when the field is present. Pass it to every internal `new FhirTerminologyService(...)` call, including in the `updateConfig` branch that recreates the service.

The existing `updateConfig` condition recreates the service when `fhirServerUrl` or `snomedVersion` changes. Extend this condition to also trigger on `maxConcurrency` change:

```
} else if (newConfig.fhirServerUrl !== undefined
        || newConfig.snomedVersion !== undefined
        || newConfig.maxConcurrency !== undefined) {
```

**Rationale**: The `ConcurrencyQueue` is immutable after construction, so a `maxConcurrency` change must recreate the service. Tracking the latest value in a closure variable (same pattern as `formattingOptions`) avoids stale values when `updateConfig` is called multiple times.

**Alternative considered**: Only pass `maxConcurrency` when the service is first created, ignoring future changes. Rejected because the spec requires prop changes to take effect — a React prop change from 5 → 10 must produce a new service with the new cap.

### 3. LSP server validates and clamps before passing to constructor

**Decision**: In `extractTerminologyConfig`, read `maxConcurrency` from the config object as a number. In `applyTerminologyConfig`, validate that the value is a positive integer before passing it. If invalid (zero, negative, non-integer), log a warning to `connection.console` and omit the field (letting the service default apply). Do **not** throw.

**Rationale**: The LSP server is long-lived. `FhirTerminologyService` throws for `maxConcurrency <= 0`, which would crash `applyTerminologyConfig` and leave the server in a degraded state with no terminology service. Guarding at the LSP boundary makes the server resilient to misconfiguration.

**Alternative considered**: Let the constructor throw and surface the error to the client. Rejected because the LSP connection would need to recover gracefully from a missing service, which it currently does not.

### 4. VSCode setting: integer, minimum 1, no maximum declared

**Decision**: Declare `ecl.terminology.maxConcurrency` in the extension's `contributes.configuration` with `"type": "integer"`, `"minimum": 1`, `"default": 5`. Do not declare a maximum — the server-side validation in the LSP server is the authoritative guard.

**Rationale**: Declaring a UI maximum (e.g. 20) would create a false ceiling for power users with a high-capacity FHIR server. The integer minimum of 1 matches the constructor's guard (`> 0`), giving VS Code UI enough to prevent obviously invalid values.

### 5. Slack bot reads `ECL_MAX_CONCURRENCY` env var at startup, not per-request

**Decision**: Parse `ECL_MAX_CONCURRENCY` once when the app config is built (startup), not on each request. Store the resolved value in the app config object as `maxConcurrency`. Log a warning and ignore if the value is not a positive integer.

**Rationale**: The Slack bot creates a new `FhirTerminologyService` per request. Parsing the env var per-request would add unnecessary overhead and make config changes invisible without restart (which is the correct expectation for an env var anyway).

## Risks / Trade-offs

**Service recreation on `maxConcurrency` change flushes the in-flight queue** → Any requests already queued in the old service instance are dropped when the service is replaced. Mitigation: this is the existing behaviour for all service-recreating config changes (e.g. switching SNOMED versions); it's acceptable because recreation only happens on explicit config updates, not during normal editor use.

**LSP server silently ignores invalid values** → A misconfigured `maxConcurrency: 0` in VSCode settings would go unnoticed beyond a console log line. Mitigation: the log line is required by the spec and is visible in the VSCode output channel.

**Slack bot requires restart to pick up env var change** → Operators changing `ECL_MAX_CONCURRENCY` must restart the bot process. Mitigation: this is standard behaviour for env-var-based config in 12-factor apps; document it.

## Open Questions

- Should `maxConcurrency` be included in the existing `updateConfig` condition verbatim, or should it get its own `else if` branch to avoid unintentionally creating a new service (with a potentially stale URL) when only concurrency changes? The safest approach is to track `currentFhirServerUrl` explicitly in the closure and always use it as the base when recreating, regardless of which field triggered the recreation.
