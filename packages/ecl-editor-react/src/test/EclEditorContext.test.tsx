// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { EclEditorProvider, useEclEditorContext } from '../EclEditorContext';

// Mock @monaco-editor/react so EclEditor renders without a real browser environment
vi.mock('@monaco-editor/react', () => {
  const MockEditor = React.forwardRef<HTMLDivElement>((_props, _ref) => <div data-testid="monaco-editor" />);
  MockEditor.displayName = 'MockEditor';
  return { default: MockEditor };
});

vi.mock('ecl-editor-core', () => ({
  registerEclLanguage: vi.fn(() => ({ dispose: vi.fn(), updateConfig: vi.fn(), getTerminologyService: vi.fn() })),
  ECL_LANGUAGE_ID: 'ecl',
  registerToggleTermsAction: vi.fn(),
}));

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

  it('renders inside a provider without error', () => {
    render(
      <EclEditorProvider maxConcurrency={10}>
        <EclEditor />
      </EclEditorProvider>,
    );
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('renders with both provider and explicit maxConcurrency prop without error', () => {
    render(
      <EclEditorProvider maxConcurrency={10}>
        <EclEditor maxConcurrency={2} />
      </EclEditorProvider>,
    );
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
  });
});
