## 1. Configuration

- [x] 1.1 Add `ecl.terminology.snomedVersion` string setting to `clients/vscode/package.json` (type string, default `""`, description with version URI format example)
- [x] 1.2 Add `ecl.selectSnomedEdition` command to `clients/vscode/package.json` contributes.commands
- [x] 1.3 Read `ecl.terminology.snomedVersion` in `initTerminologyService()` in `server.ts` and pass to FhirTerminologyService constructor

## 2. Server — Version Threading

- [x] 2.1 Add optional `snomedVersion?: string` parameter to `FhirTerminologyService` constructor; store as `this.snomedVersion`
- [x] 2.2 Add private helper `private get snomedSystemUrl(): string` that returns `this.snomedVersion || 'http://snomed.info/sct'` for use in implicit ValueSet URLs (works for both edition-only and pinned URIs)
- [x] 2.3 Thread version into `getConceptInfo()`: append `&version={uri}` when snomedVersion is set
- [x] 2.4 Thread version into `evaluateEcl()`: replace `http://snomed.info/sct` base with snomedVersion in implicit ValueSet URL
- [x] 2.5 Thread version into `bulkExpand()`: add `version` field to compose include object when snomedVersion is set
- [x] 2.6 Thread version into `searchByFilter()`: replace `http://snomed.info/sct` base with snomedVersion in implicit ValueSet URL
- [x] 2.7 Thread version into `searchConcepts()` (public method that calls searchByFilter): ensure version propagates

## 3. Server — Resolved Version Extraction

- [x] 3.1 Add `valueUri?: string` to `FhirParameterPart` interface
- [x] 3.2 Add `parameter?: { name: string; valueUri?: string }[]` to `FhirExpansion` interface
- [x] 3.3 Add `resolvedVersion: string | null` field to `FhirTerminologyService`; add `getResolvedVersion()` accessor
- [x] 3.4 Add private `extractResolvedVersion()` helper that parses version from $expand or $lookup response parameter arrays; sets `resolvedVersion` only if not yet captured
- [x] 3.5 Call `extractResolvedVersion()` in `getConceptInfo()`, `evaluateEcl()`, `bulkExpand()`, and `searchByFilter()` after successful response parsing
- [x] 3.6 Add `onResolvedVersion` callback to constructor (or use event pattern) so server.ts can forward the notification to the client

## 4. Server — Edition Discovery

- [x] 4.1 Add `getSnomedEditions()` method to `FhirTerminologyService`: fetch `GET /CodeSystem?url=http://snomed.info/sct`, parse Bundle, group by module ID, sort versions descending
- [x] 4.2 Define TypeScript types for edition response: `SnomedEdition { moduleId: string; versions: SnomedVersion[] }` and `SnomedVersion { uri: string; date: string }`
- [x] 4.3 Add `ecl/getSnomedEditions` custom request handler in `server.ts` that calls `terminologyService.getSnomedEditions()`

## 5. Server — Notification Wiring

- [x] 5.1 Add `ecl/resolvedSnomedVersion` notification handler in `server.ts`: when `FhirTerminologyService` resolves a version, send `connection.sendNotification('ecl/resolvedSnomedVersion', { versionUri: '...' })` to client

## 6. Client — Edition Picker Command

- [x] 6.1 Add hardcoded `MODULE_TO_COUNTRY` map in extension.ts with known SNOMED CT module IDs → country names
- [x] 6.2 Implement `selectSnomedEdition` command: call `ecl/getSnomedEditions`, build two-step QuickPick (edition → version), save to `ecl.terminology.snomedVersion`. Version step includes "Latest" at top (stores edition-only URI `http://snomed.info/sct/{moduleId}`) plus specific versions (store pinned URI)
- [x] 6.3 Add "Default (server)" option at top of edition QuickPick that sets snomedVersion to `""`
- [x] 6.4 Add manual entry fallback (InputBox) when edition discovery fails or returns empty
- [x] 6.5 Register command in `activate()` and add to disposables

## 7. Client — Status Bar

- [x] 7.1 Create `StatusBarItem` in `activate()` with click command `ecl.selectSnomedEdition`
- [x] 7.2 Add `updateStatusBar()` helper that reads `ecl.terminology.snomedVersion`, parses module ID and optional date, maps to country name, and updates the status bar text. Initial states: "(Default)", "{Edition} (latest)", "{Edition} {YYYY-MM-DD}". After resolution: "(Default) {Edition} {YYYY-MM-DD}" or "{Edition} {resolved-YYYY-MM-DD} (latest)"
- [x] 7.3 Listen for `ecl/resolvedSnomedVersion` notification from server; when received and setting is empty or edition-only, update status bar to show resolved edition/date with tooltip "Resolved from server"
- [x] 7.4 Clear resolved version display on config change (new setting overrides previous resolution)
- [x] 7.5 Call `updateStatusBar()` on activation, on config change, and on active editor change
- [x] 7.6 Show/hide status bar item based on whether the active editor is an ECL document

## 8. Client — Server URL Change Detection

- [x] 8.1 Track previous `ecl.terminology.serverUrl` value in extension.ts
- [x] 8.2 In `onDidChangeConfiguration`, detect when serverUrl changes and clear `ecl.terminology.snomedVersion` to `""`
- [x] 8.3 Update status bar after clearing version

## 9. Tests — Server

- [x] 9.1 Test `FhirTerminologyService` constructor stores snomedVersion field
- [x] 9.2 Test `getConceptInfo()` URL includes version parameter when snomedVersion is set
- [x] 9.3 Test `evaluateEcl()` URL uses versioned implicit ValueSet URL
- [x] 9.4 Test `bulkExpand()` POST body includes version in compose include
- [x] 9.5 Test `searchByFilter()` URL uses versioned implicit ValueSet URL
- [x] 9.6 Test all URL methods produce unversioned URLs when snomedVersion is empty/undefined
- [x] 9.7 Test all URL methods work correctly with edition-only URI (no `/version/{date}` suffix)
- [x] 9.8 Test `getSnomedEditions()` parses a mock FHIR Bundle into grouped editions
- [x] 9.9 Test `getSnomedEditions()` handles empty Bundle and error responses
- [x] 9.10 Test resolved version extraction from $expand response parameter array
- [x] 9.11 Test resolved version extraction from $lookup response parameter array
- [x] 9.12 Test resolved version is only captured once per service lifetime
- [x] 9.13 Test resolved version callback/notification is invoked on first capture

## 10. Verification

- [x] 10.1 Run `npm run compile` — both server and client build cleanly
- [x] 10.2 Run `npm test` — all existing + new tests pass (1125 pass, 0 fail)
- [x] 10.3 Run `npm run lint` — no new warnings (8 pre-existing, 0 from this change)
- [ ] 10.4 Manual F5 test: open ECL file, verify status bar shows "SNOMED CT: Default", trigger an evaluation, verify status bar updates to show resolved edition/version, click to open picker, select edition, verify status bar updates, verify evaluation uses selected edition
