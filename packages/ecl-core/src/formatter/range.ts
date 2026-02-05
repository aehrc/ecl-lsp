// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { CoreRange } from '../types';
import { positionAt, offsetAt } from '../text-utils';

// Task 15.3: Expand selection to complete expression boundaries
// eslint-disable-next-line sonarjs/cognitive-complexity -- boundary expansion with newline scanning
export function expandToExpressionBoundaries(text: string, range: CoreRange): CoreRange {
  const startOffset = offsetAt(text, range.start);
  const endOffset = offsetAt(text, range.end);

  // Find the start of the expression containing the range start
  let expandedStart = startOffset;

  // Move backwards to find the start of the line or previous expression boundary
  while (expandedStart > 0) {
    const char = text[expandedStart - 1];

    // Stop at newlines followed by non-whitespace (start of new expression)
    if (char === '\n' || char === '\r') {
      // Check if this is a blank line or start of new expression
      const prevChar = expandedStart > 1 ? text[expandedStart - 2] : '';
      if (prevChar === '\n' || prevChar === '\r' || expandedStart === 1) {
        break;
      }
    }

    expandedStart--;
  }

  // Find the end of the expression containing the range end
  let expandedEnd = endOffset;

  // Move forward to find the end of line or next expression boundary
  while (expandedEnd < text.length) {
    const char = text[expandedEnd];

    // Stop at newlines that indicate expression end
    if (char === '\n' || char === '\r') {
      expandedEnd++;
      // Skip additional newlines
      while (expandedEnd < text.length && (text[expandedEnd] === '\n' || text[expandedEnd] === '\r')) {
        expandedEnd++;
      }
      break;
    }

    expandedEnd++;
  }

  return {
    start: positionAt(text, expandedStart),
    end: positionAt(text, expandedEnd),
  };
}

// Task 15.4: Identify which expressions are touched by selection range
// eslint-disable-next-line sonarjs/cognitive-complexity -- expression splitting with comment-aware scanning
export function getExpressionsInRange(text: string, range: CoreRange): { start: number; end: number; text: string }[] {
  const startOffset = offsetAt(text, range.start);
  const endOffset = offsetAt(text, range.end);

  // Split by /* ECL-END */ to find expressions
  const delimiter = '/* ECL-END */';
  const expressions: { start: number; end: number; text: string }[] = [];

  if (!text.includes(delimiter)) {
    // Single expression - return the whole text if range overlaps
    if (startOffset < text.length && endOffset > 0) {
      return [{ start: 0, end: text.length, text: text.trim() }];
    }
    return [];
  }

  // Find delimiter positions, skipping those inside line comments
  const delimiterPositions: number[] = [];
  let scanIdx = 0;
  while (scanIdx < text.length) {
    // Skip line comments (// ... \n)
    if (text[scanIdx] === '/' && scanIdx + 1 < text.length && text[scanIdx + 1] === '/') {
      while (scanIdx < text.length && text[scanIdx] !== '\n') scanIdx++;
      continue;
    }
    if (text.startsWith(delimiter, scanIdx)) {
      delimiterPositions.push(scanIdx);
      scanIdx += delimiter.length;
      continue;
    }
    scanIdx++;
  }

  if (delimiterPositions.length === 0) {
    // No real delimiters (all were inside comments)
    if (startOffset < text.length && endOffset > 0) {
      return [{ start: 0, end: text.length, text: text.trim() }];
    }
    return [];
  }

  // Split at delimiter positions and check overlap with range
  let lastEnd = 0;
  const parts: { start: number; end: number }[] = [];
  for (const pos of delimiterPositions) {
    parts.push({ start: lastEnd, end: pos });
    lastEnd = pos + delimiter.length;
  }
  parts.push({ start: lastEnd, end: text.length });

  for (const part of parts) {
    if (part.end >= startOffset && part.start <= endOffset) {
      expressions.push({
        start: part.start,
        end: part.end,
        text: text.substring(part.start, part.end).trim(),
      });
    }
  }

  return expressions;
}

// Task 15.5: Format only the touched expressions
export function formatRangeExpressions(
  expressions: { start: number; end: number; text: string }[],
  text: string,
  formatFunction: (text: string) => string,
): { range: CoreRange; newText: string }[] {
  const edits: { range: CoreRange; newText: string }[] = [];

  for (const expr of expressions) {
    if (!expr.text) {
      continue;
    }

    // Format this expression
    const formatted = formatFunction(expr.text);

    // Create edit for this expression
    const range: CoreRange = {
      start: positionAt(text, expr.start),
      end: positionAt(text, expr.end),
    };

    edits.push({
      range,
      newText: formatted,
    });
  }

  return edits;
}
