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
  // Track the latest service-defining options in the closure so an update that
  // changes only one of them (e.g. maxConcurrency) recreates the service without
  // reverting the others to their original construction-time values.
  let currentMaxConcurrency: number | undefined = config.maxConcurrency;
  let currentFhirServerUrl: string | undefined = config.fhirServerUrl;
  let currentSnomedVersion: string | undefined = config.snomedVersion;
  let currentCorsProxy: string | undefined = config.corsProxy;
  let currentOnResolvedSnomedVersion = config.onResolvedSnomedVersion;
  const diagnosticsAdapters = new Map<string, MonacoDiagnosticsAdapter>();

  // Create terminology service if not provided
  if (!terminologyService && currentFhirServerUrl !== undefined) {
    const url = currentCorsProxy ? `${currentCorsProxy}${currentFhirServerUrl}` : currentFhirServerUrl;
    terminologyService = new FhirTerminologyService({
      baseUrl: url,
      snomedVersion: currentSnomedVersion,
      onResolvedVersion: currentOnResolvedSnomedVersion,
      maxConcurrency: currentMaxConcurrency,
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
      // Fold any provided service-defining options into the tracked closure state
      // before deciding whether to recreate, so a single-field update preserves the rest.
      if (newConfig.maxConcurrency !== undefined) {
        currentMaxConcurrency = newConfig.maxConcurrency;
      }
      if (newConfig.fhirServerUrl !== undefined) {
        currentFhirServerUrl = newConfig.fhirServerUrl;
      }
      if (newConfig.snomedVersion !== undefined) {
        currentSnomedVersion = newConfig.snomedVersion;
      }
      if (newConfig.corsProxy !== undefined) {
        currentCorsProxy = newConfig.corsProxy;
      }
      if (newConfig.onResolvedSnomedVersion !== undefined) {
        currentOnResolvedSnomedVersion = newConfig.onResolvedSnomedVersion;
      }
      if (newConfig.terminologyService !== undefined) {
        terminologyService = newConfig.terminologyService;
      } else if (
        newConfig.fhirServerUrl !== undefined ||
        newConfig.snomedVersion !== undefined ||
        newConfig.maxConcurrency !== undefined ||
        newConfig.corsProxy !== undefined
      ) {
        const url = currentCorsProxy
          ? `${currentCorsProxy}${currentFhirServerUrl ?? 'https://tx.ontoserver.csiro.au/fhir'}`
          : currentFhirServerUrl;
        if (url) {
          terminologyService = new FhirTerminologyService({
            baseUrl: url,
            snomedVersion: currentSnomedVersion,
            onResolvedVersion: currentOnResolvedSnomedVersion,
            maxConcurrency: currentMaxConcurrency,
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
