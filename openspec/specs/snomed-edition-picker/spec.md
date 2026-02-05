## Purpose

Provides a VSCode UI for selecting SNOMED CT editions and versions via a two-step QuickPick, with status bar indicator showing the active edition/version and automatic reset on server URL changes.

## Requirements

### Requirement: Edition discovery via LSP custom request

The client SHALL send an `ecl/getSnomedEditions` custom request to the server. The server SHALL fetch `GET /CodeSystem?url=http://snomed.info/sct` from the configured FHIR terminology server and return a structured response containing all available SNOMED CT editions with their versions.

The response SHALL be an array of edition objects, each containing:

- `moduleId` (string): The SNOMED CT module identifier
- `versions` (array): Version objects with `uri` (full version URI) and `date` (YYYYMMDD string), sorted newest-first

#### Scenario: Server returns multiple editions

- **WHEN** the FHIR server has International, Australian, and US editions loaded
- **THEN** the `ecl/getSnomedEditions` response contains 3 edition objects with distinct module IDs, each having at least one version entry

#### Scenario: Server returns single edition with multiple versions

- **WHEN** the FHIR server has the International Edition with versions 20250131 and 20250731
- **THEN** the response contains one edition object with `moduleId: "900000000000207008"` and two version entries, 20250731 listed before 20250131

#### Scenario: FHIR server unreachable

- **WHEN** the FHIR server is unreachable or returns an error
- **THEN** the server returns an error response and the client SHALL display a manual entry input box as fallback

#### Scenario: FHIR server returns no SNOMED editions

- **WHEN** the FHIR server returns an empty Bundle for the CodeSystem query
- **THEN** the server returns an empty array and the client SHALL display a manual entry input box

### Requirement: Two-step QuickPick for edition and version selection

The extension SHALL register an `ecl.selectSnomedEdition` command that displays a two-step QuickPick. Step 1 SHALL show available editions labelled with country names (derived from a hardcoded module-ID-to-country-name map). Step 2 SHALL show a "Latest" option at the top followed by specific versions in descending date order. Selecting "Latest" SHALL store the edition-only URI (`http://snomed.info/sct/{moduleId}`). Selecting a specific version SHALL store the full version URI (`http://snomed.info/sct/{moduleId}/version/{date}`). The final selection SHALL be saved to the `ecl.terminology.snomedVersion` workspace setting.

#### Scenario: User selects Australian edition, pinned version

- **WHEN** the user invokes `ecl.selectSnomedEdition` and picks "Australian" then "2026-01-31"
- **THEN** `ecl.terminology.snomedVersion` is set to `http://snomed.info/sct/32506021000036107/version/20260131`

#### Scenario: User selects Australian edition, latest

- **WHEN** the user invokes `ecl.selectSnomedEdition` and picks "Australian" then "Latest"
- **THEN** `ecl.terminology.snomedVersion` is set to `http://snomed.info/sct/32506021000036107`

#### Scenario: User cancels at edition step

- **WHEN** the user invokes the command and presses Escape at the edition picker
- **THEN** no changes are made to `ecl.terminology.snomedVersion`

#### Scenario: User cancels at version step

- **WHEN** the user selects an edition but presses Escape at the version picker
- **THEN** no changes are made to `ecl.terminology.snomedVersion`

#### Scenario: Unknown module ID falls back to generic label

- **WHEN** the FHIR server returns an edition with module ID `99999000000000000` not in the hardcoded map
- **THEN** the QuickPick displays it as "Edition 99999000000000000"

#### Scenario: User selects "Default (server)" option

- **WHEN** the QuickPick includes a "Default (server)" option at the top of the edition list and the user selects it
- **THEN** `ecl.terminology.snomedVersion` is set to an empty string

### Requirement: Manual entry fallback

When the `ecl/getSnomedEditions` request fails or returns no editions, the extension SHALL display a `vscode.window.showInputBox` allowing the user to manually type a SNOMED CT version URI. The input box SHALL have a placeholder showing the expected format.

#### Scenario: Manual entry after server error

- **WHEN** the edition discovery request fails and the user types `http://snomed.info/sct/32506021000036107/version/20260131` into the input box
- **THEN** `ecl.terminology.snomedVersion` is set to that URI

#### Scenario: User cancels manual entry

- **WHEN** the edition discovery fails and the user presses Escape on the input box
- **THEN** no changes are made to `ecl.terminology.snomedVersion`

### Requirement: Status bar indicator

The extension SHALL create a `StatusBarItem` that displays the active SNOMED CT edition and version. The display SHALL reflect three configured states plus resolved version updates:

- Empty setting (initial): `"(Default)"`
- Empty setting (after resolved version notification): `"(Default) {ResolvedEdition} {YYYY-MM-DD}"`
- Edition-only URI (initial): `"{EditionName} (latest)"`
- Edition-only URI (after resolved version notification): `"{EditionName} {resolved-YYYY-MM-DD} (latest)"`
- Pinned URI: `"{EditionName} {YYYY-MM-DD}"` (static, no resolution needed)

The edition name SHALL be derived from the module-ID-to-country-name map. Clicking the status bar item SHALL trigger the `ecl.selectSnomedEdition` command. The status bar item SHALL be visible when an ECL document is open and hidden otherwise.

The extension SHALL listen for `ecl/resolvedSnomedVersion` notifications from the server. When received, if the current setting is empty or edition-only, the status bar SHALL update to show the resolved edition and date.

#### Scenario: No version configured, no FHIR response yet

- **WHEN** `ecl.terminology.snomedVersion` is empty and no FHIR operations have occurred
- **THEN** the status bar shows `"(Default)"`

#### Scenario: No version configured, resolved from server

- **WHEN** `ecl.terminology.snomedVersion` is empty and the server sends `ecl/resolvedSnomedVersion` with `http://snomed.info/sct/900000000000207008/version/20250301`
- **THEN** the status bar shows `"(Default) International 2025-03-01"`

#### Scenario: Australian edition latest, resolved from server

- **WHEN** `ecl.terminology.snomedVersion` is `http://snomed.info/sct/32506021000036107` and the server sends resolved version `http://snomed.info/sct/32506021000036107/version/20260131`
- **THEN** the status bar shows `"Australian 2026-01-31 (latest)"`

#### Scenario: Australian edition with pinned version

- **WHEN** `ecl.terminology.snomedVersion` is `http://snomed.info/sct/32506021000036107/version/20260131`
- **THEN** the status bar shows `"Australian 2026-01-31"`

#### Scenario: Unknown edition with pinned version

- **WHEN** `ecl.terminology.snomedVersion` is `http://snomed.info/sct/99999000000000000/version/20260131`
- **THEN** the status bar shows `"99999000000000000 2026-01-31"`

#### Scenario: Config change clears resolved version

- **WHEN** the user changes `ecl.terminology.snomedVersion` to a new value
- **THEN** the previously resolved version is discarded and the status bar reflects the new setting's initial state

#### Scenario: Status bar click triggers picker

- **WHEN** the user clicks the status bar item
- **THEN** the `ecl.selectSnomedEdition` command is invoked

#### Scenario: Status bar hidden for non-ECL files

- **WHEN** the active editor is not an ECL document
- **THEN** the status bar item is not visible

### Requirement: Reset version on server URL change

The extension SHALL watch for changes to `ecl.terminology.serverUrl` via `workspace.onDidChangeConfiguration`. When the server URL changes, the extension SHALL set `ecl.terminology.snomedVersion` to an empty string and update the status bar to show `"SNOMED CT: Default"`.

#### Scenario: Server URL change clears version

- **WHEN** the user changes `ecl.terminology.serverUrl` from `https://tx.ontoserver.csiro.au/fhir` to `https://snowstorm.example.com/fhir`
- **THEN** `ecl.terminology.snomedVersion` is automatically set to `""` and the status bar shows `"SNOMED CT: Default"`

#### Scenario: Server URL unchanged does not reset version

- **WHEN** `onDidChangeConfiguration` fires but `ecl.terminology.serverUrl` has the same value as before
- **THEN** `ecl.terminology.snomedVersion` is not modified

### Requirement: Configuration setting

The extension SHALL contribute an `ecl.terminology.snomedVersion` string setting in `package.json` with default value `""` and a description indicating it accepts a SNOMED CT version URI. The setting SHALL be editable both via the QuickPick command and via the standard VSCode settings UI.

#### Scenario: Setting declared in package.json

- **WHEN** the extension is loaded
- **THEN** `ecl.terminology.snomedVersion` appears in the VSCode settings UI under the ECL section with type `string` and default `""`

#### Scenario: Setting editable via settings UI

- **WHEN** the user types a version URI directly into the settings UI
- **THEN** the server reads the new value on the next configuration change and uses it for all FHIR operations
