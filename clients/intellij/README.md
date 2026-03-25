# ECL Language Server — IntelliJ IDEA

## Prerequisites

- IntelliJ IDEA Ultimate 2024.2+
- Node.js 18+

## Install the server

```bash
npm install -g ecl-lsp-server
```

Or build from source:

```bash
git clone <repo-url> && cd ecl-lsp
npm install && npm run compile
npm link -w packages/ecl-lsp-server
```

## Install the plugin

1. Download the latest `ecl-lsp-intellij-x.x.x.zip` from Releases
2. In IntelliJ: **Settings** > **Plugins** > gear icon > **Install Plugin from Disk...**
3. Select the `.zip` file and restart

## Features

- **Syntax Highlighting** — TextMate grammar for ECL expressions
- **Diagnostics** — syntax errors, inactive/unknown concept warnings, semantic validation
- **Completion** — operators, keywords, SNOMED CT concept search, filter values
- **Hover** — operator documentation, concept information (FSN, PT, active status)
- **Code Actions** — refactoring (strip/add display terms, simplify, add parentheses, history supplement, description filter)
- **Formatting** — document formatting with configurable options
- **Code Lens** — expression evaluation with inline result count
- **Semantic Highlighting** — token-level highlighting from the LSP server
- **SNOMED CT Edition** — status bar widget to select and display the active edition/version

## Settings

Configure at **Settings** > **Languages & Frameworks** > **ECL Language Server**.

| Setting                   | Default                               | Description                                   |
| ------------------------- | ------------------------------------- | --------------------------------------------- |
| Server URL                | `https://tx.ontoserver.csiro.au/fhir` | FHIR terminology server base URL              |
| Timeout (ms)              | 2000                                  | Concept lookup request timeout                |
| SNOMED CT Edition         | (empty = server default)              | Edition/version URI                           |
| Semantic validation       | enabled                               | Attribute scope and value constraint checking |
| Result limit              | 200                                   | Max concepts returned from ECL evaluation     |
| Indent size               | 2                                     | Spaces per indentation level                  |
| Indent style              | space                                 | Spaces or tabs                                |
| Max line length           | 80                                    | Line breaking threshold (0 = unlimited)       |
| Space around operators    | true                                  | Spaces around AND, OR, MINUS                  |
| Align terms               | true                                  | Vertically align pipe-delimited terms         |
| Wrap comments             | false                                 | Wrap long line comments                       |
| Break on operators        | false                                 | Force newline before operators                |
| Break on refinement comma | false                                 | Force newline after commas in refinements     |
| Break after colon         | false                                 | Force newline after refinement colon          |

## SNOMED CT Edition Selection

Click the **SNOMED CT** widget in the bottom-right status bar to select an edition and version interactively. The widget is only visible when editing `.ecl` files.

## Troubleshooting

**Server not found:**
Ensure `ecl-lsp-server` is on your PATH. Run `ecl-lsp-server --version` in a terminal to verify.

**Enable LSP debug logging:**
Go to **Help** > **Diagnostic Tools** > **Debug Log Settings** and add:

```
#com.intellij.platform.lsp
```

**Check LSP output:**
The "ECL Language Server" output appears in the LSP console log.
