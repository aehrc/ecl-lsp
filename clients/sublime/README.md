# ECL Language Server — Sublime Text

## Prerequisites

- Sublime Text 4
- [LSP](https://packagecontrol.io/packages/LSP) package (install via Package Control)
- Node.js 18+

## Install the server

**Option A: npm (recommended)**

```bash
npm install -g ecl-lsp-server
```

**Option B: Build from source**

```bash
git clone <repo-url> && cd ecl-lsp
npm install && npm run compile
```

## Setup

### 1. Install the LSP package

Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:

```
Package Control: Install Package
```

Search for and install **LSP**.

### 2. Add ECL syntax definition

Create `ECL.sublime-syntax` in your Sublime `Packages/User/` directory:

- **macOS:** `~/Library/Application Support/Sublime Text/Packages/User/`
- **Linux:** `~/.config/sublime-text/Packages/User/`
- **Windows:** `%APPDATA%\Sublime Text\Packages\User\`

```yaml
%YAML 1.2
---
name: ECL
file_extensions:
  - ecl
scope: source.ecl

contexts:
  main:
    # Block comments
    - match: /\*
      scope: punctuation.definition.comment.begin.ecl
      push: block_comment

    # Line comments (non-standard but common)
    - match: //
      scope: punctuation.definition.comment.ecl
      push: line_comment

    # Pipe-delimited terms
    - match: \|
      scope: punctuation.definition.string.begin.ecl
      push: term

    # Constraint operators
    - match: '<<[!]?|>>[!]?|<[!]?|>[!]?|\^|!!>|!!<'
      scope: keyword.operator.constraint.ecl

    # Logical operators
    - match: \b(AND|OR|MINUS)\b
      scope: keyword.operator.logical.ecl

    # Filter blocks
    - match: '\{\{'
      scope: punctuation.section.filter.begin.ecl
    - match: '\}\}'
      scope: punctuation.section.filter.end.ecl

    # Concept IDs
    - match: \b\d{6,18}\b
      scope: constant.numeric.concept-id.ecl

    # Comparison operators
    - match: '!=|='
      scope: keyword.operator.comparison.ecl

    # Refinement colon
    - match: ':'
      scope: keyword.operator.refinement.ecl

  block_comment:
    - meta_scope: comment.block.ecl
    - match: \*/
      scope: punctuation.definition.comment.end.ecl
      pop: true

  line_comment:
    - meta_scope: comment.line.double-slash.ecl
    - match: $
      pop: true

  term:
    - meta_scope: string.unquoted.term.ecl
    - match: \|
      scope: punctuation.definition.string.end.ecl
      pop: true
```

### 3. Configure LSP for ECL

Open Command Palette and run **Preferences: LSP Settings**. Add the ECL server to the `clients` section:

```json
{
  "clients": {
    "ecl-lsp": {
      "enabled": true,
      "command": ["ecl-lsp-server", "--stdio"],
      "selector": "source.ecl",
      "settings": {
        "ecl.terminology": {
          "serverUrl": "https://tx.ontoserver.csiro.au/fhir",
          "timeout": 2000
        },
        "ecl.semanticValidation": {
          "enabled": true
        }
      }
    }
  }
}
```

If built from source, use `["node", "/path/to/ecl-lsp/packages/ecl-lsp-server/dist/server.js", "--stdio"]` as the command instead.

## Features

Once configured, the following features are available:

- **Diagnostics** — inline syntax errors, inactive/unknown concept warnings, semantic validation
- **Completion** — auto-triggered on `<`, `>`, `^`, `:`, `=`, `{`, space (operators, keywords, concept search, filter values)
- **Hover** — hover over operators for documentation, over concept IDs for SNOMED CT info
- **Code Actions** — right-click or `Ctrl+.` for refactoring actions
- **Formatting** — `Ctrl+Shift+P` > "LSP: Format Document"

## Troubleshooting

Open the LSP log panel: **Command Palette** > **LSP: Toggle Log Panel**.

To see server-side logs: **Command Palette** > **LSP: Toggle Server Panel**.
