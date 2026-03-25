// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Refactoring: Strip display terms from ECL expressions
//
// Removes all pipe-delimited display terms (e.g. |Clinical finding|)
// from the expression text, producing a compact numeric-only form.

import type { CoreCodeAction } from '../types';
import { coreReplace } from '../types';
import type { RefactoringContext } from './index';

// eslint-disable-next-line sonarjs/slow-regex -- pipe-delimited terms in ECL are short; no ReDoS risk
const DISPLAY_TERM_PATTERN = /\s*\|[^|]+\|/g;

/**
 * Returns a "Strip display terms" code action if the expression contains
 * at least one pipe-delimited display term.  Returns null otherwise.
 */
export function getStripDisplayTermsAction(ctx: RefactoringContext): CoreCodeAction | null {
  if (!DISPLAY_TERM_PATTERN.test(ctx.expressionText)) {
    return null;
  }

  // Reset lastIndex after .test() since the regex is global
  DISPLAY_TERM_PATTERN.lastIndex = 0;

  const stripped = ctx.expressionText.replace(DISPLAY_TERM_PATTERN, '');

  return {
    title: 'Strip display terms',
    kind: 'refactor' as const,
    documentUri: ctx.documentUri,
    edits: [coreReplace(ctx.expressionRange, stripped)],
  };
}
