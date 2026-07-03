// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as Monaco from 'monaco-editor';
import { FhirTerminologyService } from '@aehrc/ecl-core';
import { registerEclLanguage } from '../monaco/register';
import { MonacoDiagnosticsAdapter } from '../monaco/diagnostics-adapter';
import { mergeEclEditorConfig } from '../types';
import type { EclEditorConfig } from '../types';
import { createMockModel } from './mock-monaco';
import type { FhirTerminologyServiceCtorOptions } from './mock-fhir-service';

// Spy on FhirTerminologyService construction so tests can assert exactly which options
// registerEclLanguage()'s updateConfig rebuilt the service with, without real network calls.
vi.mock('@aehrc/ecl-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aehrc/ecl-core')>();
  const { createFhirTerminologyServiceMock } = await import('./mock-fhir-service');
  return {
    ...actual,
    FhirTerminologyService: createFhirTerminologyServiceMock(),
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

describe('registerEclLanguage() updateConfig() — partial config merging', () => {
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

  it('should rebuild the terminology service on a corsProxy-only update (matching DiagnosticsEngine)', () => {
    const { monaco } = createMockMonacoModule();
    const disposable = registerEclLanguage(monaco, {
      fhirServerUrl: 'https://tx.example.com/fhir',
      semanticValidation: false,
    });

    const mockedCtor = vi.mocked(FhirTerminologyService);

    disposable.updateConfig({ corsProxy: 'https://proxy.example.com/' });

    const lastCall = mockedCtor.mock.calls[mockedCtor.mock.calls.length - 1];
    const lastArgs = lastCall?.[0] as FhirTerminologyServiceCtorOptions;
    expect(lastArgs.baseUrl).toBe('https://proxy.example.com/https://tx.example.com/fhir');

    disposable.dispose();
  });

  it('should NOT rebuild the terminology service when a forwarded service key is unchanged', () => {
    const { monaco } = createMockMonacoModule();
    // Host forwards all of its config on every update (e.g. React re-render); the service keys
    // are present but unchanged, so no rebuild should occur (which would drop caches + memoization).
    const disposable = registerEclLanguage(monaco, {
      fhirServerUrl: 'https://tx.example.com/fhir',
      corsProxy: 'https://proxy.example.com/',
      semanticValidation: false,
    });

    const mockedCtor = vi.mocked(FhirTerminologyService);
    const constructionsAfterRegistration = mockedCtor.mock.calls.length;

    // An update whose only genuine change is an unrelated field, but which re-forwards the
    // same fhirServerUrl and corsProxy values (identical to registration).
    disposable.updateConfig({
      fhirServerUrl: 'https://tx.example.com/fhir',
      corsProxy: 'https://proxy.example.com/',
      semanticDebounceMs: 250,
    });

    expect(mockedCtor.mock.calls.length).toBe(constructionsAfterRegistration);

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

  it('should propagate the raw partial (not the merged config) to existing diagnostics adapters', () => {
    const model = toEclModel('< 404684003');
    const { monaco } = createMockMonacoModule([model]);
    const disposable = registerEclLanguage(monaco, {
      fhirServerUrl: 'https://tx.example.com/fhir',
      semanticValidation: false,
    });

    const mockedAdapterCtor = vi.mocked(MonacoDiagnosticsAdapter);
    expect(mockedAdapterCtor).toHaveBeenCalledTimes(1);
    const adapterInstance = mockedAdapterCtor.mock.results[0].value as { updateConfig: ReturnType<typeof vi.fn> };

    // DiagnosticsEngine.updateConfig now does its own internal merge against its own stored
    // effective config (see diagnostics-engine.test.ts), so register.ts only needs to forward
    // the raw partial that was actually passed to this call — NOT the full merged
    // `currentConfig` — and the engine keeps its terminology service alive via its own merge.
    disposable.updateConfig({ evaluateEcl: 'implicit-url' });

    expect(adapterInstance.updateConfig).toHaveBeenCalledTimes(1);
    const forwarded = adapterInstance.updateConfig.mock.calls[0][0] as {
      fhirServerUrl?: string;
      evaluateEcl?: string;
    };
    // The raw partial only ever contained `evaluateEcl` — forwarding the merged config would
    // have also carried the registration-time fhirServerUrl along.
    expect(forwarded.fhirServerUrl).toBeUndefined();
    expect(forwarded.evaluateEcl).toBe('implicit-url');

    disposable.dispose();
  });

  it('should not forward an unrelated registration-time fhirServerUrl (or terminologyService) on a semanticDebounceMs-only update', () => {
    const model = toEclModel('< 404684003');
    const { monaco } = createMockMonacoModule([model]);
    const customService = { evaluateEcl: vi.fn() };
    const disposable = registerEclLanguage(monaco, {
      fhirServerUrl: 'https://tx.example.com/fhir',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal stub, only identity matters for this test
      terminologyService: customService as any,
      semanticValidation: false,
    });

    const mockedAdapterCtor = vi.mocked(MonacoDiagnosticsAdapter);
    const adapterInstance = mockedAdapterCtor.mock.results[0].value as { updateConfig: ReturnType<typeof vi.fn> };

    // An update that touches only semanticDebounceMs must forward ONLY that key — forwarding
    // the merged config would carry the registration-time fhirServerUrl/terminologyService
    // along on every update, making DiagnosticsEngine.updateConfig think a rebuild is needed
    // (discarding caches and any evaluation-strategy memoization) even though nothing relevant
    // changed.
    disposable.updateConfig({ semanticDebounceMs: 200 });

    expect(adapterInstance.updateConfig).toHaveBeenCalledTimes(1);
    const forwarded = adapterInstance.updateConfig.mock.calls[0][0] as Record<string, unknown>;
    expect(forwarded).toEqual({ semanticDebounceMs: 200 });
    expect(forwarded.fhirServerUrl).toBeUndefined();
    expect(forwarded.terminologyService).toBeUndefined();

    disposable.dispose();
  });

  it('should not forward unrelated keys on a formattingOptions-only update', () => {
    const model = toEclModel('< 404684003');
    const { monaco } = createMockMonacoModule([model]);
    const disposable = registerEclLanguage(monaco, {
      fhirServerUrl: 'https://tx.example.com/fhir',
      semanticValidation: false,
    });

    const mockedAdapterCtor = vi.mocked(MonacoDiagnosticsAdapter);
    const adapterInstance = mockedAdapterCtor.mock.results[0].value as { updateConfig: ReturnType<typeof vi.fn> };

    disposable.updateConfig({ formattingOptions: { maxLineLength: 80 } });

    expect(adapterInstance.updateConfig).toHaveBeenCalledTimes(1);
    const forwarded = adapterInstance.updateConfig.mock.calls[0][0] as Record<string, unknown>;
    expect(forwarded).toEqual({ formattingOptions: { maxLineLength: 80 } });
    expect(forwarded.fhirServerUrl).toBeUndefined();

    disposable.dispose();
  });
});

describe('mergeEclEditorConfig — key-generic merge', () => {
  it('preserves keys outside the enumerated EclEditorConfig fields (extended config objects)', () => {
    const onDiagnostics = vi.fn();
    const base = { fhirServerUrl: 'https://tx.example.com/fhir', onDiagnostics } as EclEditorConfig;

    const merged = mergeEclEditorConfig(base, { snomedVersion: 'http://snomed.info/sct/32506021000036107' });

    expect((merged as Record<string, unknown>).onDiagnostics).toBe(onDiagnostics);
    expect(merged.fhirServerUrl).toBe('https://tx.example.com/fhir');
    expect(merged.snomedVersion).toBe('http://snomed.info/sct/32506021000036107');
  });

  it('does not apply undefined values from the partial (a value cannot be unset)', () => {
    const merged = mergeEclEditorConfig({ evaluateEcl: 'post-valueset-filter' }, { evaluateEcl: undefined });

    expect(merged.evaluateEcl).toBe('post-valueset-filter');
  });
});
