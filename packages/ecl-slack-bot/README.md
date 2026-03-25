# ECL Slack Bot

A Slack bot that validates, formats, and evaluates SNOMED CT Expression Constraint Language (ECL) expressions directly in Slack.

## Features

- **Validation** — syntax errors with user-friendly messages, inactive/unknown concept warnings, semantic checks
- **Formatting** — auto-formats expressions with display terms (FSN) added from the FHIR terminology server
- **Evaluation** — counts matching concepts and shows a preview (with [Shrimp](https://ontoserver.csiro.au/shrimp/) links)
- **SNOMED CT editions** — switch between International, Australian, US, UK, NZ, or any custom edition
- **Three interaction modes** — `/ecl` slash command (private), `@ECL Bot` mention (thread reply), direct message

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App → From a manifest**
2. Paste the contents of [`slack-manifest.yaml`](slack-manifest.yaml)
3. Install the app to your workspace
4. Copy the **Bot User OAuth Token** (`xoxb-...`) from **OAuth & Permissions**
5. Copy the **App-Level Token** (`xapp-...`) from **Basic Information → App-Level Tokens** (create one with `connections:write` scope)

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in the tokens:

```bash
cp .env.example .env
```

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token

# Optional: FHIR terminology server (defaults to Ontoserver)
# FHIR_SERVER_URL=https://tx.ontoserver.csiro.au/fhir

# Optional: Default SNOMED CT edition (shorthand or full URI)
# SNOMED_EDITION=au

# Optional: Max concepts shown in evaluation results (default: 5)
# MAX_EVAL_RESULTS=5
```

### 3. Run

**From the monorepo:**

```bash
npm install
npm run compile
cd packages/ecl-slack-bot
npm start
```

**With Docker:**

```bash
# Build from repo root (Dockerfile uses multi-stage build)
docker build -f packages/ecl-slack-bot/Dockerfile -t ecl-slack-bot .

# Run with environment variables
docker run -d --name ecl-slack-bot \
  -e SLACK_BOT_TOKEN=xoxb-... \
  -e SLACK_APP_TOKEN=xapp-... \
  ecl-slack-bot
```

## Usage

### Slash Command (Private Response)

```
/ecl < 404684003 |Clinical finding|
/ecl --edition au << 32570681000036106
/ecl --no-terms << 404684003
```

### @Mention (Thread Reply)

```
@ECL Bot < 404684003 AND < 19829001
@ECL Bot --edition us < 404684003
```

### Direct Message

Send your ECL expression directly — no prefix needed.

### Options

| Flag                    | Description                                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| `--edition <code\|uri>` | Override SNOMED CT edition (`int`, `au`, `us`, `uk`, `nz`, or a full URI) |
| `--no-terms`            | Format and validate without adding display terms from the FHIR server     |
| `help`                  | Show usage help                                                           |

### What You Get Back

- **Formatted ECL** with display terms added from the terminology server
- **Errors** (syntax issues with line/column)
- **Warnings** (inactive concepts, unknown concepts, semantic issues)
- **Evaluation** — concept count + sample results with Shrimp browser links
- **Edition** — resolved SNOMED CT edition and version

## Development

```bash
cd packages/ecl-slack-bot
npm run compile        # Compile TypeScript
npm test               # Run tests (3 test files)
npm run watch          # Watch mode
```

Tests cover input parsing, ECL processing pipeline, and Slack message formatting.

## License

Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO) ABN 41 687 119 230

Licensed under the Apache License, Version 2.0 — see [LICENSE](../../LICENSE).
