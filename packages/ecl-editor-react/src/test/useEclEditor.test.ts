// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock ecl-core to avoid pulling in the real parser/formatter at test time.
vi.mock('@aehrc/ecl-core', () => ({
  formatDocument: vi.fn((text: string) => text.trim()),
  defaultFormattingOptions: {
    indentSize: 2,
    indentStyle: 'space',
    spaceAroundOperators: true,
    maxLineLength: 80,
    alignTerms: true,
    wrapComments: false,
    breakOnOperators: false,
    breakOnRefinementComma: false,
    breakAfterColon: false,
  },
}));

import { useEclEditor } from '../useEclEditor';
import { formatDocument } from '@aehrc/ecl-core';

describe('useEclEditor', () => {
  it('should set initial value correctly', () => {
    const { result } = renderHook(() => useEclEditor({ initialValue: '<< 404684003' }));
    expect(result.current.value).toBe('<< 404684003');
  });

  it('should default to empty string when no initial value', () => {
    const { result } = renderHook(() => useEclEditor());
    expect(result.current.value).toBe('');
  });

  it('should update value via onChange', () => {
    const { result } = renderHook(() => useEclEditor());

    act(() => {
      result.current.onChange('< 19829001');
    });

    expect(result.current.value).toBe('< 19829001');
  });

  it('should update value via setValue', () => {
    const { result } = renderHook(() => useEclEditor());

    act(() => {
      result.current.setValue('<< 73211009');
    });

    expect(result.current.value).toBe('<< 73211009');
  });

  it('should return current value from getValue', () => {
    const { result } = renderHook(() => useEclEditor({ initialValue: '^ 447562003' }));
    expect(result.current.getValue()).toBe('^ 447562003');
  });

  it('should return updated value from getValue after onChange', () => {
    const { result } = renderHook(() => useEclEditor());

    act(() => {
      result.current.onChange('< 404684003 AND < 19829001');
    });

    expect(result.current.getValue()).toBe('< 404684003 AND < 19829001');
  });

  it('should call formatDocument and update value on format()', () => {
    const { result } = renderHook(() => useEclEditor({ initialValue: '  << 404684003  ' }));

    act(() => {
      result.current.format();
    });

    expect(formatDocument).toHaveBeenCalled();
    expect(result.current.value).toBe('<< 404684003');
  });

  it('should not update value when format produces the same text', () => {
    const { result } = renderHook(() => useEclEditor({ initialValue: 'already-trimmed' }));

    const valueBefore = result.current.value;

    act(() => {
      result.current.format();
    });

    expect(result.current.value).toBe(valueBefore);
  });

  it('should update diagnostics via onDiagnostics', () => {
    const { result } = renderHook(() => useEclEditor());

    expect(result.current.diagnostics).toEqual([]);

    const mockDiags = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        message: 'Syntax error',
        severity: 'error' as const,
      },
    ];

    act(() => {
      result.current.onDiagnostics(mockDiags);
    });

    expect(result.current.diagnostics).toEqual(mockDiags);
    expect(result.current.diagnostics).toHaveLength(1);
  });

  it('should clear diagnostics when empty array is passed', () => {
    const { result } = renderHook(() => useEclEditor());

    act(() => {
      result.current.onDiagnostics([
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
          message: 'Error',
          severity: 'error',
        },
      ]);
    });

    expect(result.current.diagnostics).toHaveLength(1);

    act(() => {
      result.current.onDiagnostics([]);
    });

    expect(result.current.diagnostics).toEqual([]);
  });
});
