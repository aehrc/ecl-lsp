# ECL Language Support — VSCode

VSCode extension providing full IDE support for SNOMED CT Expression Constraint Language (ECL) 2.2.

## Prerequisites

- VSCode 1.75+
- Node.js 18+ (for building from source)

## Install

### From VSIX

1. Download the latest `ecl-lsp-client-x.x.x.vsix` from Releases
2. In VSCode: **Extensions** > `...` menu > **Install from VSIX...**
3. Select the `.vsix` file and reload

### From Source

```bash
git clone <repo-url> && cd ecl-lsp
npm install && npm run compile
cd clients/vscode && npm run build:vsix
```

Then install the generated `.vsix` file.

### Development

1. Open the repo root in VSCode
2. Press **F5** to launch the Extension Development Host
3. Open any `.ecl` file

## Features

- **Syntax Highlighting** — TextMate grammar for ECL expressions
- **Diagnostics** — syntax errors, inactive/unknown concept warnings, semantic validation
- **Completion** — operators, keywords, SNOMED CT concept search, filter values, 18 snippets
- **Hover** — operator documentation, concept information (FSN, PT, active status)
- **Code Actions** — 8 refactoring actions (strip/add display terms, simplify, parentheses, history supplement, description filter)
- **Formatting** — document and range formatting with 9 configurable options
- **Code Lens** — "Evaluate" lens above each expression with inline result count
- **Semantic Highlighting** — token-level highlighting from the LSP server
- **SNOMED CT Edition** — status bar selector for edition/version switching

## Commands

| Command                         | Description                                                      |
| ------------------------------- | ---------------------------------------------------------------- |
| `ECL: Search for Concept`       | Search SNOMED CT concepts via FHIR and insert into editor        |
| `ECL: Evaluate Expression`      | Evaluate the ECL expression at cursor against terminology server |
| `ECL: Select SNOMED CT Edition` | Choose SNOMED CT edition and version via QuickPick               |

## Settings

All settings are under the `ecl.*` namespace in VSCode settings.

### Terminology

| Setting                         | Default                               | Description                   |
| ------------------------------- | ------------------------------------- | ----------------------------- |
| `ecl.terminology.serverUrl`     | `https://tx.ontoserver.csiro.au/fhir` | FHIR terminology server URL   |
| `ecl.terminology.timeout`       | `2000`                                | Concept lookup timeout (ms)   |
| `ecl.terminology.snomedVersion` | `""` (server default)                 | SNOMED CT edition/version URI |

### Validation

| Setting                          | Default | Description                |
| -------------------------------- | ------- | -------------------------- |
| `ecl.semanticValidation.enabled` | `true`  | Enable semantic validation |

### Evaluation

| Setting                      | Default | Description                                      |
| ---------------------------- | ------- | ------------------------------------------------ |
| `ecl.evaluation.resultLimit` | `200`   | Max concepts returned when evaluating (1–10,000) |

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

## Troubleshooting

Check the server output: **Output** panel > select **ECL Language Server** from the dropdown.

## License

Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO) ABN 41 687 119 230

Apache License 2.0 — see [LICENSE](../../LICENSE).
