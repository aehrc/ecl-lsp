// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { workspace, ExtensionContext, commands, window, Range, Position, WorkspaceEdit } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient;
let evaluationOutput: vscode.OutputChannel;
let snomedStatusBar: vscode.StatusBarItem;
let resolvedVersionUri: string | null = null;
let previousServerUrl: string | undefined;

// ── SNOMED CT module ID → country name mapping ──────────────────────────
const MODULE_TO_COUNTRY = new Map<string, string>([
  ['900000000000207008', 'International'],
  ['32506021000036107', 'Australian'],
  ['731000124108', 'US'],
  ['999000011000000103', 'UK Clinical'],
  ['999000021000000109', 'UK Drug'],
  ['83821000000107', 'UK Composition'],
  ['11000172109', 'Belgian'],
  ['21000210109', 'Danish'],
  ['554471000005108', 'Danish'],
  ['11000146104', 'Dutch'],
  ['11000181102', 'Estonian'],
  ['11000229109', 'Irish'],
  ['11000220105', 'Uruguayan'],
  ['5631000179106', 'Uruguayan'],
  ['45991000052106', 'Swedish'],
  ['11000221109', 'Argentinian'],
  ['20611000087101', 'Canadian'],
  ['11000274103', 'German'],
  ['51000202101', 'Norwegian'],
  ['11000234105', 'Austrian'],
  ['2011000195101', 'Swiss'],
  ['11000315107', 'French'],
  ['900000001000122104', 'Spanish'],
  ['450829007', 'Spanish (Latin America)'],
  ['11000318109', 'Jamaican'],
  ['332351000009108', 'Veterinary (VTSL)'],
  ['11010000107', 'LOINC Extension'],
  ['999991001000101', 'IPS Terminology'],
]);

export function activate(context: ExtensionContext) {
  console.log('ECL extension activating...');

  evaluationOutput = window.createOutputChannel('ECL Evaluation');
  context.subscriptions.push(evaluationOutput);

  // Status bar item for SNOMED CT edition
  snomedStatusBar = window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  snomedStatusBar.command = 'ecl.selectSnomedEdition';
  context.subscriptions.push(snomedStatusBar);
  updateStatusBar();

  // Track server URL for change detection
  previousServerUrl = workspace.getConfiguration('ecl.terminology').get<string>('serverUrl');

  // Show/hide status bar based on active editor language; watch for config changes
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor(() => {
      updateStatusBarVisibility();
    }),
    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ecl.terminology.serverUrl')) {
        const newUrl = workspace.getConfiguration('ecl.terminology').get<string>('serverUrl');
        if (newUrl !== previousServerUrl) {
          previousServerUrl = newUrl;
          resolvedVersionUri = null;
          void workspace
            .getConfiguration('ecl.terminology')
            .update('snomedVersion', '', vscode.ConfigurationTarget.Workspace);
        }
      }
      if (e.affectsConfiguration('ecl.terminology.snomedVersion')) {
        resolvedVersionUri = null;
        updateStatusBar();
      }
    }),
  );

  // Server module path — try VSIX-bundled layout first, fallback to monorepo layout
  const vsixPath = context.asAbsolutePath(path.join('server', 'server.js'));
  const monorepoPath = context.asAbsolutePath(path.join('..', '..', 'packages', 'ecl-lsp-server', 'dist', 'server.js'));
  const serverModule = fs.existsSync(vsixPath) ? vsixPath : monorepoPath;

  console.log('ECL: vsixPath:', vsixPath, 'exists:', fs.existsSync(vsixPath));
  console.log('ECL: monorepoPath:', monorepoPath, 'exists:', fs.existsSync(monorepoPath));
  console.log('ECL: selected serverModule:', serverModule);

  // Check if server file exists
  if (!fs.existsSync(serverModule)) {
    console.error('ECL: Server module not found at:', serverModule);
    return;
  }

  console.log('ECL: Server module exists, starting client...');

  // Server options
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
  };

  // Client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'ecl' }],
    synchronize: {
      configurationSection: 'ecl',
      fileEvents: workspace.createFileSystemWatcher('**/*.ecl'),
    },
    outputChannelName: 'ECL Language Server',
  };

  // Create the client
  client = new LanguageClient('eclLanguageServer', 'ECL Language Server', serverOptions, clientOptions);

  console.log('Starting language client...');

  // Register commands — catch to avoid "command already exists" crash on restart
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registerCommand = (id: string, handler: (...args: any[]) => any) => {
    try {
      const disposable = commands.registerCommand(id, handler);
      context.subscriptions.push(disposable);
    } catch {
      // Command already registered (e.g. after Extension Host restart)
    }
  };

  registerCommand('ecl.searchConcept', () => {
    searchAndInsertConcept(client);
  });

  registerCommand('ecl.evaluateExpression', async (startLine?: number, _endLine?: number, expression?: string) => {
    await evaluateExpression(client, startLine, expression);
  });

  registerCommand('ecl.selectSnomedEdition', () => {
    void selectSnomedEdition(client);
  });

  // Add error handlers
  client.onDidChangeState((event) => {
    console.log('Client state changed:', event);
  });

  // Start the client and set up server notifications
  client
    .start()
    .then(() => {
      console.log('Language client started successfully');

      // Listen for resolved version notifications from server
      client.onNotification('ecl/resolvedSnomedVersion', (params: { versionUri: string }) => {
        const setting = workspace.getConfiguration('ecl.terminology').get<string>('snomedVersion', '');
        // Only update display for default or edition-only settings (not pinned)
        if (!setting.includes('/version/')) {
          resolvedVersionUri = params.versionUri;
          updateStatusBar();
        }
      });
    })
    .catch((error: unknown) => {
      console.error('Failed to start language client:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : String(error));
    });
}

interface ConceptSearchResult {
  id: string;
  fsn: string;
  pt: string;
}

interface SearchResponse {
  results: ConceptSearchResult[];
  hasMore: boolean;
}

interface ConceptQuickPickItem extends vscode.QuickPickItem {
  concept?: ConceptSearchResult;
}

function searchAndInsertConcept(client: LanguageClient): void {
  const editor = window.activeTextEditor;
  if (!editor) {
    window.showErrorMessage('No active editor');
    return;
  }

  const quickPick = window.createQuickPick<ConceptQuickPickItem>();
  quickPick.placeholder = 'Search for SNOMED CT concept...';
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;

  let debounceTimer: NodeJS.Timeout | undefined;
  let currentQuery = '';

  function handleSearchResponse(response: SearchResponse, query: string): void {
    if (currentQuery !== query) return;

    const items: ConceptQuickPickItem[] = response.results.map((concept) => ({
      label: `${concept.id} | ${concept.fsn}`,
      description: concept.pt === concept.fsn ? undefined : concept.pt,
      detail: concept.id,
      concept,
    }));

    if (response.hasMore) {
      items.push({
        label: '$(ellipsis) More results available...',
        description: 'Refine your search to see more specific results',
        detail: '',
        concept: undefined,
      });
    }

    if (items.length === 0) {
      quickPick.items = [
        {
          label: '$(info) No concepts found',
          description: 'Try a different search term',
          detail: '',
          concept: undefined,
        },
      ];
    } else {
      quickPick.items = items;
    }

    quickPick.busy = false;
  }

  // Handle search input changes with debouncing
  quickPick.onDidChangeValue((value) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    currentQuery = value;

    if (!value || value.trim().length === 0) {
      quickPick.items = [];
      quickPick.busy = false;
      return;
    }

    quickPick.busy = true;

    debounceTimer = setTimeout(() => {
      client
        .sendRequest<SearchResponse>('ecl/searchConcept', { query: value })
        .then((response) => {
          handleSearchResponse(response, value);
        })
        .catch((_error: unknown) => {
          if (currentQuery === value) {
            quickPick.busy = false;
            const errorItems: ConceptQuickPickItem[] = [
              {
                label: '$(error) Terminology server unavailable',
                description: 'Check your network connection and try again',
                detail: '',
                concept: undefined,
              },
            ];
            quickPick.items = errorItems;
          }
        });
    }, 300); // 300ms debounce
  });

  // Handle concept selection
  quickPick.onDidAccept(async () => {
    const selected = quickPick.selectedItems[0];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- selectedItems[0] can be undefined at runtime
    if (!selected?.concept) {
      quickPick.hide();
      return;
    }

    await insertConcept(editor, selected.concept);
    quickPick.hide();
  });

  quickPick.onDidHide(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    quickPick.dispose();
  });

  quickPick.show();
}

async function insertConcept(editor: vscode.TextEditor, concept: ConceptSearchResult): Promise<void> {
  const position = editor.selection.active;
  const line = editor.document.lineAt(position.line);
  const lineText = line.text;

  // Check if the completion label was inserted before cursor (VSCode commits completion before running command)
  const labelText = '🔍 Search for concept...';
  const textBeforeCursor = lineText.substring(0, position.character);
  let insertPosition = position;
  let rangeToReplace: Range | undefined;

  if (textBeforeCursor.endsWith(labelText)) {
    // The label was inserted, we need to remove it
    const labelStart = position.character - labelText.length;
    rangeToReplace = new Range(new Position(position.line, labelStart), position);
    insertPosition = new Position(position.line, labelStart);
  } else {
    // Check if cursor is on an existing concept ID
    const conceptIdPattern = /\b(\d{6,18})\b/g;
    let match: RegExpExecArray | null;

    while ((match = conceptIdPattern.exec(lineText)) !== null) {
      const startPos = match.index;
      const endPos = match.index + match[0].length;

      if (position.character >= startPos && position.character <= endPos) {
        rangeToReplace = new Range(new Position(position.line, startPos), new Position(position.line, endPos));
        insertPosition = new Position(position.line, startPos);
        break;
      }
    }
  }

  // Build replacement text
  const term = concept.pt || concept.fsn;
  const replacementText = term ? `${concept.id} |${term}|` : concept.id;

  // Create edit
  const edit = new WorkspaceEdit();

  if (rangeToReplace) {
    // Replace existing text (either label or concept ID)
    edit.replace(editor.document.uri, rangeToReplace, replacementText);
  } else {
    // Insert new concept
    edit.insert(editor.document.uri, insertPosition, replacementText);
  }

  await workspace.applyEdit(edit);
}

interface EvaluationConcept {
  code: string;
  display: string;
}

interface EvaluationResponse {
  total: number;
  concepts: EvaluationConcept[];
  truncated: boolean;
}

async function evaluateExpression(client: LanguageClient, startLine?: number, expression?: string): Promise<void> {
  const editor = window.activeTextEditor;
  if (editor?.document.languageId !== 'ecl') {
    window.showErrorMessage('Open an ECL file to evaluate expressions');
    return;
  }

  const uri = editor.document.uri.toString();
  const limit = workspace.getConfiguration('ecl.evaluation').get<number>('resultLimit', 200);

  // Build request params
  const params: { uri: string; expression?: string; line?: number; limit: number } = { uri, limit };
  if (expression) {
    params.expression = expression;
  } else {
    // Called from Command Palette — use cursor line
    params.line = editor.selection.active.line;
  }

  await window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Evaluating ECL expression...',
      cancellable: false,
    },
    async () => {
      try {
        const result: EvaluationResponse = await client.sendRequest('ecl/evaluateExpression', params);

        const timestamp = new Date().toLocaleString();
        const exprDisplay = (expression ?? `(expression at line ${(startLine ?? params.line ?? 0) + 1})`).trim();

        evaluationOutput.appendLine(`=== ECL Evaluation Results (${timestamp}) ===`);
        evaluationOutput.appendLine('');
        evaluationOutput.appendLine(`Expression: ${exprDisplay}`);
        evaluationOutput.appendLine('');
        evaluationOutput.appendLine(`Total matching concepts: ${result.total}`);
        if (result.truncated) {
          evaluationOutput.appendLine(`(Showing first ${result.concepts.length} of ${result.total})`);
        }
        evaluationOutput.appendLine('');
        evaluationOutput.appendLine('---');
        for (const concept of result.concepts) {
          evaluationOutput.appendLine(`${concept.code}  ${concept.display}`);
        }
        evaluationOutput.appendLine('---');
        evaluationOutput.appendLine(`${result.total} concept(s) total`);
        evaluationOutput.appendLine('');
        evaluationOutput.show(true);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('abort') || msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
          window.showWarningMessage(
            'ECL evaluation timed out. The expression may be too broad — try adding constraints to narrow it.',
          );
        } else {
          window.showErrorMessage(`ECL evaluation failed: ${msg}`);
        }
      }
    },
  );
}

// ── SNOMED CT Edition Picker ──────────────────────────────────────────────

interface SnomedVersion {
  uri: string;
  date: string;
}

interface SnomedEdition {
  moduleId: string;
  versions: SnomedVersion[];
}

interface EditionQuickPickItem extends vscode.QuickPickItem {
  edition?: SnomedEdition;
  isDefault?: boolean;
}

interface VersionQuickPickItem extends vscode.QuickPickItem {
  versionUri?: string;
  isLatest?: boolean;
}

function parseSnomedVersionUri(uri: string): { moduleId: string; date?: string } | null {
  const pinned = /^http:\/\/snomed\.info\/sct\/(\d+)\/version\/(\d+)$/.exec(uri);
  if (pinned) return { moduleId: pinned[1], date: pinned[2] };
  const editionOnly = /^http:\/\/snomed\.info\/sct\/(\d+)$/.exec(uri);
  if (editionOnly) return { moduleId: editionOnly[1] };
  return null;
}

function formatDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function getEditionLabel(moduleId: string): string {
  return MODULE_TO_COUNTRY.get(moduleId) ?? moduleId;
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- status bar display logic with multiple edition/version/resolved states
function updateStatusBar(): void {
  const setting = workspace.getConfiguration('ecl.terminology').get<string>('snomedVersion', '');

  if (setting) {
    const parsed = parseSnomedVersionUri(setting);
    if (parsed) {
      const label = getEditionLabel(parsed.moduleId);
      if (parsed.date) {
        // Pinned
        snomedStatusBar.text = `$(globe) ${label} ${formatDate(parsed.date)}`;
        snomedStatusBar.tooltip = 'SNOMED CT Edition (pinned) — Click to change';
      } else {
        // Edition-only
        if (resolvedVersionUri) {
          const resolved = parseSnomedVersionUri(resolvedVersionUri);
          if (resolved?.date) {
            snomedStatusBar.text = `$(globe) ${label} ${formatDate(resolved.date)} (latest)`;
          } else {
            snomedStatusBar.text = `$(globe) ${label} (latest)`;
          }
        } else {
          snomedStatusBar.text = `$(globe) ${label} (latest)`;
        }
        snomedStatusBar.tooltip = 'SNOMED CT Edition (latest) — Click to change';
      }
    } else {
      snomedStatusBar.text = `$(globe) Custom edition`;
      snomedStatusBar.tooltip = `${setting}\nClick to change`;
    }
  } else {
    // Default mode
    if (resolvedVersionUri) {
      const parsed = parseSnomedVersionUri(resolvedVersionUri);
      if (parsed?.date) {
        snomedStatusBar.text = `$(globe) (Default) ${getEditionLabel(parsed.moduleId)} ${formatDate(parsed.date)}`;
      } else {
        snomedStatusBar.text = '$(globe) (Default)';
      }
    } else {
      snomedStatusBar.text = '$(globe) (Default)';
    }
    snomedStatusBar.tooltip = 'SNOMED CT Edition — Click to change';
  }

  updateStatusBarVisibility();
}

function updateStatusBarVisibility(): void {
  const editor = window.activeTextEditor;
  if (editor?.document.languageId === 'ecl') {
    snomedStatusBar.show();
  } else {
    snomedStatusBar.hide();
  }
}

async function selectSnomedEdition(client: LanguageClient): Promise<void> {
  let editions: SnomedEdition[] = [];
  let fetchFailed = false;

  try {
    const response = await client.sendRequest<{ editions: SnomedEdition[] }>('ecl/getSnomedEditions');
    editions = response.editions;
  } catch {
    fetchFailed = true;
  }

  if (fetchFailed || editions.length === 0) {
    // Manual entry fallback
    const uri = await window.showInputBox({
      prompt: 'Enter a SNOMED CT version URI',
      // eslint-disable-next-line sonarjs/no-clear-text-protocols -- SNOMED CT standard URI scheme uses http://snomed.info/sct
      placeHolder: 'http://snomed.info/sct/32506021000036107/version/20260131',
      value: workspace.getConfiguration('ecl.terminology').get<string>('snomedVersion', ''),
    });
    if (uri !== undefined) {
      await workspace
        .getConfiguration('ecl.terminology')
        .update('snomedVersion', uri, vscode.ConfigurationTarget.Workspace);
    }
    return;
  }

  // Step 1: Pick edition — sorted alphabetically, International first
  const editionEntries = editions
    .map((ed) => ({
      label: getEditionLabel(ed.moduleId),
      description: `Module: ${ed.moduleId} (${ed.versions.length} version${ed.versions.length === 1 ? '' : 's'})`,
      edition: ed,
    }))
    .sort((a, b) => {
      // International always first
      if (a.edition.moduleId === '900000000000207008') return -1;
      if (b.edition.moduleId === '900000000000207008') return 1;
      return a.label.localeCompare(b.label);
    });

  const editionItems: EditionQuickPickItem[] = [
    { label: '$(server) Default (server)', description: "Use the server's default edition", isDefault: true },
    ...editionEntries,
  ];

  const pickedEdition = await window.showQuickPick(editionItems, {
    placeHolder: 'Select SNOMED CT edition',
  });

  if (!pickedEdition) return;

  if (pickedEdition.isDefault) {
    await workspace
      .getConfiguration('ecl.terminology')
      .update('snomedVersion', '', vscode.ConfigurationTarget.Workspace);
    return;
  }

  const edition = pickedEdition.edition;
  if (!edition) return;

  // Step 2: Pick version
  const versionItems: VersionQuickPickItem[] = [
    {
      label: '$(clock) Latest',
      description: 'Always use the newest version of this edition',
      versionUri: `http://snomed.info/sct/${edition.moduleId}`,
      isLatest: true,
    },
    ...edition.versions.map((v) => ({
      label: formatDate(v.date),
      description: v.uri,
      versionUri: v.uri,
    })),
  ];

  const pickedVersion = await window.showQuickPick(versionItems, {
    placeHolder: `Select version for ${getEditionLabel(edition.moduleId)}`,
  });

  if (!pickedVersion?.versionUri) return;

  await workspace
    .getConfiguration('ecl.terminology')
    .update('snomedVersion', pickedVersion.versionUri, vscode.ConfigurationTarget.Workspace);
}

export function deactivate(): Thenable<void> | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!client) {
    return undefined;
  }
  return client.stop();
}
