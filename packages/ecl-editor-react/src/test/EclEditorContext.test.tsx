// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { registerEclLanguage } from '@aehrc/ecl-editor-core';
import { EclEditorProvider, useEclEditorContext } from '../EclEditorContext';

// Mock @monaco-editor/react so EclEditor renders without a real browser environment.
// The mock invokes onMount with stub editor/monaco objects so that EclEditor's
// registerEclLanguage() call actually runs and its config can be asserted against.
vi.mock('@monaco-editor/react', () => {
  function MockEditor(props: Readonly<{ onMount?: (editor: unknown, monaco: unknown) => void }>) {
    const onMount = props.onMount;
    // Fire once on mount with the initial handler; sufficient for single-render tests.
    React.useEffect(() => {
      onMount?.({}, {});
    }, [onMount]);
    return <div data-testid="monaco-editor" />;
  }
  return { default: MockEditor };
});

// NOTE: the specifier must match EclEditor.tsx's import ('@aehrc/ecl-editor-core'),
// otherwise the mock silently does not apply.
vi.mock('@aehrc/ecl-editor-core', () => ({
  registerEclLanguage: vi.fn(() => ({ dispose: vi.fn(), updateConfig: vi.fn(), getTerminologyService: vi.fn() })),
  ECL_LANGUAGE_ID: 'ecl',
  registerToggleTermsAction: vi.fn(),
}));

const mockRegister = vi.mocked(registerEclLanguage);

/** The config object EclEditor passed to registerEclLanguage on its first (mount) call. */
function firstRegisteredConfig(): Record<string, unknown> {
  expect(mockRegister).toHaveBeenCalled();
  return mockRegister.mock.calls[0][1] as unknown as Record<string, unknown>;
}

beforeEach(() => {
  mockRegister.mockClear();
});

// Helper: renders a component that exposes context values via data attributes
function ContextReader() {
  const ctx = useEclEditorContext();
  return <div data-testid="ctx" data-max-concurrency={ctx.maxConcurrency ?? 'undefined'} />;
}

// ── EclEditorProvider ────────────────────────────────────────────────────

describe('EclEditorProvider', () => {
  it('renders its children', () => {
    render(
      <EclEditorProvider maxConcurrency={10}>
        <div data-testid="child">hello</div>
      </EclEditorProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('provides maxConcurrency to useEclEditorContext', () => {
    render(
      <EclEditorProvider maxConcurrency={10}>
        <ContextReader />
      </EclEditorProvider>,
    );
    expect(screen.getByTestId('ctx')).toHaveAttribute('data-max-concurrency', '10');
  });

  it('provides undefined maxConcurrency when not set', () => {
    render(
      <EclEditorProvider>
        <ContextReader />
      </EclEditorProvider>,
    );
    expect(screen.getByTestId('ctx')).toHaveAttribute('data-max-concurrency', 'undefined');
  });

  it('useEclEditorContext returns empty object when no provider is present', () => {
    render(<ContextReader />);
    expect(screen.getByTestId('ctx')).toHaveAttribute('data-max-concurrency', 'undefined');
  });
});

// ── EclEditor inside/outside provider ────────────────────────────────────

import { EclEditor } from '../EclEditor';

describe('EclEditor — EclEditorProvider integration', () => {
  it('renders without a provider (backwards compat)', () => {
    render(<EclEditor />);
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('forwards no maxConcurrency to registerEclLanguage when neither prop nor provider is set', () => {
    render(<EclEditor />);
    expect(firstRegisteredConfig().maxConcurrency).toBeUndefined();
  });

  it('forwards the provider maxConcurrency to registerEclLanguage when no prop is set', () => {
    render(
      <EclEditorProvider maxConcurrency={10}>
        <EclEditor />
      </EclEditorProvider>,
    );
    expect(firstRegisteredConfig().maxConcurrency).toBe(10);
  });

  it('lets an explicit maxConcurrency prop override the provider value', () => {
    render(
      <EclEditorProvider maxConcurrency={10}>
        <EclEditor maxConcurrency={2} />
      </EclEditorProvider>,
    );
    expect(firstRegisteredConfig().maxConcurrency).toBe(2);
  });
});
