## Context

All FHIR terminology operations currently use the hardcoded system URI `http://snomed.info/sct` without a version qualifier. This means every `$lookup`, `$expand`, and implicit ValueSet URL resolves against the FHIR server's default SNOMED CT edition — typically the International Edition at its latest loaded version. Users working with national editions (Australian, US, UK) or pinned historical releases get wrong results.

**Current state of FHIR URL construction** (all in `fhir-service.ts`):

| Operation        | Current URL                                                       | Version injection point                                                              |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `$lookup`        | `CodeSystem/$lookup?system=http://snomed.info/sct&code={id}`      | Add `&version={versionUri}`                                                          |
| `evaluateEcl`    | `ValueSet/$expand?url=http://snomed.info/sct?fhir_vs=ecl/{ecl}`   | Replace base with `http://snomed.info/sct/{module}/version/{date}?fhir_vs=ecl/{ecl}` |
| `bulkExpand`     | POST body: `{ system: "http://snomed.info/sct", concept: [...] }` | Add `version: "{versionUri}"` to include                                             |
| `searchByFilter` | `ValueSet/$expand?url=http://snomed.info/sct?fhir_vs&filter={f}`  | Replace base with `http://snomed.info/sct/{module}/version/{date}?fhir_vs`           |

**SNOMED URI formats**: Edition-only `http://snomed.info/sct/{moduleId}` (latest version) or pinned `http://snomed.info/sct/{moduleId}/version/{YYYYMMDD}` (specific release). Both are valid FHIR system URIs for SNOMED CT.

## Goals / Non-Goals

**Goals:**

- Allow users to select a specific SNOMED CT edition and version for all FHIR operations
- Provide a discoverable QuickPick UI that queries the FHIR server for available editions
- Show the active edition in the status bar for constant visibility
- Thread the version URI through every FHIR call (lookup, expand, evaluate, search)
- Preserve current behaviour exactly when no version is configured

**Non-Goals:**

- Supporting non-SNOMED code systems (LOINC, ICD-10, etc.)
- Per-file or per-expression edition overrides
- Edition auto-detection from file content or project configuration
- Caching the edition list across sessions (fetched fresh each time the picker opens)
- Supporting FHIR servers that don't implement `GET /CodeSystem?url=http://snomed.info/sct`

## Decisions

### 1. SNOMED URI as the single config value (three-way choice)

**Decision:** Store a SNOMED CT URI in `ecl.terminology.snomedVersion`. The setting supports three states:

| State                 | Value                                                  | Behaviour                                               |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| Server default        | `""` (empty)                                           | No version qualifier — server picks edition and version |
| Edition only (latest) | `http://snomed.info/sct/{moduleId}`                    | Server uses the latest loaded version of that edition   |
| Pinned version        | `http://snomed.info/sct/{moduleId}/version/{YYYYMMDD}` | Exact edition and release date                          |

**Alternatives considered:**

- _Separate edition + version fields_: Two settings would require coordination and validation that the combination exists. A single URI is atomic and directly usable in FHIR calls.
- _Pinned version only (no edition-only option)_: Users who always want the latest release of their national edition would need to update the setting after every SNOMED release. The edition-only URI (`http://snomed.info/sct/{moduleId}`) is a valid SNOMED CT system URI that tells the FHIR server to use the latest version of that module.

**Rationale:** Both URI forms are canonical FHIR identifiers. They can be parsed to extract module ID and (optionally) date for display, and inserted directly into FHIR URLs with no transformation. The edition-only form is the common case — most users care about _which_ edition, not _which release_.

### 2. Server-side edition discovery via custom LSP request

**Decision:** Add an `ecl/getSnomedEditions` custom request handler on the server. The server fetches `GET /CodeSystem?url=http://snomed.info/sct` from the configured FHIR server, parses the response, and returns a structured list of editions with their versions. The client calls this request and displays the result in a QuickPick.

**Alternatives considered:**

- _Client-side fetch_: Would require the client to know the FHIR server URL, handle timeouts, parse FHIR bundles. Duplicates HTTP infrastructure that already exists on the server.
- _Static edition list_: Would go stale and wouldn't reflect what the specific server actually has loaded.

**Rationale:** Keeps all FHIR interaction on the server side where `fetchWithTimeout()` and URL construction already exist. The client remains a thin UI layer.

### 3. Two-step QuickPick (edition → version)

**Decision:** Step 1 shows distinct editions grouped by module ID with country names. Step 2 shows a "Latest" option at the top (stores edition-only URI) followed by specific versions in descending date order (newest first). Both steps use `vscode.window.showQuickPick`.

**Alternatives considered:**

- _Single flat list_: With many editions × versions, the list becomes unwieldy. Two steps filter effectively.
- _Tree view / webview_: Over-engineered for a simple selection. QuickPick is the established VSCode pattern (matches Python interpreter picker, TypeScript version selector).

**Rationale:** Two QuickPicks is the minimal UI that handles the two-dimensional nature of the selection (which edition × which version).

### 4. Status bar item with click-to-change and resolved version display

**Decision:** Add a `StatusBarItem` on the right side (priority 100). Display states:

- Pinned: `"{EditionName} {YYYY-MM-DD}"` (static, directly from setting)
- Edition-only: `"{EditionName} (latest)"` initially, then updated to `"{EditionName} {resolved-date} (latest)"` once the first FHIR response reveals the actual version
- Default: `"(Default)"` initially, then updated to `"(Default) {ResolvedEdition} {resolved-date}"` once the first FHIR response reveals what the server is actually using

Clicking it triggers the `ecl.selectSnomedEdition` command. When the displayed version was resolved from a FHIR response (not explicitly configured), the tooltip says `"Resolved from server"` to distinguish it from an explicit selection.

**How resolved version is extracted:** FHIR `$expand` responses include `ValueSet.expansion.parameter[]` with an entry `{ name: "version", valueUri: "http://snomed.info/sct/{moduleId}/version/{date}" }`. The server extracts this from the first successful `$expand` response and reports it to the client via a custom notification (`ecl/resolvedSnomedVersion`). The `$lookup` response also includes a `version` parameter with a `valueUri` field. The server uses whichever response comes first.

**Alternatives considered:**

- _Client polls the server for resolved version_: Adds unnecessary request/response overhead. A push notification after the first natural FHIR operation is simpler.
- _Show resolved version only in tooltip, not status bar text_: Users would need to hover to see what edition they're actually working against — defeats the purpose of constant visibility.

**Rationale:** Provides constant visibility of which edition is active. The click-to-change pattern matches VSCode conventions (language mode, line endings, encoding selectors in the status bar). Showing the resolved version for "Default" and "latest" modes gives users confidence about exactly which data they're working with, without requiring any configuration.

### 5. Resolved version extraction and notification

**Decision:** Add a `resolvedVersion` field to `FhirTerminologyService` that captures the version URI from the first successful FHIR response. Extend the `FhirExpansion` interface to include `parameter?: { name: string; valueUri?: string }[]` and `FhirParameterPart` to include `valueUri?: string`. After any `$expand` or `$lookup` response, if `resolvedVersion` is not yet set, extract the version from `expansion.parameter[name="version"].valueUri` (for expand) or `parameter[name="version"].valueUri` (for lookup) and store it. The server sends an `ecl/resolvedSnomedVersion` notification to the client with the resolved URI. The client parses it for display.

The resolved version is cleared whenever the `FhirTerminologyService` is recreated (config change), so it re-resolves on the next operation.

**Rationale:** Piggybacks on existing FHIR operations — no extra network requests. The version info is already in every response, just currently ignored. A single notification per service lifetime is sufficient since the server's default doesn't change mid-session.

### 6. Version threading via constructor parameter

**Decision:** Add an optional `snomedVersion?: string` parameter to the `FhirTerminologyService` constructor. Each URL-building method checks `this.snomedVersion` and modifies the URL accordingly. When undefined, URLs are built exactly as today.

**Alternatives considered:**

- _Per-method parameter_: Would require changing every call site. Constructor parameter centralises the decision.
- _Setter method_: Would allow changing mid-session without cache invalidation. Constructor parameter forces a fresh instance (new caches) when the version changes, which is the existing pattern for server URL changes.

**Rationale:** Matches the existing pattern — `initTerminologyService()` already recreates `FhirTerminologyService` on any config change, so all caches are automatically cleared when the edition changes.

### 7. Client-side server URL change detection

**Decision:** The extension watches for `ecl.terminology.serverUrl` changes via `workspace.onDidChangeConfiguration`. When the server URL changes, the extension clears `ecl.terminology.snomedVersion` (sets to empty string) because a different server may not have the same editions loaded.

**Rationale:** The server doesn't know the previous URL to compare against. The client can easily track `onDidChangeConfiguration` and update the setting. This prevents stale version URIs from causing silent failures on a new server.

### 8. Edition-to-country-name mapping

**Decision:** Hardcode a `Map<string, string>` of known SNOMED CT module IDs to country names in the client extension. Unknown module IDs fall back to `"Edition {moduleId}"`.

```
900000000000207008 → International
32506021000036107  → Australian
731000124108       → US
999000011000000103 → UK Clinical
999000021000000109 → UK Drug
11000172109        → Belgian
21000210109        → Danish
...
```

**Rationale:** Module IDs are stable SNOMED identifiers that rarely change. A static map is simpler and faster than a FHIR lookup. The fallback ensures unknown editions still display usefully.

### 9. Manual entry fallback

**Decision:** If the `ecl/getSnomedEditions` request fails (network error, unsupported server), show an input box allowing the user to manually type a version URI.

**Rationale:** Users with non-standard FHIR servers or network restrictions can still configure the edition. The setting is just a string — the QuickPick is convenience, not a requirement.

## Risks / Trade-offs

**[Cache staleness on edition change]** → Mitigated by recreating `FhirTerminologyService` on config change, which creates fresh cache maps. The existing `onDidChangeConfiguration` handler already calls `initTerminologyService()`.

**[FHIR server doesn't support edition query]** → Mitigated by manual entry fallback in QuickPick and graceful error handling. The `GET /CodeSystem?url=http://snomed.info/sct` endpoint is standard FHIR but some servers may return empty results.

**[Version URI format validation]** → Mitigated by the QuickPick producing valid URIs from server data. Manual entry is accepted as-is (no strict validation) since invalid URIs will produce FHIR errors that surface naturally through existing error handling.

**[Status bar clutter]** → The item only shows when an ECL file is open (set `StatusBarItem.show()` on document change, hide when no ECL files). Low risk since ECL users need this information.

**[Edition list fetch latency]** → The QuickPick shows a loading indicator (`showQuickPick` with `busy: true`). The fetch reuses `fetchWithTimeout()` with a 5-second timeout. Users see results quickly or a manual entry fallback.
