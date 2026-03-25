// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { CorePosition, CoreRange } from './types';

/**
 * Convert a 0-based offset in a text string to a CorePosition (line, character).
 * Equivalent to TextDocument.positionAt().
 */
export function positionAt(text: string, offset: number): CorePosition {
  let line = 0;
  let lastLineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      lastLineStart = i + 1;
    }
  }
  return { line, character: offset - lastLineStart };
}

/**
 * Convert a CorePosition (line, character) to a 0-based offset in a text string.
 * Equivalent to TextDocument.offsetAt().
 */
export function offsetAt(text: string, position: CorePosition): number {
  let line = 0;
  let i = 0;
  while (line < position.line && i < text.length) {
    if (text[i] === '\n') {
      line++;
    }
    i++;
  }
  return i + position.character;
}

/**
 * Get a substring from text using a CoreRange.
 * Equivalent to TextDocument.getText(range).
 */
export function getText(text: string, range?: CoreRange): string {
  if (!range) return text;
  const start = offsetAt(text, range.start);
  const end = offsetAt(text, range.end);
  return text.substring(start, end);
}
