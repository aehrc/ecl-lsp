// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console -- validation helpers use console for warnings */
import { defaultFormattingOptions } from './options';

// Pure validation functions for formatting options

export function validateIndentSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 8) {
    if (value !== undefined) {
      console.warn(
        'Invalid ecl.formatting.indentSize (must be 1-8), using default:',
        defaultFormattingOptions.indentSize,
      );
    }
    return defaultFormattingOptions.indentSize;
  }
  return Math.floor(value);
}

export function validateIndentStyle(value: unknown): 'space' | 'tab' {
  if (value !== 'space' && value !== 'tab') {
    if (value !== undefined) {
      console.warn(
        'Invalid ecl.formatting.indentStyle (must be "space" or "tab"), using default:',
        defaultFormattingOptions.indentStyle,
      );
    }
    return defaultFormattingOptions.indentStyle;
  }
  return value;
}

export function validateMaxLineLength(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    if (value !== undefined) {
      console.warn(
        'Invalid ecl.formatting.maxLineLength (must be >= 0), using default:',
        defaultFormattingOptions.maxLineLength,
      );
    }
    return defaultFormattingOptions.maxLineLength;
  }
  return Math.floor(value);
}

export function validateBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value !== 'boolean') {
    return defaultValue;
  }
  return value;
}
