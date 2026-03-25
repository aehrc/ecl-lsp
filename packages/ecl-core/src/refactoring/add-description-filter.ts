// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Refactoring: Add description filter to ECL expressions
//
// Appends a description filter block ( {{ D term = "" }} ) to an expression
// that does not already have one, making it easy to begin filtering by term.

import type { CoreCodeAction } from '../types';
import { coreInsert } from '../types';
import type { RefactoringContext } from './index';
import {
  ExpressionNode,
  SubExpressionNode,
  NodeType,
  FilterConstraintNode,
  CompoundExpressionNode,
  RefinedExpressionNode,
  DottedExpressionNode,
} from '../parser/ast';

/**
 * Collects all SubExpressionNodes reachable from an ExpressionNode so we
 * can inspect their filter lists.
 */
function collectSubExpressions(ast: ExpressionNode): SubExpressionNode[] {
  const result: SubExpressionNode[] = [];

  function visit(
    node: SubExpressionNode | CompoundExpressionNode | RefinedExpressionNode | DottedExpressionNode,
  ): void {
    switch (node.type) {
      case NodeType.SubExpressionConstraint:
        result.push(node);
        // If the focus is a nested expression, recurse into it
        if (node.focus.type === NodeType.ExpressionConstraint) {
          const nested = node.focus;
          visit(nested.expression);
        }
        break;

      case NodeType.CompoundExpression:
        for (const operand of node.operands) {
          visit(operand);
        }
        break;

      case NodeType.RefinedExpression:
        visit(node.expression);
        break;

      case NodeType.DottedExpression:
        visit(node.source);
        break;
    }
  }

  visit(ast.expression);
  return result;
}

/**
 * Returns true if any SubExpressionNode in the AST already has a description
 * filter attached.
 */
function hasDescriptionFilterInAST(ast: ExpressionNode): boolean {
  const subs = collectSubExpressions(ast);
  return subs.some((sub) => sub.filters?.some((f: FilterConstraintNode) => f.filterType === 'description') ?? false);
}

/** Quick text-level check for an existing description filter block. */
function hasDescriptionFilterInText(text: string): boolean {
  return /\{\{\s*D/.test(text);
}

/**
 * Returns an "Add description filter" code action when the expression does
 * not already contain a description filter.  Returns null otherwise.
 */
export function getAddDescriptionFilterAction(ctx: RefactoringContext): CoreCodeAction | null {
  // Fast text-based check first
  if (hasDescriptionFilterInText(ctx.expressionText)) {
    return null;
  }

  // AST-based check for robustness
  if (ctx.ast?.expression && hasDescriptionFilterInAST(ctx.ast)) {
    return null;
  }

  const insertPosition = ctx.expressionRange.end;

  return {
    title: 'Add description filter',
    kind: 'refactor' as const,
    documentUri: ctx.documentUri,
    edits: [coreInsert(insertPosition, ' {{ D term = "" }}')],
  };
}
