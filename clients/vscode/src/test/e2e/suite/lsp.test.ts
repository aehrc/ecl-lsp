// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * Poll a condition until it becomes true or the timeout is reached.
 */
async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 30_000,
  intervalMs = 250,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

function workspacePath(file: string): vscode.Uri {
  const wsFolder = vscode.workspace.workspaceFolders?.[0];
  if (!wsFolder) throw new Error('No workspace folder');
  return vscode.Uri.joinPath(wsFolder.uri, file);
}

async function openDocument(file: string): Promise<vscode.TextDocument> {
  const uri = workspacePath(file);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
  return doc;
}

suite('ECL VSCode Extension E2E', () => {
  suiteSetup(async function () {
    this.timeout(60_000);
    // Open an .ecl file to trigger extension activation
    await openDocument('valid.ecl');
    // Wait for the extension to activate and the LSP server to start
    const ext = vscode.extensions.getExtension('ecl-lsp.ecl-lsp-client');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
    // Give the LSP server time to initialize
    await new Promise((r) => setTimeout(r, 5_000));
  });

  test('Extension activates on .ecl file open', async () => {
    const ext = vscode.extensions.getExtension('ecl-lsp.ecl-lsp-client');
    assert.ok(ext, 'Extension should be found');
    assert.ok(ext.isActive, 'Extension should be active');
  });

  test('Diagnostics appear for invalid ECL', async function () {
    this.timeout(30_000);
    const doc = await openDocument('invalid.ecl');

    await waitFor(() => {
      const diags = vscode.languages.getDiagnostics(doc.uri);
      return diags.length > 0;
    });

    const diags = vscode.languages.getDiagnostics(doc.uri);
    assert.ok(diags.length > 0, `Expected diagnostics for invalid ECL, got ${diags.length}`);
    assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Error, 'First diagnostic should be an error');
  });

  test('No diagnostics for valid ECL', async function () {
    this.timeout(30_000);
    const doc = await openDocument('valid.ecl');

    // Wait a bit for the server to process, then verify no errors
    await new Promise((r) => setTimeout(r, 3_000));

    const diags = vscode.languages.getDiagnostics(doc.uri);
    const errors = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(errors.length, 0, `Expected no syntax errors for valid ECL, got ${errors.length}`);
  });

  test('Completion includes ECL operators', async function () {
    this.timeout(30_000);
    const doc = await openDocument('valid.ecl');
    // Position at end of line (after the expression) — trigger completion
    const position = new vscode.Position(0, doc.lineAt(0).text.length);

    // Use the built-in completion provider
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      position,
    );

    assert.ok(completions, 'Should receive completion list');
    const labels = completions.items.map((item) => (typeof item.label === 'string' ? item.label : item.label.label));
    const hasOperator = labels.some((l) => /\b(AND|OR|MINUS)\b/i.test(l));
    assert.ok(hasOperator, `Expected operator completions (AND/OR/MINUS), got: ${labels.slice(0, 10).join(', ')}`);
  });

  test('Hover returns content for operator', async function () {
    this.timeout(30_000);
    const doc = await openDocument('valid.ecl');
    // Position on the '<' operator (column 0)
    const position = new vscode.Position(0, 0);

    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      position,
    );

    assert.ok(hovers, 'Should receive hover result');
    assert.ok(hovers.length > 0, 'Should have at least one hover');
    const content = hovers[0].contents
      .map((c) => (typeof c === 'string' ? c : (c as vscode.MarkdownString).value))
      .join('\n');
    assert.ok(content.length > 0, 'Hover content should not be empty');
  });

  test('Formatting reformats document', async function () {
    this.timeout(30_000);
    // Create a temp document with poorly formatted ECL
    const uri = workspacePath('format-test.ecl');
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(uri, encoder.encode('<<404684003|Clinical finding|'));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);

    // Wait for server to recognize the new document
    await new Promise((r) => setTimeout(r, 2_000));

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      'vscode.executeFormatDocumentProvider',
      doc.uri,
      { tabSize: 2, insertSpaces: true },
    );

    assert.ok(edits, 'Should receive formatting edits');
    assert.ok(edits.length > 0, 'Formatting should return edits for poorly formatted ECL');
    const formatted = edits[0].newText;
    assert.ok(
      formatted.includes('|') && formatted.includes('404684003'),
      'Formatted text should contain the concept ID and pipes',
    );

    // Clean up
    await vscode.workspace.fs.delete(uri);
  });
});
