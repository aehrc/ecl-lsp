// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { FormattingOptions } from './options';

export function getIndentString(level: number, options: FormattingOptions): string {
  const unit = options.indentStyle === 'tab' ? '\t' : ' '.repeat(options.indentSize);
  return unit.repeat(level);
}

export function formatLogicalOperator(operator: string, options: FormattingOptions): string {
  if (options.spaceAroundOperators) {
    return ` ${operator} `;
  }
  return operator;
}

export function formatRefinementColon(operator: string): string {
  // Colon has no space before, only after
  return `${operator} `;
}

export function formatRefinementEquals(operator: string): string {
  // Equals has spaces on both sides
  return ` ${operator} `;
}

export function normalizeTerm(term: string): string {
  // Normalize whitespace: remove newlines/tabs, collapse multiple spaces to single space
  // Preserve internal spaces between words
  const normalized = term.replaceAll(/\s+/g, ' ').trim();
  // Return with single space padding on each side
  return ` | ${normalized} |`;
}

export function shouldBreakLine(currentLength: number, options: FormattingOptions): boolean {
  if (options.maxLineLength === 0) {
    return false;
  }
  return currentLength > options.maxLineLength;
}
