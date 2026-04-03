// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Public API for canonical ECL expression comparison.

import { parseECL } from '../parser';
import type { ParseError } from '../parser';
import { normaliseAst } from './normaliser';
import { printCanonical } from './canonical-printer';

export type ComparisonResult = 'identical' | 'structurally_equivalent' | 'different';

export class CanonicaliseError extends Error {
  constructor(
    message: string,
    public readonly parseErrors: ParseError[],
  ) {
    super(message);
    this.name = 'CanonicaliseError';
  }
}

/**
 * Returns a canonical string form of the given ECL expression.
 *
 * Applies deterministic ordering (AND/OR operands, refinement attributes),
 * strips display terms, removes redundant parentheses, and normalises whitespace.
 *
 * Throws `CanonicaliseError` if the expression cannot be parsed.
 */
export function canonicalise(expression: string): string {
  const { ast, errors } = parseECL(expression);
  if (!ast || errors.length > 0) {
    throw new CanonicaliseError(`Cannot canonicalise invalid ECL: ${errors[0]?.message ?? 'unknown error'}`, errors);
  }
  const normalised = normaliseAst(ast, expression);
  return printCanonical(normalised, expression);
}

/**
 * Compares two ECL expressions.
 *
 * Returns 'identical' if the trimmed input strings are equal.
 * Returns 'structurally_equivalent' if they differ but canonicalise to the same form.
 * Returns 'different' otherwise.
 *
 * Both expressions must be syntactically valid. If either fails to parse,
 * a CanonicaliseError is thrown.
 */
export function compareExpressions(a: string, b: string): ComparisonResult {
  if (a.trim() === b.trim()) return 'identical';
  const ca = canonicalise(a);
  const cb = canonicalise(b);
  return ca === cb ? 'structurally_equivalent' : 'different';
}
