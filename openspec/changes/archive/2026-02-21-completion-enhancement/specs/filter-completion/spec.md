## ADDED Requirements

### Requirement: Offer filter block openers after complete constraints

The completion provider SHALL offer `{{ D` (description filter), `{{ C` (concept filter), `{{ M` (member filter), and `{{ +` (history supplement) after a complete subexpression constraint (concept with optional term).

#### Scenario: Show filter options after concept with term

- **WHEN** cursor is after `< 64572001 |Disease| `
- **THEN** completion list includes `{{ D` with detail "Description filter", `{{ C` with detail "Concept filter", and `{{ +` with detail "History supplement"

#### Scenario: Show member filter after member-of expression

- **WHEN** cursor is after `^ 700043003 |Example problem list| `
- **THEN** completion list includes `{{ M` with detail "Member filter" alongside `{{ D` and `{{ C`

#### Scenario: Do not show filters at expression start

- **WHEN** cursor is at the start of an empty expression
- **THEN** completion list does NOT include any filter openers

#### Scenario: Do not show filters after logical operators

- **WHEN** cursor is after `< 64572001 AND `
- **THEN** completion list does NOT include filter openers (only constraint operators)

#### Scenario: Show filters after closing filter block

- **WHEN** cursor is after `< 64572001 {{ D term = "heart" }} `
- **THEN** completion list includes `{{ D`, `{{ C`, and `{{ +` for chaining additional filters

### Requirement: Offer description filter keywords inside `{{ D` blocks

The completion provider SHALL offer description filter keywords when the cursor is inside a `{{ D` or `{{` block (no type prefix defaults to description filter per grammar rule 62).

#### Scenario: Show keywords after opening `{{ D`

- **WHEN** cursor is after `{{ D ` or `{{ `
- **THEN** completion list includes: `term`, `type`, `typeId`, `language`, `dialect`, `dialectId`, `moduleId`, `effectiveTime`, `active`, `id`

#### Scenario: Show keywords after comma inside filter block

- **WHEN** cursor is after `{{ D term = "heart", `
- **THEN** completion list includes the same filter keywords for the next filter clause

#### Scenario: Show type token values after `type =`

- **WHEN** cursor is after `{{ D type = `
- **THEN** completion list includes `syn` (synonym), `fsn` (fully specified name), `def` (definition)

#### Scenario: Show boolean values after `active =`

- **WHEN** cursor is after `{{ D active = `
- **THEN** completion list includes `true`, `false`, `1`, `0`

### Requirement: Offer concept filter keywords inside `{{ C` blocks

The completion provider SHALL offer concept filter keywords when the cursor is inside a `{{ C` block.

#### Scenario: Show keywords after opening `{{ C`

- **WHEN** cursor is after `{{ C `
- **THEN** completion list includes: `definitionStatus`, `definitionStatusId`, `moduleId`, `effectiveTime`, `active`

#### Scenario: Show definition status tokens after `definitionStatus =`

- **WHEN** cursor is after `{{ C definitionStatus = `
- **THEN** completion list includes `primitive`, `defined`

#### Scenario: Show boolean values after `active =` inside concept filter

- **WHEN** cursor is after `{{ C active = `
- **THEN** completion list includes `true`, `false`, `1`, `0`

### Requirement: Offer member filter keywords inside `{{ M` blocks

The completion provider SHALL offer member filter keywords when the cursor is inside a `{{ M` block.

#### Scenario: Show keywords after opening `{{ M`

- **WHEN** cursor is after `{{ M `
- **THEN** completion list includes: `moduleId`, `effectiveTime`, `active`

### Requirement: Offer history supplement completions

The completion provider SHALL offer history supplement variants after `{{ +` and as standalone filter options.

#### Scenario: Show HISTORY keyword after `{{ +`

- **WHEN** cursor is after `{{ + `
- **THEN** completion list includes: `HISTORY }}` (max recall), `HISTORY-MIN }}`, `HISTORY-MOD }}`, `HISTORY-MAX }}`

#### Scenario: History supplement as snippet

- **WHEN** user selects `HISTORY-MIN }}` from completion
- **THEN** text `HISTORY-MIN }}` is inserted, completing the history supplement block

### Requirement: Filter completions use appropriate CompletionItemKind

The completion provider SHALL use distinct CompletionItemKind values for filter-related items.

#### Scenario: Filter openers use Struct kind

- **WHEN** completion list includes filter openers (`{{ D`, `{{ C`, `{{ M`, `{{ +`)
- **THEN** each uses `CompletionItemKind.Struct`

#### Scenario: Filter keywords use Property kind

- **WHEN** completion list includes filter keywords (term, type, language, etc.)
- **THEN** each uses `CompletionItemKind.Property`

#### Scenario: Filter value tokens use EnumMember kind

- **WHEN** completion list includes value tokens (syn, fsn, def, primitive, defined, true, false)
- **THEN** each uses `CompletionItemKind.EnumMember`
