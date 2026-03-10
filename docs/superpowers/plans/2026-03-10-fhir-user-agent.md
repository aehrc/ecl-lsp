# FHIR User-Agent Identification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Ontoserver traffic reporting by client type via User-Agent headers on all FHIR requests from the Slack bot, MCP server, and LSP server.

**Architecture:** Refactor `FhirTerminologyService` from a 5-parameter positional constructor to a typed options object. Each consumer (Slack bot, MCP server, LSP server) passes a descriptive `userAgent` string. The Slack bot includes the workspace name from `auth.test`, the LSP server includes IDE `clientInfo` from the LSP initialize handshake, and the MCP server includes `getClientVersion()` from the MCP initialize handshake.

**Tech Stack:** TypeScript, Node.js test runner, Slack Bolt.js, MCP SDK, LSP protocol

**Spec:** `docs/superpowers/specs/2026-03-10-fhir-user-agent-design.md`

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `packages/ecl-core/src/terminology/fhir-service.ts` | Modify | Options object constructor, export interface |
| `packages/ecl-core/src/index.ts` | Modify | Export `FhirTerminologyServiceOptions` type |
| `packages/ecl-core/src/test/snomed-version.test.ts` | Modify | ~48 constructor calls → options object |
| `packages/ecl-core/src/test/search-inactive-filter.test.ts` | Modify | ~16 constructor calls → options object |
| `packages/ecl-core/src/test/semantic-integration.test.ts` | Modify | 1 constructor call → options object |
| `packages/ecl-lsp-server/src/server.ts` | Modify | Capture `clientInfo`, pass `userAgent` |
| `packages/ecl-mcp-server/src/server.ts` | Modify | Fix bug, capture `getClientVersion()`, pass `userAgent` |
| `packages/ecl-mcp-server/src/test/tools.test.ts` | Modify | 1 constructor call → options object |
| `packages/ecl-slack-bot/src/app.ts` | Modify | `auth.test` for team name, pass `userAgent` |
| `packages/ecl-slack-bot/src/test/ecl-processor.test.ts` | Modify | Update any mock terminology service patterns if needed |

---

## Task 1: Refactor FhirTerminologyService constructor to options object

This is the core change. After this task, ecl-core compiles and all ecl-core tests pass.

**Files:**
- Modify: `packages/ecl-core/src/terminology/fhir-service.ts:74,97-125`
- Modify: `packages/ecl-core/src/index.ts:34`
- Modify: `packages/ecl-core/src/test/snomed-version.test.ts` (~48 call sites)
- Modify: `packages/ecl-core/src/test/search-inactive-filter.test.ts` (~16 call sites)
- Modify: `packages/ecl-core/src/test/semantic-integration.test.ts` (1 call site)

### Step 1: Define the options interface and update constructor

- [ ] **Step 1a: Add `FhirTerminologyServiceOptions` interface and change constructor**

In `packages/ecl-core/src/terminology/fhir-service.ts`, replace the positional constructor with an options object:

```typescript
// Add before the class definition (after the CacheEntry interface, around line 83)
export interface FhirTerminologyServiceOptions {
  baseUrl?: string;
  timeout?: number;
  userAgent?: string;
  snomedVersion?: string;
  onResolvedVersion?: (versionUri: string) => void;
}

// Replace the constructor (lines 110-125) with:
constructor(options: FhirTerminologyServiceOptions = {}) {
  this.baseUrl = options.baseUrl ?? 'https://tx.ontoserver.csiro.au/fhir';
  this.timeout = options.timeout ?? 2000;
  this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  this.evaluationTimeout = 15000;
  this.searchTimeout = 5000;
  this.searchCacheTTL = 5 * 60 * 1000;
  this.snomedVersion = options.snomedVersion?.trim() ? options.snomedVersion.trim() : undefined;
  this.onResolvedVersion = options.onResolvedVersion;
}
```

- [ ] **Step 1b: Export the options type from ecl-core index**

In `packages/ecl-core/src/index.ts`, update the terminology export line:

```typescript
// Change line 34 from:
export { FhirTerminologyService } from './terminology/fhir-service';
// To:
export { FhirTerminologyService } from './terminology/fhir-service';
export type { FhirTerminologyServiceOptions } from './terminology/fhir-service';
```

### Step 2: Update ecl-core test files

All constructor calls in test files need to change from positional args to options objects. Here are the conversion patterns:

**Pattern A: No args (stays the same)**
```typescript
// Before:
new FhirTerminologyService()
// After (unchanged):
new FhirTerminologyService()
```

**Pattern B: baseUrl + timeout**
```typescript
// Before:
new FhirTerminologyService(baseUrl, 2000)
// After:
new FhirTerminologyService({ baseUrl, timeout: 2000 })
```

**Pattern C: baseUrl + timeout + undefined + snomedVersion**
```typescript
// Before:
new FhirTerminologyService(baseUrl, 2000, undefined, version)
// After:
new FhirTerminologyService({ baseUrl, timeout: 2000, snomedVersion: version })
```

**Pattern D: baseUrl + timeout + undefined + undefined + callback**
```typescript
// Before:
new FhirTerminologyService(baseUrl, 2000, undefined, undefined, (uri) => {
  capturedVersions.push(uri);
})
// After:
new FhirTerminologyService({ baseUrl, timeout: 2000, onResolvedVersion: (uri) => {
  capturedVersions.push(uri);
}})
```

**Pattern E: baseUrl + timeout + undefined + snomedVersion + callback**
```typescript
// Before:
new FhirTerminologyService(baseUrl, 2000, undefined, snomedVersion, callback)
// After:
new FhirTerminologyService({ baseUrl, timeout: 2000, snomedVersion, onResolvedVersion: callback })
```

- [ ] **Step 2a: Update `packages/ecl-core/src/test/snomed-version.test.ts`**

This file has ~48 constructor calls. Apply the patterns above mechanically:
- Most are Pattern B (`baseUrl, 2000`) or Pattern C (`baseUrl, 2000, undefined, version`)
- A few are Pattern D or E (with callback)
- Search for `new FhirTerminologyService(` and convert each one

- [ ] **Step 2b: Update `packages/ecl-core/src/test/search-inactive-filter.test.ts`**

This file has ~16 constructor calls, all Pattern B (`baseUrl, 2000`).

- [ ] **Step 2c: Update `packages/ecl-core/src/test/semantic-integration.test.ts`**

Line 24 — one call, Pattern B with custom timeout:
```typescript
// Before:
const svc = new FhirTerminologyService('https://tx.ontoserver.csiro.au/fhir', 15_000);
// After:
const svc = new FhirTerminologyService({ baseUrl: 'https://tx.ontoserver.csiro.au/fhir', timeout: 15_000 });
```

### Step 3: Verify

- [ ] **Step 3a: Compile ecl-core**

```bash
cd /Users/mcm184/Projects/ecl-lsp && npm run compile
```
Expected: Clean compilation.

- [ ] **Step 3b: Run ecl-core tests**

```bash
npm run test:core
```
Expected: All 1455 tests pass.

- [ ] **Step 3c: Commit**

```bash
git add packages/ecl-core/src/terminology/fhir-service.ts packages/ecl-core/src/index.ts packages/ecl-core/src/test/snomed-version.test.ts packages/ecl-core/src/test/search-inactive-filter.test.ts packages/ecl-core/src/test/semantic-integration.test.ts
git commit -m "refactor(core): replace FhirTerminologyService positional params with options object"
```

---

## Task 2: Update LSP server — capture clientInfo, pass userAgent

After this task, the LSP server compiles and all LSP server tests pass. The User-Agent sent to Ontoserver includes the IDE client name/version.

**Files:**
- Modify: `packages/ecl-lsp-server/src/server.ts:182,218-230,279-287`

### Step 1: Capture clientInfo from initialize

- [ ] **Step 1a: Add module-level variable and capture in onInitialize**

In `packages/ecl-lsp-server/src/server.ts`:

Near the other module-level state (around line 182), add:
```typescript
let clientUserAgent: string | undefined;
```

In the `connection.onInitialize` handler (line 279), add after the existing `clientSupportsCodeLensRefresh` line:
```typescript
// Build User-Agent from client info
const client = params.clientInfo;
if (client) {
  const clientName = client.name === 'Visual Studio Code' ? 'VSCode' : client.name;
  const clientVersion = client.version ? `/${client.version}` : '';
  clientUserAgent = `ecl-lsp-server/1.0.0 (${clientName}${clientVersion})`;
} else {
  clientUserAgent = 'ecl-lsp-server/1.0.0';
}
```

### Step 2: Update FhirTerminologyService construction

- [ ] **Step 2a: Update the initial default construction (line 182)**

```typescript
// Before:
let terminologyService: ITerminologyService = new FhirTerminologyService();
// After:
let terminologyService: ITerminologyService = new FhirTerminologyService();
```
This stays the same — it's created before `initialize` so no client info yet. It gets replaced in `applyTerminologyConfig`.

- [ ] **Step 2b: Update `applyTerminologyConfig` (lines 220-230)**

```typescript
// Before:
terminologyService = new FhirTerminologyService(
  cfg.serverUrl,
  cfg.timeout,
  undefined,
  cfg.snomedVersion,
  (versionUri) => {
    connection.console.log(`Resolved SNOMED version: ${versionUri}`);
    snomedEditionLabel = versionUri;
    void connection.sendNotification('ecl/resolvedSnomedVersion', { versionUri });
  },
);

// After:
terminologyService = new FhirTerminologyService({
  baseUrl: cfg.serverUrl,
  timeout: cfg.timeout,
  userAgent: clientUserAgent,
  snomedVersion: cfg.snomedVersion,
  onResolvedVersion: (versionUri) => {
    connection.console.log(`Resolved SNOMED version: ${versionUri}`);
    snomedEditionLabel = versionUri;
    void connection.sendNotification('ecl/resolvedSnomedVersion', { versionUri });
  },
});
```

### Step 3: Verify

- [ ] **Step 3a: Compile all packages**

```bash
npm run compile
```
Expected: Clean compilation.

- [ ] **Step 3b: Run LSP server tests**

```bash
npm run test:server
```
Expected: All 81 tests pass (including 9 LSP integration tests).

- [ ] **Step 3c: Commit**

```bash
git add packages/ecl-lsp-server/src/server.ts
git commit -m "feat(lsp): include IDE client name in FHIR User-Agent header"
```

---

## Task 3: Update MCP server — fix bug, capture client version, pass userAgent

After this task, the MCP server compiles and all MCP tests pass. Fixes the pre-existing bug where `snomedVersion` was passed as `userAgent`.

**Files:**
- Modify: `packages/ecl-mcp-server/src/server.ts:33-43,54-57,373-384`
- Modify: `packages/ecl-mcp-server/src/test/tools.test.ts` (1 call site)

### Step 1: Capture MCP client version

- [ ] **Step 1a: Add module-level variable and capture on initialized**

In `packages/ecl-mcp-server/src/server.ts`, after the `McpServer` construction (line 57), add:

```typescript
let mcpClientUserAgent = 'ecl-mcp-server/1.0.0';

server.server.oninitialized = () => {
  const client = server.server.getClientVersion();
  if (client?.name) {
    const clientVersion = client.version ? `/${client.version}` : '';
    mcpClientUserAgent = `ecl-mcp-server/1.0.0 (${client.name}${clientVersion})`;
  }
};
```

### Step 2: Fix createTerminologyService

- [ ] **Step 2a: Update `createTerminologyService` to use options object and pass userAgent**

```typescript
// Before (lines 33-43):
function createTerminologyService(
  fhirServer?: string,
  snomedVersion?: string,
  timeout?: number,
): FhirTerminologyService {
  return new FhirTerminologyService(
    fhirServer ?? config.fhirServer,
    timeout ?? config.fhirTimeout,
    snomedVersion ?? config.snomedVersion,
  );
}

// After:
function createTerminologyService(
  fhirServer?: string,
  snomedVersion?: string,
  timeout?: number,
): FhirTerminologyService {
  return new FhirTerminologyService({
    baseUrl: fhirServer ?? config.fhirServer,
    timeout: timeout ?? config.fhirTimeout,
    userAgent: mcpClientUserAgent,
    snomedVersion: snomedVersion ?? config.snomedVersion,
  });
}
```

### Step 3: Update test

- [ ] **Step 3a: Update test constructor call in `packages/ecl-mcp-server/src/test/tools.test.ts`**

Find the `new FhirTerminologyService()` call (around line 490) and leave it as-is — no-arg construction still works with the options object default.

### Step 4: Verify

- [ ] **Step 4a: Compile all packages**

```bash
npm run compile
```
Expected: Clean compilation.

- [ ] **Step 4b: Run MCP server tests**

```bash
npm run test:mcp
```
Expected: All 47 tests pass.

- [ ] **Step 4c: Commit**

```bash
git add packages/ecl-mcp-server/src/server.ts packages/ecl-mcp-server/src/test/tools.test.ts
git commit -m "fix(mcp): fix userAgent/snomedVersion param swap, add MCP client identification"
```

---

## Task 4: Update Slack bot — auth.test for team name, pass userAgent

After this task, the Slack bot compiles and all Slack bot tests pass. The User-Agent includes the Slack workspace name.

**Files:**
- Modify: `packages/ecl-slack-bot/src/app.ts:11-22,33,65-70`
- Modify: `packages/ecl-slack-bot/src/test/ecl-processor.test.ts` (if any direct FhirTerminologyService construction — check first, likely uses MockTerminologyService and needs no changes)

### Step 1: Capture team name at startup

- [ ] **Step 1a: Add team name variable and auth.test call**

In `packages/ecl-slack-bot/src/app.ts`:

After the `const app = new App({...})` block (line 22), add a module-level variable:
```typescript
let slackTeamName = 'unknown';
```

The `auth.test` call needs to happen after the app starts. In the existing startup IIFE at the bottom of the file, add the auth.test call after `app.start()`:
```typescript
void (async () => {
  try {
    await app.start();
    // Capture workspace name for User-Agent
    try {
      const authResult = await app.client.auth.test();
      slackTeamName = authResult.team ?? 'unknown';
      console.log(`[ECL] Connected to workspace: ${slackTeamName}`);
    } catch {
      console.warn('[ECL] Could not retrieve workspace name from auth.test');
    }
    console.log('[ECL] ECL Slack Bot is running');
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
})();
```

### Step 2: Update FhirTerminologyService construction in handleEcl

- [ ] **Step 2a: Change constructor call to options object with team name**

```typescript
// Before (lines 65-70):
const terminologyService = new FhirTerminologyService(
  config.fhirServerUrl,
  10_000, // 10s timeout — bot users expect a few seconds of latency
  'ecl-slack-bot/1.0.0',
  snomedEdition,
);

// After:
const terminologyService = new FhirTerminologyService({
  baseUrl: config.fhirServerUrl,
  timeout: 10_000, // 10s timeout — bot users expect a few seconds of latency
  userAgent: `ecl-slack-bot/1.0.0 (team:${slackTeamName})`,
  snomedVersion: snomedEdition,
});
```

### Step 3: Verify

- [ ] **Step 3a: Compile all packages**

```bash
npm run compile
```
Expected: Clean compilation.

- [ ] **Step 3b: Run Slack bot tests**

```bash
npm run test:slack-bot
```
Expected: All 153 tests pass. The ecl-processor tests use `MockTerminologyService` (which implements `ITerminologyService`), not `FhirTerminologyService` directly, so they should be unaffected.

- [ ] **Step 3c: Commit**

```bash
git add packages/ecl-slack-bot/src/app.ts
git commit -m "feat(slack-bot): include workspace name in FHIR User-Agent header"
```

---

## Task 5: Final verification

- [ ] **Step 5a: Run full lint**

```bash
npx eslint packages/ecl-core/src/ packages/ecl-lsp-server/src/ packages/ecl-mcp-server/src/ packages/ecl-slack-bot/src/ clients/vscode/src/
```
Expected: Zero errors.

- [ ] **Step 5b: Run Prettier check**

```bash
npm run format:check
```
Expected: Clean (only dist files flagged).

- [ ] **Step 5c: Run all tests**

```bash
npm test
```
Expected: All 1736 tests pass (1455 + 81 + 47 + 153).
