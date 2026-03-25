## Why

ECL expressions often become difficult to read when they grow in complexity, especially with nested refinements, compound logical operators, and long concept terms. Users need a standardized way to format their ECL expressions for readability and consistency across teams. LSP formatting support (textDocument/formatting) is a standard feature that users expect in modern language servers.

## What Changes

- Add LSP textDocument/formatting capability to the ECL Language Server
- Implement pretty printing that applies consistent indentation, spacing, and line breaks to ECL expressions
- Support configurable formatting options (indentation style, spaces around operators, term alignment)
- Add textDocument/rangeFormatting capability for formatting selected text regions
- Optionally support textDocument/onTypeFormatting for real-time formatting as users type

## Capabilities

### New Capabilities

- `formatting`: Format ECL expressions with consistent indentation, spacing, and line breaks following ECL best practices
- `formatting-options`: Configure formatting behavior (indentation level, spaces vs tabs, operator spacing, term alignment)

### Modified Capabilities

None - this is a new feature that doesn't modify existing capabilities.

## Impact

**Code:**

- New formatter module in server/src/formatter/ with formatting logic
- Registration of LSP formatting capabilities in server.ts
- New configuration options for formatting preferences
- Integration with existing parser for AST-based formatting

**Testing:**

- New test suite for formatting scenarios (compound expressions, refinements, nested structures)
- Tests for formatting options and configuration
- Tests for range formatting and document formatting

**Documentation:**

- README updates to document formatting feature and configuration options
- Examples of formatted ECL expressions
