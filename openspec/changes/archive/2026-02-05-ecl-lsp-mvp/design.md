## Context

SNOMED CT Expression Constraint Language (ECL) is a formal syntax for defining constraints on SNOMED CT concepts. Currently, developers write ECL queries without IDE support, leading to syntax errors and slow development cycles.

This design establishes the architecture for an MVP Language Server Protocol implementation that provides basic language support for ECL. The LSP will run as a separate process and communicate with editors (initially VSCode) via the Language Server Protocol.

**Current State**: No existing tooling for ECL development assistance.

**Constraints**:

- MVP scope: focus on core features (parsing, diagnostics, completion, hover, concept lookups)
- FHIR terminology integration with graceful degradation (LSP works even if server unavailable)
- VSCode client for MVP, but LSP server architecture must remain editor-agnostic to support future IntelliJ integration

## Goals / Non-Goals

**Goals:**

- Parse ECL syntax and build an internal representation (AST or similar)
- Provide real-time syntax error diagnostics as users type
- **Detect and boldly warn about inactive concepts** - critical validation that prevents subtle execution failures
- Offer intelligent completion for ECL operators and keywords
- Display operator documentation and live concept information on hover
- **Provide syntax highlighting** via TextMate grammar for operators, concept IDs, terms
- **Integrate FHIR terminology server** for real-time concept lookups with caching and graceful degradation
- **Optimize LSP responses for AI agents and LLM-based coding assistants** (rich examples, structured output, clear patterns, real concept data)
- Include basic VSCode client extension to launch and connect to the LSP server
- Establish extensible architecture for future enhancements (including IntelliJ integration)
- Include test harness with example ECL files and mock terminology service

**Non-Goals:**

- Advanced semantic validation (e.g., validating refinement attributes are appropriate for concept types, checking relationship cardinality)
- Concept existence validation (checking if concept IDs exist - only inactive status is checked)
- Concept search/autocomplete (only hover lookups for now)
- Semantic highlighting (LSP-based context-aware coloring - defer to post-MVP)
- Code formatting/pretty printing (defer to post-MVP)
- Advanced refactoring capabilities
- Performance optimization for large files (defer until needed)
- Support for ECL extensions or vendor-specific syntax
- Publishing to VSCode marketplace or other extension stores
- Advanced extension features (custom views, commands, configuration panels, webviews)
- Multi-editor support beyond VSCode (IntelliJ integration deferred to post-MVP)
- ECL query evaluation/execution (only parsing and validation)

## Decisions

### 1. Language and Framework: TypeScript + vscode-languageserver

**Decision**: Implement the LSP server in TypeScript using the `vscode-languageserver` library.

**Rationale**:

- TypeScript provides strong typing and excellent tooling support
- `vscode-languageserver` is the canonical implementation, well-documented and maintained
- Cross-platform compatibility (Node.js runs everywhere)
- Large ecosystem of LSP examples and community support

**Alternatives Considered**:

- **Rust + tower-lsp**: Better performance but steeper learning curve, more complex async model, longer development time for MVP
- **Python + pygls**: Simpler but slower, less robust typing, fewer LSP examples

### 2. Parser Architecture: ANTLR4 with Official SNOMED Grammar

**Decision**: Use ANTLR4 parser generator with the official SNOMED ECL grammar from IHTSDO.

**Rationale**:

- SNOMED International publishes official ANTLR grammar: https://github.com/IHTSDO/snomed-expression-constraint-language
- ANTLR4 ensures spec conformance - we implement actual ECL, not our interpretation
- Official grammar is the canonical source of truth, maintained by SNOMED experts
- Repository includes test cases and example expressions we can reuse
- ANTLR4 has excellent TypeScript target support
- Mature error recovery and diagnostic capabilities
- Reduces hand-written parser code from ~500+ lines to using the official grammar
- Community can validate our implementation against the official spec
- Parser generation happens at build time, no runtime dependency

**Implementation**:

- Use official ECL grammar from https://github.com/IHTSDO/snomed-expression-constraint-language
- Target ECL 2.2 specification (latest version)
- ANTLR4 generates TypeScript parser, lexer, and visitor/listener patterns
- Visitor pattern for AST construction and transformation
- Configure error listeners for LSP-friendly diagnostics
- Reuse test cases from official repo for validation

**Alternatives Considered**:

- **Hand-written recursive descent**: More code to maintain, risk of divergence from spec, harder to verify correctness
- **Tree-sitter**: Excellent for incremental parsing but overkill for MVP, limited ECL grammar availability
- **PEG.js/Peggy**: Simpler but less powerful error recovery, smaller ecosystem
- **Chevrotain**: Pure TypeScript, no build step, but more verbose grammar definitions

### 3. Parser Output: Token Stream + AST-lite

**Decision**: Parser produces a token stream with position information and a simplified AST structure.

**Rationale**:

- Token stream enables precise diagnostics with line/column information
- Lightweight AST sufficient for MVP features (don't need full semantic tree yet)
- Can evolve to richer AST when semantic features are added
- Keeps memory footprint small

**Structure**:

```typescript
interface Token {
  type: TokenType;
  value: string;
  range: Range; // start/end position
}

interface ASTNode {
  type: NodeType;
  range: Range;
  children?: ASTNode[];
  // Feature-specific fields as needed
}
```

### 4. Modular Architecture

**Decision**: Organize code into distinct modules with clear separation of concerns.

**Modules**:

- `server/` - LSP server implementation
  - `parser/` - ANTLR-generated parser, AST definitions, visitor implementations
  - `diagnostics/` - Error detection and diagnostic generation
  - `completion/` - Completion provider logic
  - `hover/` - Hover provider logic (operators + concept lookups)
  - `terminology/` - FHIR terminology service implementation, mock service, caching
  - `grammar/` - ANTLR4 ECL 2.2 grammar files
- `client/` - Basic VSCode extension (launches server, establishes connection)
  - `syntaxes/` - TextMate grammar for syntax highlighting
- `test/` - Test harness and fixtures with mock terminology service
- `examples/` - Sample ECL 2.2 files

**Rationale**:

- Clear module boundaries make testing easier
- Future features can be added without touching existing code
- Terminology service interface can be swapped when real implementation is ready
- Easier for multiple contributors to work in parallel

### 5. FHIR Terminology Server Integration

**Decision**: Implement real FHIR terminology server integration in MVP using `CodeSystem/$lookup` with Ontoserver as default endpoint.

**Rationale**:

- Provides immediate value - hover on concept IDs shows real SNOMED CT data (FSN, PT)
- Better testing with actual terminology data vs mocks
- AI agents benefit from real concept context when learning ECL
- Ontoserver (tx.ontoserver.fhir.au/fhir) is public, no auth required for concept lookups
- FHIR provides vendor-neutral, standardized terminology access
- Validates integration approach early, no "stub to real" migration later
- Configurable endpoint supports custom FHIR servers

**Implementation**:

```typescript
interface ITerminologyService {
  // FHIR CodeSystem/$lookup - retrieve concept details by code
  getConceptInfo(conceptId: string): Promise<ConceptInfo | null>;

  // Future: FHIR ValueSet/$expand with filter parameter
  searchConcepts(query: string): Promise<ConceptInfo[]>;
}

// Production implementation
class FhirTerminologyService implements ITerminologyService {
  constructor(
    private baseUrl: string = 'https://tx.ontoserver.csiro.au/fhir',
    private cache: Map<string, ConceptInfo> = new Map(),
    private timeout: number = 2000,
    private userAgent: string = 'ecl-lsp/1.0.0',
  ) {}

  async getConceptInfo(conceptId: string): Promise<ConceptInfo | null> {
    // 1. Check cache first (aggressive caching)
    // 2. Fetch from FHIR with User-Agent header:
    //    GET {baseUrl}/CodeSystem/$lookup?system=http://snomed.info/sct&code={conceptId}
    //    Headers: { 'User-Agent': this.userAgent }
    // 3. Transform FHIR Parameters response to ConceptInfo
    // 4. Cache result
    // 5. Return null on error (graceful degradation)
  }
}

// Mock for unit tests
class MockTerminologyService implements ITerminologyService {
  private mockData = new Map([
    ['404684003', { id: '404684003', fsn: 'Clinical finding (finding)', pt: 'Clinical finding' }],
    ['64572001', { id: '64572001', fsn: 'Disease (disorder)', pt: 'Disease' }],
    // ... common concepts for offline testing
  ]);
}
```

**Graceful Degradation**:

- Network errors → hover shows no concept info, LSP continues working
- Timeout after 2s → return null, don't block editor
- Server unavailable → LSP provides operator docs, just no concept lookups
- Mock service available for offline development

**Caching Strategy**:

- Cache all concept lookups indefinitely (concepts rarely change)
- LRU eviction if cache grows too large (10,000 concepts)
- Clear cache on configuration change (endpoint URL change)

**Alternatives Considered**:

- **Stub only**: Less valuable MVP, no real concept data, migration work later
- **No terminology service**: Misses opportunity to help AI agents with real context
- **Local SNOMED CT database**: Complex setup, large file size, offline benefit not worth complexity

### 6. VSCode Client Extension: Minimal Wrapper

**Decision**: Include a basic VSCode extension that launches the LSP server and establishes the client-server connection.

**Rationale**:

- Enables testing and demonstration in a real editor environment
- VSCode's `vscode-languageclient` library makes client implementation straightforward
- Users can immediately use the LSP without manual configuration
- Standard practice for LSP projects (separate client and server packages)
- Editor-agnostic server architecture preserved for future IntelliJ integration

**Scope**:

- Extension activates when `.ecl` files are opened
- Spawns server process and creates LSP connection
- No custom UI, commands, or configuration panels in MVP
- No marketplace publishing

**Alternatives Considered**:

- **No client, documentation only**: Users would need to manually configure their LSP client, high barrier to entry
- **Generic LSP client**: Less reliable, inconsistent user experience

### 7. Syntax Highlighting: TextMate Grammar

**Decision**: Provide basic syntax highlighting via TextMate grammar in the VSCode client extension.

**Rationale**:

- Immediate visual feedback for ECL syntax (operators, concept IDs, terms)
- Standard practice for VSCode language extensions
- Fast, regex-based - works before LSP server starts
- Simple to implement (~30 minutes)
- Significantly improves developer experience
- AI agents benefit from color-coded examples in documentation

**Implementation**:
Create `client/syntaxes/ecl.tmLanguage.json` with token patterns:

```json
{
  "scopeName": "source.ecl",
  "patterns": [
    {
      "name": "keyword.operator.logical.ecl",
      "match": "\\b(AND|OR|MINUS|NOT)\\b"
    },
    {
      "name": "keyword.operator.constraint.ecl",
      "match": "(<<?|>>?)"
    },
    {
      "name": "keyword.operator.refinement.ecl",
      "match": "(:)"
    },
    {
      "name": "constant.numeric.sctid.ecl",
      "match": "\\b\\d{6,18}\\b"
    },
    {
      "name": "string.quoted.pipe.ecl",
      "match": "\\|[^|]*\\|"
    },
    {
      "name": "keyword.operator.wildcard.ecl",
      "match": "(\\*)"
    }
  ]
}
```

**Register in client extension** (`client/package.json`):

```json
{
  "contributes": {
    "languages": [
      {
        "id": "ecl",
        "extensions": [".ecl"],
        "aliases": ["ECL", "Expression Constraint Language"]
      }
    ],
    "grammars": [
      {
        "language": "ecl",
        "scopeName": "source.ecl",
        "path": "./syntaxes/ecl.tmLanguage.json"
      }
    ]
  }
}
```

**Scope**:

- Basic token-level coloring (operators, IDs, terms, parentheses)
- No semantic highlighting (e.g., inactive concepts in red - defer to post-MVP)

**Alternatives Considered**:

- **No syntax highlighting**: Poor developer experience, unprofessional
- **LSP semantic highlighting**: More complex, slower, overkill for MVP
- **Both TextMate + semantic**: Good future enhancement, but TextMate alone sufficient for MVP

### 8. AI-Agent Optimization: Example-Rich, Structured Responses

**Decision**: Design LSP responses (completion, hover, diagnostics) to be highly useful to AI agents and LLM-based coding assistants.

**Rationale**:

- AI coding assistants (Claude Code, GitHub Copilot, etc.) are increasingly used for writing specialized languages like ECL
- LLMs benefit from rich examples and structured patterns more than humans do
- Clear, unambiguous error messages help AI agents self-correct
- Well-formatted documentation enables AI to learn ECL syntax patterns
- This is a **core goal** - the LSP should be optimized for AI use

**AI-Friendly Design Principles**:

1. **Rich Examples in Every Response**
   - Completion items include concrete usage examples, not just operator names
   - Hover documentation shows 2-3 examples per operator
   - Error messages suggest corrections with example syntax

2. **Structured, Predictable Output**
   - Consistent Markdown formatting for all documentation
   - Code examples always wrapped in code blocks
   - Clear section headers in hover (Syntax, Description, Examples)

3. **Complete Context**
   - Don't assume prior knowledge - explain what each operator does
   - Provide full syntax patterns, not abbreviated hints
   - Include both simple and complex examples

4. **Actionable Diagnostics**
   - Error messages describe what's wrong AND what's expected
   - Suggest fixes with concrete examples: "Expected operand after AND. Example: < 19829001 AND < 301867009"
   - Include position information so AI can apply fixes

5. **Progressive Complexity**
   - Start with simple examples, then show advanced usage
   - Completion items ordered by common usage (< before <<)
   - Documentation shows operator combinations

**Example Completion Item** (AI-optimized):

````typescript
{
  label: "AND",
  kind: CompletionItemKind.Keyword,
  detail: "Logical AND - Intersection of two concept sets",
  documentation: {
    kind: MarkupKind.Markdown,
    value: `
## Syntax
\`\`\`ecl
<constraint1> AND <constraint2>
\`\`\`

## Description
The AND operator returns concepts that satisfy both constraints (intersection).

## Examples
Simple:
\`\`\`ecl
< 19829001 |Disorder of lung| AND < 301867009 |Edema|
\`\`\```

With refinement:
\`\`\`ecl
< 404684003 |Clinical finding| AND < 123037004 |Body structure|
\`\`\`
    `
  }
}
````

**Alternatives Considered**:

- **Minimal documentation**: Faster but doesn't help AI agents learn syntax
- **Human-focused brevity**: Traditional LSP approach, but AI agents need more context
- **Separate AI endpoint**: Would fragment the implementation

### 9. Inactive Concept Detection: Critical Semantic Validation

**Decision**: Include inactive concept detection as a high-priority warning in MVP diagnostics.

**Rationale**:

- Inactive concepts can cause ECL queries to return empty results
- Behavior varies by terminology server - some return nothing, others ignore inactive concepts
- Extremely subtle bug that's hard to debug without tooling
- High value for both human developers and AI agents
- Simple to implement with FHIR integration already in place
- Doesn't require complex semantic analysis, just concept status check

**Implementation**:

```typescript
// After parsing, extract all concept IDs from AST
const conceptIds = extractConceptIds(ast);

// Query FHIR for each concept (with caching)
for (const conceptId of conceptIds) {
  const info = await terminologyService.getConceptInfo(conceptId);
  if (info && !info.active) {
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      range: conceptId.range,
      message: `⚠️ Concept ${conceptId.value} is INACTIVE. This may cause unexpected results or empty result sets on some terminology servers.`,
      source: 'ecl-lsp',
    });
  }
}
```

**User Experience**:

- Bold warning icon in editor gutter
- Yellow/orange squiggle under inactive concept ID
- Prominent warning message with emoji (⚠️)
- AI agents see clear warning in diagnostic output

**Graceful Degradation**:

- If terminology server unavailable, skip inactive checks
- Syntax diagnostics still work
- No blocking behavior

**Alternatives Considered**:

- **Defer to post-MVP**: High-value feature, worth including now
- **Make it an error**: Too strict - sometimes inactive concepts are intentional (e.g., testing, historical analysis)
- **Check concept existence**: More expensive, less critical than inactive check

### 10. Diagnostic Strategy: Syntax + Inactive Concepts in MVP

**Decision**: MVP diagnostics include syntax errors (always) and inactive concept warnings (when FHIR available).

**Rationale**:

- Syntax errors can be detected without terminology service - always available
- Inactive concept warnings provide critical value with minimal complexity
- Other semantic validation (attribute appropriateness, cardinality) deferred
- Keeps MVP scope manageable while addressing most critical validation

**Examples of MVP Diagnostics**:

**Syntax Errors (Error severity):**

- Unclosed parentheses
- Invalid operator syntax
- Malformed refinements
- Unexpected tokens

**Semantic Warnings (Warning severity, requires FHIR):**

- Inactive concepts with bold warning message

## Risks / Trade-offs

**[Risk] Hand-written parser may miss edge cases** → Mitigation: Comprehensive test suite with valid/invalid ECL examples from SNOMED specification

**[Risk] Stub terminology service may not match real API** → Mitigation: Design interface aligned with FHIR Terminology Services standard (CodeSystem/$lookup, ValueSet/$expand), ensuring compatibility with any FHIR-compliant terminology server

**[Trade-off] TypeScript is slower than Rust** → Acceptable: Performance is not critical for MVP, ECL files are typically small, can optimize later if needed

**[Risk] LSP protocol versioning and compatibility** → Mitigation: Use stable LSP features (3.x), avoid experimental capabilities

**[Trade-off] No semantic validation in MVP** → Acceptable: Syntax checking provides immediate value, semantic features can be added incrementally

## Migration Plan

Not applicable - this is a new project with no existing users or systems to migrate.

## Decisions Summary

### Resolved Questions

1. **ECL version**: ECL 2.2 exclusively (latest version)

2. **Test coverage target**: >80% code coverage for parser and core features

3. **Example ECL files**: Use official examples from:
   - https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language
   - https://github.com/IHTSDO/snomed-expression-constraint-language/tree/main/examples

4. **FHIR endpoint configuration**:
   - Configurable endpoint URL
   - Default: `https://tx.ontoserver.csiro.au/fhir`
   - Always include User-Agent header to identify service
   - No authentication support in MVP (OAuth, API keys deferred)

5. **Syntax highlighting**: Basic TextMate grammar in VSCode client for operators, concept IDs, terms (semantic highlighting deferred)

6. **IntelliJ integration**: Deferred to post-MVP (VSCode only for now)

7. **Future roadmap**: Post-MVP features include:
   - IntelliJ client extension
   - FHIR authentication flows (OAuth, API keys)
   - Semantic highlighting (LSP-based context-aware coloring for inactive concepts, etc.)
   - Code formatting/pretty printing
   - Advanced semantic validation (attribute appropriateness, cardinality)
   - Concept search/autocomplete
   - ECL query evaluation
   - ECL formatting/refactoring
