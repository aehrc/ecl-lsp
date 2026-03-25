# ECL Language Server Plugin for Claude Code

Provides real-time ECL (Expression Constraint Language) support in Claude Code, including syntax validation, concept warnings, semantic analysis, and FHIR terminology integration.

## Prerequisites

- Node.js 18+
- Claude Code CLI

## Installation

### 1. Install the language server

```bash
cd server
npm install
npm run compile
npm link
```

Verify the server is available:

```bash
which ecl-lsp-server
```

### 2. Register the marketplace

In Claude Code:

1. Run `/plugin`
2. Go to **Marketplaces** tab
3. Select **Add marketplace**
4. Enter the local path to this directory: `/path/to/ecl-lsp/clients/claude-code`

### 3. Install the plugin

1. Run `/plugin`
2. Go to **Discover** tab
3. Find **ecl-lsp** and install it

## What you get

Once installed, Claude Code automatically:

- **Diagnostics** — Syntax errors and concept warnings appear after every `.ecl` file edit
- **Hover** — Concept information and operator documentation via the LSP Tool
- **Completion** — Context-aware ECL completions (operators, concepts, filters, snippets)
- **Formatting** — Document and range formatting
- **Code Actions** — Quick fixes and refactoring actions
- **Code Lens** — Expression evaluation

## Troubleshooting

**Plugin not activating?**

- Ensure `ecl-lsp-server` is in your PATH (`which ecl-lsp-server`)
- Check that the file has a `.ecl` extension

**No diagnostics?**

- The server validates on file open/change — try editing the file
- Check Claude Code's plugin status via `/plugin` → Installed
