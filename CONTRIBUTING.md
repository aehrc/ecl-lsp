# Contributing to ECL Language Tools

Thank you for your interest in contributing! This guide covers how to set up the project, make changes, and submit them.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 7+ (for workspace support)
- VSCode (for testing the VSCode extension)
- IntelliJ IDEA Ultimate 2024.2+ (for IntelliJ plugin development)
- Java 17+ and Maven (for Eclipse plugin development)

### Setup

```bash
git clone <repo-url>
cd ecl-lsp
npm install          # Installs all workspace dependencies
npm run compile      # Compiles all packages
```

### Project Layout

This is an npm workspace monorepo with 6 packages and 7 IDE clients:

**Packages:**

| Package            | Path                         | Description                                                                                                           |
| ------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ecl-core`         | `packages/ecl-core/`         | Zero-dependency core library: parser, formatter, completion, refactoring, semantic validation, terminology, knowledge |
| `ecl-lsp-server`   | `packages/ecl-lsp-server/`   | LSP server — thin adapter mapping ecl-core types to the LSP protocol                                                  |
| `ecl-mcp-server`   | `packages/ecl-mcp-server/`   | MCP server — 6 tools + 6 ECL literacy resources for AI assistants                                                     |
| `ecl-editor-core`  | `packages/ecl-editor-core/`  | Headless ECL editor integration for Monaco Editor                                                                     |
| `ecl-editor-react` | `packages/ecl-editor-react/` | React component wrapping ecl-editor-core                                                                              |
| `ecl-editor`       | `packages/ecl-editor/`       | Web Component (`<ecl-editor>`) wrapping ecl-editor-core                                                               |

**IDE Clients:**

| Client       | Path                   | Description                                   |
| ------------ | ---------------------- | --------------------------------------------- |
| VSCode       | `clients/vscode/`      | VSCode extension                              |
| IntelliJ     | `clients/intellij/`    | IntelliJ IDEA Ultimate plugin (Kotlin/Gradle) |
| Eclipse      | `clients/eclipse/`     | Eclipse IDE plugin (Java/Maven/Tycho)         |
| Neovim       | `clients/neovim/`      | Neovim LSP configuration guide                |
| Sublime Text | `clients/sublime/`     | Sublime Text LSP configuration guide          |
| Emacs        | `clients/emacs/`       | Emacs (eglot/lsp-mode) configuration guide    |
| Claude Code  | `clients/claude-code/` | Claude Code plugin                            |

**Other:**

- `grammar/` — ANTLR4 ECL grammar (official IHTSDO, at repo root)
- `shared/syntaxes/` — TextMate grammar (single source of truth, shared across IDE clients)
- `examples/` — Example ECL files for testing

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature
```

### 2. Make Changes

- Core library code: `packages/ecl-core/src/`
- LSP server code: `packages/ecl-lsp-server/src/`
- MCP server code: `packages/ecl-mcp-server/src/`
- Browser editor code: `packages/ecl-editor-core/src/`, `packages/ecl-editor-react/src/`, `packages/ecl-editor/src/`
- VSCode client code: `clients/vscode/src/`
- IntelliJ plugin code: `clients/intellij/src/`
- Eclipse plugin code: `clients/eclipse/au.csiro.ecl.eclipse/src/`

### 3. Run Tests

```bash
npm test    # All 1653+ tests across all packages
```

Per-package:

```bash
npm run test:core          # ecl-core (1439 tests)
npm run test:server        # ecl-lsp-server (61 tests)
npm run test:mcp           # ecl-mcp-server (15 tests)
npm run test:editor-core   # ecl-editor-core (71 tests)
npm run test:editor-react  # ecl-editor-react (33 tests)
npm run test:editor        # ecl-editor (34 tests)
```

IDE client tests:

```bash
cd clients/vscode && npm run test:e2e       # VSCode E2E (6 tests)
cd clients/intellij && ./gradlew test       # IntelliJ (18+ tests)
cd clients/eclipse && mvn clean verify      # Eclipse (24 tests)
```

All tests must pass. If you add new functionality, add tests for it.

### 4. Lint & Format

```bash
npm run lint         # ESLint + SonarJS
npm run format:check # Prettier
```

Fix any issues:

```bash
npm run lint:fix
npm run format
```

### 5. Test in an IDE

**VSCode:**

1. Open the project in VSCode
2. Press **F5** to launch the Extension Development Host
3. Open an `.ecl` file and verify your changes work

**IntelliJ:**

1. Run `cd clients/intellij && ./gradlew runIde`
2. Open an `.ecl` file in the launched IDE

**Eclipse:**

1. Run `cd clients/eclipse && mvn clean verify`
2. Install the built plugin in Eclipse from the local update site

### 6. Submit a Pull Request

- Keep PRs focused on a single change
- Include a clear description of what and why
- Reference any related issues

## Adding Tests

Tests use Node.js built-in test runner (`node:test`). Add tests to the appropriate file in the relevant package's `src/test/` directory, or create a new file if adding a new feature area.

```typescript
import { test, describe } from 'node:test';
import { strict as assert } from 'assert';

describe('Your Feature', () => {
  test('should do the expected thing', () => {
    assert.equal(actual, expected);
  });
});
```

## Modifying the Grammar

The ECL grammar is in `grammar/ECL.g4` (official IHTSDO grammar). If you modify it:

```bash
cd packages/ecl-core
npm run antlr4ts    # Regenerate parser
npm run compile     # Recompile
npm test            # Verify nothing broke
```

## Code Style

- TypeScript with strict mode
- Prettier for formatting (config in project root)
- ESLint with SonarJS rules
- No explicit return types needed for test functions
- Prefer pure functions where possible (formatter rules, error refinement, code lens builder)

## Reporting Issues

When reporting bugs, please include:

- The ECL expression that triggers the issue
- Expected vs actual behavior
- IDE/editor and version
- Any relevant output from the server log

## License

Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO) ABN 41 687 119 230

Licensed under the Apache License, Version 2.0 — see [LICENSE](LICENSE).
