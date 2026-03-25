## Context

The ECL Language Server currently provides parsing, validation, diagnostics, hover, and completion features. Users can write ECL expressions but have no way to automatically format them for consistency and readability.

**Current State:**

- Parser generates AST from ECL expressions (ANTLR4-based)
- Multi-line expressions supported with `/* ECL-END */` delimiters
- No formatting capabilities registered with LSP

**Constraints:**

- Must preserve semantic meaning of expressions (formatting cannot change behavior)
- Must respect `/* ECL-END */` delimiters when formatting multi-expression files
- Must work with existing parser infrastructure
- Should be fast enough for real-time formatting (< 100ms for typical expressions)

## Goals / Non-Goals

**Goals:**

- Implement LSP textDocument/formatting for whole-document formatting
- Support configurable formatting options (indentation, spacing, alignment)
- Format complex ECL expressions with nested refinements and compound operators
- Provide consistent, readable output following ECL best practices
- Support textDocument/rangeFormatting for selected regions

**Non-Goals:**

- Minification (compressing ECL to minimal form - not useful for readability-focused language)
- Automatic fixing of syntax errors (formatter assumes valid ECL)
- textDocument/onTypeFormatting (defer until user demand is clear)
- Custom formatting rules per-project (use single global configuration)

## Decisions

### Decision 1: AST-based formatting vs token-based formatting

**Choice:** AST-based formatting using the existing parser

**Rationale:**

- Already have ANTLR4 parser generating AST with full semantic structure
- AST provides context for intelligent formatting decisions (e.g., indent refinements differently than constraints)
- Token-based approach would require reimplementing structure detection

**Alternatives Considered:**

- **Token-stream formatting:** Process tokens without parsing. Rejected because it lacks semantic context and would require complex heuristics.
- **String manipulation with regex:** Simplest approach but brittle and error-prone. Cannot handle nested structures reliably.

### Decision 2: Formatting style defaults

**Choice:** Use these defaults:

- 2-space indentation for nested structures
- Single space around binary operators (AND, OR, MINUS)
- No space after constraint operators (<, <<, >, >>)
- Align refinement attributes vertically when multiple attributes exist
- Break complex expressions across lines when they exceed 80 characters

**Rationale:**

- Follows common formatting conventions from other query languages (SQL, GraphQL)
- 2-space indentation is LSP community standard and keeps nesting readable
- No space after constraint operators matches natural ECL reading (<404684003 not < 404684003)
- Vertical alignment improves readability of multi-attribute refinements

**Alternatives Considered:**

- **4-space indentation:** More common in some languages, but ECL expressions can nest deeply and this wastes horizontal space.
- **Space after constraint operators:** Would be consistent with logical operators, but looks unnatural in ECL.

### Decision 3: Configuration mechanism

**Choice:** Use LSP workspace configuration (workspace/configuration) with settings under `ecl.formatting.*` namespace

**Rationale:**

- Standard LSP approach for per-workspace settings
- Integrates with VS Code settings UI automatically
- Can be overridden per-workspace or globally

**Configuration options:**

```typescript
interface ECLFormattingOptions {
  indentSize: number; // Default: 2
  indentStyle: 'space' | 'tab'; // Default: 'space'
  spaceAroundOperators: boolean; // Default: true (for AND/OR/MINUS)
  maxLineLength: number; // Default: 80 (soft limit for line breaks)
  alignTerms: boolean; // Default: true (align | pipes in multi-attribute refinements)
}
```

**Alternatives Considered:**

- **.eclformat configuration file:** More flexible but adds complexity and non-standard approach for LSP.
- **EditorConfig integration:** Could work but limited to basic settings and less discoverable.

### Decision 4: Handling multi-expression files

**Choice:** Format each expression independently, preserve `/* ECL-END */` delimiters and their spacing

**Rationale:**

- Expressions separated by delimiters are independent units
- Preserving delimiters maintains expression boundaries
- Each expression gets formatted with consistent style

**Behavior:**

- Blank lines between expression and delimiter are preserved (1 blank line)
- Blank lines after delimiter before next expression are preserved (1 blank line)
- Comments before expressions are preserved with their original spacing

### Decision 5: Range formatting behavior

**Choice:** If selection spans partial expression, expand to format the complete expression containing the selection

**Rationale:**

- Partial expression formatting could create invalid ECL
- AST-based approach needs complete expression for context
- User expectation: selecting part of expression should format the whole expression

**Behavior:**

- Selection on line 3-5 of expression spanning lines 1-8 → formats lines 1-8
- Selection spanning multiple `/* ECL-END */` delimited expressions → formats all spanned expressions

### Decision 6: Formatter architecture

**Choice:** Create separate formatter module with visitor pattern over AST

**Structure:**

```
server/src/formatter/
  index.ts           // Public API: formatDocument(), formatRange()
  formatter.ts       // ECLFormatterVisitor class
  options.ts         // FormattingOptions interface and defaults
  rules.ts           // Formatting rules (spacing, indentation, line breaks)
```

**Rationale:**

- Visitor pattern matches existing ECLASTVisitor pattern
- Separates formatting logic from LSP server glue code
- Rules module allows easy adjustment of formatting behavior
- Clean public API for testing

**Alternatives Considered:**

- **Single formatter class:** Simpler but mixes concerns and harder to test.
- **Transform AST then serialize:** Would require modifying AST nodes, more complex than direct visiting.

## Risks / Trade-offs

### Risk: Formatting destroys comments in unexpected ways

**Impact:** Medium - users could lose important documentation

**Mitigation:**

- Preserve all block comments (`/* */`) in their original positions relative to expressions
- Preserve inline comments after expressions
- Test suite includes comment preservation scenarios
- Document comment handling behavior clearly

### Risk: Performance issues with very large files

**Impact:** Low - ECL files are typically small (< 1000 lines)

**Mitigation:**

- Benchmark formatter with 1000+ line files during development
- If needed, add timeout mechanism (abort formatting after 5 seconds)
- Range formatting provides escape hatch for large files (format incrementally)

### Risk: Formatting changes break semantic meaning

**Impact:** Critical - would be catastrophic bug

**Mitigation:**

- Test strategy: parse original, format, parse formatted, compare ASTs
- Extensive test suite with complex expressions
- Visual regression tests with before/after examples
- Beta testing period with real users before stable release

### Risk: Configuration options create inconsistent styles across teams

**Impact:** Medium - defeats purpose of formatter if everyone uses different settings

**Mitigation:**

- Provide strong, opinionated defaults that work for 90% of users
- Documentation recommends using defaults unless strong reason to customize
- Keep configuration options minimal (< 10 options)

### Trade-off: No automatic error fixing

**Benefit:** Formatter is simple and predictable
**Cost:** Users must fix syntax errors before formatting works

**Decision:** Accept this trade-off. Mixing validation and formatting creates complexity and unpredictability.

### Trade-off: Single formatting style (no presets like "compact" vs "expanded")

**Benefit:** Simpler implementation, fewer configuration decisions for users
**Cost:** Less flexibility for users with strong style preferences

**Decision:** Start with single style, add presets only if clear user demand emerges.

## Migration Plan

**Phase 1: Core formatting (MVP)**

1. Implement basic document formatting with default options
2. Register textDocument/formatting capability
3. Test with simple and complex expressions
4. No configuration yet (use hardcoded defaults)

**Phase 2: Configuration support**

1. Add workspace/configuration integration
2. Implement configuration options (indentSize, indentStyle, etc.)
3. Test configuration changes apply correctly
4. Document configuration in README

**Phase 3: Range formatting**

1. Implement textDocument/rangeFormatting
2. Add logic to expand selection to complete expressions
3. Test range selection and formatting
4. Update client capability registration

**Rollback Strategy:**

- Formatting is additive feature (no breaking changes)
- If critical bugs found, disable capability registration in server.ts
- Users can opt-out by removing formatting capability from client settings

**Deployment:**

- Feature can be deployed incrementally (Phase 1 → 2 → 3)
- Each phase is independently useful
- No database or schema migrations needed

## Resolved Questions

1. **Should we format terms (text between | pipes)?**
   - **Decision:** Yes, normalize whitespace while preserving meaningful spaces
   - Behavior:
     - Maintain exactly one space between pipes and term text: `| term |`
     - Preserve space characters within the term text itself
     - Remove newlines and tabs if present (replace with single space)
   - Example: `|  Clinical   finding\n|` → `| Clinical   finding |`

2. **Should formatter reorder refinement attributes (e.g., alphabetically)?**
   - **Decision:** Preserve order by default
   - Rationale: Attribute order may be semantically meaningful to users
   - **Future Enhancement:** Expression normalization feature for comparing expressions
     - Potential option to sort attributes alphabetically by name or by concept ID
     - Useful for diffing two versions of same expression
     - Could be separate feature or toggleable option
     - Defer until user demand is clear

3. **How should formatter handle very long concept terms (> 80 chars)?**
   - **Decision:** Allow exceeding max line length, do not wrap or break terms
   - Rationale: Breaking terms across lines is unnatural and harms readability
   - The 80-character limit is a soft guideline for expressions, not terms
