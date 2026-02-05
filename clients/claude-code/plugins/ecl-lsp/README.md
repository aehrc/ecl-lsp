# ecl-lsp

SNOMED CT Expression Constraint Language (ECL) language server for Claude Code, providing code intelligence for `.ecl` files.

## Features

- Real-time syntax error diagnostics
- Inactive/unknown concept warnings via FHIR terminology server
- Context-aware completions (operators, concepts, filters, refinements, snippets)
- Hover documentation for operators and SNOMED CT concepts
- Document and range formatting with 9 configuration options
- Code actions (add/strip display terms, simplify, parentheses, history supplements)
- Code Lens for expression evaluation
- Semantic validation (attribute scope, value constraints)

## Supported Extensions

`.ecl`

## Installation

Install the ECL language server globally via npm:

```bash
npm install -g ecl-lsp-server
```

Or link from a local build of this repository:

```bash
cd packages/ecl-lsp-server
npm link
```

After installation, `ecl-lsp-server` must be available in your PATH.

## Configuration

The server reads configuration via `workspace/didChangeConfiguration` under the `ecl` section. Default settings are provided by the plugin:

### Terminology

| Setting                         | Default                               | Description                                            |
| ------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| `ecl.terminology.serverUrl`     | `https://tx.ontoserver.csiro.au/fhir` | FHIR terminology server base URL                       |
| `ecl.terminology.timeout`       | `2000`                                | Concept lookup timeout in milliseconds (500-30000)     |
| `ecl.terminology.snomedVersion` | `""`                                  | SNOMED CT edition/version URI (empty = server default) |

### Formatting

| Setting                                 | Default   | Description                                     |
| --------------------------------------- | --------- | ----------------------------------------------- |
| `ecl.formatting.indentSize`             | `2`       | Spaces per indent level (1-8)                   |
| `ecl.formatting.indentStyle`            | `"space"` | `"space"` or `"tab"`                            |
| `ecl.formatting.spaceAroundOperators`   | `true`    | Spaces around AND/OR/MINUS                      |
| `ecl.formatting.maxLineLength`          | `80`      | Max line length before breaking (0 = unlimited) |
| `ecl.formatting.alignTerms`             | `true`    | Align term pipes vertically                     |
| `ecl.formatting.wrapComments`           | `false`   | Wrap comments exceeding max line length         |
| `ecl.formatting.breakOnOperators`       | `false`   | New line before every AND/OR/MINUS              |
| `ecl.formatting.breakOnRefinementComma` | `false`   | New line after refinement commas                |
| `ecl.formatting.breakAfterColon`        | `false`   | New line after refinement colon                 |

### Evaluation

| Setting                      | Default | Description                                         |
| ---------------------------- | ------- | --------------------------------------------------- |
| `ecl.evaluation.resultLimit` | `200`   | Max concepts returned from ECL evaluation (1-10000) |

### Semantic Validation

| Setting                          | Default | Description                                       |
| -------------------------------- | ------- | ------------------------------------------------- |
| `ecl.semanticValidation.enabled` | `true`  | Enable semantic validation (requires FHIR server) |

## More Information

- [SNOMED ECL Specification](https://confluence.ihtsdotools.org/display/DOCECL)
- [ECL Grammar Repository](https://github.com/IHTSDO/snomed-expression-constraint-language)
- [FHIR Terminology Services](https://hl7.org/fhir/terminology-service.html)
