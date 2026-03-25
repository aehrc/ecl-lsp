## ADDED Requirements

### Requirement: Claude Code LSP plugin with bundled server

The Claude Code plugin SHALL bundle the ecl-lsp-server and register it as an LSP server for `.ecl` files, requiring zero npm install or external configuration from the user.

#### Scenario: Plugin descriptor references bundled server

- **WHEN** inspecting the plugin's configuration
- **THEN** the server path points to a bundled `ecl-lsp-server` within the plugin directory

#### Scenario: Zero-config activation

- **WHEN** the plugin is installed in Claude Code
- **THEN** it activates automatically when working with `.ecl` files without any user setup

#### Scenario: Plugin includes server distribution

- **WHEN** examining the plugin directory structure
- **THEN** a `server/` subdirectory contains the compiled ecl-lsp-server and its dependencies

### Requirement: LSP feature support

The Claude Code plugin SHALL expose all LSP features provided by ecl-lsp-server that Claude Code supports.

#### Scenario: Diagnostics reported

- **WHEN** the language server detects syntax errors in an .ecl file
- **THEN** Claude Code displays the diagnostics

#### Scenario: Completion available

- **WHEN** completion is triggered in an .ecl file
- **THEN** ECL-aware suggestions are provided

#### Scenario: Formatting available

- **WHEN** format document is invoked on an .ecl file
- **THEN** the ECL formatter produces properly formatted output

### Requirement: Configuration support

The Claude Code plugin SHALL expose configuration for FHIR server URL, timeout, SNOMED edition/version, formatting preferences, and semantic validation toggle.

#### Scenario: Configuration fields defined

- **WHEN** inspecting the plugin's configuration schema
- **THEN** fields for `fhirServerUrl`, `fhirTimeout`, `snomedVersion`, formatting options, and `semanticValidation.enabled` are available

#### Scenario: Default configuration works out of the box

- **WHEN** no custom configuration is provided
- **THEN** the server uses sensible defaults (Ontoserver, international edition, 15s timeout)
