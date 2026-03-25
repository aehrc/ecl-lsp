# ECL Platform Restructuring Design

**Date:** 2026-02-28
**Status:** Approved

## Problem

The ECL language server is production-ready (1500+ tests, full LSP feature set) but tightly coupled to a single-package monorepo structure. Clients embed server-specific types, the server mixes protocol concerns with core logic, and there's no path to non-LSP consumers (MCP servers, programmatic use).

## Goals

1. **ecl-core**: Extract a zero-dependency core library containing all ECL intelligence (parser, formatter, semantic validation, refactoring, terminology, knowledge)
2. **ecl-lsp-server**: Thin LSP adapter over ecl-core
3. **ecl-mcp-server**: MCP adapter over ecl-core with tools + ECL literacy resources for AI agents
4. **Self-contained IDE plugins**: VSCode, IntelliJ, Eclipse — each bundles the LSP server, zero-config install
5. **Claude Code plugin**: Bundled LSP server, zero npm-install needed
6. **Text editor guides**: Neovim, Sublime, Emacs — config-only, user installs server globally
7. **Shared ECL knowledge**: Reference documentation condensed from the [ECL specification](https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language) and [grammar repo examples](https://github.com/IHTSDO/snomed-expression-constraint-language), served as MCP resources for agent literacy and used by LSP for richer hover/completion docs

## Decisions

- **Monorepo** with independent versioning per package (publish only what changed)
- **ecl-core extracted** as a separate package with zero LSP/MCP dependencies
- **Existing OpenSpec proposals absorbed** into restructuring (not implemented standalone)
- **MCP server** provides both mechanical tools and ECL literacy resources
- **Knowledge module** in ecl-core serves both LSP (hover docs, completion context) and MCP (agent resources)

## Package Structure

```
ecl-lsp/
├── packages/
│   ├── ecl-core/                # Zero-dependency core library
│   │   ├── src/
│   │   │   ├── parser/          # ANTLR4 parser, AST, concept extraction
│   │   │   ├── formatter/       # Document/range formatting
│   │   │   ├── completion/      # Completion engine
│   │   │   ├── semantic/        # Semantic validation
│   │   │   ├── refactoring/     # Code action engines
│   │   │   ├── validation/      # Error refinement
│   │   │   ├── terminology/     # FHIR service, Verhoeff, types
│   │   │   ├── knowledge/       # ECL construct docs, patterns, explain logic
│   │   │   └── index.ts         # Public API surface
│   │   └── package.json         # "ecl-core"
│   │
│   ├── ecl-lsp-server/          # LSP adapter
│   │   ├── src/
│   │   │   ├── server.ts        # LSP connection + handlers
│   │   │   ├── code-lens.ts
│   │   │   └── semantic-tokens.ts
│   │   ├── bin/ecl-lsp-server.js
│   │   └── package.json         # depends: ecl-core, vscode-languageserver
│   │
│   └── ecl-mcp-server/          # MCP adapter
│       ├── src/server.ts        # MCP tools + resources
│       ├── bin/ecl-mcp-server.js
│       └── package.json         # depends: ecl-core, @modelcontextprotocol/sdk
│
├── clients/
│   ├── vscode/                  # VSCode extension (bundles ecl-lsp-server)
│   ├── intellij/                # IntelliJ plugin (bundles ecl-lsp-server)
│   ├── eclipse/                 # Eclipse plugin (bundles ecl-lsp-server)
│   ├── claude-code/             # Claude Code LSP plugin (bundles ecl-lsp-server)
│   ├── neovim/                  # Config guide (README)
│   ├── sublime/                 # Config guide (README)
│   └── emacs/                   # Config guide (README)
│
├── shared/syntaxes/             # TextMate grammar (source of truth)
├── grammar/                     # ANTLR4 ECL.g4
└── package.json                 # Workspace root
```

## ecl-core Boundary

**Moves into ecl-core** (from current `server/src/`):

- `parser/` — parseECL, AST types, concept extraction, expression grouper, refinement check
- `formatter/` — formatDocument, range formatting, rules, config validation
- `completion/` — context detection, completion item generation, filter cache
- `semantic/` — semantic validation, ECL text extraction
- `refactoring/` — all 8 refactoring engines
- `validation/` — error refinement (ANTLR → user-friendly messages)
- `terminology/` — FHIR service, Verhoeff validation, types/interfaces

**New in ecl-core:**

- `knowledge/` — ECL reference documentation condensed from the official spec and grammar repo examples. Serves as structured content for MCP resources (agent literacy) and LSP enrichment (hover docs, completion context). The LLM does the reasoning — this module provides the reference material, not NLP logic.

**Key constraint:** ecl-core must not import from `vscode-languageserver`. Current refactoring modules import `CodeAction`, `TextEdit`, etc. These become core-native types (simple interfaces for text edits and action metadata) that the LSP server maps to protocol types.

**Stays in ecl-lsp-server:**

- LSP connection setup, handler registration
- Mapping ecl-core results → LSP types (Diagnostic, CompletionItem, CodeAction, etc.)
- Code Lens builder, semantic tokens
- Custom requests (ecl/evaluateExpression, ecl/getSnomedEditions, ecl/searchConcept)
- executeCommandProvider (for IntelliJ Code Lens support)

## MCP Server Design

### Configuration model

**Hybrid: static defaults + per-call overrides.**

The MCP server is configured with default FHIR server URL, timeout, and SNOMED edition (via env vars or config file at setup time). Every tool call accepts optional `fhirServer` and `snomedVersion` parameters to override defaults for that call. This lets agents switch editions mid-conversation ("now check against the international edition") without reconfiguration.

ecl-core's terminology service supports per-call overrides — either via parameter on each operation or by cheaply creating service instances per unique config combination.

### Tools (mechanical operations)

All tools accept optional `fhirServer` and `snomedVersion` parameters to override defaults.

| Tool                 | Input                | Output                         | Core module                    |
| -------------------- | -------------------- | ------------------------------ | ------------------------------ |
| validate_ecl         | ECL string           | Errors/warnings                | parser, validation, semantic   |
| evaluate_ecl         | ECL string           | Matching concepts              | terminology ($expand)          |
| lookup_concept       | SCTID                | Concept info (FSN, PT, active) | terminology ($lookup)          |
| search_concepts      | Search term          | Matching concepts              | terminology (search)           |
| format_ecl           | ECL string + options | Formatted ECL                  | formatter                      |
| list_snomed_editions | (none)               | Available editions + versions  | terminology (CodeSystem query) |

Note: `explain_ecl` and `suggest_ecl_pattern` were removed as dedicated tools. These are LLM reasoning tasks — the agent uses the ECL literacy resources (below) as context and does the explaining/suggesting itself. The MCP server provides the reference material, not NLP logic.

### Resources (ECL literacy)

| Resource URI                    | Content                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| ecl://guide/operators           | Constraint operators — meanings, examples, when to use     |
| ecl://guide/refinements         | Attribute refinements — purpose, syntax, common attributes |
| ecl://guide/filters             | Description/concept/member filters                         |
| ecl://guide/history-supplements | Profiles and usage                                         |
| ecl://guide/patterns            | Common ECL patterns for typical tasks                      |
| ecl://reference/grammar         | ECL 2.2 grammar summary                                    |

### Agent workflow example

An agent with an AMT skill + this MCP server:

1. User asks: "What trade product packs contain paracetamol?"
2. Agent reads `ecl://guide/refinements` and `ecl://guide/patterns` to understand ECL syntax
3. Agent uses `search_concepts` to find paracetamol SCTID
4. Agent writes ECL using its understanding of the AMT model and ECL syntax
5. Agent uses `validate_ecl` to check syntax
6. Agent uses `evaluate_ecl` to get results
7. Agent reviews results and refines the expression if needed

## Client Packaging

| Client      | Bundles server?     | Distribution          | Configuration            |
| ----------- | ------------------- | --------------------- | ------------------------ |
| VSCode      | Yes (in VSIX)       | VS Marketplace        | Extension settings UI    |
| IntelliJ    | Yes (in plugin ZIP) | JetBrains Marketplace | Settings UI (Kotlin DSL) |
| Eclipse     | Yes (in plugin)     | Eclipse Marketplace   | Preferences page         |
| Claude Code | Yes (in plugin dir) | Claude Code plugins   | Plugin config file       |
| Neovim      | No                  | README guide          | LSP client config        |
| Sublime     | No                  | README guide          | LSP client config        |
| Emacs       | No                  | README guide          | LSP client config        |

All IDE plugins are self-contained (no npm install required). Text editor users install `ecl-lsp-server` globally via npm.

All clients expose configuration for: FHIR server URL, timeout, SNOMED edition/version, formatting preferences, semantic validation toggle.

## Implementation Order

1. **Extract ecl-core** — move modules, create core-native types, all tests pass
2. **Slim ecl-lsp-server** — thin adapter, semantic safety fixes, executeCommand
3. **Fix VSCode client** — grammar path, activation, command race, VSIX packaging
4. **Fix IntelliJ client** — bundle server, executeCommand support, dead file cleanup
5. **Build MCP server** — tools + resources over ecl-core
6. **Build Eclipse client** — LSP4E plugin with bundled server
7. **Build Claude Code plugin** — marketplace descriptor with bundled server
8. **Add knowledge module** — ECL literacy content, explain-expression, pattern guides

Steps 1-2 are the foundation (must be sequential). Steps 3-7 can be parallelized. Step 8 enriches all deliverables retroactively.
