## 1. Setup formatter module structure

- [x] 1.1 Create server/src/formatter/ directory
- [x] 1.2 Create server/src/formatter/index.ts with public API exports
- [x] 1.3 Create server/src/formatter/options.ts with FormattingOptions interface
- [x] 1.4 Define default formatting options (indentSize=2, indentStyle="space", spaceAroundOperators=true, maxLineLength=80, alignTerms=true)
- [x] 1.5 Create server/src/formatter/rules.ts for formatting rule functions
- [x] 1.6 Create server/src/formatter/formatter.ts for ECLFormatterVisitor class

## 2. Implement AST visitor for formatting

- [x] 2.1 Create ECLFormatterVisitor class extending AbstractParseTreeVisitor
- [x] 2.2 Implement visitExpressionConstraint to handle top-level expressions
- [x] 2.3 Implement visitCompoundExpressionConstraint for AND/OR/MINUS operators
- [x] 2.4 Implement visitRefinedExpressionConstraint for refinements
- [x] 2.5 Implement visitSubExpressionConstraint for constraint operators (<, <<, >, >>)
- [x] 2.6 Implement visitEclConceptReference for concept IDs and terms
- [x] 2.7 Implement visitEclRefinement for refinement blocks
- [x] 2.8 Implement visitEclAttributeSet for multiple attributes
- [x] 2.9 Implement visitEclAttribute for individual attributes

## 3. Implement formatting rules

- [x] 3.1 Implement rule for spacing around logical operators (AND, OR, MINUS)
- [x] 3.2 Implement rule for no space after constraint operators (<, <<, >, >>)
- [x] 3.3 Implement rule for spacing around refinement operators (: and =)
- [x] 3.4 Implement rule for indentation of nested structures
- [x] 3.5 Implement rule for line breaking at max line length
- [x] 3.6 Implement rule for term whitespace normalization (one space each side, preserve internal spaces, remove newlines/tabs)
- [x] 3.7 Implement rule for vertical term alignment in multi-attribute refinements

## 4. Implement multi-expression file handling

- [x] 4.1 Create function to split document by /_ ECL-END _/ delimiters
- [x] 4.2 Implement logic to format each expression independently
- [x] 4.3 Preserve /_ ECL-END _/ delimiters in output
- [x] 4.4 Maintain one blank line before and after each delimiter
- [x] 4.5 Handle files with no delimiters (single expression)

## 5. Implement comment preservation

- [x] 5.1 Identify block comments (/\* \*/) in input document
- [x] 5.2 Track comment positions relative to expressions
- [x] 5.3 Preserve comments before expressions with original spacing
- [x] 5.4 Preserve inline comments after expressions on same line if space permits
- [x] 5.5 Preserve comments between expressions in multi-expression files

## 6. Implement core formatting API (Phase 1 MVP)

- [x] 6.1 Implement formatDocument(text: string, options: FormattingOptions): string function
- [x] 6.2 Add error handling for parse errors (return original text on failure)
- [x] 6.3 Add timeout mechanism (abort after 5 seconds, return original text)
- [x] 6.4 Implement semantic preservation validation (parse original, format, parse formatted, compare ASTs)
- [x] 6.5 Export formatDocument from formatter/index.ts

## 7. Register LSP formatting capability (Phase 1 MVP)

- [x] 7.1 Add documentFormattingProvider to server capabilities in server.ts
- [x] 7.2 Implement onDocumentFormatting handler in server.ts
- [x] 7.3 Call formatDocument with hardcoded default options
- [x] 7.4 Return formatted text as TextEdit array replacing entire document
- [x] 7.5 Test formatting with simple expressions via LSP client

## 8. Add basic formatter tests

- [x] 8.1 Create server/src/test/formatter.test.ts
- [x] 8.2 Test formatting simple constraint expressions
- [x] 8.3 Test formatting compound expressions with AND/OR/MINUS
- [x] 8.4 Test formatting refinement expressions with indentation
- [x] 8.5 Test formatting nested parenthesized expressions
- [x] 8.6 Test term whitespace normalization
- [ ] 8.7 Test semantic preservation (AST comparison before/after)
- [x] 8.8 Test comment preservation scenarios
- [x] 8.9 Test multi-expression file handling with /_ ECL-END _/
- [x] 8.10 Test error handling (unparseable input returns original)

## 9. Implement workspace configuration support (Phase 2)

- [x] 9.1 Define ecl.formatting configuration schema in package.json (client)
- [x] 9.2 Implement getFormattingOptions() function to read workspace/configuration
- [x] 9.3 Add configuration validation with type checking
- [x] 9.4 Add fallback to defaults for invalid configuration values
- [x] 9.5 Log warnings for invalid configuration values

## 10. Implement configurable indentation

- [x] 10.1 Update formatter to respect indentSize option
- [x] 10.2 Update formatter to respect indentStyle option (space vs tab)
- [x] 10.3 Test formatting with indentSize=2 (default)
- [x] 10.4 Test formatting with indentSize=4
- [x] 10.5 Test formatting with indentStyle="tab"
- [x] 10.6 Test rejection of invalid indentSize values
- [x] 10.7 Test rejection of invalid indentStyle values

## 11. Implement configurable operator spacing

- [x] 11.1 Update formatter to respect spaceAroundOperators option
- [x] 11.2 Test formatting with spaceAroundOperators=true (default)
- [x] 11.3 Test formatting with spaceAroundOperators=false
- [x] 11.4 Verify constraint operators are unaffected by this option

## 12. Implement configurable line length

- [x] 12.1 Update formatter to respect maxLineLength option
- [x] 12.2 Implement line breaking logic at logical operators when exceeding max length
- [x] 12.3 Test formatting with maxLineLength=80 (default)
- [x] 12.4 Test formatting with maxLineLength=120
- [x] 12.5 Test formatting with maxLineLength=0 (unlimited)
- [x] 12.6 Verify long terms can exceed max length without breaking
- [x] 12.7 Test rejection of negative maxLineLength values

## 13. Implement configurable term alignment

- [x] 13.1 Update formatter to respect alignTerms option
- [x] 13.2 Implement vertical alignment of pipe characters in multi-attribute refinements
- [x] 13.3 Test formatting with alignTerms=true (default)
- [x] 13.4 Test formatting with alignTerms=false
- [x] 13.5 Verify single-attribute refinements are unaffected by alignment option

## 14. Update configuration in onDocumentFormatting handler

- [x] 14.1 Modify onDocumentFormatting to call getFormattingOptions() before formatting
- [x] 14.2 Pass configuration options to formatDocument function
- [x] 14.3 Test configuration changes apply without server restart
- [x] 14.4 Test partial configuration uses defaults for missing values

## 15. Implement range formatting (Phase 3)

- [x] 15.1 Add documentRangeFormattingProvider to server capabilities
- [x] 15.2 Implement onDocumentRangeFormatting handler in server.ts
- [x] 15.3 Create function to expand selection to complete expression boundaries
- [x] 15.4 Identify which expressions are touched by selection range
- [x] 15.5 Format only the touched expressions
- [x] 15.6 Return TextEdit array for only the affected range

## 16. Add range formatting tests

- [x] 16.1 Test range formatting within single expression
- [x] 16.2 Test range formatting spanning multiple expressions
- [x] 16.3 Test range formatting with partial expression selection (expands to complete)
- [x] 16.4 Test range formatting at document start
- [x] 16.5 Test range formatting at document end

## 17. Add integration tests

- [ ] 17.1 Create test file with complex ECL expressions for visual validation
- [ ] 17.2 Test formatting preserves semantic meaning on all test expressions
- [ ] 17.3 Test performance with large files (1000+ lines)
- [ ] 17.4 Verify formatting completes in < 100ms for typical expressions
- [ ] 17.5 Create before/after examples for documentation

## 18. Update documentation

- [ ] 18.1 Add Formatting section to README.md
- [ ] 18.2 Document textDocument/formatting capability
- [ ] 18.3 Document textDocument/rangeFormatting capability
- [ ] 18.4 Document all configuration options with defaults
- [ ] 18.5 Add examples of formatted ECL expressions
- [ ] 18.6 Document comment preservation behavior
- [ ] 18.7 Document multi-expression file handling
- [ ] 18.8 Add troubleshooting section for common formatting issues

## 19. Final testing and polish

- [ ] 19.1 Run full test suite and verify all 114+ tests pass
- [ ] 19.2 Test formatting with VS Code client end-to-end
- [ ] 19.3 Test formatting with various ECL expressions from examples/
- [ ] 19.4 Test configuration changes via VS Code settings UI
- [ ] 19.5 Fix any bugs discovered during testing
- [ ] 19.6 Verify no performance regressions
