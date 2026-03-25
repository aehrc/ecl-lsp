// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type * as Monaco from 'monaco-editor';
import { FhirTerminologyService } from '@aehrc/ecl-core';
import type { ITerminologyService, FormattingOptions, CoreDiagnostic } from '@aehrc/ecl-core';
import type { EclEditorConfig, EclEditorDisposable } from '../types';
import { createCompletionProvider } from './completion-provider';
import { createHoverProvider } from './hover-provider';
import { createDocumentFormattingProvider, createDocumentRangeFormattingProvider } from './formatting-provider';
import { createCodeActionProvider } from './code-action-provider';
import { createSemanticTokensProvider } from './semantic-tokens-provider';
import { MonacoDiagnosticsAdapter } from './diagnostics-adapter';

/** The Monaco language ID for ECL. */
export const ECL_LANGUAGE_ID = 'ecl';

/**
 * Monarch token definitions for basic ECL syntax highlighting.
 * Provides immediate coloring without TextMate grammar dependency.
 */
const eclMonarchLanguage: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  ignoreCase: true,

  tokenizer: {
    root: [
      [/\/\*/, 'comment', '@comment'],
      // eslint-disable-next-line sonarjs/slow-regex
      [/\/\/.*$/, 'comment'],
      [/\|[^|\n]*\|/, 'string'],
      [/\bHISTORY(?:-(?:MIN|MOD|MAX))?\b/, 'tag'],
      [/\b(?:AND|OR|MINUS|NOT)\b/, 'keyword'],
      [/<<!?|<!?|>>!?|>!?|!![<>]|\^/, 'operator'],
      [/!=|[=:.]/, 'operator'],
      [/\b\d{6,18}\b/, 'number'],
      [/\*/, 'variable'],
      [/[{}()]/, 'delimiter.bracket'],
    ],
    comment: [
      [/[^/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],
  },
};

export interface RegisterOptions extends EclEditorConfig {
  /** Callback to receive diagnostic updates. */
  onDiagnostics?: (diagnostics: CoreDiagnostic[]) => void;
}

/**
 * Register the ECL language in Monaco with all providers.
 *
 * Call once per Monaco instance. Returns a disposable handle.
 */
export function registerEclLanguage(
  monaco: typeof import('monaco-editor'),
  config: RegisterOptions = {},
): EclEditorDisposable {
  const disposables: Monaco.IDisposable[] = [];
  let terminologyService: ITerminologyService | null = config.terminologyService ?? null;
  let formattingOptions: Partial<FormattingOptions> = config.formattingOptions ?? {};
  const diagnosticsAdapters = new Map<string, MonacoDiagnosticsAdapter>();

  // Create terminology service if not provided
  if (!terminologyService && config.fhirServerUrl !== undefined) {
    const url = config.corsProxy ? `${config.corsProxy}${config.fhirServerUrl}` : config.fhirServerUrl;
    terminologyService = new FhirTerminologyService({
      baseUrl: url,
      snomedVersion: config.snomedVersion,
      onResolvedVersion: config.onResolvedSnomedVersion,
    });
  }

  // Lazy accessors for providers
  const getService = () => terminologyService;
  const getFormatOpts = () => formattingOptions;

  // Register language
  monaco.languages.register({ id: ECL_LANGUAGE_ID, extensions: ['.ecl'] });

  // Monarch tokenizer for basic highlighting
  monaco.languages.setMonarchTokensProvider(ECL_LANGUAGE_ID, eclMonarchLanguage);

  // Register all providers
  disposables.push(
    monaco.languages.registerCompletionItemProvider(ECL_LANGUAGE_ID, createCompletionProvider(getService)),
    monaco.languages.registerHoverProvider(ECL_LANGUAGE_ID, createHoverProvider(getService)),
    monaco.languages.registerDocumentFormattingEditProvider(
      ECL_LANGUAGE_ID,
      createDocumentFormattingProvider(getFormatOpts),
    ),
    monaco.languages.registerDocumentRangeFormattingEditProvider(
      ECL_LANGUAGE_ID,
      createDocumentRangeFormattingProvider(getFormatOpts),
    ),
    monaco.languages.registerCodeActionProvider(ECL_LANGUAGE_ID, createCodeActionProvider(getService)),
    monaco.languages.registerDocumentSemanticTokensProvider(ECL_LANGUAGE_ID, createSemanticTokensProvider()),
  );

  // Attach diagnostics to any ECL model that gets created
  function attachDiagnostics(model: Monaco.editor.ITextModel): void {
    if (model.getLanguageId() !== ECL_LANGUAGE_ID) return;
    const key = model.uri.toString();
    if (diagnosticsAdapters.has(key)) return;
    const adapter = new MonacoDiagnosticsAdapter(monaco, model, config, config.onDiagnostics);
    diagnosticsAdapters.set(key, adapter);
  }

  // Attach to existing models
  for (const model of monaco.editor.getModels()) {
    attachDiagnostics(model);
  }

  // Attach to future models
  disposables.push(
    monaco.editor.onDidCreateModel((model) => {
      attachDiagnostics(model);
    }),
  );

  // Clean up when models are disposed
  disposables.push(
    monaco.editor.onWillDisposeModel((model) => {
      const key = model.uri.toString();
      const adapter = diagnosticsAdapters.get(key);
      if (adapter) {
        adapter.dispose();
        diagnosticsAdapters.delete(key);
      }
    }),
  );

  return {
    getTerminologyService(): ITerminologyService | null {
      return terminologyService;
    },

    dispose(): void {
      for (const adapter of diagnosticsAdapters.values()) {
        adapter.dispose();
      }
      diagnosticsAdapters.clear();
      for (const d of disposables) {
        d.dispose();
      }
      disposables.length = 0;
    },

    updateConfig(newConfig: Partial<EclEditorConfig>): void {
      if (newConfig.formattingOptions) {
        formattingOptions = { ...formattingOptions, ...newConfig.formattingOptions };
      }
      if (newConfig.terminologyService !== undefined) {
        terminologyService = newConfig.terminologyService;
      } else if (newConfig.fhirServerUrl !== undefined || newConfig.snomedVersion !== undefined) {
        const url =
          (newConfig.corsProxy ?? config.corsProxy)
            ? `${newConfig.corsProxy ?? config.corsProxy}${newConfig.fhirServerUrl ?? config.fhirServerUrl ?? 'https://tx.ontoserver.csiro.au/fhir'}`
            : (newConfig.fhirServerUrl ?? config.fhirServerUrl);
        if (url) {
          terminologyService = new FhirTerminologyService({
            baseUrl: url,
            snomedVersion: newConfig.snomedVersion ?? config.snomedVersion,
            onResolvedVersion: newConfig.onResolvedSnomedVersion ?? config.onResolvedSnomedVersion,
          });
        }
      }

      // Propagate to diagnostics adapters
      for (const adapter of diagnosticsAdapters.values()) {
        adapter.updateConfig(newConfig);
      }
    },
  };
}
