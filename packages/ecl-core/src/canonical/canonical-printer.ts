// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Deterministic string emission from a normalised ECL AST.
// Produces a single-line, compact, canonical form for structural comparison.

import {
  NodeType,
  type ExpressionNode,
  type SubExpressionNode,
  type CompoundExpressionNode,
  type RefinedExpressionNode,
  type DottedExpressionNode,
  type RefinementNode,
  type AttributeNode,
  type ConceptReferenceNode,
} from '../parser/ast';

/**
 * Print a canonical string from an ECL AST node.
 * Accepts either a full ExpressionNode or a SubExpressionNode (for sort-key computation).
 */
export function printCanonical(
  ast: ExpressionNode | SubExpressionNode,
  sourceText: string,
  outerOperator?: string,
): string {
  if (ast.type === NodeType.SubExpressionConstraint) {
    return printSubExpression(ast, sourceText, outerOperator);
  }
  return printExpression(ast, sourceText, outerOperator);
}

function printExpression(node: ExpressionNode, src: string, outerOperator?: string): string {
  const inner = node.expression;
  switch (inner.type) {
    case NodeType.SubExpressionConstraint:
      return printSubExpression(inner, src, outerOperator);
    case NodeType.CompoundExpression:
      return printCompoundExpression(inner, src);
    case NodeType.RefinedExpression:
      return printRefinedExpression(inner, src);
    case NodeType.DottedExpression:
      return printDottedExpression(inner, src);
    default: {
      const _exhaustive: never = inner;
      return String(_exhaustive);
    }
  }
}

function printSubExpression(node: SubExpressionNode, src: string, outerOperator?: string): string {
  let result = '';

  // Constraint operator — compact form (no space before concept)
  if (node.operator) {
    result += node.operator.operator;
  }

  // Member-of (^)
  if (node.memberOf) {
    result += '^';
  }

  // Focus
  switch (node.focus.type) {
    case NodeType.ConceptReference:
      result += printConceptReference(node.focus);
      break;
    case NodeType.Wildcard:
      result += '*';
      break;
    case NodeType.ExpressionConstraint: {
      const innerExpr = node.focus.expression;
      // §5.5 redundant parenthesis removal — 3-way check
      if (innerExpr.type !== NodeType.CompoundExpression) {
        // Rule 1: inner is non-compound → parens always redundant
        result += printExpression(node.focus, src, outerOperator);
      } else if (outerOperator && innerExpr.operator.operator === outerOperator) {
        // Rule 2: same operator as outer → redundant (handled by normaliser flattening)
        // If we get here, the normaliser didn't flatten — emit without parens anyway
        result += printExpression(node.focus, src, outerOperator);
      } else {
        // Rule 3: different operator or no outer context → keep parens
        result += '(' + printExpression(node.focus, src) + ')';
      }
      break;
    }
  }

  // Filters — opaque passthrough with whitespace normalisation
  if (node.filters) {
    for (const filter of node.filters) {
      const filterText = src.slice(filter.range.start.offset, filter.range.end.offset);
      result += ' ' + filterText.replaceAll(/\s+/g, ' ').trim();
    }
  }

  // History supplement — opaque passthrough
  if (node.historySupplement) {
    const histText = src.slice(node.historySupplement.range.start.offset, node.historySupplement.range.end.offset);
    result += ' ' + histText.replaceAll(/\s+/g, ' ').trim();
  }

  return result;
}

function printCompoundExpression(node: CompoundExpressionNode, src: string): string {
  const op = node.operator.operator;
  return node.operands.map((operand) => printSubExpression(operand, src, op)).join(` ${op} `);
}

function printRefinedExpression(node: RefinedExpressionNode, src: string): string {
  const focus = printSubExpression(node.expression, src);
  const refinement = printRefinement(node.refinement, src);
  return focus + ':' + refinement;
}

function printDottedExpression(node: DottedExpressionNode, src: string): string {
  const source = printSubExpression(node.source, src);
  const dots = node.attributes.map((a) => printSubExpression(a.attributeName, src));
  return source + dots.map((d) => '.' + d).join('');
}

function printRefinement(node: RefinementNode, src: string): string {
  // Build each attribute, detecting per-attribute brace groups from source
  const parts: string[] = [];
  let prevEnd = node.range.start.offset;

  for (const attr of node.attributes) {
    const printed = printAttribute(attr, src);
    const inBraces = isAttrInBraceGroup(attr, prevEnd, src);
    parts.push(inBraces ? '{' + printed + '}' : printed);
    prevEnd = attr.range.end.offset;
  }

  return parts.join(',');
}

function isAttrInBraceGroup(attr: AttributeNode, prevEnd: number, src: string): boolean {
  const gap = src.slice(prevEnd, attr.range.start.offset);
  return gap.includes('{');
}

function printAttribute(node: AttributeNode, src: string): string {
  // Cardinality prefix — recovered from source text
  const preNameSrc = src.slice(node.range.start.offset, node.name.range.start.offset).trim();
  // Strip leading { that might be in the gap (brace group handled by caller)
  const cardinalityRaw = preNameSrc.replace(/^\{?\s*/, '').trim();
  const cardinalityPrefix = cardinalityRaw.length > 0 ? cardinalityRaw + ' ' : '';

  // Name
  let name: string;
  if (node.name.conceptId) {
    name = node.name.conceptId;
  } else if (node.name.expression) {
    name = printSubExpression(node.name.expression, src);
  } else {
    name = src.slice(node.name.range.start.offset, node.name.range.end.offset).trim();
  }

  // Comparison operator — recovered from source gap
  const between = src.slice(node.name.range.end.offset, node.value.range.start.offset);
  const opMatch = /(!?=|[<>]=)/.exec(between);
  const compOp = opMatch ? opMatch[1] : '=';

  // # prefix for numeric comparisons
  const hasHashPrefix = between.includes('#');

  // Value
  let value: string;
  if (node.value.expression) {
    value = printSubExpression(node.value.expression, src);
  } else if (node.value.rawValue) {
    value = hasHashPrefix ? '#' + node.value.rawValue : node.value.rawValue;
  } else {
    value = src.slice(node.value.range.start.offset, node.value.range.end.offset).trim();
  }

  const reversed = node.reversed ? 'R ' : '';
  return cardinalityPrefix + reversed + name + ' ' + compOp + ' ' + value;
}

function printConceptReference(node: ConceptReferenceNode): string {
  // Terms are stripped by the normaliser — just emit the concept ID
  return node.conceptId;
}
