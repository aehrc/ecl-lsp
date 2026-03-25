## ADDED Requirements

### Requirement: Eclipse LSP4E plugin with bundled server

The Eclipse plugin SHALL use Eclipse LSP4E for language server integration and SHALL bundle the ecl-lsp-server within the plugin distribution, requiring no separate server installation.

#### Scenario: Plugin activates on .ecl file open

- **WHEN** user opens a file with `.ecl` extension in Eclipse
- **THEN** the plugin activates and starts the bundled ECL language server

#### Scenario: Server bundled in plugin

- **WHEN** the plugin is installed from Eclipse Marketplace
- **THEN** the ecl-lsp-server is included in the plugin and requires no separate npm install

#### Scenario: Plugin works offline after install

- **WHEN** Eclipse starts without internet access (after initial install)
- **THEN** the plugin activates and provides syntax features (FHIR features degrade gracefully)

### Requirement: TextMate syntax highlighting

The Eclipse plugin SHALL register the shared TextMate grammar for ECL syntax highlighting.

#### Scenario: ECL keywords highlighted

- **WHEN** user opens an .ecl file
- **THEN** ECL operators (AND, OR, MINUS, <, <<), concept IDs, and display terms are syntax-highlighted

#### Scenario: Grammar matches shared source of truth

- **WHEN** comparing the grammar used by the Eclipse plugin
- **THEN** it is the same TextMate grammar from `shared/syntaxes/` used by VSCode and IntelliJ

### Requirement: Configuration UI

The Eclipse plugin SHALL provide a preferences page for configuring: FHIR server URL, timeout, SNOMED edition/version, formatting preferences, and semantic validation toggle.

#### Scenario: Settings accessible via preferences

- **WHEN** user opens Eclipse Preferences
- **THEN** an "ECL Language Server" section is available with all configuration fields

#### Scenario: Settings sent to server on change

- **WHEN** user changes the FHIR server URL in preferences
- **THEN** the new setting is sent to the language server via workspace/didChangeConfiguration

### Requirement: Standard LSP features exposed

The Eclipse plugin SHALL expose all LSP features provided by ecl-lsp-server through Eclipse's standard editor integration.

#### Scenario: Diagnostics shown as markers

- **WHEN** the server reports syntax errors or concept warnings
- **THEN** Eclipse shows them as error/warning markers in the editor and Problems view

#### Scenario: Completion available

- **WHEN** user triggers content assist (Ctrl+Space) in an .ecl file
- **THEN** ECL-aware completion suggestions appear

#### Scenario: Hover information displayed

- **WHEN** user hovers over an operator or concept ID
- **THEN** documentation or concept information is shown in a tooltip

#### Scenario: Code actions available

- **WHEN** user invokes Quick Fix on an expression
- **THEN** ECL refactoring actions (simplify, add terms, etc.) are available
