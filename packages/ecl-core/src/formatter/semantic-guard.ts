// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Safety net for the formatter: a structural fingerprint of an expression that
// ignores everything formatting is allowed to change (whitespace, line breaks,
// indentation, display terms, redundant parentheses, operand order) and captures
// everything it must not (operators, grouping, concepts, comparisons, values).
//
// Checking that the formatted output still parses is NOT enough: turning
// `A = x OR B = y` into `A = x, B = y` yields perfectly valid ECL that selects a
// different set of concepts (issue #73). Only a structural comparison catches it.

import { parseECL, type ExpressionNode } from '../parser';
import { normaliseAst } from '../canonical/normaliser';
import { printCanonical } from '../canonical/canonical-printer';

/** Structural fingerprint of an already-parsed expression. */
export function structuralSignature(ast: ExpressionNode, sourceText: string): string {
  return printCanonical(normaliseAst(ast, sourceText), sourceText);
}

/**
 * Structural fingerprint of ECL text, or `null` when the text cannot be parsed
 * unambiguously. A `null` signature means "unknown", so callers must treat it as
 * "cannot verify" rather than "not equivalent".
 */
export function signatureOf(text: string): string | null {
  try {
    const { ast, errors } = parseECL(text);
    if (!ast || errors.length > 0) {
      return null;
    }
    return structuralSignature(ast, text);
  } catch {
    return null;
  }
}
