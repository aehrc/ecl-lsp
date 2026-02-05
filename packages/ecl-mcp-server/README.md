# ecl-mcp-server

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for SNOMED CT Expression Constraint Language (ECL). Provides 6 tools and 6 ECL literacy resources for AI assistants.

Built on [ecl-core](../ecl-core/).

## Install

```bash
npm install -g ecl-mcp-server
```

## Usage

```bash
ecl-mcp-server
```

The server communicates over stdio using the MCP protocol.

## Tools

| Tool                  | Description                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `validate_ecl`        | Parse and validate an ECL expression, returning syntax errors and warnings                |
| `evaluate_ecl`        | Evaluate an ECL expression against a FHIR terminology server, returning matching concepts |
| `lookup_concept`      | Look up a SNOMED CT concept by ID, returning FSN, PT, and active status                   |
| `search_concepts`     | Search for SNOMED CT concepts by text query                                               |
| `format_ecl`          | Format an ECL expression with configurable options                                        |
| `get_snomed_editions` | List available SNOMED CT editions and their versions                                      |

All FHIR-dependent tools accept optional `fhirServer` and `snomedVersion` parameters to override the defaults for a single call.

## Resources

6 ECL literacy guides sourced from the ecl-core knowledge module:

| Resource          | Description                                    |
| ----------------- | ---------------------------------------------- |
| ECL Quick Start   | Getting started with ECL syntax                |
| Operators Guide   | All ECL constraint and logical operators       |
| Refinements Guide | Attribute refinements, groups, and cardinality |
| Filters Guide     | Description, concept, and member filters       |
| Common Patterns   | Frequently used ECL patterns                   |
| Grammar Reference | ECL 2.2 formal grammar summary                 |

## Configuration

Configure via environment variables:

| Variable             | Default                               | Description                   |
| -------------------- | ------------------------------------- | ----------------------------- |
| `ECL_FHIR_SERVER`    | `https://tx.ontoserver.csiro.au/fhir` | FHIR terminology server URL   |
| `ECL_FHIR_TIMEOUT`   | `2000`                                | Concept lookup timeout (ms)   |
| `ECL_SNOMED_VERSION` | `""` (server default)                 | SNOMED CT edition/version URI |

## Use with Claude Code

Add to your Claude Code MCP settings (`.claude/plugins/ecl-mcp/plugin.json`):

```json
{
  "name": "ecl-mcp",
  "mcpServers": {
    "ecl": {
      "command": "ecl-mcp-server",
      "args": []
    }
  }
}
```

## Use with Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ecl": {
      "command": "ecl-mcp-server",
      "args": [],
      "env": {
        "ECL_FHIR_SERVER": "https://tx.ontoserver.csiro.au/fhir"
      }
    }
  }
}
```

## License

Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO) ABN 41 687 119 230

Apache License 2.0 — see [LICENSE](../../LICENSE).
