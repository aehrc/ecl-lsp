# FHIR User-Agent Identification Design

**Goal:** Enable Ontoserver traffic reporting by client type (Slack bot, MCP server, LSP server, IDE) via User-Agent headers on all FHIR requests.

**Architecture:** Refactor `FhirTerminologyService` constructor from fragile positional parameters to a typed options object. Each consumer passes a descriptive `userAgent` string identifying the client application. The Slack bot includes the workspace name, the LSP server includes the IDE client name/version, and the MCP server includes the connecting client name/version.

## FhirTerminologyService Constructor Refactor

Replace the 5-parameter positional constructor with an options object to prevent parameter ordering bugs (the MCP server currently has a bug where `snomedVersion` is passed in the `userAgent` position).

```typescript
export interface FhirTerminologyServiceOptions {
  baseUrl?: string; // default: 'https://tx.ontoserver.csiro.au/fhir'
  timeout?: number; // default: 2000
  userAgent?: string; // default: 'ecl-lsp/1.0.0'
  snomedVersion?: string;
  onResolvedVersion?: (versionUri: string) => void;
}

// Old: new FhirTerminologyService(url, timeout, userAgent, version, callback)
// New: new FhirTerminologyService({ baseUrl, timeout, userAgent, snomedVersion, onResolvedVersion })
```

The `IS_BROWSER` check in `fetchWithTimeout` continues to skip the `User-Agent` header in browser environments (CORS preflight avoidance). Browser editor identification via `X-ECL-Client` header is deferred to a future change pending Ontoserver CORS configuration.

## Per-Consumer User-Agent Strings

| Consumer | User-Agent Example | Source |
| --- | --- | --- |
| **Slack bot** | `ecl-slack-bot/1.0.0 (team:CSIRO Ontoserver)` | Slack `auth.test` API at startup |
| **MCP server** | `ecl-mcp-server/1.0.0 (claude-code/1.2.3)` | `server.server.getClientVersion()` after MCP init |
| **LSP server** | `ecl-lsp-server/1.0.0 (VSCode/1.96.0)` | `params.clientInfo` from LSP `initialize` request |
| **Browser editors** | Deferred (User-Agent is a forbidden header in browsers) | N/A |

### Slack Bot

At startup (after `app.start()`), call Slack's `auth.test` API to retrieve the workspace name. This is a single API call that uses the already-configured `SLACK_BOT_TOKEN`. The team name is captured once and reused for all subsequent `FhirTerminologyService` instantiations.

```typescript
const authResult = await app.client.auth.test();
const teamName = authResult.team ?? 'unknown';
// userAgent: `ecl-slack-bot/1.0.0 (team:${teamName})`
```

Since the Slack bot creates a new `FhirTerminologyService` per request (inside `handleEcl`), the team name needs to be stored in a module-level variable accessible to the handler.

### MCP Server

The MCP SDK's `Server` class provides `getClientVersion()` after initialization completes. The `McpServer` wrapper exposes the underlying `Server` via `.server`. Use the `oninitialized` callback to capture client info.

```typescript
server.server.oninitialized = () => {
  const client = server.server.getClientVersion();
  // client?.name = "claude-code", client?.version = "1.2.3"
};
```

Since the MCP server creates a new `FhirTerminologyService` per tool call (via `createTerminologyService`), the client info is captured once at init and stored in a module-level variable.

### LSP Server

The LSP `InitializeParams` includes `clientInfo?: { name: string; version?: string }`. This is already received in `connection.onInitialize` but not currently used. Capture it and pass it when creating the terminology service in `applyTerminologyConfig`.

```typescript
connection.onInitialize((params: InitializeParams) => {
  // params.clientInfo?.name = "Visual Studio Code"
  // params.clientInfo?.version = "1.96.0"
});
```

Known client names from IDE clients:

- VSCode: `"Visual Studio Code"` → shortened to `"VSCode"` for brevity
- IntelliJ: sends the IDE product name (e.g. `"IntelliJ IDEA"`)
- Eclipse: `"Eclipse IDE"`
- Neovim: `"Neovim"`
- Other editors: whatever `clientInfo.name` reports

### Browser Editors (Deferred)

Browser environments cannot set the `User-Agent` header (forbidden by the Fetch spec). A future enhancement could:

1. Accept an `appName` prop/attribute on the editor components
2. Send it via a custom `X-ECL-Client` header
3. Require Ontoserver to add `X-ECL-Client` to `Access-Control-Allow-Headers`

This is deferred pending the Ontoserver CORS configuration change.

## Test Impact

- **ecl-core tests:** All tests constructing `FhirTerminologyService` must be updated from positional args to options object. The `MockTerminologyService` (which implements `ITerminologyService`) is unaffected since it doesn't extend `FhirTerminologyService`.
- **ecl-lsp-server tests:** Integration tests that construct real `FhirTerminologyService` instances need updating.
- **ecl-mcp-server tests:** Tests for `createTerminologyService` need updating.
- **ecl-slack-bot tests:** Mock the `auth.test` call; test that team name flows into User-Agent.
- **New tests:** Verify User-Agent header is set correctly for each consumer. Verify `IS_BROWSER` path still skips User-Agent.

## Files to Modify

- `packages/ecl-core/src/terminology/fhir-service.ts` — Options object, export interface
- `packages/ecl-core/src/test/` — Update all `FhirTerminologyService` construction calls
- `packages/ecl-lsp-server/src/server.ts` — Capture `clientInfo`, pass `userAgent`
- `packages/ecl-lsp-server/src/test/` — Update integration tests
- `packages/ecl-mcp-server/src/server.ts` — Fix bug, capture `getClientVersion()`, pass `userAgent`
- `packages/ecl-mcp-server/src/test/` — Update tests
- `packages/ecl-slack-bot/src/app.ts` — `auth.test` call, pass team name as `userAgent`
- `packages/ecl-slack-bot/src/test/` — Update tests
