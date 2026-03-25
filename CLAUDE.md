# ECL Language Server

LSP implementation for SNOMED CT Expression Constraint Language (ECL) 2.2.

## Build & Test

```bash
npm run compile        # Compile all packages (order matters: ecl-core → ecl-lsp-server → editors → vscode → slack-bot)
npm test               # All tests (node:test runner, not jest)
npm run lint           # ESLint (sonarjs + unicorn + typescript-eslint)
npm run format:check   # Prettier
```

Pre-commit hook enforces: lint + format + secret scan. All three must pass.

IDE clients build separately:

```bash
cd clients/vscode && npm run build:vsix                   # VSCode VSIX
cd clients/intellij && ./gradlew buildPlugin              # IntelliJ ZIP
cd clients/eclipse && mvn clean verify                    # Eclipse (needs JDK 21 + Xvfb on Linux)
```

Regenerate parser after grammar changes: `cd packages/ecl-core && npm run antlr4ts`

## Architecture

npm workspaces monorepo. Compile order matters — ecl-core must build first.

```
packages/
  ecl-core/           Zero-dependency core: parser, AST, formatter, completion, refactoring, validation, FHIR terminology
  ecl-lsp-server/     Thin LSP adapter (depends on ecl-core)
  ecl-editor-core/    Monaco editor integration (depends on ecl-core)
  ecl-editor-react/   React component (depends on ecl-editor-core)
  ecl-editor/         Web component <ecl-editor> (depends on ecl-editor-core)
  ecl-slack-bot/      Slack bot (depends on ecl-core)
clients/
  vscode/             VSCode extension with embedded ECL support for FSH/JSON/XML/Java/TS
  intellij/           IntelliJ IDEA Ultimate plugin (Kotlin/Gradle, bundles ecl-lsp-server)
  eclipse/            Eclipse plugin (Maven/Tycho, bundles ecl-lsp-server)
  neovim/ sublime/ emacs/ claude-code/   Config guides
```

All packages scoped `@aehrc/*`.

## Key Files

| What                  | Where                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| ECL grammar           | `grammar/ECL.g4` (official IHTSDO, do not hand-edit)                                               |
| Parser + AST          | `packages/ecl-core/src/parser/{index,ast,visitor}.ts`                                              |
| Formatter pipeline    | `packages/ecl-core/src/formatter/formatter.ts` — normalizes spacing, then delegates to AST printer |
| AST printer           | `packages/ecl-core/src/formatter/ast-printer.ts` — walks AST for indentation/line-breaking         |
| Completion            | `packages/ecl-core/src/completion/provider.ts` — context-aware, triggers on `^ : = {`              |
| FHIR service          | `packages/ecl-core/src/terminology/fhir-service.ts` — concept lookup, ECL evaluation, search       |
| LSP server            | `packages/ecl-lsp-server/src/server.ts` — maps ecl-core types to LSP protocol                      |
| VSCode extension      | `clients/vscode/src/extension.ts` — LSP client, embedded ECL, evaluation, edition picker           |
| Embedded ECL (pure)   | `clients/vscode/src/embedded-core.ts` — extractors + position mapping (no vscode dependency)       |
| Embedded ECL (vscode) | `clients/vscode/src/embedded.ts` — virtual document manager, diagnostics middleware                |

## Formatter Pipeline

The formatter is multi-stage — understanding this prevents bugs:

1. **Extract comments** (removed from text, reinserted after formatting)
2. **Normalize spacing** — operators, colons, equals, terms, filter blocks (text-level regex)
3. **Re-parse** the normalized text to get AST with correct offsets
4. **AST printer** — walks tree, decides inline vs multi-line per node based on `maxLineLength` + current column
5. **Post-process** — refinement comma breaks (if enabled)
6. **Reinsert comments**

If re-parse fails (syntax errors in normalized text), the formatter returns normalized text without indentation.

The `alignTerms` option is accepted but is a no-op — term pipe alignment was removed.

## Testing Conventions

- Framework: `node:test` (built-in, not jest/mocha)
- Test files: `src/test/*.test.ts` in each package
- Pattern: `describe()` + `it()` + `assert.*`
- FHIR tests use `MockTerminologyService` — no network calls
- AST printer tests: parse input with `parseECL()`, print with `printAst()`, assert output string
- Add tests to existing files, don't create new test files unless adding a new module

## Known Limitations

- OR/AND between refinement attributes is flattened by the AST — the printer comma-separates them
- Filter constraint internals (term values, language codes) not modelled in AST — only concept-bearing parts extracted
- Cardinality constraints and `{ }` brace groups recovered from source text, not AST
- Eclipse client requires Maven/Tycho (not part of npm workflow)

## Resources

- [SNOMED ECL 2.2 Spec](https://confluence.ihtsdotools.org/display/DOCECL)
- [ECL Grammar (IHTSDO)](https://github.com/IHTSDO/snomed-expression-constraint-language)
- [LSP Specification](https://microsoft.github.io/language-server-protocol/)
- [FHIR Terminology Services](https://hl7.org/fhir/terminology-service.html)
