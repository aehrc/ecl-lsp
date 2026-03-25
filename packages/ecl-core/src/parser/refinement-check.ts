// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { ExpressionNode, NodeType, RefinedExpressionNode, Range } from './ast';

export interface RefinementWarning {
  line: number;
  column: number;
  message: string;
  /** The operator that conflicts with the first one seen. */
  conflictOp: string;
  /** Range covering the refinement text for positioning. */
  range: Range;
}

/**
 * Check an expression for mixed AND/OR operators in refinement clauses.
 *
 * The ECL 2.2 specification requires that AND and OR not be mixed without
 * parentheses at any level. The official ANTLR grammar has a known defect
 * (https://github.com/IHTSDO/snomed-expression-constraint-language/issues/12)
 * that allows mixing at the attribute refinement level via two-layer nesting.
 *
 * This function detects that pattern and returns warnings.
 */
export function checkMixedRefinementOperators(ast: ExpressionNode, sourceText: string): RefinementWarning[] {
  const warnings: RefinementWarning[] = [];
  collectFromExpression(ast.expression, sourceText, warnings);
  return warnings;
}

function collectFromExpression(
  node: ExpressionNode['expression'],
  sourceText: string,
  warnings: RefinementWarning[],
): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- node can be null from incomplete parse
  if (!node) return;
  switch (node.type) {
    case NodeType.RefinedExpression:
      checkRefinement(node, sourceText, warnings);
      // Recurse into focus if it contains nested expressions
      if (node.expression.focus.type === NodeType.ExpressionConstraint) {
        collectFromExpression(node.expression.focus.expression, sourceText, warnings);
      }
      break;
    case NodeType.CompoundExpression:
      for (const operand of node.operands) {
        if (operand.focus.type === NodeType.ExpressionConstraint) {
          collectFromExpression(operand.focus.expression, sourceText, warnings);
        }
      }
      break;
    case NodeType.SubExpressionConstraint:
      if (node.focus.type === NodeType.ExpressionConstraint) {
        collectFromExpression(node.focus.expression, sourceText, warnings);
      }
      break;
    case NodeType.DottedExpression:
      if (node.source.focus.type === NodeType.ExpressionConstraint) {
        collectFromExpression(node.source.focus.expression, sourceText, warnings);
      }
      break;
  }
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- char-by-char refinement scanner with depth/term tracking
function checkRefinement(node: RefinedExpressionNode, sourceText: string, warnings: RefinementWarning[]): void {
  // Extract the refinement text (everything after the colon)
  const refinementText = sourceText.substring(node.refinement.range.start.offset, node.refinement.range.end.offset);
  const baseLine = node.refinement.range.start.line;
  const baseColumn = node.refinement.range.start.column;

  // Scan for AND/OR/comma operators at depth 0 (outside parens, braces, terms)
  let depth = 0;
  let inTerm = false;
  let firstOpType: 'AND' | 'OR' | null = null;
  let firstOpText: string | null = null;
  let i = 0;

  while (i < refinementText.length) {
    const ch = refinementText[i];

    // Track terms (pipe-delimited)
    if (ch === '|') {
      inTerm = !inTerm;
      i++;
      continue;
    }

    if (inTerm) {
      i++;
      continue;
    }

    // Track depth
    if (ch === '(' || ch === '{') {
      depth++;
      i++;
      continue;
    }
    if (ch === ')' || ch === '}') {
      depth--;
      i++;
      continue;
    }

    if (depth !== 0) {
      i++;
      continue;
    }

    // Check for AND keyword (case-insensitive, word boundary)
    if (
      i + 3 <= refinementText.length &&
      /^AND\b/i.test(refinementText.substring(i, i + 4)) &&
      (i === 0 || /\s/.test(refinementText[i - 1]))
    ) {
      if (firstOpType === null) {
        firstOpType = 'AND';
        firstOpText = 'AND';
      } else if (firstOpType === 'OR') {
        // Mixed!
        const localCol = computeColumn(refinementText, i, baseColumn);
        const localLine = computeLine(refinementText, i, baseLine);
        warnings.push({
          line: localLine,
          column: localCol,
          message:
            `Mixed AND/OR operators in refinement without parentheses. ` +
            `The ECL specification does not allow mixing ${firstOpText} and AND in refinements. ` +
            `Add parentheses to clarify precedence.`,
          conflictOp: 'AND',
          range: node.refinement.range,
        });
        return;
      }
      i += 3;
      continue;
    }

    // Check for OR keyword (case-insensitive, word boundary)
    if (
      i + 2 <= refinementText.length &&
      /^OR\b/i.test(refinementText.substring(i, i + 3)) &&
      (i === 0 || /\s/.test(refinementText[i - 1]))
    ) {
      if (firstOpType === null) {
        firstOpType = 'OR';
        firstOpText = 'OR';
      } else if (firstOpType === 'AND') {
        // Mixed!
        const localCol = computeColumn(refinementText, i, baseColumn);
        const localLine = computeLine(refinementText, i, baseLine);
        const firstDesc = firstOpText === ',' ? 'comma (AND)' : firstOpText;
        warnings.push({
          line: localLine,
          column: localCol,
          message:
            `Mixed ${firstDesc} and OR operators in refinement without parentheses. ` +
            `The ECL specification does not allow mixing these operators in refinements. ` +
            `Add parentheses to clarify precedence.`,
          conflictOp: 'OR',
          range: node.refinement.range,
        });
        return;
      }
      i += 2;
      continue;
    }

    // Check for comma (which is a conjunction/AND in ECL)
    if (ch === ',') {
      if (firstOpType === null) {
        firstOpType = 'AND';
        firstOpText = ',';
      } else if (firstOpType === 'OR') {
        // Mixed!
        const localCol = computeColumn(refinementText, i, baseColumn);
        const localLine = computeLine(refinementText, i, baseLine);
        warnings.push({
          line: localLine,
          column: localCol,
          message:
            `Mixed comma (AND) and OR operators in refinement without parentheses. ` +
            `The ECL specification does not allow mixing these operators in refinements. ` +
            `Add parentheses to clarify precedence.`,
          conflictOp: ',',
          range: node.refinement.range,
        });
        return;
      }
      i++;
      continue;
    }

    i++;
  }
}

/** Compute the line number at position `i` within `text`, relative to `baseLine`. */
function computeLine(text: string, i: number, baseLine: number): number {
  let line = baseLine;
  for (let j = 0; j < i; j++) {
    if (text[j] === '\n') line++;
  }
  return line;
}

/** Compute the column at position `i` within `text`, using `baseColumn` for the first line. */
function computeColumn(text: string, i: number, baseColumn: number): number {
  let lastNewline = -1;
  for (let j = 0; j < i; j++) {
    if (text[j] === '\n') lastNewline = j;
  }
  if (lastNewline === -1) {
    // Still on the first line
    return baseColumn + i;
  }
  return i - lastNewline - 1;
}
