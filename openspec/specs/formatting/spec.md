## MODIFIED Requirements

### Requirement: Format selected range of ECL document

The formatter SHALL provide range formatting that accepts plain text and `CoreRange` instead of LSP `TextDocument` and `Range` types. The LSP server adapter SHALL handle the conversion between LSP types and core types.

#### Scenario: Format selection within single expression

- **WHEN** user selects part of an expression and invokes range formatting
- **THEN** complete expression containing the selection is formatted

#### Scenario: Format selection spanning multiple expressions

- **WHEN** user selects text spanning multiple `/* ECL-END */` delimited expressions
- **THEN** all expressions touched by selection are formatted

#### Scenario: Format selection with partial expression

- **WHEN** user selects lines 3-5 of expression spanning lines 1-8
- **THEN** entire expression (lines 1-8) is formatted to maintain validity

#### Scenario: Range formatting accepts plain text input

- **WHEN** calling range formatting from ecl-core
- **THEN** it accepts `(fullText: string, range: CoreRange, options: FormattingOptions)` instead of `(document: TextDocument, range: Range)`

#### Scenario: LSP adapter converts TextDocument to plain text

- **WHEN** the LSP server receives a textDocument/rangeFormatting request
- **THEN** it extracts the full text from the TextDocument and passes it with a CoreRange to ecl-core's range formatter

### Requirement: Handle formatting errors gracefully

The formatter SHALL handle invalid input gracefully without crashing or corrupting content. Configuration validation functions SHALL be pure functions that do not depend on LSP `Connection` for reading settings.

#### Scenario: Return original content for unparseable expressions

- **WHEN** formatting document with syntax errors that prevent parsing
- **THEN** original content is returned unmodified

#### Scenario: Log formatting errors appropriately

- **WHEN** formatting fails due to unexpected error
- **THEN** error is logged with context but does not crash language server

#### Scenario: Timeout on extremely large documents

- **WHEN** formatting takes longer than 5 seconds
- **THEN** formatting is aborted and original content is returned

#### Scenario: Config validation is pure functions

- **WHEN** calling `validateIndentSize`, `validateIndentStyle`, `validateMaxLineLength`, or `validateBoolean`
- **THEN** these are pure functions accepting values and returning validated results, with no LSP `Connection` parameter

#### Scenario: LSP server reads config from Connection

- **WHEN** the LSP server needs formatting options
- **THEN** it reads settings from the LSP `Connection`, validates with ecl-core's pure validators, and passes the resulting `FormattingOptions` to ecl-core's formatter
