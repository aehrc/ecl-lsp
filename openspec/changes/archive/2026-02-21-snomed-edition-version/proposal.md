## Why

All FHIR terminology queries currently run against the server's default SNOMED CT edition and version. Users working with national editions (e.g. Australian, US, UK) or pinned release versions get incorrect concept validation, hover information, evaluation results, and semantic warnings because the server may default to the International Edition or a different version than intended.

## What Changes

- Add a `ecl.terminology.snomedVersion` string setting that accepts a SNOMED CT URI in one of two forms: edition-only (`http://snomed.info/sct/32506021000036107`, uses the server's latest version of that edition) or pinned (`http://snomed.info/sct/32506021000036107/version/20260131`, uses that exact release). When empty, the server's default edition/version is used (current behaviour preserved).
- Add an `ecl.selectSnomedEdition` command with a two-step QuickPick: step 1 picks the edition (fetched from the FHIR server, grouped and labelled with country names), step 2 picks the version (descending date order, with a "Latest" option at the top that stores the edition-only URI). The selection is saved to the setting above.
- Add a status bar item showing the active edition/version. When no version is configured: "(Default)" initially, then updated to show the resolved edition/version from the most recent FHIR response (e.g. "(Default) International 2025-03-01"). Edition-only: "Australian (latest)", updated to "Australian 2026-01-31 (latest)" after first FHIR response. Pinned: "Australian 2026-01-31". Clicking it triggers the QuickPick.
- Pass the configured version URI through all FHIR operations: `$lookup` (`version` parameter), `$expand` (`system-version` parameter), and `ValueSet/$expand` for ECL evaluation (append version to the implicit value set URL).
- Reset the edition/version setting to empty when `ecl.terminology.serverUrl` changes, since a different server may not have the same editions loaded.
- Add a FHIR endpoint to fetch available editions/versions: `GET /CodeSystem?url=http://snomed.info/sct` and parse the `version` field from returned resources.

## Capabilities

### New Capabilities

- `snomed-edition-picker`: Two-step QuickPick command to discover and select a SNOMED CT edition and version from the connected FHIR server. Includes status bar indicator, edition-to-country-name mapping, and persistence to workspace settings.
- `snomed-version-config`: Server-side version URI handling — threading the configured version through all FHIR operations ($lookup, $expand, ECL evaluation), resetting on server URL change, and graceful fallback when no version is set.

### Modified Capabilities

(none)

## Impact

- **Client (clients/vscode):** New command registration, QuickPick UI, status bar item, LSP custom request for fetching editions. Extension.ts grows ~150-200 lines.
- **Server (server/src):** `FhirTerminologyService` gains a `snomedVersion` field threaded into all FHIR URLs. New `ecl/getSnomedEditions` custom request handler. `initTerminologyService` reads the new setting and resets on server URL change. ~100-150 lines across fhir-service.ts and server.ts.
- **Configuration (package.json):** One new setting (`ecl.terminology.snomedVersion`), one new command (`ecl.selectSnomedEdition`).
- **Dependencies:** None new. Uses existing `node-fetch`, `vscode` APIs, and LSP custom requests.
- **Risk:** Low. All changes are additive. Empty/absent version setting preserves current behaviour exactly. The edition list fetch is a single FHIR GET that can fail gracefully (show manual entry fallback).
