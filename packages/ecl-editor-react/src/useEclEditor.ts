// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { useState, useCallback, useRef } from 'react';
import type { CoreDiagnostic, FormattingOptions } from '@aehrc/ecl-core';
import { formatDocument, defaultFormattingOptions } from '@aehrc/ecl-core';

export interface UseEclEditorOptions {
  /** Initial value. */
  initialValue?: string;
  /** Formatting options for format(). */
  formattingOptions?: Partial<FormattingOptions>;
}

export interface UseEclEditorReturn {
  /** Current editor value. */
  value: string;
  /** Set editor value. */
  setValue: (value: string) => void;
  /** Current diagnostics. */
  diagnostics: CoreDiagnostic[];
  /** Format the current document. */
  format: () => void;
  /** Get current value (same as value, for imperative access). */
  getValue: () => string;
  /** onChange handler to pass to EclEditor. */
  onChange: (value: string) => void;
  /** onDiagnostics handler to pass to EclEditor. */
  onDiagnostics: (diagnostics: CoreDiagnostic[]) => void;
}

/**
 * Hook for programmatic control of the ECL editor.
 *
 * Usage:
 * ```tsx
 * const editor = useEclEditor({ initialValue: '<< 404684003' });
 * return <EclEditor value={editor.value} onChange={editor.onChange} onDiagnostics={editor.onDiagnostics} />;
 * ```
 */
export function useEclEditor(options: UseEclEditorOptions = {}): UseEclEditorReturn {
  const [value, setValue] = useState(options.initialValue ?? '');
  const [diagnostics, setDiagnostics] = useState<CoreDiagnostic[]>([]);
  const formattingOpts = useRef(options.formattingOptions);
  formattingOpts.current = options.formattingOptions;

  const onChange = useCallback((newValue: string) => {
    setValue(newValue);
  }, []);

  const onDiagnostics = useCallback((diags: CoreDiagnostic[]) => {
    setDiagnostics(diags);
  }, []);

  const getValue = useCallback(() => {
    return value;
  }, [value]);

  const format = useCallback(() => {
    const opts = { ...defaultFormattingOptions, ...formattingOpts.current };
    const formatted = formatDocument(value, opts);
    if (formatted !== value) {
      setValue(formatted);
    }
  }, [value]);

  return {
    value,
    setValue,
    diagnostics,
    format,
    getValue,
    onChange,
    onDiagnostics,
  };
}
