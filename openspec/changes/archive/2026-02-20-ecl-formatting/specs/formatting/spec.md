## ADDED Requirements

### Requirement: Format complete ECL document

The language server SHALL provide textDocument/formatting capability to format entire ECL documents with consistent style.

#### Scenario: Format simple constraint expression

- **WHEN** user invokes format document on `<<404684003|Clinical finding|`
- **THEN** expression is formatted with normalized spacing: `<< 404684003 |Clinical finding|`

#### Scenario: Format compound expression with logical operators

- **WHEN** user invokes format document on `<404684003 AND <19829001`
- **THEN** expression is formatted with spaces around AND: `< 404684003 AND < 19829001`

#### Scenario: Format multi-line expression with indentation

- **WHEN** user invokes format document on unindented refinement expression
- **THEN** refinement attributes are indented according to configured indent size

#### Scenario: Format preserves semantic meaning

- **WHEN** user invokes format document on any valid ECL expression
- **THEN** formatted output parses to identical AST as original input

### Requirement: Format selected range of ECL document

The language server SHALL provide textDocument/rangeFormatting capability to format selected portions of ECL documents.

#### Scenario: Format selection within single expression

- **WHEN** user selects part of an expression and invokes range formatting
- **THEN** complete expression containing the selection is formatted

#### Scenario: Format selection spanning multiple expressions

- **WHEN** user selects text spanning multiple `/* ECL-END */` delimited expressions
- **THEN** all expressions touched by selection are formatted

#### Scenario: Format selection with partial expression

- **WHEN** user selects lines 3-5 of expression spanning lines 1-8
- **THEN** entire expression (lines 1-8) is formatted to maintain validity

### Requirement: Apply consistent indentation to nested structures

The formatter SHALL indent nested ECL structures according to configured indentation settings.

#### Scenario: Indent refinement attributes

- **WHEN** formatting expression with refinement like `< 404684003 : 363698007 = < 39057004`
- **THEN** refinement attribute is indented on new line with one indent level

#### Scenario: Indent nested parenthesized expressions

- **WHEN** formatting expression with parentheses like `< 19829001 AND (< 301867009 OR < 195967001)`
- **THEN** content within parentheses is indented if broken across lines

#### Scenario: Indent multiple refinement attributes

- **WHEN** formatting expression with multiple attributes in refinement
- **THEN** each attribute is on separate line with consistent indentation

### Requirement: Apply consistent spacing around operators

The formatter SHALL apply spacing around operators according to ECL conventions.

#### Scenario: Single space around logical operators

- **WHEN** formatting expression with AND, OR, or MINUS operators
- **THEN** exactly one space appears before and after each logical operator

#### Scenario: No space after constraint operators

- **WHEN** formatting expression with <, <<, >, or >> operators
- **THEN** no space appears between operator and following concept ID

#### Scenario: Space after constraint operator before parenthesis

- **WHEN** formatting expression like `< (< 404684003)`
- **THEN** space appears between constraint operator and opening parenthesis

#### Scenario: Single space around refinement operators

- **WHEN** formatting expression with : or = operators in refinements
- **THEN** exactly one space appears before and after each refinement operator

### Requirement: Break long expressions across multiple lines

The formatter SHALL break long ECL expressions across lines for readability when they exceed configured max line length.

#### Scenario: Break compound expression at logical operators

- **WHEN** formatting expression exceeding max line length with multiple AND/OR operators
- **THEN** expression breaks at logical operators with proper indentation

#### Scenario: Keep short expressions on single line

- **WHEN** formatting expression under max line length
- **THEN** expression remains on single line

#### Scenario: Break refinement with multiple attributes

- **WHEN** formatting expression with multiple refinement attributes
- **THEN** each attribute appears on separate line regardless of total length

### Requirement: Normalize whitespace in concept terms

The formatter SHALL normalize whitespace within concept term delimiters while preserving meaningful spaces.

#### Scenario: Ensure single space between pipes and term text

- **WHEN** formatting term like `|Clinical finding|` or `|  Clinical finding  |`
- **THEN** formatted output is `| Clinical finding |` with exactly one space on each side

#### Scenario: Preserve internal spaces in terms

- **WHEN** formatting term like `| Clinical   finding |` with multiple spaces between words
- **THEN** internal spacing is preserved: `| Clinical   finding |`

#### Scenario: Remove newlines and tabs from terms

- **WHEN** formatting term containing newlines or tabs like `|Clinical\nfinding|` or `|Clinical\tfinding|`
- **THEN** newlines and tabs are replaced with single space: `| Clinical finding |`

#### Scenario: Handle empty terms

- **WHEN** formatting term like `||` or `|  |`
- **THEN** formatted output is `| |` with single space

### Requirement: Preserve expression delimiters in multi-expression files

The formatter SHALL preserve `/* ECL-END */` delimiters when formatting files with multiple expressions.

#### Scenario: Format multiple expressions independently

- **WHEN** formatting file with two expressions separated by `/* ECL-END */`
- **THEN** each expression is formatted independently with delimiter preserved between them

#### Scenario: Maintain blank line spacing around delimiters

- **WHEN** formatting multi-expression file
- **THEN** one blank line appears before and after each `/* ECL-END */` delimiter

#### Scenario: Format file with only delimiters

- **WHEN** formatting file containing only `/* ECL-END */` delimiters with no expressions
- **THEN** delimiters are preserved without modification

### Requirement: Preserve comments during formatting

The formatter SHALL preserve block comments in their original positions relative to ECL expressions.

#### Scenario: Preserve comment before expression

- **WHEN** formatting file with comment `/* Query for lung disorders */` followed by ECL expression
- **THEN** comment remains before expression with original spacing

#### Scenario: Preserve comment after expression

- **WHEN** formatting expression with trailing comment like `< 404684003 /* Clinical finding */`
- **THEN** comment remains after expression on same line if space permits

#### Scenario: Preserve comment between expressions

- **WHEN** formatting multi-expression file with comments between expressions
- **THEN** comments remain in original positions relative to expressions

### Requirement: Handle formatting errors gracefully

The formatter SHALL handle invalid input gracefully without crashing or corrupting content.

#### Scenario: Return original content for unparseable expressions

- **WHEN** formatting document with syntax errors that prevent parsing
- **THEN** original content is returned unmodified

#### Scenario: Log formatting errors appropriately

- **WHEN** formatting fails due to unexpected error
- **THEN** error is logged with context but does not crash language server

#### Scenario: Timeout on extremely large documents

- **WHEN** formatting takes longer than 5 seconds
- **THEN** formatting is aborted and original content is returned
