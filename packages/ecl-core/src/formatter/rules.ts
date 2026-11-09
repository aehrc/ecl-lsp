// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { FormattingOptions } from './options';

export function getIndentString(level: number, options: FormattingOptions): string {
  const unit = options.indentStyle === 'tab' ? '\t' : ' '.repeat(options.indentSize);
  return unit.repeat(level);
}

export function formatLogicalOperator(operator: string, _options: FormattingOptions): string {
  // AND, OR and MINUS are keyword tokens: the ECL grammar requires mandatory
  // whitespace (`mws`) around them, so their spacing is not configurable.
  // `spaceAroundOperators` is accepted but has no effect here — stripping these
  // spaces produced output that no longer parsed (`< 404684003AND< 19829001`).
  return ` ${operator} `;
}

export function formatRefinementColon(operator: string): string {
  // Colon has no space before, only after
  return `${operator} `;
}

export function formatRefinementEquals(operator: string): string {
  // Equals has spaces on both sides
  return ` ${operator} `;
}

/** A display term's text with newlines, tabs and runs of spaces collapsed to single spaces. */
export function collapseTermWhitespace(term: string): string {
  return term.replaceAll(/\s+/g, ' ').trim();
}

export function normalizeTerm(term: string): string {
  // Normalize whitespace: remove newlines/tabs, collapse multiple spaces to single space
  // Preserve internal spaces between words
  const normalized = collapseTermWhitespace(term);
  // Return with single space padding on each side
  return ` | ${normalized} |`;
}

export function shouldBreakLine(currentLength: number, options: FormattingOptions): boolean {
  if (options.maxLineLength === 0) {
    return false;
  }
  return currentLength > options.maxLineLength;
}
