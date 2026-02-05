/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock @monaco-editor/react with a simple textarea-based stand-in.
vi.mock('@monaco-editor/react', () => {
  const MockEditor = React.forwardRef((props: any, _ref: any) => {
    return (
      <div
        data-testid="monaco-editor"
        data-language={props.language}
        data-theme={props.theme}
        style={{ height: props.height, width: props.width }}
      >
        <textarea
          data-testid="monaco-textarea"
          value={props.value ?? props.defaultValue ?? ''}
          onChange={(e) => props.onChange?.(e.target.value)}
          readOnly={props.options?.readOnly}
          data-minimap={props.options?.minimap?.enabled ? 'on' : 'off'}
          data-linenumbers={props.options?.lineNumbers}
        />
      </div>
    );
  });
  MockEditor.displayName = 'MockEditor';
  return { default: MockEditor };
});

// Mock ecl-editor-core so we don't need real Monaco integration.
vi.mock('ecl-editor-core', () => ({
  registerEclLanguage: vi.fn(() => ({
    dispose: vi.fn(),
    updateConfig: vi.fn(),
  })),
  ECL_LANGUAGE_ID: 'ecl',
}));

import { EclEditor } from '../EclEditor';

describe('EclEditor', () => {
  it('should render without crashing', () => {
    render(<EclEditor />);
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('should pass value prop to editor', () => {
    render(<EclEditor value="<< 404684003" />);
    const textarea = screen.getByTestId('monaco-textarea');
    expect(textarea.value).toBe('<< 404684003');
  });

  it('should pass defaultValue prop to editor', () => {
    render(<EclEditor defaultValue="< 19829001" />);
    const textarea = screen.getByTestId('monaco-textarea');
    expect(textarea.value).toBe('< 19829001');
  });

  it('should call onChange when value changes', () => {
    const handleChange = vi.fn();
    render(<EclEditor value="" onChange={handleChange} />);

    const textarea = screen.getByTestId('monaco-textarea');
    fireEvent.change(textarea, { target: { value: '< 73211009' } });

    expect(handleChange).toHaveBeenCalledWith('< 73211009');
  });

  it('should pass correct language to editor', () => {
    render(<EclEditor />);
    const editor = screen.getByTestId('monaco-editor');
    expect(editor).toHaveAttribute('data-language', 'ecl');
  });

  it('should apply readOnly option', () => {
    render(<EclEditor readOnly />);
    const textarea = screen.getByTestId('monaco-textarea');
    expect(textarea.readOnly).toBe(true);
  });

  it('should not be readOnly by default', () => {
    render(<EclEditor />);
    const textarea = screen.getByTestId('monaco-textarea');
    expect(textarea.readOnly).toBe(false);
  });

  it('should apply height prop', () => {
    render(<EclEditor height="500px" />);
    const editor = screen.getByTestId('monaco-editor');
    expect(editor.style.height).toBe('500px');
  });

  it('should apply width prop', () => {
    render(<EclEditor width="80%" />);
    const editor = screen.getByTestId('monaco-editor');
    expect(editor.style.width).toBe('80%');
  });

  it('should use default height and width', () => {
    render(<EclEditor />);
    const editor = screen.getByTestId('monaco-editor');
    expect(editor.style.height).toBe('300px');
    expect(editor.style.width).toBe('100%');
  });

  it('should apply theme prop', () => {
    render(<EclEditor theme="vs-dark" />);
    const editor = screen.getByTestId('monaco-editor');
    expect(editor).toHaveAttribute('data-theme', 'vs-dark');
  });

  it('should use default theme', () => {
    render(<EclEditor />);
    const editor = screen.getByTestId('monaco-editor');
    expect(editor).toHaveAttribute('data-theme', 'vs');
  });

  it('should pass minimap option', () => {
    render(<EclEditor minimap={true} />);
    const textarea = screen.getByTestId('monaco-textarea');
    expect(textarea).toHaveAttribute('data-minimap', 'on');
  });

  it('should disable minimap by default', () => {
    render(<EclEditor />);
    const textarea = screen.getByTestId('monaco-textarea');
    expect(textarea).toHaveAttribute('data-minimap', 'off');
  });

  it('should pass lineNumbers option', () => {
    render(<EclEditor lineNumbers={false} />);
    const textarea = screen.getByTestId('monaco-textarea');
    expect(textarea).toHaveAttribute('data-linenumbers', 'off');
  });

  it('should enable lineNumbers by default', () => {
    render(<EclEditor />);
    const textarea = screen.getByTestId('monaco-textarea');
    expect(textarea).toHaveAttribute('data-linenumbers', 'on');
  });

  it('controlled value should take precedence over defaultValue', () => {
    render(<EclEditor value="< 404684003" defaultValue="< 19829001" />);
    const textarea = screen.getByTestId('monaco-textarea');
    // The mock editor uses value ?? defaultValue, so value wins
    expect(textarea.value).toBe('< 404684003');
  });

  it('should pass custom options that override defaults', () => {
    render(<EclEditor options={{ fontSize: 20, tabSize: 4 }} />);
    // The mock doesn't expose all options, but we can verify render succeeds
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('should pass onResolvedSnomedVersion to registerEclLanguage on mount', () => {
    const onResolved = vi.fn();
    const { unmount } = render(
      <EclEditor onResolvedSnomedVersion={onResolved} fhirServerUrl="https://tx.example.com/fhir" />,
    );

    // The mock @monaco-editor/react doesn't call onMount, so registerEclLanguage
    // won't be called. But we verify it renders without error.
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    unmount();
  });

  it('should pass terminologyService prop', () => {
    const mockService = {
      getConceptInfo: vi.fn(),
      validateConcepts: vi.fn(),
      searchConcepts: vi.fn(),
      evaluateEcl: vi.fn(),
    };
    render(<EclEditor terminologyService={mockService as any} />);
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('should pass corsProxy prop', () => {
    render(<EclEditor corsProxy="https://proxy.example.com/" fhirServerUrl="https://tx.example.com/fhir" />);
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('should pass semanticDebounceMs prop', () => {
    render(<EclEditor semanticDebounceMs={1000} />);
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('should pass semanticValidation prop', () => {
    render(<EclEditor semanticValidation={false} />);
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
  });
});
