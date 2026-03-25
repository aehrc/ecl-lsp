// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Embedded ECL support — VSCode integration layer.
// Pure extraction and mapping logic lives in embedded-core.ts (zero vscode dependency).
// This module wraps it with vscode.Range, LanguageClient lifecycle, and LSP middleware.

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import {
  type RawFragment,
  type Position as CorePosition,
  type Range as CoreRange,
  extractFshFragments as extractFshRaw,
  extractFhirJsonFragments as extractFhirJsonRaw,
  extractFhirXmlFragments as extractFhirXmlRaw,
  extractCommentTriggerFragments as extractCommentTriggerRaw,
  hostToVirtualPos,
  virtualToHostRange as virtualToHostRangeCore,
} from './embedded-core';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EclFragment {
  range: vscode.Range;
  text: string;
  index: number;
  charMap?: number[];
}

export type FragmentExtractor = (text: string) => EclFragment[];

// ── Adapters: RawFragment ↔ EclFragment ──────────────────────────────────────

function rawToEcl(raw: RawFragment): EclFragment {
  return {
    range: new vscode.Range(
      raw.range.start.line,
      raw.range.start.character,
      raw.range.end.line,
      raw.range.end.character,
    ),
    text: raw.text,
    index: raw.index,
    charMap: raw.charMap,
  };
}

function coreRange(r: CoreRange): vscode.Range {
  return new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
}

// ── Exported extractors (wrap pure functions with vscode.Range) ──────────────

export function extractFshFragments(text: string): EclFragment[] {
  return extractFshRaw(text).map(rawToEcl);
}

export function extractFhirJsonFragments(text: string): EclFragment[] {
  return extractFhirJsonRaw(text).map(rawToEcl);
}

export function extractFhirXmlFragments(text: string): EclFragment[] {
  return extractFhirXmlRaw(text).map(rawToEcl);
}

export function extractCommentTriggerFragments(text: string): EclFragment[] {
  return extractCommentTriggerRaw(text).map(rawToEcl);
}

// ── Virtual URI helpers (vscode.Uri wrappers) ────────────────────────────────

function makeVirtualUri(hostUri: vscode.Uri, index: number): string {
  return vscode.Uri.from({
    scheme: 'ecl-embedded',
    authority: hostUri.scheme,
    path: `${hostUri.path}/fragment/${index}`,
  }).toString();
}

function parseVirtualUri(uri: vscode.Uri): { hostUri: vscode.Uri; index: number } | null {
  if (uri.scheme !== 'ecl-embedded') return null;
  const match = /^(.+)\/fragment\/(\d+)$/.exec(uri.path);
  if (!match) return null;
  return {
    hostUri: vscode.Uri.from({ scheme: uri.authority, path: match[1] }),
    index: parseInt(match[2], 10),
  };
}

// ── Position mapping wrappers ────────────────────────────────────────────────

function hostToVirtual(fragment: EclFragment, pos: vscode.Position): CorePosition {
  return hostToVirtualPos(
    { line: fragment.range.start.line, character: fragment.range.start.character },
    { line: pos.line, character: pos.character },
    fragment.charMap,
  );
}

function virtualToHost(fragment: EclFragment, r: CoreRange): vscode.Range {
  const mapped = virtualToHostRangeCore(
    { line: fragment.range.start.line, character: fragment.range.start.character },
    r,
    fragment.charMap,
  );
  return coreRange(mapped);
}

// ── Embedded ECL Manager ─────────────────────────────────────────────────────

export class EmbeddedEclManager implements vscode.Disposable {
  private fragmentsByHost = new Map<string, EclFragment[]>();
  private virtualVersions = new Map<string, number>();
  private virtualTexts = new Map<string, string>();
  private fragmentDiagnostics = new Map<string, vscode.Diagnostic[]>();

  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];
  private client: LanguageClient | null = null;
  private extractors = new Map<string, FragmentExtractor>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private static readonly DEBOUNCE_MS = 300;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('ecl-embedded');
  }

  registerExtractor(key: string, extractor: FragmentExtractor): void {
    this.extractors.set(key, extractor);
  }

  setClient(client: LanguageClient): void {
    this.client = client;
    for (const doc of vscode.workspace.textDocuments) {
      void this.processDocument(doc);
    }
  }

  activate(): void {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => void this.processDocument(doc)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        this.debouncedProcess(e.document);
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => void this.onDocumentClosed(doc)),
      this.diagnosticCollection,
    );
    for (const doc of vscode.workspace.textDocuments) {
      void this.processDocument(doc);
    }
  }

  private debouncedProcess(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key);
        void this.processDocument(doc);
      }, EmbeddedEclManager.DEBOUNCE_MS),
    );
  }

  // ── Document lifecycle ─────────────────────────────────────────────────────

  private getExtractor(doc: vscode.TextDocument): FragmentExtractor | undefined {
    const byLang = this.extractors.get(doc.languageId);
    if (byLang) return byLang;
    const ext = doc.uri.path.split('.').pop()?.toLowerCase();
    return ext ? this.extractors.get(`.${ext}`) : undefined;
  }

  private async processDocument(doc: vscode.TextDocument): Promise<void> {
    const extractor = this.getExtractor(doc);
    if (!extractor) return;

    const newFragments = extractor(doc.getText());
    const hostKey = doc.uri.toString();
    const oldFragments = this.fragmentsByHost.get(hostKey) ?? [];
    this.fragmentsByHost.set(hostKey, newFragments);

    if (!this.client) return;

    const newIndices = new Set(newFragments.map((f) => f.index));
    let removedAny = false;
    for (const old of oldFragments) {
      if (!newIndices.has(old.index)) {
        await this.closeVirtualDoc(makeVirtualUri(doc.uri, old.index));
        removedAny = true;
      }
    }
    if (removedAny) {
      this.rebuildHostDiagnostics(hostKey, doc.uri);
    }

    for (const fragment of newFragments) {
      const vUri = makeVirtualUri(doc.uri, fragment.index);
      const oldText = this.virtualTexts.get(vUri);
      if (oldText === fragment.text) continue;

      try {
        if (oldText === undefined) {
          await this.client.sendNotification('textDocument/didOpen', {
            textDocument: { uri: vUri, languageId: 'ecl', version: 1, text: fragment.text },
          });
          this.virtualVersions.set(vUri, 1);
        } else {
          const version = (this.virtualVersions.get(vUri) ?? 0) + 1;
          await this.client.sendNotification('textDocument/didChange', {
            textDocument: { uri: vUri, version },
            contentChanges: [{ text: fragment.text }],
          });
          this.virtualVersions.set(vUri, version);
        }
        this.virtualTexts.set(vUri, fragment.text);
      } catch {
        // Client not running
      }
    }
  }

  private async onDocumentClosed(doc: vscode.TextDocument): Promise<void> {
    const hostKey = doc.uri.toString();
    const timer = this.debounceTimers.get(hostKey);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(hostKey);
    }
    const fragments = this.fragmentsByHost.get(hostKey);
    if (!fragments) return;
    for (const fragment of fragments) {
      await this.closeVirtualDoc(makeVirtualUri(doc.uri, fragment.index));
    }
    this.fragmentsByHost.delete(hostKey);
    this.diagnosticCollection.delete(doc.uri);
  }

  private async closeVirtualDoc(vUri: string): Promise<void> {
    if (!this.virtualVersions.has(vUri) || !this.client) return;
    try {
      await this.client.sendNotification('textDocument/didClose', { textDocument: { uri: vUri } });
    } catch {
      // Client not running
    }
    this.virtualVersions.delete(vUri);
    this.virtualTexts.delete(vUri);
    this.fragmentDiagnostics.delete(vUri);
  }

  // ── Diagnostics ────────────────────────────────────────────────────────────

  handleDiagnostics(uri: vscode.Uri, diagnostics: vscode.Diagnostic[]): boolean {
    const parsed = parseVirtualUri(uri);
    if (!parsed) return false;

    const hostKey = parsed.hostUri.toString();
    const fragments = this.fragmentsByHost.get(hostKey);
    if (!fragments) return true;

    const fragment = fragments.find((f) => f.index === parsed.index);
    if (!fragment) return true;

    const mapped = diagnostics.map((d) => {
      const range = virtualToHost(fragment, d.range);
      const diag = new vscode.Diagnostic(range, d.message, d.severity);
      diag.source = d.source ?? 'ecl';
      if (d.code !== undefined) diag.code = d.code;
      return diag;
    });

    const vUri = makeVirtualUri(parsed.hostUri, parsed.index);
    this.fragmentDiagnostics.set(vUri, mapped);
    this.rebuildHostDiagnostics(hostKey, parsed.hostUri);
    return true;
  }

  private rebuildHostDiagnostics(hostKey: string, hostUri: vscode.Uri): void {
    const fragments = this.fragmentsByHost.get(hostKey) ?? [];
    const allDiags: vscode.Diagnostic[] = [];
    for (const fragment of fragments) {
      const vUri = makeVirtualUri(hostUri, fragment.index);
      const diags = this.fragmentDiagnostics.get(vUri);
      if (diags) allDiags.push(...diags);
    }
    this.diagnosticCollection.set(hostUri, allDiags);
  }

  // ── Fragment lookup ────────────────────────────────────────────────────────

  getFragmentAtPosition(hostUri: vscode.Uri, pos: vscode.Position): EclFragment | undefined {
    const fragments = this.fragmentsByHost.get(hostUri.toString());
    if (!fragments) return undefined;
    return fragments.find((f) => f.range.start.isBeforeOrEqual(pos) && f.range.end.isAfter(pos));
  }

  /** Returns all ECL fragments in a host document. */
  getFragments(hostUri: vscode.Uri): EclFragment[] {
    return this.fragmentsByHost.get(hostUri.toString()) ?? [];
  }

  // ── Code Lens ──────────────────────────────────────────────────────────────

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const fragments = this.getFragments(doc.uri);
    return fragments.map((f) => {
      const range = new vscode.Range(f.range.start.line, 0, f.range.start.line, 0);
      return new vscode.CodeLens(range, {
        title: 'Evaluate',
        command: 'ecl.evaluateEmbeddedExpression',
        arguments: [doc.uri, f.index],
      });
    });
  }

  // ── Completions ────────────────────────────────────────────────────────────

  async provideCompletions(
    doc: vscode.TextDocument,
    pos: vscode.Position,
  ): Promise<vscode.CompletionItem[] | undefined> {
    const fragment = this.getFragmentAtPosition(doc.uri, pos);
    if (!fragment || !this.client) return undefined;

    try {
      const result = await this.client.sendRequest<LspCompletionResult | null>('textDocument/completion', {
        textDocument: { uri: makeVirtualUri(doc.uri, fragment.index) },
        position: hostToVirtual(fragment, pos),
      });
      if (!result) return undefined;
      const items: LspCompletionItem[] = Array.isArray(result) ? result : result.items;
      return items.map((item) => this.convertCompletionItem(item, fragment));
    } catch {
      return undefined;
    }
  }

  // ── Hover ──────────────────────────────────────────────────────────────────

  async provideHover(doc: vscode.TextDocument, pos: vscode.Position): Promise<vscode.Hover | undefined> {
    const fragment = this.getFragmentAtPosition(doc.uri, pos);
    if (!fragment || !this.client) return undefined;

    try {
      const result = await this.client.sendRequest<LspHoverResult | null>('textDocument/hover', {
        textDocument: { uri: makeVirtualUri(doc.uri, fragment.index) },
        position: hostToVirtual(fragment, pos),
      });
      if (!result?.contents) return undefined;
      const contents = convertHoverContents(result.contents);
      const range = result.range ? virtualToHost(fragment, result.range) : undefined;
      return new vscode.Hover(contents, range);
    } catch {
      return undefined;
    }
  }

  // ── Provider registration ──────────────────────────────────────────────────

  registerProviders(selectors: vscode.DocumentFilter[]): void {
    this.disposables.push(
      vscode.languages.registerCompletionItemProvider(
        selectors,
        { provideCompletionItems: (doc, pos) => this.provideCompletions(doc, pos) },
        '<',
        '>',
        '^',
        ':',
        '=',
        '{',
        ' ',
      ),
      vscode.languages.registerHoverProvider(selectors, {
        provideHover: (doc, pos) => this.provideHover(doc, pos),
      }),
      vscode.languages.registerCodeLensProvider(selectors, {
        provideCodeLenses: (doc) => this.provideCodeLenses(doc),
      }),
    );
  }

  // ── LSP type converters ────────────────────────────────────────────────────
  // LSP CompletionItemKind is 1-indexed, VS Code is 0-indexed.
  // The orderings happen to align (Text=1/0, Method=2/1, etc.) so subtracting 1 is correct.

  private convertCompletionItem(item: LspCompletionItem, fragment: EclFragment): vscode.CompletionItem {
    const label = typeof item.label === 'string' ? item.label : item.label.label;
    const kind: vscode.CompletionItemKind | undefined = item.kind == null ? undefined : item.kind - 1;
    const ci = new vscode.CompletionItem(label, kind);

    if (item.detail) ci.detail = item.detail;
    if (item.documentation) {
      ci.documentation =
        typeof item.documentation === 'string'
          ? item.documentation
          : new vscode.MarkdownString(item.documentation.value);
    }
    if (item.filterText) ci.filterText = item.filterText;
    if (item.sortText) ci.sortText = item.sortText;

    const newText = item.textEdit?.newText ?? item.insertText ?? label;
    if (item.insertTextFormat === 2) {
      ci.insertText = new vscode.SnippetString(newText);
    } else {
      ci.insertText = newText;
    }

    if (item.textEdit?.range) {
      ci.range = virtualToHost(fragment, item.textEdit.range);
    }

    if (item.command) ci.command = item.command;
    return ci;
  }

  // ── Dispose ────────────────────────────────────────────────────────────────

  dispose(): void {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    for (const d of this.disposables) d.dispose();
  }
}

// ── LSP response types ───────────────────────────────────────────────────────

interface LspMarkupContent {
  kind: string;
  value: string;
}
interface LspTextEdit {
  range: CoreRange;
  newText: string;
}
interface LspCommand {
  title: string;
  command: string;
  arguments?: unknown[];
}
interface LspCompletionItemLabel {
  label: string;
  detail?: string;
  description?: string;
}

interface LspCompletionItem {
  label: string | LspCompletionItemLabel;
  kind?: number;
  detail?: string;
  documentation?: string | LspMarkupContent;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: number;
  textEdit?: LspTextEdit;
  command?: LspCommand;
}

type LspCompletionResult = LspCompletionItem[] | { items: LspCompletionItem[]; isIncomplete?: boolean };
type LspHoverContents = string | LspMarkupContent | (string | LspMarkupContent)[];
interface LspHoverResult {
  contents: LspHoverContents;
  range?: CoreRange;
}

function convertHoverContents(contents: LspHoverContents): vscode.MarkdownString[] {
  if (typeof contents === 'string') return [new vscode.MarkdownString(contents)];
  if (Array.isArray(contents))
    return contents.map((c) => new vscode.MarkdownString(typeof c === 'string' ? c : c.value));
  return [new vscode.MarkdownString(contents.value)];
}
