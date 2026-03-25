// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Refactoring: Add history supplement to ECL expressions
//
// Appends a HISTORY-MIN history supplement to the expression,
// enabling retrieval of historical associations for inactive concepts.

import type { CoreCodeAction } from '../types';
import { coreInsert } from '../types';
import type { RefactoringContext } from './index';
import { NodeType } from '../parser/ast';
import type {
  SubExpressionNode,
  CompoundExpressionNode,
  RefinedExpressionNode,
  DottedExpressionNode,
} from '../parser/ast';

const HISTORY_SUPPLEMENT_PATTERN = /\{\{\s*\+/;

/**
 * Returns true if any SubExpressionNode in the AST already has a historySupplement.
 */
function astHasHistorySupplement(
  expr: SubExpressionNode | CompoundExpressionNode | RefinedExpressionNode | DottedExpressionNode,
): boolean {
  switch (expr.type) {
    case NodeType.SubExpressionConstraint:
      return !!expr.historySupplement;

    case NodeType.CompoundExpression:
      return expr.operands.some((op) => !!op.historySupplement);

    case NodeType.RefinedExpression:
      return !!expr.expression.historySupplement;

    case NodeType.DottedExpression:
      return !!expr.source.historySupplement;

    default:
      return false;
  }
}

/** History supplement profiles with their display labels. */
const HISTORY_PROFILES = [
  { profile: 'HISTORY-MIN', label: 'Minimal (SAME-AS, REPLACED-BY, MOVED-TO)' },
  { profile: 'HISTORY-MOD', label: 'Moderate (min + POSSIBLY-EQUIVALENT-TO)' },
  { profile: 'HISTORY-MAX', label: 'Maximum (all association types)' },
  { profile: 'HISTORY', label: 'All historical associations' },
] as const;

/**
 * Returns code actions to add a history supplement with each profile.
 * Returns an empty array if the expression already has a history supplement.
 */
export function getAddHistorySupplementAction(ctx: RefactoringContext): CoreCodeAction | null;
export function getAddHistorySupplementAction(ctx: RefactoringContext): CoreCodeAction | null {
  // Quick text-based check
  if (HISTORY_SUPPLEMENT_PATTERN.test(ctx.expressionText)) {
    return null;
  }

  // AST-based check if available
  if (ctx.ast?.expression) {
    if (astHasHistorySupplement(ctx.ast.expression)) {
      return null;
    }
  }

  // Return the first (HISTORY-MIN) as the primary action — the rest are
  // collected by getAddHistorySupplementActions() for the full list.
  return {
    title: 'Add history supplement (HISTORY-MIN)',
    kind: 'refactor' as const,
    documentUri: ctx.documentUri,
    edits: [
      coreInsert(
        { line: ctx.expressionRange.end.line, character: ctx.expressionRange.end.character },
        ' {{ + HISTORY-MIN }}',
      ),
    ],
  };
}

/**
 * Returns 4 code actions (one per history profile) if the expression
 * does not already contain a history supplement.  Returns empty array otherwise.
 */
export function getAddHistorySupplementActions(ctx: RefactoringContext): CoreCodeAction[] {
  // Quick text-based check
  if (HISTORY_SUPPLEMENT_PATTERN.test(ctx.expressionText)) {
    return [];
  }

  // AST-based check if available
  if (ctx.ast?.expression) {
    if (astHasHistorySupplement(ctx.ast.expression)) {
      return [];
    }
  }

  return HISTORY_PROFILES.map(({ profile }) => ({
    title: `Add history supplement (${profile})`,
    kind: 'refactor' as const,
    documentUri: ctx.documentUri,
    edits: [
      coreInsert(
        { line: ctx.expressionRange.end.line, character: ctx.expressionRange.end.character },
        ` {{ + ${profile} }}`,
      ),
    ],
  }));
}
