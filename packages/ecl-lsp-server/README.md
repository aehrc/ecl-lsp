# ecl-lsp-server

Language Server Protocol (LSP) server for SNOMED CT Expression Constraint Language (ECL) 2.2. Provides diagnostics, completion, hover, formatting, code actions, code lens, and semantic tokens.

Built on [ecl-core](../ecl-core/) — this package is a thin LSP adapter that maps core types to the LSP protocol.

## Install

```bash
npm install -g ecl-lsp-server
```

## Usage

```bash
ecl-lsp-server --stdio
```

The server communicates over stdio using the LSP protocol. Connect it to any LSP-capable editor.

## LSP Capabilities

| Capability                          | Description                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `textDocument/diagnostics`          | Syntax errors, inactive/unknown concept warnings, semantic validation                |
| `textDocument/completion`           | Context-aware operators, keywords, filter values, SNOMED CT concept search, snippets |
| `textDocument/hover`                | Operator documentation, concept information (FSN, PT, active status)                 |
| `textDocument/formatting`           | Document formatting with 9 configurable options                                      |
| `textDocument/rangeFormatting`      | Format a selection                                                                   |
| `textDocument/codeAction`           | 8 refactoring actions (strip/add terms, simplify, parentheses, history, filter)      |
| `textDocument/codeLens`             | "Evaluate" lens above each expression with inline result count                       |
| `textDocument/semanticTokens`       | Token-level highlighting                                                             |
| Custom: `ecl/searchConcept`         | SNOMED CT concept search via FHIR                                                    |
| Custom: `ecl/getSnomedEditions`     | List available SNOMED CT editions                                                    |
| Custom: `ecl/resolvedSnomedVersion` | Notification when SNOMED version is resolved                                         |

## Configuration

The server reads settings from `workspace/configuration` requests under the `ecl` namespace.

### Terminology

| Setting                         | Default                               | Description                   |
| ------------------------------- | ------------------------------------- | ----------------------------- |
| `ecl.terminology.serverUrl`     | `https://tx.ontoserver.csiro.au/fhir` | FHIR terminology server URL   |
| `ecl.terminology.timeout`       | `2000`                                | Concept lookup timeout (ms)   |
| `ecl.terminology.snomedVersion` | `""` (server default)                 | SNOMED CT edition/version URI |

### Semantic Validation

| Setting                          | Default | Description                                                                            |
| -------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `ecl.semanticValidation.enabled` | `true`  | Enable semantic validation (attribute scope, value constraints, empty sub-expressions) |

### Evaluation

| Setting                      | Default | Description                                                    |
| ---------------------------- | ------- | -------------------------------------------------------------- |
| `ecl.evaluation.resultLimit` | `200`   | Max concepts returned when evaluating an expression (1–10,000) |

### Formatting

| Setting                                 | Default | Description                                 |
| --------------------------------------- | ------- | ------------------------------------------- |
| `ecl.formatting.indentSize`             | `2`     | Spaces per indent level (1–8)               |
| `ecl.formatting.indentStyle`            | `space` | `space` or `tab`                            |
| `ecl.formatting.spaceAroundOperators`   | `true`  | Spaces around AND/OR/MINUS                  |
| `ecl.formatting.maxLineLength`          | `80`    | Line length before breaking (0 = unlimited) |
| `ecl.formatting.alignTerms`             | `true`  | Vertically align term pipes                 |
| `ecl.formatting.wrapComments`           | `false` | Wrap long line comments                     |
| `ecl.formatting.breakOnOperators`       | `false` | Newline before AND/OR/MINUS                 |
| `ecl.formatting.breakOnRefinementComma` | `false` | Newline after refinement commas             |
| `ecl.formatting.breakAfterColon`        | `false` | Newline after refinement colon              |

## IDE Clients

| Editor        | Link                                              |
| ------------- | ------------------------------------------------- |
| VSCode        | [clients/vscode](../../clients/vscode/)           |
| IntelliJ IDEA | [clients/intellij](../../clients/intellij/)       |
| Eclipse       | [clients/eclipse](../../clients/eclipse/)         |
| Neovim        | [clients/neovim](../../clients/neovim/)           |
| Sublime Text  | [clients/sublime](../../clients/sublime/)         |
| Emacs         | [clients/emacs](../../clients/emacs/)             |
| Claude Code   | [clients/claude-code](../../clients/claude-code/) |

## License

Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO) ABN 41 687 119 230

Apache License 2.0 — see [LICENSE](../../LICENSE).
