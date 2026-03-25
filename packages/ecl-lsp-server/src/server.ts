// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionItem,
  CompletionItemKind,
  CompletionList,
  InsertTextFormat,
  CompletionParams,
  Hover,
  MarkupKind,
  HoverParams,
  CodeActionParams,
  CodeAction,
  CodeActionKind,
  TextEdit,
  CodeLens,
  CodeLensParams,
  SemanticTokensBuilder,
  Connection,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

// ecl-core imports — all ECL intelligence comes from the core library
import {
  parseECL,
  extractConceptIds,
  groupIntoExpressions,
  FhirTerminologyService,
  formatDocument,
  expandToExpressionBoundaries,
  getExpressionsInRange,
  formatRangeExpressions,
  getRefactoringActions,
  REFACTORING_RESOLVE_KIND,
  resolveAddDisplayTerms,
  resolveUnifiedSimplify,
  getCompletionItemsWithSearch,
  clearFilterCache,
  validateSemantics,
  refineParseError,
  isValidDescriptionId,
  isValidSnomedId,
  isValidConceptId,
  validateIndentSize,
  validateIndentStyle,
  validateMaxLineLength,
  validateBoolean,
  defaultFormattingOptions,
  getOperatorHoverDoc,
} from '@aehrc/ecl-core';
import type {
  ITerminologyService,
  EvaluationResponse,
  CoreCodeAction,
  CoreCompletionItem,
  CoreRange,
  FormattingOptions,
  ParseError,
} from '@aehrc/ecl-core';

// LSP-specific modules (not in ecl-core)
import { buildCodeLenses } from './code-lens';
import { tokenLegend, computeSemanticTokens } from './semantic-tokens';

// ── Type mapping: Core types to LSP types ───────────────────────────────

const COMPLETION_KIND_MAP: Record<string, CompletionItemKind> = {
  keyword: CompletionItemKind.Keyword,
  operator: CompletionItemKind.Operator,
  snippet: CompletionItemKind.Snippet,
  value: CompletionItemKind.Value,
  concept: CompletionItemKind.Reference,
  property: CompletionItemKind.Property,
  text: CompletionItemKind.Text,
  function: CompletionItemKind.Function,
};

function toLspCompletionItem(core: CoreCompletionItem): CompletionItem {
  const item: CompletionItem = {
    label: core.label,
    kind: COMPLETION_KIND_MAP[core.kind] ?? CompletionItemKind.Text,
  };
  if (core.detail !== undefined) item.detail = core.detail;
  if (core.documentation !== undefined) item.documentation = core.documentation;
  if (core.insertText !== undefined) item.insertText = core.insertText;
  if (core.insertTextFormat === 'snippet') {
    item.insertTextFormat = InsertTextFormat.Snippet;
  } else if (core.insertTextFormat === 'plainText') {
    item.insertTextFormat = InsertTextFormat.PlainText;
  }
  if (core.textEdit) {
    item.textEdit = TextEdit.replace(core.textEdit.range, core.textEdit.newText);
  }
  if (core.sortText !== undefined) item.sortText = core.sortText;
  if (core.filterText !== undefined) item.filterText = core.filterText;
  if (core.command) item.command = core.command;
  return item;
}

function toLspCodeAction(core: CoreCodeAction, documentUri: string): CodeAction {
  const action: CodeAction = {
    title: core.title,
    kind: core.kind === 'quickfix' ? CodeActionKind.QuickFix : CodeActionKind.Refactor,
  };
  if (core.edits && core.edits.length > 0) {
    const uri = core.documentUri ?? documentUri;
    action.edit = {
      changes: {
        [uri]: core.edits.map((e) => TextEdit.replace(e.range, e.newText)),
      },
    };
  }
  if (core.data !== undefined) {
    action.data = core.data;
  }
  return action;
}

function lspRangeToCoreRange(range: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}): CoreRange {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}

// ── LSP-specific: read formatting config from workspace ─────────────────

async function getFormattingOptions(conn: Connection): Promise<FormattingOptions> {
  // Try workspace.getConfiguration, fall back to initializationOptions.formatting
  let config: Record<string, unknown> | null = null;
  try {
    const wsConfig = await conn.workspace.getConfiguration({ section: 'ecl.formatting' });
    if (wsConfig && typeof wsConfig === 'object' && Object.keys(wsConfig).length > 0) {
      config = wsConfig as Record<string, unknown>;
    }
  } catch {
    // workspace.getConfiguration not available
  }

  // Fall back to initializationOptions
  if (!config && cachedInitOptions.formatting && typeof cachedInitOptions.formatting === 'object') {
    config = cachedInitOptions.formatting as Record<string, unknown>;
  }

  if (!config) return defaultFormattingOptions;

  return {
    indentSize: validateIndentSize(config.indentSize),
    indentStyle: validateIndentStyle(config.indentStyle),
    spaceAroundOperators: validateBoolean(config.spaceAroundOperators, defaultFormattingOptions.spaceAroundOperators),
    maxLineLength: validateMaxLineLength(config.maxLineLength),
    alignTerms: validateBoolean(config.alignTerms, defaultFormattingOptions.alignTerms),
    wrapComments: validateBoolean(config.wrapComments, defaultFormattingOptions.wrapComments),
    breakOnOperators: validateBoolean(config.breakOnOperators, defaultFormattingOptions.breakOnOperators),
    breakOnRefinementComma: validateBoolean(
      config.breakOnRefinementComma,
      defaultFormattingOptions.breakOnRefinementComma,
    ),
    breakAfterColon: validateBoolean(config.breakAfterColon, defaultFormattingOptions.breakAfterColon),
  };
}

// ── LSP server setup ────────────────────────────────────────────────────

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Terminology service — recreated when configuration changes
let terminologyService: ITerminologyService = new FhirTerminologyService();

// Evaluation cache: documentUri -> expressionText -> resultCount
const evaluationCache = new Map<string, Map<string, number>>();

// Semantic validation enabled flag (default: true)
let semanticValidationEnabled = true;

// Human-readable label for the active SNOMED edition/version
let snomedEditionLabel = 'server default';

// Cached initializationOptions from the client (Eclipse sends config here)
let cachedInitOptions: Record<string, unknown> = {};
let clientSupportsCodeLensRefresh = false;
let clientUserAgent: string | undefined;

/**
 * Extract terminology config from a source object, handling both VSCode-style
 * (workspace.getConfiguration section keys) and Eclipse-style (initializationOptions flat keys).
 */
function extractTerminologyConfig(config: Record<string, unknown> | null | undefined): {
  serverUrl: string | undefined;
  timeout: number | undefined;
  snomedVersion: string | undefined;
} {
  if (!config) return { serverUrl: undefined, timeout: undefined, snomedVersion: undefined };
  // VSCode: { serverUrl, timeout, snomedVersion } from section 'ecl.terminology'
  // Eclipse initializationOptions: { fhirTerminologyServerUrl, timeout, snomedVersion }
  const rawUrl = config.serverUrl ?? config.fhirTerminologyServerUrl;
  const serverUrl = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl.trim() : undefined;
  const rawTimeout = config.timeout;
  const timeout = typeof rawTimeout === 'number' && rawTimeout >= 500 ? rawTimeout : undefined;
  const rawVersion = config.snomedVersion;
  const snomedVersion = typeof rawVersion === 'string' && rawVersion.trim() ? rawVersion.trim() : undefined;
  return { serverUrl, timeout, snomedVersion };
}

function applyTerminologyConfig(cfg: { serverUrl?: string; timeout?: number; snomedVersion?: string }): void {
  snomedEditionLabel = cfg.snomedVersion ?? 'server default';
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
  connection.console.log(
    `Terminology server: ${cfg.serverUrl ?? 'https://tx.ontoserver.csiro.au/fhir'} (timeout: ${cfg.timeout ?? 2000}ms)` +
      (cfg.snomedVersion ? ` (SNOMED version: ${cfg.snomedVersion})` : ''),
  );
}

async function initTerminologyService(): Promise<void> {
  // Try workspace.getConfiguration first (VSCode, clients with configuration support)
  try {
    const config = await connection.workspace.getConfiguration({
      section: 'ecl.terminology',
    });
    const cfg = extractTerminologyConfig(config as Record<string, unknown>);
    // If workspace config returned actual values, use them
    if (cfg.serverUrl !== undefined || cfg.timeout !== undefined || cfg.snomedVersion !== undefined) {
      applyTerminologyConfig(cfg);
    } else {
      // Fall back to initializationOptions (Eclipse and other clients)
      const initCfg = extractTerminologyConfig(cachedInitOptions);
      applyTerminologyConfig(initCfg);
    }
  } catch {
    // workspace.getConfiguration not supported — use initializationOptions
    connection.console.log('workspace.getConfiguration not available, using initializationOptions');
    const initCfg = extractTerminologyConfig(cachedInitOptions);
    applyTerminologyConfig(initCfg);
  }

  // Read semantic validation setting
  try {
    const semanticConfig = await connection.workspace.getConfiguration({
      section: 'ecl.semanticValidation',
    });
    const scObj = semanticConfig as Record<string, unknown> | null;
    if (scObj?.enabled === undefined) {
      // Fall back to initializationOptions
      semanticValidationEnabled = cachedInitOptions.semanticValidation !== false;
    } else {
      semanticValidationEnabled = scObj.enabled !== false;
    }
    connection.console.log(`Semantic validation: ${semanticValidationEnabled ? 'enabled' : 'disabled'}`);
  } catch {
    semanticValidationEnabled = cachedInitOptions.semanticValidation !== false;
  }
}

// ── Initialize ──────────────────────────────────────────────────────────

connection.onInitialize((params: InitializeParams): InitializeResult => {
  // Track whether client supports workspace/codeLens/refresh (LSP 3.17+)
  clientSupportsCodeLensRefresh = !!params.capabilities.workspace?.codeLens?.refreshSupport;

  // Build User-Agent from client info for FHIR request identification
  const client = params.clientInfo;
  if (client) {
    const clientName = client.name === 'Visual Studio Code' ? 'VSCode' : client.name;
    const clientVersion = client.version ? `/${client.version}` : '';
    clientUserAgent = `ecl-lsp-server/1.0.0 (${clientName}${clientVersion})`;
  } else {
    clientUserAgent = 'ecl-lsp-server/1.0.0';
  }

  // Cache initializationOptions for Eclipse and other clients that send config here
  if (params.initializationOptions && typeof params.initializationOptions === 'object') {
    cachedInitOptions = params.initializationOptions as Record<string, unknown>;
    connection.console.log('Received initializationOptions: ' + JSON.stringify(Object.keys(cachedInitOptions)));
  }

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [' ', '(', '<', '>', '^', ':', '=', '{'],
      },
      hoverProvider: true,
      codeActionProvider: { resolveProvider: true },
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      codeLensProvider: { resolveProvider: false },
      semanticTokensProvider: {
        legend: tokenLegend,
        full: true,
        range: false,
      },
      executeCommandProvider: {
        commands: ['ecl.evaluateExpression'],
      },
    },
  };

  connection.console.log('Server capabilities: ' + JSON.stringify(result.capabilities, null, 2));
  return result;
});

connection.onInitialized(() => {
  connection.console.log('ECL Language Server initialized successfully');
  connection.console.log('Features: syntax highlighting, diagnostics, completion, hover, and quick fixes');
  void initTerminologyService();
});

// Recreate terminology service when configuration changes, then re-validate
connection.onDidChangeConfiguration(() => {
  clearFilterCache();
  void initTerminologyService().then(() => {
    for (const doc of documents.all()) {
      void validateDocument(doc);
    }
  });
});

// ── Debounced validation ────────────────────────────────────────────────

const semanticDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

documents.onDidChangeContent((change) => {
  evaluationCache.delete(change.document.uri);
  void validateDocumentSyntax(change.document);

  const uri = change.document.uri;
  const existing = semanticDebounceTimers.get(uri);
  if (existing) clearTimeout(existing);
  semanticDebounceTimers.set(
    uri,
    setTimeout(() => {
      semanticDebounceTimers.delete(uri);
      const doc = documents.get(uri);
      if (doc) void validateDocumentSemantics(doc);
    }, 500),
  );
});

// ── Syntax diagnostics collection ───────────────────────────────────────

// eslint-disable-next-line sonarjs/cognitive-complexity -- multi-phase diagnostics collection requires branching
function collectSyntaxDiagnostics(document: TextDocument) {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();
  const expressions = groupIntoExpressions(text);
  const lines = text.split('\n');

  // Check for non-standard // comments
  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) {
      const commentStart = line.indexOf('//');
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: lineIndex, character: commentStart },
          end: { line: lineIndex, character: commentStart + 2 },
        },
        message: 'Line comments (//) are not part of the ECL 2.2 standard. Use block comments /* ... */ instead.',
        source: 'ecl',
      });
    }
  });

  // Validate description IDs inside {{ D ... }} filter blocks
  const descFilterIdPattern = /\{\{\s*[Dd]\s[^}]*\bid\s*=\s*(\d{6,18})\b/g;
  let descIdMatch;
  while ((descIdMatch = descFilterIdPattern.exec(text)) !== null) {
    const sctid = descIdMatch[1];
    if (!isValidDescriptionId(sctid)) {
      const matchOffset = descIdMatch.index + descIdMatch[0].length - sctid.length;
      let charCount = 0;
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const lineEnd = charCount + lines[lineIdx].length + 1;
        if (matchOffset >= charCount && matchOffset < lineEnd) {
          const startChar = matchOffset - charCount;
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line: lineIdx, character: startChar },
              end: { line: lineIdx, character: startChar + sctid.length },
            },
            message: `Invalid description ID: ${sctid} is not a SNOMED CT description identifier (expected partition 01 or 11).`,
            source: 'ecl',
          });
          break;
        }
        charCount = lineEnd;
      }
    }
  }

  // Collect concept/semantic tasks while parsing
  const conceptValidationTasks: {
    expr: (typeof expressions)[0];
    concepts: ReturnType<typeof extractConceptIds>;
    lines: string[];
  }[] = [];

  const semanticValidationTasks: {
    ast: ReturnType<typeof parseECL>['ast'];
    sourceText: string;
    expr: (typeof expressions)[0];
  }[] = [];

  for (const expr of expressions) {
    const result = parseECL(expr.text);

    // Semantic safety: skip concept/semantic validation when syntax errors exist
    const hasErrors = result.errors.length > 0;

    result.errors.forEach((error: ParseError) => {
      const exprLineIndex = Math.max(0, error.line - 1);
      const docLineIndex = expr.lineOffsets[exprLineIndex] ?? expr.startLine;

      const refined = refineParseError({
        error,
        lines,
        docLineIndex,
        lineOffsets: expr.lineOffsets,
        startLine: expr.startLine,
      });

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: refined.docLineIndex, character: refined.startChar },
          end: { line: refined.docLineIndex, character: refined.endChar },
        },
        message: refined.message,
        source: 'ecl',
      });
    });

    for (const warning of result.warnings) {
      const warnExprLine = Math.max(0, warning.line - 1);
      const warnDocLine = expr.lineOffsets[warnExprLine] ?? expr.startLine;

      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: warnDocLine, character: warning.column },
          end: { line: warnDocLine, character: warning.column + warning.conflictOp.length },
        },
        message: warning.message,
        source: 'ecl',
      });
    }

    if (result.ast && !hasErrors) {
      const concepts = extractConceptIds(result.ast);
      if (concepts.length > 0) {
        conceptValidationTasks.push({ expr, concepts, lines });
      }
      if (semanticValidationEnabled) {
        semanticValidationTasks.push({ ast: result.ast, sourceText: expr.text, expr });
      }
    }
  }

  // Validate concept ID format (Verhoeff + partition check)
  for (const task of conceptValidationTasks) {
    task.concepts = task.concepts.filter((concept) => {
      if (!isValidSnomedId(concept.id)) {
        const conceptExprLine = Math.max(0, (concept.range.start.line || 1) - 1);
        const conceptDocLine = task.expr.lineOffsets[conceptExprLine] ?? task.expr.startLine;
        const docLine = task.lines[conceptDocLine] || '';
        const conceptIdx = docLine.indexOf(concept.id);
        const startChar = conceptIdx >= 0 ? conceptIdx : concept.range.start.column;
        const endChar = conceptIdx >= 0 ? conceptIdx + concept.id.length : startChar + concept.id.length;

        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: conceptDocLine, character: startChar },
            end: { line: conceptDocLine, character: endChar },
          },
          message: `Invalid SNOMED CT identifier: ${concept.id} has an invalid check digit or format.`,
          source: 'ecl',
        });
        return false;
      }

      if (!isValidConceptId(concept.id)) {
        const conceptExprLine = Math.max(0, (concept.range.start.line || 1) - 1);
        const conceptDocLine = task.expr.lineOffsets[conceptExprLine] ?? task.expr.startLine;
        const docLine = task.lines[conceptDocLine] || '';
        const conceptIdx = docLine.indexOf(concept.id);
        const startChar = conceptIdx >= 0 ? conceptIdx : concept.range.start.column;
        const endChar = conceptIdx >= 0 ? conceptIdx + concept.id.length : startChar + concept.id.length;
        const partitionId = concept.id.substring(concept.id.length - 3, concept.id.length - 1);

        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: conceptDocLine, character: startChar },
            end: { line: conceptDocLine, character: endChar },
          },
          message: `Invalid concept ID: ${concept.id} is not a SNOMED CT concept identifier (expected partition 00 or 10, found ${partitionId}).`,
          source: 'ecl',
        });
        return false;
      }

      return true;
    });
  }

  return { diagnostics, conceptValidationTasks, semanticValidationTasks };
}

// ── Syntax-only validation ──────────────────────────────────────────────

async function validateDocumentSyntax(document: TextDocument): Promise<void> {
  try {
    const { diagnostics } = collectSyntaxDiagnostics(document);

    if (diagnostics.length > 0) {
      const errorCount = diagnostics.filter((d) => d.severity === DiagnosticSeverity.Error).length;
      const warningCount = diagnostics.filter((d) => d.severity === DiagnosticSeverity.Warning).length;
      connection.console.log(`Found ${errorCount} syntax error(s) and ${warningCount} warning(s)`);
    }

    await connection.sendDiagnostics({ uri: document.uri, diagnostics });
  } catch (error: unknown) {
    connection.console.error(`Error validating document syntax: ${String(error)}`);
  }
}

// ── Semantic validation (FHIR-dependent) ────────────────────────────────

async function validateDocumentSemantics(document: TextDocument): Promise<void> {
  try {
    const { diagnostics, conceptValidationTasks, semanticValidationTasks } = collectSyntaxDiagnostics(document);

    // Validate all concepts across expressions in parallel
    await Promise.all(
      conceptValidationTasks.map(async ({ expr, concepts, lines: docLines }) => {
        try {
          const conceptIds = concepts.map((c) => c.id);
          const validationResults = await terminologyService.validateConcepts(conceptIds);

          for (const concept of concepts) {
            const info = validationResults.get(concept.id) ?? null;

            const conceptExprLine = Math.max(0, (concept.range.start.line || 1) - 1);
            const conceptDocLine = expr.lineOffsets[conceptExprLine] ?? expr.startLine;
            const docLine = docLines[conceptDocLine] || '';

            const conceptIdx = docLine.indexOf(concept.id);
            const startChar = conceptIdx >= 0 ? conceptIdx : concept.range.start.column;
            const endChar = conceptIdx >= 0 ? conceptIdx + concept.id.length : startChar + concept.id.length;

            if (info === null) {
              diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                  start: { line: conceptDocLine, character: startChar },
                  end: { line: conceptDocLine, character: endChar },
                },
                message: `Unknown concept ${concept.id} — not found in ${snomedEditionLabel}. Check the concept ID or try changing the SNOMED CT edition/version (ECL: Select SNOMED CT Edition).`,
                source: 'ecl',
              });
            } else if (!info.active) {
              const name = info.pt || info.fsn;
              const nameLabel = name ? ` |${name}|` : '';
              diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                  start: { line: conceptDocLine, character: startChar },
                  end: { line: conceptDocLine, character: endChar },
                },
                message: `Inactive concept ${concept.id}${nameLabel} — consider using an active replacement.`,
                source: 'ecl',
              });
            }
          }
        } catch (error) {
          connection.console.warn(
            `Failed to check inactive concepts in expression starting at line ${expr.startLine + 1}: ${String(error)}`,
          );
        }
      }),
    );

    // Run semantic validation in parallel
    if (semanticValidationTasks.length > 0) {
      const semanticResults = await Promise.all(
        semanticValidationTasks.map(async ({ ast, sourceText, expr }) => {
          try {
            if (!ast) return [];
            return await validateSemantics(ast, sourceText, terminologyService);
          } catch (error) {
            connection.console.warn(
              `Semantic validation failed for expression at line ${expr.startLine + 1}: ${String(error)}`,
            );
            return [];
          }
        }),
      );

      for (let i = 0; i < semanticResults.length; i++) {
        const semDiags = semanticResults[i];
        const expr = semanticValidationTasks[i].expr;

        for (const sd of semDiags) {
          const exprLine = Math.max(0, sd.range.start.line - 1);
          const docStartLine = expr.lineOffsets[exprLine] ?? expr.startLine;
          const exprEndLine = Math.max(0, sd.range.end.line - 1);
          const docEndLine = expr.lineOffsets[exprEndLine] ?? expr.startLine;

          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: { line: docStartLine, character: sd.range.start.column },
              end: { line: docEndLine, character: sd.range.end.column },
            },
            message: sd.message,
            source: 'ecl-semantic',
          });
        }
      }
    }

    if (diagnostics.length > 0) {
      const errorCount = diagnostics.filter((d) => d.severity === DiagnosticSeverity.Error).length;
      const warningCount = diagnostics.filter((d) => d.severity === DiagnosticSeverity.Warning).length;
      connection.console.log(`Found ${errorCount} syntax error(s) and ${warningCount} warning(s)`);
    }

    await connection.sendDiagnostics({ uri: document.uri, diagnostics });
  } catch (error: unknown) {
    connection.console.error(`Error validating document: ${String(error)}`);
  }
}

async function validateDocument(document: TextDocument): Promise<void> {
  await validateDocumentSemantics(document);
}

// ── Completion provider ─────────────────────────────────────────────────

connection.onCompletion(async (params: CompletionParams): Promise<CompletionList> => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return { isIncomplete: false, items: [] };
  }

  const expressions = groupIntoExpressions(document.getText());
  const cursorLine = params.position.line;
  const currentExpr = expressions.find((expr) => cursorLine >= expr.startLine && cursorLine <= expr.endLine);
  const inExpression = !!currentExpr;

  const textBeforeCursor = currentExpr
    ? document.getText({
        start: { line: currentExpr.startLine, character: 0 },
        end: params.position,
      })
    : '';

  const currentLine = document
    .getText({
      start: { line: params.position.line, character: 0 },
      end: { line: params.position.line + 1, character: 0 },
    })
    .replace(/\n$/, '');

  const coreItems = await getCompletionItemsWithSearch(
    inExpression,
    textBeforeCursor,
    currentLine,
    params.position.character,
    params.position.line,
    terminologyService,
  );

  // Return CompletionList with isIncomplete: true so clients (especially IntelliJ)
  // re-request completions as the user types, enabling concept search to trigger
  // once the query reaches 3+ characters.
  return { isIncomplete: true, items: coreItems.map(toLspCompletionItem) };
});

// ── Hover documentation ─────────────────────────────────────────────────

// Hover documentation now sourced from ecl-core knowledge module via getOperatorHoverDoc()

// eslint-disable-next-line sonarjs/cognitive-complexity -- hover provider with operator docs + FHIR concept lookup
connection.onHover(async (params: HoverParams): Promise<Hover | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const text = document.getText();
  const offset = document.offsetAt(params.position);

  // Get the word/operator at the cursor position
  const windowStart = Math.max(0, offset - 3);
  const windowEnd = Math.min(text.length, offset + 4);
  const window = text.substring(windowStart, windowEnd);
  const cursorInWindow = offset - windowStart;

  // Try multi-character operators
  const symbolOps = ['<<!', '>>!', '!!>', '!!<', '<<', '>>', '<!', '>!', '<', '>', ':', '^'];
  for (const op of symbolOps) {
    for (let start = cursorInWindow - op.length + 1; start <= cursorInWindow; start++) {
      if (start >= 0 && start + op.length <= window.length && window.substring(start, start + op.length) === op) {
        if (cursorInWindow >= start && cursorInWindow < start + op.length) {
          if ((op === '<' || op === '>') && start + 1 < window.length) {
            const next = window[start + 1];
            if (next === '<' || next === '>' || next === '!') continue;
          }
          if ((op === '<<' || op === '>>') && start + 2 < window.length && window[start + 2] === '!') continue;
          const opDoc = getOperatorHoverDoc(op);
          if (opDoc) {
            return {
              contents: { kind: MarkupKind.Markdown, value: opDoc },
            };
          }
        }
      }
    }
  }

  // Keyword operators (AND, OR, MINUS)
  const wordWindowStart = Math.max(0, offset - 10);
  const wordWindowText = text.substring(wordWindowStart, offset + 10);
  const wordRegex = /\b(AND|OR|MINUS)\b/gi;
  let wordMatch;
  while ((wordMatch = wordRegex.exec(wordWindowText)) !== null) {
    const matchAbsStart = wordWindowStart + wordMatch.index;
    const matchAbsEnd = matchAbsStart + wordMatch[1].length;
    if (offset >= matchAbsStart && offset < matchAbsEnd) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: getOperatorHoverDoc(wordMatch[1].toUpperCase()) ?? 'ECL operator',
        },
      };
    }
  }

  // Concept IDs (6-18 digit numbers)
  const surroundingText = text.substring(Math.max(0, offset - 20), offset + 20);
  const conceptIdPattern = /\b(\d{6,18})\b/g;
  let match;

  while ((match = conceptIdPattern.exec(surroundingText)) !== null) {
    const matchStart = Math.max(0, offset - 20) + match.index;
    const matchEnd = matchStart + match[1].length;

    if (offset >= matchStart && offset <= matchEnd) {
      const line = document.getText({
        start: document.positionAt(text.lastIndexOf('\n', matchStart) + 1),
        end: document.positionAt(matchStart),
      });
      const quoteCount = (line.match(/"/g) ?? []).length;
      if (quoteCount % 2 === 1) {
        break;
      }

      if (/\{\{\s*[Dd]\s[^}]*\bid\s*[!=]*=\s*$/.test(line)) {
        break;
      }

      const conceptId = match[1];

      try {
        const info = await terminologyService.getConceptInfo(conceptId);

        if (info) {
          const statusBadge = info.active ? 'Active' : 'INACTIVE';
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: [
                `**${info.fsn}**`,
                '',
                `**Preferred Term:** ${info.pt}`,
                '',
                `**Concept ID:** ${info.id}`,
                '',
                `**Status:** ${statusBadge}`,
              ].join('\n'),
            },
          };
        } else {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: [
                '**Unknown Concept**',
                '',
                `**Concept ID:** ${conceptId}`,
                '',
                'This concept was not found in the terminology server.',
                '',
                'This may indicate:',
                '- Invalid concept ID',
                '- Retired/deleted concept',
                '- Concept not in the loaded edition',
              ].join('\n'),
            },
          };
        }
      } catch (error) {
        connection.console.warn(`Failed to fetch concept info for ${conceptId}: ${String(error)}`);
      }

      break;
    }
  }

  return null;
});

// ── Code action provider ────────────────────────────────────────────────

connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const codeActions: CodeAction[] = [];
  const diagnostics = params.context.diagnostics;

  diagnostics.forEach((diagnostic) => {
    if (diagnostic.source !== 'ecl') {
      return;
    }

    const line = document.getText({
      start: { line: diagnostic.range.start.line, character: 0 },
      end: { line: diagnostic.range.start.line + 1, character: 0 },
    });

    if (/Duplicate AND/i.test(diagnostic.message)) {
      const fixedLine = line.replace(/\bAND\s+AND\b/i, 'AND');
      codeActions.push({
        title: 'Remove duplicate AND operator',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [params.textDocument.uri]: [
              TextEdit.replace(
                {
                  start: { line: diagnostic.range.start.line, character: 0 },
                  end: { line: diagnostic.range.start.line + 1, character: 0 },
                },
                fixedLine,
              ),
            ],
          },
        },
      });
    }

    if (/Duplicate OR/i.test(diagnostic.message)) {
      const fixedLine = line.replace(/\bOR\s+OR\b/i, 'OR');
      codeActions.push({
        title: 'Remove duplicate OR operator',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [params.textDocument.uri]: [
              TextEdit.replace(
                {
                  start: { line: diagnostic.range.start.line, character: 0 },
                  end: { line: diagnostic.range.start.line + 1, character: 0 },
                },
                fixedLine,
              ),
            ],
          },
        },
      });
    }

    if (diagnostic.message.includes('Duplicate MINUS')) {
      const fixedLine = line.replace(/\bMINUS\s+MINUS\b/, 'MINUS');
      codeActions.push({
        title: 'Remove duplicate MINUS operator',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [params.textDocument.uri]: [
              TextEdit.replace(
                {
                  start: { line: diagnostic.range.start.line, character: 0 },
                  end: { line: diagnostic.range.start.line + 1, character: 0 },
                },
                fixedLine,
              ),
            ],
          },
        },
      });
    }

    if (diagnostic.message.includes('Missing operator')) {
      // eslint-disable-next-line sonarjs/slow-regex -- bounded to single editor line
      const fixedLine = line.replace(/(<<?)\s+(\d+[^<]*)\s+(<<?)\s+(\d+)/, '$1 $2 AND $3 $4');
      codeActions.push({
        title: 'Insert AND operator',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [params.textDocument.uri]: [
              TextEdit.replace(
                {
                  start: { line: diagnostic.range.start.line, character: 0 },
                  end: { line: diagnostic.range.start.line + 1, character: 0 },
                },
                fixedLine,
              ),
            ],
          },
        },
      });
    }
  });

  // Add refactoring code actions — ecl-core returns CoreCodeAction[]
  const coreRange = lspRangeToCoreRange(params.range);
  const coreActions = getRefactoringActions(params.textDocument.uri, document.getText(), coreRange);
  codeActions.push(...coreActions.map((a) => toLspCodeAction(a, params.textDocument.uri)));

  return codeActions;
});

// Resolve handler for async code actions (FHIR lookups)
connection.onCodeActionResolve(async (codeAction: CodeAction): Promise<CodeAction> => {
  const data = codeAction.data as { kind?: string; action?: string; uri?: string } | undefined;
  if (data?.kind === REFACTORING_RESOLVE_KIND) {
    // Convert LSP CodeAction -> CoreCodeAction for resolution
    const coreAction: CoreCodeAction = {
      title: codeAction.title,
      kind: codeAction.kind === CodeActionKind.QuickFix ? 'quickfix' : 'refactor',
      data: codeAction.data,
    };

    let resolved: CoreCodeAction;
    switch (data.action) {
      case 'addDisplayTerms':
        resolved = await resolveAddDisplayTerms(coreAction, terminologyService);
        break;
      case 'unifiedSimplify':
        resolved = await resolveUnifiedSimplify(coreAction, terminologyService);
        break;
      default:
        return codeAction;
    }

    // Map resolved CoreCodeAction back to LSP CodeAction
    if (resolved.edits && resolved.edits.length > 0) {
      const uri = resolved.documentUri ?? data.uri ?? '';
      codeAction.edit = {
        changes: {
          [uri]: resolved.edits.map((e) => TextEdit.replace(e.range, e.newText)),
        },
      };
    }
  }
  return codeAction;
});

// ── Document formatting ─────────────────────────────────────────────────

connection.onDocumentFormatting(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const options = await getFormattingOptions(connection);
  const formatted = formatDocument(document.getText(), options);

  const range = {
    start: document.positionAt(0),
    end: document.positionAt(document.getText().length),
  };

  return [TextEdit.replace(range, formatted)];
});

// ── Range formatting ────────────────────────────────────────────────────

connection.onDocumentRangeFormatting(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const options = await getFormattingOptions(connection);
  const text = document.getText();

  // ecl-core range formatting uses plain text + CoreRange
  const coreRange = lspRangeToCoreRange(params.range);
  const expandedRange = expandToExpressionBoundaries(text, coreRange);
  const expressions = getExpressionsInRange(text, expandedRange);

  if (expressions.length === 0) {
    return [];
  }

  const formatFn = (t: string) => formatDocument(t, options);
  const edits = formatRangeExpressions(expressions, text, formatFn);

  return edits.map((edit) => TextEdit.replace(edit.range, edit.newText));
});

// ── Semantic tokens ─────────────────────────────────────────────────────

connection.languages.semanticTokens.on((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return { data: [] };

  const tokens = computeSemanticTokens(document.getText());
  const builder = new SemanticTokensBuilder();
  for (const token of tokens) {
    builder.push(token.line, token.character, token.length, token.tokenType, token.tokenModifiers);
  }
  return builder.build();
});

// ── Code Lens ───────────────────────────────────────────────────────────

connection.onCodeLens((params: CodeLensParams): CodeLens[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const expressions = groupIntoExpressions(document.getText());
  const cache = evaluationCache.get(params.textDocument.uri);
  return buildCodeLenses(expressions, cache);
});

// ── Execute command handler (for Code Lens actions in IntelliJ/Eclipse) ──

// eslint-disable-next-line sonarjs/cognitive-complexity -- command dispatch with cache management
connection.onExecuteCommand(async (params) => {
  if (params.command === 'ecl.evaluateExpression' && params.arguments) {
    const [startLine, , expression] = params.arguments as [number, number, string];
    if (!expression || expression.trim().length === 0) {
      return null;
    }

    const result = await terminologyService.evaluateEcl(expression.trim());

    // Find the document that contains this expression and cache the result
    for (const doc of documents.all()) {
      const expressions = groupIntoExpressions(doc.getText());
      const match = expressions.find((expr) => expr.startLine === startLine && expr.text.trim() === expression.trim());
      if (match) {
        if (!evaluationCache.has(doc.uri)) {
          evaluationCache.set(doc.uri, new Map());
        }
        evaluationCache.get(doc.uri)?.set(expression.trim(), result.total);
        if (clientSupportsCodeLensRefresh) {
          try {
            await connection.sendRequest('workspace/codeLens/refresh');
          } catch {
            // Request failed despite declared support
          }
        } else {
          // LSP4E and older clients don't support codeLens/refresh —
          // show result via notification so the user gets feedback
          const total = result.total;
          connection.window.showInformationMessage(`ECL evaluation: ${total} concept${total === 1 ? '' : 's'} found`);
        }
        break;
      }
    }

    return result;
  }
  return null;
});

// ── Custom request handlers ─────────────────────────────────────────────

connection.onRequest(
  'ecl/evaluateExpression',
  async (params: { uri: string; expression?: string; line?: number; limit?: number }): Promise<EvaluationResponse> => {
    let expression = params.expression;

    if (!expression && params.uri && params.line !== undefined) {
      const cursorLine = params.line;
      const document = documents.get(params.uri);
      if (document) {
        const expressions = groupIntoExpressions(document.getText());
        const match = expressions.find((expr) => cursorLine >= expr.startLine && cursorLine <= expr.endLine);
        if (match) {
          expression = match.text.trim();
        }
      }
    }

    if (!expression || expression.trim().length === 0) {
      throw new Error('No ECL expression found at cursor position');
    }

    const result = await terminologyService.evaluateEcl(expression.trim(), params.limit);

    // Cache the result count
    if (params.uri) {
      if (!evaluationCache.has(params.uri)) {
        evaluationCache.set(params.uri, new Map());
      }
      evaluationCache.get(params.uri)?.set(expression.trim(), result.total);
      try {
        await connection.sendRequest('workspace/codeLens/refresh');
      } catch {
        // Client may not support codeLens/refresh
      }
    }

    return result;
  },
);

connection.onRequest('ecl/searchConcept', async (params: { query: string }) => {
  try {
    const result = await terminologyService.searchConcepts(params.query);
    return result;
  } catch (error) {
    connection.console.error(`Search failed: ${String(error)}`);
    throw error;
  }
});

connection.onRequest('ecl/getSnomedEditions', async () => {
  try {
    if (terminologyService instanceof FhirTerminologyService) {
      return { editions: await terminologyService.getSnomedEditions() };
    }
    return { editions: [] };
  } catch (error) {
    connection.console.error(`Edition discovery failed: ${String(error)}`);
    throw error;
  }
});

// ── Document lifecycle ──────────────────────────────────────────────────

documents.onDidOpen((e) => {
  connection.console.log(`Document opened: ${e.document.uri}`);
  void validateDocument(e.document);
});

documents.onDidClose((e) => {
  evaluationCache.delete(e.document.uri);
  void connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

// ── Start ───────────────────────────────────────────────────────────────

documents.listen(connection);
connection.listen();
