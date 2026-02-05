## ADDED Requirements

### Requirement: Expose formatting configuration via LSP workspace settings

The language server SHALL read formatting preferences from LSP workspace configuration under the `ecl.formatting` namespace.

#### Scenario: Read configuration when formatting is invoked

- **WHEN** user invokes document formatting
- **THEN** language server requests current configuration via workspace/configuration before formatting

#### Scenario: Use default values when configuration is absent

- **WHEN** workspace configuration does not provide ecl.formatting settings
- **THEN** language server uses default formatting options

#### Scenario: Apply updated configuration immediately

- **WHEN** user changes formatting configuration in workspace settings
- **THEN** next formatting operation uses updated configuration without server restart

### Requirement: Support configurable indentation size

The formatter SHALL respect the `ecl.formatting.indentSize` setting to control indentation depth.

#### Scenario: Format with default 2-space indentation

- **WHEN** indentSize is not configured or set to 2
- **THEN** nested structures are indented with 2 spaces per level

#### Scenario: Format with 4-space indentation

- **WHEN** indentSize is set to 4
- **THEN** nested structures are indented with 4 spaces per level

#### Scenario: Format refinement with configured indentation

- **WHEN** formatting expression with refinement and indentSize set to 3
- **THEN** refinement attributes are indented with 3 spaces

#### Scenario: Reject invalid indentSize values

- **WHEN** indentSize is set to 0, negative, or non-integer value
- **THEN** language server falls back to default value of 2 and logs warning

### Requirement: Support configurable indentation style

The formatter SHALL respect the `ecl.formatting.indentStyle` setting to use spaces or tabs for indentation.

#### Scenario: Format with space indentation by default

- **WHEN** indentStyle is not configured or set to "space"
- **THEN** nested structures use space characters for indentation

#### Scenario: Format with tab indentation

- **WHEN** indentStyle is set to "tab"
- **THEN** nested structures use tab characters for indentation

#### Scenario: Combine tab style with indentSize

- **WHEN** indentStyle is "tab" and indentSize is 2
- **THEN** nested structures use 2 tab characters per indentation level

#### Scenario: Reject invalid indentStyle values

- **WHEN** indentStyle is set to value other than "space" or "tab"
- **THEN** language server falls back to "space" and logs warning

### Requirement: Support configurable operator spacing

The formatter SHALL respect the `ecl.formatting.spaceAroundOperators` setting to control spacing around logical operators.

#### Scenario: Apply spaces around operators by default

- **WHEN** spaceAroundOperators is not configured or set to true
- **THEN** single space appears before and after AND, OR, MINUS operators

#### Scenario: Omit spaces around operators when disabled

- **WHEN** spaceAroundOperators is set to false
- **THEN** no spaces appear before and after AND, OR, MINUS operators

#### Scenario: Spacing does not affect constraint operators

- **WHEN** spaceAroundOperators is false
- **THEN** constraint operators (<, <<, >, >>) still have no space after them (unchanged behavior)

### Requirement: Support configurable maximum line length

The formatter SHALL respect the `ecl.formatting.maxLineLength` setting to control line breaking behavior.

#### Scenario: Use default 80-character limit

- **WHEN** maxLineLength is not configured or set to 80
- **THEN** expressions exceeding 80 characters are broken across lines

#### Scenario: Use custom line length limit

- **WHEN** maxLineLength is set to 120
- **THEN** expressions exceeding 120 characters are broken across lines

#### Scenario: Disable line length limit with 0

- **WHEN** maxLineLength is set to 0
- **THEN** expressions are never broken across lines based on length (only structure)

#### Scenario: Reject invalid maxLineLength values

- **WHEN** maxLineLength is set to negative value
- **THEN** language server falls back to default value of 80 and logs warning

#### Scenario: Allow terms to exceed max line length

- **WHEN** concept term exceeds maxLineLength
- **THEN** term is not broken across lines even if expression would exceed limit

### Requirement: Support configurable term alignment

The formatter SHALL respect the `ecl.formatting.alignTerms` setting to control vertical alignment of terms in refinements.

#### Scenario: Align term pipes by default

- **WHEN** alignTerms is not configured or set to true
- **THEN** term delimiters (|) in multi-attribute refinements are vertically aligned

#### Scenario: Disable term alignment

- **WHEN** alignTerms is set to false
- **THEN** terms are formatted without vertical alignment

#### Scenario: Align terms example with multiple attributes

- **WHEN** formatting refinement with attributes `363698007 |Finding site| = < 39057004` and `116676008 |Morphology| = < 107666005` and alignTerms is true
- **THEN** pipe characters are aligned vertically

#### Scenario: Skip alignment for single attribute

- **WHEN** refinement has only one attribute and alignTerms is true
- **THEN** no special alignment applied (standard formatting)

### Requirement: Provide default formatting options

The language server SHALL define sensible default values for all formatting options when not configured by user.

#### Scenario: Default configuration values

- **WHEN** no formatting configuration is provided
- **THEN** defaults are: indentSize=2, indentStyle="space", spaceAroundOperators=true, maxLineLength=80, alignTerms=true

#### Scenario: Partial configuration uses defaults for missing values

- **WHEN** user configures only indentSize=4 without other options
- **THEN** other options use default values while indentSize uses 4

### Requirement: Validate configuration values

The language server SHALL validate formatting configuration values and provide meaningful error messages for invalid values.

#### Scenario: Warn on invalid configuration type

- **WHEN** indentSize is set to string value like "two"
- **THEN** language server logs warning with expected type and falls back to default

#### Scenario: Warn on out-of-range values

- **WHEN** indentSize is set to unreasonably large value like 100
- **THEN** language server logs warning suggesting reasonable range (1-8) and falls back to default

#### Scenario: Configuration errors do not prevent formatting

- **WHEN** formatting configuration contains invalid values
- **THEN** formatter uses default values and still formats document successfully
