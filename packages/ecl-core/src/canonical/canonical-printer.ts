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
  type RefinementMemberNode,
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
  return printExpression(ast, sourceText, outerOperator, outerOperator === undefined);
}

/**
 * `topLevel` is true where a full expression constraint is legal without parentheses: the whole
 * expression, or directly inside a pair of parentheses. Refined and dotted expressions are only
 * legal unparenthesised there.
 */
function printExpression(node: ExpressionNode, src: string, outerOperator?: string, topLevel = false): string {
  const inner = node.expression;
  switch (inner.type) {
    case NodeType.SubExpressionConstraint:
      return printSubExpression(inner, src, outerOperator, topLevel);
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

function printSubExpression(node: SubExpressionNode, src: string, outerOperator?: string, topLevel = false): string {
  let result = '';

  // Constraint operator — compact form (no space before concept)
  if (node.operator) {
    result += node.operator.operator;
  }

  // Member-of (^), with any member field selection
  if (node.memberOf) {
    result += node.memberFields ? `^[${node.memberFields.join(',')}]` : '^';
  }

  // Focus
  switch (node.focus.type) {
    case NodeType.ConceptReference:
      result += printConceptReference(node.focus);
      break;
    case NodeType.Wildcard:
      result += '*';
      break;
    case NodeType.AlternateIdentifier:
      result += node.focus.identifier;
      break;
    case NodeType.ExpressionConstraint: {
      const innerExpr = node.focus.expression;
      result += parensRedundant(node, innerExpr, outerOperator, topLevel)
        ? printExpression(node.focus, src, outerOperator, topLevel)
        : '(' + printExpression(node.focus, src, undefined, true) + ')';
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

/** §5.5 redundant parenthesis removal: can the parens around `inner` (the focus of `node`) be dropped? */
function parensRedundant(
  node: SubExpressionNode,
  inner: ExpressionNode['expression'],
  outerOperator: string | undefined,
  topLevel: boolean,
): boolean {
  // An operator or ^ applied to a constrained/refined inner expression needs the parens
  if ((node.operator || node.memberOf) && !isBareFocus(inner)) return false;
  // A filter or history supplement applied to a compound/refined/dotted group needs the parens
  if ((node.filters?.length || node.historySupplement) && inner.type !== NodeType.SubExpressionConstraint) {
    return false;
  }
  // Rule 1: a plain sub-expression never needs them
  if (inner.type === NodeType.SubExpressionConstraint) return true;
  // The whole expression (or a group that is itself directly parenthesised) needs no extra parens
  const plain = !node.operator && !node.memberOf && !node.filters?.length && !node.historySupplement;
  if (topLevel && plain) return true;
  // Refined and dotted expressions are only legal unparenthesised at the top level
  if (inner.type !== NodeType.CompoundExpression) return false;
  // Rule 2: same associative operator as outer → redundant (normally flattened by the normaliser).
  // MINUS is not associative: A MINUS (B MINUS C) differs from (A MINUS B) MINUS C.
  // Rule 3: different operator or no outer context → keep parens
  return (
    inner.operator.operator !== 'MINUS' && outerOperator !== undefined && inner.operator.operator === outerOperator
  );
}

/** True when the expression is just a concept reference or wildcard, with nothing applied to it. */
function isBareFocus(expr: ExpressionNode['expression']): boolean {
  return (
    expr.type === NodeType.SubExpressionConstraint &&
    !expr.operator &&
    !expr.memberOf &&
    !expr.filters?.length &&
    !expr.historySupplement &&
    (expr.focus.type !== NodeType.ExpressionConstraint || isBareFocus(expr.focus.expression))
  );
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
  return node.content ? printRefinementMember(node.content, src) : '';
}

/**
 * Canonical form of a refinement member.
 *
 * The conjunction/disjunction operator and the grouping are part of the meaning:
 * a comma is a CONJUNCTION, so a disjunction must not collapse to one (issue #73).
 * Explicit `AND` is normalised to `,` because the two are equivalent.
 */
export function printRefinementMember(node: RefinementMemberNode, src: string): string {
  switch (node.type) {
    case NodeType.Attribute:
      return printAttribute(node, src);
    case NodeType.AttributeGroup:
      return (node.cardinality ?? '') + '{' + printRefinementMember(node.content, src) + '}';
    case NodeType.AttributeSet: {
      const sep = node.operator === 'OR' ? ' OR ' : ',';
      return node.members
        .map((member) =>
          member.type === NodeType.AttributeSet
            ? '(' + printRefinementMember(member, src) + ')'
            : printRefinementMember(member, src),
        )
        .join(sep);
    }
  }
}

function printAttribute(node: AttributeNode, src: string): string {
  const cardinalityPrefix = node.cardinality ? node.cardinality + ' ' : '';

  // Name
  let name: string;
  if (node.name.conceptId) {
    name = node.name.conceptId;
  } else if (node.name.expression) {
    name = printSubExpression(node.name.expression, src);
  } else {
    name = src.slice(node.name.range.start.offset, node.name.range.end.offset).trim();
  }

  const compOp = node.comparison ?? '=';
  const between = src.slice(node.name.range.end.offset, node.value.range.start.offset);

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
