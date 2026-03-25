# ECL Language Support — Eclipse IDE

Eclipse IDE plugin providing full IDE support for SNOMED CT Expression Constraint Language (ECL) 2.2. Built with LSP4E and TM4E.

## Prerequisites

- Eclipse IDE 2024-12 or later
- Java 17+
- Node.js 18+ (bundled server uses Node.js runtime)

## Install

### From Update Site

Install from the Eclipse update site (URL TBD).

### From Source

```bash
git clone <repo-url> && cd ecl-lsp
npm install && npm run compile
cd clients/eclipse && mvn clean verify
```

The built plugin is in `au.csiro.ecl.eclipse.update/target/repository/`. Add it as a local update site in Eclipse: **Help** > **Install New Software** > **Add** > **Local** > select the `repository/` directory.

## Features

- **Syntax Highlighting** — TextMate grammar for ECL expressions (via TM4E)
- **Diagnostics** — syntax errors, inactive/unknown concept warnings, semantic validation
- **Completion** — operators, keywords, SNOMED CT concept search, filter values, snippets
- **Hover** — operator documentation, concept information (FSN, PT, active status)
- **Code Actions** — 8 refactoring actions (strip/add display terms, simplify, parentheses, history supplement, description filter)
- **Formatting** — document formatting with configurable options
- **Code Lens** — "Evaluate" lens above each expression with inline result count

## Settings

Configure at **Window** > **Preferences** > **ECL Language Server**.

### Server

| Setting      | Default       | Description                                                                                             |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------------- |
| Node.js path | (auto-detect) | Path to Node.js executable. Only needed if `node` is not on the system PATH (common on macOS GUI apps). |

### FHIR Terminology

| Setting             | Default                               | Description                                   |
| ------------------- | ------------------------------------- | --------------------------------------------- |
| Server URL          | `https://tx.ontoserver.csiro.au/fhir` | FHIR terminology server URL                   |
| Timeout (ms)        | `2000`                                | Concept lookup request timeout                |
| SNOMED CT Edition   | (empty = server default)              | Edition/version URI                           |
| Semantic validation | enabled                               | Attribute scope and value constraint checking |

### Evaluation

| Setting      | Default | Description                               |
| ------------ | ------- | ----------------------------------------- |
| Result limit | `200`   | Max concepts returned from ECL evaluation |

### Formatting

| Setting                   | Default | Description                             |
| ------------------------- | ------- | --------------------------------------- |
| Indent size               | `2`     | Spaces per indentation level            |
| Indent style              | `space` | Spaces or tabs                          |
| Max line length           | `80`    | Line breaking threshold (0 = unlimited) |
| Space around operators    | `true`  | Spaces around AND, OR, MINUS            |
| Align terms               | `true`  | Vertically align pipe-delimited terms   |
| Wrap comments             | `false` | Wrap long line comments                 |
| Break on operators        | `false` | Newline before operators                |
| Break on refinement comma | `false` | Newline after commas in refinements     |
| Break after colon         | `false` | Newline after refinement colon          |

## Node.js Path

The plugin bundles the ECL LSP server and launches it with Node.js. It looks for `node` on the system PATH by default.

On macOS, GUI applications may not inherit shell PATH settings. If the server fails to start, set the Node.js path explicitly in **Preferences** > **ECL Language Server** > **Server** > **Node.js path**.

## Troubleshooting

**Server not starting:**

- Check the **Error Log** view (**Window** > **Show View** > **Error Log**)
- Verify Node.js is accessible: set the path in preferences if needed
- Check the **Language Servers** view (**Window** > **Show View** > **Other** > **Language Servers**)

**No syntax highlighting:**

- Ensure `.ecl` files are associated with the ECL content type
- Check **General** > **Content Types** > **Text** > **ECL Expression**

## Building

```bash
cd clients/eclipse
mvn clean verify                              # Build + run 24 headless tests
mvn clean verify -Decl.test.integration=true  # Include integration tests (needs display)
```

## License

Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO) ABN 41 687 119 230

Apache License 2.0 — see [LICENSE](../../LICENSE).
