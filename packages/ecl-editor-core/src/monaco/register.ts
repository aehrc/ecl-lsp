// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type * as Monaco from 'monaco-editor';
import { FhirTerminologyService } from '@aehrc/ecl-core';
import type { ITerminologyService, FormattingOptions, CoreDiagnostic } from '@aehrc/ecl-core';
import type { EclEditorConfig, EclEditorDisposable } from '../types';
import { mergeEclEditorConfig } from '../types';
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
  // Mutable effective config, merged with every `updateConfig()` partial (see mergeEclEditorConfig).
  // All updateConfig fallbacks — and adapters attached to new models — read this, not `config`,
  // so sequential partial updates accumulate instead of reverting to the immutable registration config.
  let currentConfig: EclEditorConfig = config;
  const diagnosticsAdapters = new Map<string, MonacoDiagnosticsAdapter>();

  // Create terminology service if not provided
  if (!terminologyService && config.fhirServerUrl !== undefined) {
    const url = config.corsProxy ? `${config.corsProxy}${config.fhirServerUrl}` : config.fhirServerUrl;
    terminologyService = new FhirTerminologyService({
      baseUrl: url,
      snomedVersion: config.snomedVersion,
      eclEvaluationStrategy: config.evaluateEcl,
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
    const adapter = new MonacoDiagnosticsAdapter(monaco, model, currentConfig, config.onDiagnostics);
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

    /**
     * `newConfig` is merged into the mutable `currentConfig` (see {@link mergeEclEditorConfig}):
     * a key applies only when its value is `!== undefined`, so a value cannot be unset by passing
     * `undefined`, and sequential partial updates accumulate rather than reverting fields left
     * unspecified back to the immutable registration-time config.
     *
     * Adapters receive the raw `newConfig` partial (NOT the merged `currentConfig`) —
     * `DiagnosticsEngine.updateConfig` does its own internal merge against its own stored
     * effective config and only rebuilds its terminology service when the raw partial actually
     * touches a relevant key (`fhirServerUrl` / `snomedVersion` / `evaluateEcl` / `corsProxy` /
     * `terminologyService`). Forwarding the full merged config instead would make every update
     * (even an unrelated `semanticDebounceMs`-only or `formattingOptions`-only change) look like
     * it touches those keys once any of them has ever been set, discarding caches and any
     * strategy memoization on the terminology service for no reason. It would also cause a
     * registration-time custom `terminologyService` to ride along — and be reapplied — on every
     * unrelated forward.
     */
    updateConfig(newConfig: Partial<EclEditorConfig>): void {
      currentConfig = mergeEclEditorConfig(currentConfig, newConfig);

      if (newConfig.formattingOptions) {
        formattingOptions = { ...formattingOptions, ...newConfig.formattingOptions };
      }
      if (newConfig.terminologyService !== undefined) {
        terminologyService = newConfig.terminologyService;
      } else if (
        newConfig.fhirServerUrl !== undefined ||
        newConfig.snomedVersion !== undefined ||
        newConfig.evaluateEcl !== undefined
      ) {
        const url = currentConfig.corsProxy
          ? `${currentConfig.corsProxy}${currentConfig.fhirServerUrl ?? 'https://tx.ontoserver.csiro.au/fhir'}`
          : currentConfig.fhirServerUrl;
        if (url) {
          terminologyService = new FhirTerminologyService({
            baseUrl: url,
            snomedVersion: currentConfig.snomedVersion,
            eclEvaluationStrategy: currentConfig.evaluateEcl,
            onResolvedVersion: currentConfig.onResolvedSnomedVersion,
          });
        }
      }

      // Propagate to diagnostics adapters — forward the raw partial, not the merged config
      // (see the doc comment above for why).
      for (const adapter of diagnosticsAdapters.values()) {
        adapter.updateConfig(newConfig);
      }
    },
  };
}
