// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as Monaco from 'monaco-editor';
import { FhirTerminologyService } from '@aehrc/ecl-core';
import { registerEclLanguage } from '../monaco/register';
import { MonacoDiagnosticsAdapter } from '../monaco/diagnostics-adapter';
import { createMockModel } from './mock-monaco';

// Spy on FhirTerminologyService construction so tests can assert exactly which options
// registerEclLanguage()'s updateConfig rebuilt the service with, without real network calls.
vi.mock('@aehrc/ecl-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aehrc/ecl-core')>();
  return {
    ...actual,
    // A named function expression (not an arrow function) so `new FhirTerminologyService(...)`
    // in production code invokes it as a real constructor and uses its returned object.
    FhirTerminologyService: vi.fn().mockImplementation(function FhirTerminologyServiceMock() {
      return {
        async getConceptInfo() {
          return null;
        },
        async validateConcepts(ids: string[]) {
          return new Map(ids.map((id) => [id, null]));
        },
        async searchConcepts() {
          return { results: [], hasMore: false };
        },
        async evaluateEcl() {
          return { total: 0, concepts: [], truncated: false };
        },
      };
    }),
  };
});

// Replace the diagnostics adapter with a spy so tests can inspect exactly what config each
// diagnostics adapter (one per model) is constructed and updated with, independent of
// DiagnosticsEngine's own behaviour (covered separately in diagnostics-engine.test.ts).
vi.mock('../monaco/diagnostics-adapter', () => ({
  MonacoDiagnosticsAdapter: vi.fn().mockImplementation(function MonacoDiagnosticsAdapterMock() {
    return {
      updateConfig: vi.fn(),
      dispose: vi.fn(),
    };
  }),
}));

interface FhirTerminologyServiceCtorOptions {
  baseUrl?: string;
  snomedVersion?: string;
  eclEvaluationStrategy?: string;
}

/** Minimal Monaco module mock — just enough surface area for registerEclLanguage() to run. */
function createMockMonacoModule(initialModels: Monaco.editor.ITextModel[] = []) {
  const disposable = { dispose: () => {} };
  let onDidCreateModelHandler: ((model: Monaco.editor.ITextModel) => void) | undefined;

  const monaco = {
    languages: {
      register: () => {},
      setMonarchTokensProvider: () => {},
      registerCompletionItemProvider: () => disposable,
      registerHoverProvider: () => disposable,
      registerDocumentFormattingEditProvider: () => disposable,
      registerDocumentRangeFormattingEditProvider: () => disposable,
      registerCodeActionProvider: () => disposable,
      registerDocumentSemanticTokensProvider: () => disposable,
    },
    editor: {
      getModels: () => initialModels,
      onDidCreateModel: (handler: (model: Monaco.editor.ITextModel) => void) => {
        onDidCreateModelHandler = handler;
        return disposable;
      },
      onWillDisposeModel: () => disposable,
      setModelMarkers: () => {},
    },
  } as unknown as typeof import('monaco-editor');

  return {
    monaco,
    /** Simulate Monaco creating a new model after registration. */
    createModel(model: Monaco.editor.ITextModel) {
      onDidCreateModelHandler?.(model);
    },
  };
}

function toEclModel(text: string): Monaco.editor.ITextModel {
  return createMockModel(text) as unknown as Monaco.editor.ITextModel;
}

describe('registerEclLanguage() updateConfig() — partial config merging regression (issue #59 review, Finding 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not revert an earlier partial update when a later, independent partial update is applied', () => {
    const { monaco } = createMockMonacoModule();
    const disposable = registerEclLanguage(monaco, {
      fhirServerUrl: 'https://tx.example.com/fhir',
      semanticValidation: false,
    });

    const mockedCtor = vi.mocked(FhirTerminologyService);

    // First partial update: evaluateEcl only. Must not drop the registration-time fhirServerUrl.
    disposable.updateConfig({ evaluateEcl: 'implicit-url' });
    expect(disposable.getTerminologyService()).not.toBeNull();

    let lastCall = mockedCtor.mock.calls[mockedCtor.mock.calls.length - 1];
    let lastArgs = lastCall?.[0] as FhirTerminologyServiceCtorOptions;
    expect(lastArgs.baseUrl).toBe('https://tx.example.com/fhir');
    expect(lastArgs.eclEvaluationStrategy).toBe('implicit-url');

    // Second, independent partial update: snomedVersion only. Must not revert the evaluateEcl
    // strategy applied by the first update (the old code fell back to the immutable
    // registration-time config, which never had evaluateEcl set, reverting it to undefined).
    disposable.updateConfig({ snomedVersion: 'http://snomed.info/sct/32506021000036107/version/20240731' });

    lastCall = mockedCtor.mock.calls[mockedCtor.mock.calls.length - 1];
    lastArgs = lastCall?.[0] as FhirTerminologyServiceCtorOptions;
    expect(lastArgs.baseUrl).toBe('https://tx.example.com/fhir');
    expect(lastArgs.eclEvaluationStrategy).toBe('implicit-url');
    expect(lastArgs.snomedVersion).toBe('http://snomed.info/sct/32506021000036107/version/20240731');

    disposable.dispose();
  });

  it('should attach new diagnostics adapters with the latest merged config, not the stale registration config', () => {
    const { monaco, createModel } = createMockMonacoModule();
    // No fhirServerUrl at registration time — the service (and the adapter's config) only
    // gains one via a later partial update.
    const disposable = registerEclLanguage(monaco, { semanticValidation: false });

    const mockedAdapterCtor = vi.mocked(MonacoDiagnosticsAdapter);
    mockedAdapterCtor.mockClear();

    disposable.updateConfig({ fhirServerUrl: 'https://tx.example.com/fhir', evaluateEcl: 'implicit-url' });

    createModel(toEclModel('< 404684003'));

    expect(mockedAdapterCtor).toHaveBeenCalledTimes(1);
    const configArg = mockedAdapterCtor.mock.calls[0][2] as { fhirServerUrl?: string; evaluateEcl?: string };
    expect(configArg.fhirServerUrl).toBe('https://tx.example.com/fhir');
    expect(configArg.evaluateEcl).toBe('implicit-url');

    disposable.dispose();
  });

  it('should propagate the full merged config (not the raw partial) to existing diagnostics adapters', () => {
    const model = toEclModel('< 404684003');
    const { monaco } = createMockMonacoModule([model]);
    const disposable = registerEclLanguage(monaco, {
      fhirServerUrl: 'https://tx.example.com/fhir',
      semanticValidation: false,
    });

    const mockedAdapterCtor = vi.mocked(MonacoDiagnosticsAdapter);
    expect(mockedAdapterCtor).toHaveBeenCalledTimes(1);
    const adapterInstance = mockedAdapterCtor.mock.results[0].value as { updateConfig: ReturnType<typeof vi.fn> };

    // A raw partial `{ evaluateEcl }` forwarded as-is would leave the adapter's engine unable
    // to tell that fhirServerUrl is still meant to be set — asserting the forwarded object
    // carries it proves the merged currentConfig (not the raw partial) was forwarded.
    disposable.updateConfig({ evaluateEcl: 'implicit-url' });

    expect(adapterInstance.updateConfig).toHaveBeenCalledTimes(1);
    const forwarded = adapterInstance.updateConfig.mock.calls[0][0] as {
      fhirServerUrl?: string;
      evaluateEcl?: string;
    };
    expect(forwarded.fhirServerUrl).toBe('https://tx.example.com/fhir');
    expect(forwarded.evaluateEcl).toBe('implicit-url');

    disposable.dispose();
  });
});
