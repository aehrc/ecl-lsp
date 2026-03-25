// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type * as Monaco from 'monaco-editor';
import {
  formatDocument,
  expandToExpressionBoundaries,
  getExpressionsInRange,
  formatRangeExpressions,
  defaultFormattingOptions,
} from '@aehrc/ecl-core';
import type { FormattingOptions } from '@aehrc/ecl-core';

export function createDocumentFormattingProvider(
  getFormattingOptions: () => Partial<FormattingOptions>,
): Monaco.languages.DocumentFormattingEditProvider {
  return {
    provideDocumentFormattingEdits(model: Monaco.editor.ITextModel): Monaco.languages.TextEdit[] {
      const text = model.getValue();
      const options = { ...defaultFormattingOptions, ...getFormattingOptions() };
      const formatted = formatDocument(text, options);

      if (formatted === text) return [];

      const fullRange = model.getFullModelRange();
      return [{ range: fullRange, text: formatted }];
    },
  };
}

export function createDocumentRangeFormattingProvider(
  getFormattingOptions: () => Partial<FormattingOptions>,
): Monaco.languages.DocumentRangeFormattingEditProvider {
  return {
    provideDocumentRangeFormattingEdits(
      model: Monaco.editor.ITextModel,
      range: Monaco.Range,
    ): Monaco.languages.TextEdit[] {
      const text = model.getValue();
      const options = { ...defaultFormattingOptions, ...getFormattingOptions() };

      // Convert Monaco range (1-based) to 0-based CoreRange
      const coreRange = {
        start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
        end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
      };

      const expanded = expandToExpressionBoundaries(text, coreRange);
      const expressionsInRange = getExpressionsInRange(text, expanded);
      const edits = formatRangeExpressions(expressionsInRange, text, (t) => formatDocument(t, options));

      return edits.map((edit) => ({
        range: {
          startLineNumber: edit.range.start.line + 1,
          startColumn: edit.range.start.character + 1,
          endLineNumber: edit.range.end.line + 1,
          endColumn: edit.range.end.character + 1,
        },
        text: edit.newText,
      }));
    },
  };
}
