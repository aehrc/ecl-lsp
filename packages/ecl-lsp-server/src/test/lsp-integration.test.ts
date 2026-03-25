// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { spawn, ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import {
  StreamMessageReader,
  StreamMessageWriter,
  createMessageConnection,
  MessageConnection,
} from 'vscode-jsonrpc/node';

// Default settings the server expects from workspace/configuration
const DEFAULT_SETTINGS = {
  'ecl.terminology': {
    serverUrl: 'https://tx.ontoserver.csiro.au/fhir',
    timeout: 2000,
    snomedVersion: '',
  },
  'ecl.formatting': {
    indentSize: 2,
    indentStyle: 'space',
    spaceAroundOperators: true,
    maxLineLength: 80,
    alignTerms: true,
    wrapComments: false,
    breakOnOperators: false,
    breakOnRefinementComma: false,
    breakAfterColon: false,
  },
  'ecl.semanticValidation': {
    enabled: false, // Disable FHIR validation in tests for speed
  },
  'ecl.evaluation': {
    resultLimit: 200,
  },
};

// ── Server lifecycle helpers ────────────────────────────────────────────

function startServer(): { process: ChildProcess; connection: MessageConnection } {
  const serverPath = path.resolve(__dirname, '..', 'server.js');
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- node is required from PATH for spawning the LSP server process
  const proc = spawn('node', [serverPath, '--stdio'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const reader = new StreamMessageReader(proc.stdout);
  const writer = new StreamMessageWriter(proc.stdin);
  const connection = createMessageConnection(reader, writer);

  // Handle workspace/configuration requests from the server
  connection.onRequest('workspace/configuration', (params: { items: { section?: string }[] }) => {
    return params.items.map((item) => {
      const section = item.section ?? '';
      return (DEFAULT_SETTINGS as Record<string, unknown>)[section] ?? {};
    });
  });

  connection.listen();

  return { process: proc, connection };
}

async function initializeServer(connection: MessageConnection): Promise<void> {
  await connection.sendRequest('initialize', {
    processId: process.pid,
    rootPath: null,
    rootUri: null,
    capabilities: {
      textDocument: {
        completion: { completionItem: { snippetSupport: true } },
        hover: {},
        codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: [] } } },
        formatting: {},
        publishDiagnostics: {},
        semanticTokens: { requests: { full: true }, tokenTypes: [], tokenModifiers: [] },
      },
      workspace: { configuration: true },
    },
  });
  await connection.sendNotification('initialized', {});
  // Give the server time to process initialization (workspace/configuration requests)
  await new Promise((resolve) => setTimeout(resolve, 500));
}

function openDocument(connection: MessageConnection, uri: string, text: string, version = 1): Promise<void> {
  return connection.sendNotification('textDocument/didOpen', {
    textDocument: { uri, languageId: 'ecl', version, text },
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('LSP Protocol Integration', () => {
  let serverProc: ChildProcess;
  let conn: MessageConnection;

  before(async () => {
    const { process: proc, connection } = startServer();
    serverProc = proc;
    conn = connection;
    await initializeServer(conn);
  });

  after(async () => {
    conn.dispose();
    serverProc.kill('SIGTERM');
    // Give the process a moment to clean up
    await new Promise<void>((resolve) => {
      serverProc.once('exit', () => {
        resolve();
      });
      setTimeout(() => {
        resolve();
      }, 1000);
    });
  });

  describe('Initialize', () => {
    it('should expose completion capability', async () => {
      // Re-initialize to check capabilities
      const { process: proc, connection } = startServer();
      try {
        const result = await connection.sendRequest('initialize', {
          processId: process.pid,
          rootPath: null,
          rootUri: null,
          capabilities: {},
        });
        const caps = (result as { capabilities: Record<string, unknown> }).capabilities;
        assert.ok(caps.completionProvider, 'should have completionProvider');
        assert.ok(caps.hoverProvider, 'should have hoverProvider');
        assert.ok(caps.codeActionProvider, 'should have codeActionProvider');
        assert.ok(caps.documentFormattingProvider, 'should have documentFormattingProvider');
        assert.ok(caps.codeLensProvider, 'should have codeLensProvider');
        assert.ok(caps.semanticTokensProvider, 'should have semanticTokensProvider');
        assert.ok(caps.executeCommandProvider, 'should have executeCommandProvider');
      } finally {
        connection.dispose();
        proc.kill('SIGTERM');
      }
    });
  });

  describe('Diagnostics', () => {
    it('should publish diagnostics for syntax errors', async () => {
      const diagnosticsPromise = new Promise<{ uri: string; diagnostics: unknown[] }>((resolve) => {
        conn.onNotification('textDocument/publishDiagnostics', (params) => {
          const p = params as { uri: string; diagnostics: unknown[] };
          if (p.diagnostics.length > 0) {
            resolve(p);
          }
        });
      });

      await openDocument(conn, 'file:///test-errors.ecl', '< 404684003 AND AND < 19829001');

      const result = await Promise.race([
        diagnosticsPromise,
        new Promise<null>((resolve) =>
          setTimeout(() => {
            resolve(null);
          }, 5000),
        ),
      ]);

      assert.ok(result, 'should receive diagnostics within timeout');
      assert.ok(result.diagnostics.length > 0, 'should have at least one diagnostic');
    });

    it('should publish empty diagnostics for valid ECL', async () => {
      // Listen for diagnostics — may get multiple notifications (syntax + concept validation)
      let lastDiagnostics: unknown[] = [];
      conn.onNotification('textDocument/publishDiagnostics', (params) => {
        const p = params as { uri: string; diagnostics: unknown[] };
        if (p.uri === 'file:///test-valid.ecl') {
          lastDiagnostics = p.diagnostics;
        }
      });

      await openDocument(conn, 'file:///test-valid.ecl', '< 404684003');

      // Wait for diagnostics to settle
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // The first diagnostic notification (syntax) should have 0 errors
      assert.strictEqual(lastDiagnostics.length, 0, 'valid ECL should have no syntax errors');
    });
  });

  describe('Completion', () => {
    it('should provide operator completions', async () => {
      await openDocument(conn, 'file:///test-completion.ecl', '');

      const result = await conn.sendRequest('textDocument/completion', {
        textDocument: { uri: 'file:///test-completion.ecl' },
        position: { line: 0, character: 0 },
      });

      const items = Array.isArray(result) ? result : (result as { items: unknown[] }).items;
      assert.ok(items.length > 0, 'should return completion items');

      // Should include ECL snippets (empty document gets snippet completions)
      const labels = items.map((item: { label: string }) => item.label);
      assert.ok(
        labels.some((l: string) => l.toLowerCase().includes('descendant')),
        'should include descendant snippet',
      );
    });

    it('should return CompletionList with isIncomplete: true for re-request support', async () => {
      // IntelliJ (and other strict LSP clients) only re-send completion requests
      // when the server returns isIncomplete: true. Without this, concept search
      // never triggers because the initial request (on trigger character) has no
      // query text yet, and the client filters locally instead of re-requesting.
      await openDocument(conn, 'file:///test-incomplete.ecl', '<< 404684003 : ');

      const result = await conn.sendRequest('textDocument/completion', {
        textDocument: { uri: 'file:///test-incomplete.ecl' },
        position: { line: 0, character: 15 },
      });

      assert.ok(!Array.isArray(result), 'should return CompletionList object, not a plain array');
      const list = result as { isIncomplete: boolean; items: unknown[] };
      assert.strictEqual(
        list.isIncomplete,
        true,
        'isIncomplete must be true so clients re-request as user types concept search queries',
      );
      assert.ok(Array.isArray(list.items), 'should have items array');
    });
  });

  describe('Hover', () => {
    it('should provide hover for operator', async () => {
      await openDocument(conn, 'file:///test-hover.ecl', '<< 404684003');

      const result = await conn.sendRequest('textDocument/hover', {
        textDocument: { uri: 'file:///test-hover.ecl' },
        position: { line: 0, character: 0 },
      });

      if (result) {
        const hover = result as { contents: unknown };
        assert.ok(hover.contents, 'hover should have contents');
      }
      // null is acceptable (no hover info at this position)
    });
  });

  describe('Formatting', () => {
    it('should format document', async () => {
      await openDocument(conn, 'file:///test-format.ecl', '<<404684003|Clinical finding|');

      const result = await conn.sendRequest('textDocument/formatting', {
        textDocument: { uri: 'file:///test-format.ecl' },
        options: { tabSize: 2, insertSpaces: true },
      });

      const edits = result as { range: unknown; newText: string }[];
      assert.ok(edits.length > 0, 'should return formatting edits');
      // The formatted text should have proper spacing
      assert.ok(edits[0].newText.includes('<< 404684003'), 'formatted text should have space after operator');
    });
  });

  describe('Code Lens', () => {
    it('should provide evaluate code lens', async () => {
      await openDocument(conn, 'file:///test-lens.ecl', '<< 404684003');

      const result = await conn.sendRequest('textDocument/codeLens', {
        textDocument: { uri: 'file:///test-lens.ecl' },
      });

      const lenses = result as { range: unknown; command?: { title: string; command: string } }[];
      assert.ok(lenses.length > 0, 'should return at least one code lens');
      assert.ok(
        lenses.some((l) => l.command?.command === 'ecl.evaluateExpression'),
        'should have evaluate expression command',
      );
    });
  });

  describe('Semantic Tokens', () => {
    it('should provide semantic tokens for ECL expression', async () => {
      await openDocument(conn, 'file:///test-tokens.ecl', '<< 404684003 |Clinical finding|');

      const result = await conn.sendRequest('textDocument/semanticTokens/full', {
        textDocument: { uri: 'file:///test-tokens.ecl' },
      });

      const tokens = result as { data: number[] } | null;
      assert.ok(tokens, 'should return semantic tokens');
      assert.ok(tokens.data.length > 0, 'should have token data');
    });
  });

  describe('Code Actions', () => {
    it('should provide refactoring actions for valid ECL', async () => {
      await openDocument(conn, 'file:///test-actions.ecl', '<< 404684003 |Clinical finding|');

      const result = await conn.sendRequest('textDocument/codeAction', {
        textDocument: { uri: 'file:///test-actions.ecl' },
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 35 },
        },
        context: { diagnostics: [] },
      });

      const actions = result as { title: string; kind?: string }[];
      assert.ok(actions.length > 0, 'should provide at least one code action');
    });
  });

  // ── Extended: Diagnostic content validation ──────────────────────────

  describe('Diagnostic content validation', () => {
    it('should report syntax error message text (not just count)', async () => {
      const diagnosticsPromise = new Promise<{
        uri: string;
        diagnostics: { message: string; severity: number }[];
      }>((resolve) => {
        conn.onNotification('textDocument/publishDiagnostics', (params) => {
          const p = params as { uri: string; diagnostics: { message: string; severity: number }[] };
          if (p.uri === 'file:///test-msg.ecl' && p.diagnostics.length > 0) {
            resolve(p);
          }
        });
      });

      await openDocument(conn, 'file:///test-msg.ecl', '< 404684003 AND AND < 19829001');

      const result = await Promise.race([
        diagnosticsPromise,
        new Promise<null>((resolve) =>
          setTimeout(() => {
            resolve(null);
          }, 5000),
        ),
      ]);

      assert.ok(result, 'should receive diagnostics');
      assert.ok(result.diagnostics[0].message.length > 0, 'diagnostic message should not be empty');
      // Severity 1 = Error in LSP
      assert.strictEqual(result.diagnostics[0].severity, 1, 'syntax errors should have Error severity');
    });

    it('should produce line comment warning', async () => {
      const diagnosticsPromise = new Promise<{ diagnostics: { message: string; severity: number }[] }>((resolve) => {
        conn.onNotification('textDocument/publishDiagnostics', (params) => {
          const p = params as { uri: string; diagnostics: { message: string; severity: number }[] };
          if (p.uri === 'file:///test-linecomment.ecl' && p.diagnostics.length > 0) {
            resolve(p);
          }
        });
      });

      await openDocument(conn, 'file:///test-linecomment.ecl', '// this is a line comment');

      const result = await Promise.race([
        diagnosticsPromise,
        new Promise<null>((resolve) =>
          setTimeout(() => {
            resolve(null);
          }, 5000),
        ),
      ]);

      assert.ok(result, 'should receive diagnostics for line comment');
      const warning = result.diagnostics.find((d) => d.message.includes('Line comments'));
      assert.ok(warning, 'should have a line comment warning');
      // Severity 2 = Warning
      assert.strictEqual(warning.severity, 2, 'line comment should be a Warning');
    });

    it('should handle multiple expressions in one document', async () => {
      let lastDiagnostics: unknown[] = [];
      conn.onNotification('textDocument/publishDiagnostics', (params) => {
        const p = params as { uri: string; diagnostics: unknown[] };
        if (p.uri === 'file:///test-multi-expr.ecl') {
          lastDiagnostics = p.diagnostics;
        }
      });

      // Two valid expressions separated by ECL-END marker
      await openDocument(conn, 'file:///test-multi-expr.ecl', '<< 404684003\n/* ECL-END */\n< 19829001');
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Should have no syntax errors (both are valid)
      const errors = (lastDiagnostics as { severity: number }[]).filter((d) => d.severity === 1);
      assert.strictEqual(errors.length, 0, 'two valid expressions should have no syntax errors');
    });
  });

  // ── Extended: Configuration handling ──────────────────────────────────

  describe('Configuration handling', () => {
    it('should accept didChangeConfiguration notification', async () => {
      // Sending this should not crash the server
      await conn.sendNotification('workspace/didChangeConfiguration', {
        settings: {},
      });
      // Verify server still works by requesting completions
      await openDocument(conn, 'file:///test-config.ecl', '<< 404684003');
      const result = await conn.sendRequest('textDocument/completion', {
        textDocument: { uri: 'file:///test-config.ecl' },
        position: { line: 0, character: 12 },
      });
      assert.ok(result !== null, 'server should still respond after config change');
    });
  });

  // ── Extended: Custom request handlers ─────────────────────────────────

  describe('Custom request handlers', () => {
    it('ecl/evaluateExpression should return error shape for empty expression', async () => {
      await openDocument(conn, 'file:///test-eval-empty.ecl', '');

      try {
        await conn.sendRequest('ecl/evaluateExpression', {
          uri: 'file:///test-eval-empty.ecl',
          expression: '',
          limit: 10,
        });
        assert.fail('should throw for empty expression');
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        assert.ok(msg.includes('No ECL expression'), 'error should mention no expression found');
      }
    });

    it('ecl/evaluateExpression should accept valid expression without crashing', async () => {
      await openDocument(conn, 'file:///test-eval-valid.ecl', '<< 404684003');

      // This will call FHIR which may timeout — we just want to verify the request shape is accepted
      try {
        await Promise.race([
          conn.sendRequest('ecl/evaluateExpression', {
            uri: 'file:///test-eval-valid.ecl',
            expression: '<< 404684003',
            limit: 5,
          }),
          new Promise((_, reject) =>
            setTimeout(() => {
              reject(new Error('timeout'));
            }, 5000),
          ),
        ]);
      } catch (error: unknown) {
        // Timeout or FHIR error is fine — we verified the server accepted the request shape
        const msg = error instanceof Error ? error.message : String(error);
        assert.ok(
          msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('abort') || msg.includes('fetch'),
          `unexpected error: ${msg}`,
        );
      }
    });

    it('ecl/searchConcept should accept request without crashing', async () => {
      try {
        await Promise.race([
          conn.sendRequest('ecl/searchConcept', { query: 'heart' }),
          new Promise((_, reject) =>
            setTimeout(() => {
              reject(new Error('timeout'));
            }, 5000),
          ),
        ]);
      } catch (error: unknown) {
        // FHIR timeout is acceptable
        const msg = error instanceof Error ? error.message : String(error);
        assert.ok(
          msg.includes('timeout') ||
            msg.includes('ETIMEDOUT') ||
            msg.includes('abort') ||
            msg.includes('fetch') ||
            msg.includes('Search failed'),
          `unexpected error: ${msg}`,
        );
      }
    });

    it('ecl/getSnomedEditions should accept request without crashing', async () => {
      try {
        const result = await Promise.race([
          conn.sendRequest('ecl/getSnomedEditions'),
          new Promise((_, reject) =>
            setTimeout(() => {
              reject(new Error('timeout'));
            }, 5000),
          ),
        ]);
        // If it returns, it should have editions array
        assert.ok((result as { editions: unknown[] }).editions, 'should have editions array');
      } catch (error: unknown) {
        // FHIR timeout is acceptable
        const msg = error instanceof Error ? error.message : String(error);
        assert.ok(
          msg.includes('timeout') ||
            msg.includes('ETIMEDOUT') ||
            msg.includes('abort') ||
            msg.includes('fetch') ||
            msg.includes('failed'),
          `unexpected error: ${msg}`,
        );
      }
    });
  });

  // ── Extended: Range formatting ────────────────────────────────────────

  describe('Range formatting', () => {
    it('should format only the selected range', async () => {
      const text = '<<404684003|Clinical finding|\n<<19829001|Disease|';
      await openDocument(conn, 'file:///test-range-fmt.ecl', text);

      const result = await conn.sendRequest('textDocument/rangeFormatting', {
        textDocument: { uri: 'file:///test-range-fmt.ecl' },
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 29 },
        },
        options: { tabSize: 2, insertSpaces: true },
      });

      const edits = result as { range: { start: { line: number } }; newText: string }[];
      assert.ok(edits.length > 0, 'should return formatting edits');
      // Edits should only affect line 0 range
      for (const edit of edits) {
        assert.ok(edit.range.start.line <= 0, 'edits should only affect the selected range');
      }
    });
  });

  // ── Extended: Document lifecycle ──────────────────────────────────────

  describe('Document lifecycle', () => {
    it('should clear diagnostics when document is closed', async () => {
      const closedDiagPromise = new Promise<{ uri: string; diagnostics: unknown[] }>((resolve) => {
        conn.onNotification('textDocument/publishDiagnostics', (params) => {
          const p = params as { uri: string; diagnostics: unknown[] };
          if (p.uri === 'file:///test-close.ecl' && p.diagnostics.length === 0) {
            resolve(p);
          }
        });
      });

      await openDocument(conn, 'file:///test-close.ecl', '< 404684003 AND AND');

      // Wait for initial diagnostics
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Close the document
      await conn.sendNotification('textDocument/didClose', {
        textDocument: { uri: 'file:///test-close.ecl' },
      });

      const result = await Promise.race([
        closedDiagPromise,
        new Promise<null>((resolve) =>
          setTimeout(() => {
            resolve(null);
          }, 3000),
        ),
      ]);

      assert.ok(result, 'should receive empty diagnostics after close');
      assert.strictEqual(result.diagnostics.length, 0, 'diagnostics should be cleared');
    });

    it('should handle multiple documents simultaneously', async () => {
      await openDocument(conn, 'file:///test-multi-a.ecl', '<< 404684003');
      await openDocument(conn, 'file:///test-multi-b.ecl', '< 19829001');

      // Both should get completions
      const resultA = await conn.sendRequest('textDocument/completion', {
        textDocument: { uri: 'file:///test-multi-a.ecl' },
        position: { line: 0, character: 12 },
      });
      const resultB = await conn.sendRequest('textDocument/completion', {
        textDocument: { uri: 'file:///test-multi-b.ecl' },
        position: { line: 0, character: 10 },
      });

      const itemsA = Array.isArray(resultA) ? resultA : (resultA as { items: unknown[] }).items;
      const itemsB = Array.isArray(resultB) ? resultB : (resultB as { items: unknown[] }).items;
      assert.ok(itemsA.length > 0, 'document A should return completions');
      assert.ok(itemsB.length > 0, 'document B should return completions');
    });
  });

  // ── Extended: Edge cases ──────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle empty document without errors', async () => {
      let lastDiagnostics: unknown[] = [];
      conn.onNotification('textDocument/publishDiagnostics', (params) => {
        const p = params as { uri: string; diagnostics: unknown[] };
        if (p.uri === 'file:///test-empty.ecl') {
          lastDiagnostics = p.diagnostics;
        }
      });

      await openDocument(conn, 'file:///test-empty.ecl', '');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const errors = (lastDiagnostics as { severity: number }[]).filter((d) => d.severity === 1);
      assert.strictEqual(errors.length, 0, 'empty document should have no errors');
    });

    it('should handle document with only comments', async () => {
      let lastDiagnostics: unknown[] = [];
      conn.onNotification('textDocument/publishDiagnostics', (params) => {
        const p = params as { uri: string; diagnostics: unknown[] };
        if (p.uri === 'file:///test-comments-only.ecl') {
          lastDiagnostics = p.diagnostics;
        }
      });

      await openDocument(conn, 'file:///test-comments-only.ecl', '/* Just a comment block */');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Should have no syntax errors (comment-only is valid)
      const errors = (lastDiagnostics as { severity: number }[]).filter((d) => d.severity === 1);
      assert.strictEqual(errors.length, 0, 'comment-only document should have no syntax errors');
    });

    it('should handle very long single-line expression', async () => {
      // Build a long expression: << 404684003 AND << 404684003 AND ... (repeated many times)
      const longExpr = Array.from({ length: 50 }, () => '<< 404684003').join(' AND ');
      await openDocument(conn, 'file:///test-long.ecl', longExpr);

      const result = await conn.sendRequest('textDocument/semanticTokens/full', {
        textDocument: { uri: 'file:///test-long.ecl' },
      });

      const tokens = result as { data: number[] } | null;
      assert.ok(tokens, 'should return semantic tokens for long expression');
      assert.ok(tokens.data.length > 0, 'should have token data');
    });
  });
});
