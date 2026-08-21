// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// AST normalisation for canonical comparison: term stripping, operand sorting,
// attribute sorting, and same-operator flattening.

import {
  NodeType,
  type ExpressionNode,
  type SubExpressionNode,
  type CompoundExpressionNode,
  type RefinedExpressionNode,
  type DottedExpressionNode,
  type RefinementNode,
  type RefinementMemberNode,
  type AttributeSetNode,
  type AttributeNode,
  type AttributeNameNode,
  type AttributeValueNode,
  type ConceptReferenceNode,
  type WildcardNode,
  type DottedAttributeNode,
  type FilterConstraintNode,
} from '../parser/ast';
import { printCanonical, printRefinementMember } from './canonical-printer';

/**
 * Produce a normalised deep copy of the AST.
 * Strips display terms, sorts commutative operands and attributes,
 * and flattens same-operator compound expressions.
 */
export function normaliseAst(ast: ExpressionNode, sourceText: string): ExpressionNode {
  return normaliseExpression(ast, sourceText);
}

function normaliseExpression(node: ExpressionNode, src: string): ExpressionNode {
  const inner = node.expression;
  let normalised;
  switch (inner.type) {
    case NodeType.SubExpressionConstraint:
      normalised = normaliseSubExpression(inner, src);
      break;
    case NodeType.CompoundExpression:
      normalised = normaliseCompoundExpression(inner, src);
      break;
    case NodeType.RefinedExpression:
      normalised = normaliseRefinedExpression(inner, src);
      break;
    case NodeType.DottedExpression:
      normalised = normaliseDottedExpression(inner, src);
      break;
    default: {
      const _exhaustive: never = inner;
      normalised = _exhaustive;
    }
  }
  return { ...node, expression: normalised };
}

function normaliseSubExpression(node: SubExpressionNode, src: string): SubExpressionNode {
  let focus: ConceptReferenceNode | WildcardNode | ExpressionNode;
  switch (node.focus.type) {
    case NodeType.ConceptReference:
      focus = stripTerm(node.focus);
      break;
    case NodeType.Wildcard:
      focus = { ...node.focus };
      break;
    case NodeType.ExpressionConstraint:
      focus = normaliseExpression(node.focus, src);
      break;
  }

  return {
    ...node,
    operator: node.operator ? { ...node.operator } : undefined,
    focus,
    filters: node.filters ? node.filters.map(copyFilter) : undefined,
    historySupplement: node.historySupplement ? { ...node.historySupplement } : undefined,
  };
}

function normaliseCompoundExpression(node: CompoundExpressionNode, src: string): CompoundExpressionNode {
  const op = node.operator.operator;

  // Normalise all operands first
  let normOperands = node.operands.map((o) => normaliseSubExpression(o, src));

  // §5.5 rule 2: flatten same-operator nested compounds (AND inside AND, OR inside OR)
  if (op === 'AND' || op === 'OR') {
    normOperands = flattenSameOperator(normOperands, op, src);
  }

  // §5.2: sort commutative operators by canonical string
  if (op === 'AND' || op === 'OR') {
    normOperands.sort((a, b) => {
      const ka = printCanonical(a, src);
      const kb = printCanonical(b, src);
      return ka.localeCompare(kb);
    });
  }

  return {
    ...node,
    operator: { ...node.operator },
    operands: normOperands,
  };
}

/**
 * Flatten operands that are parenthesized compound expressions with the same operator.
 * e.g., (A AND B) AND C → [A, B, C]
 */
function flattenSameOperator(operands: SubExpressionNode[], operator: 'AND' | 'OR', src: string): SubExpressionNode[] {
  const result: SubExpressionNode[] = [];
  for (const operand of operands) {
    // Check if this operand is a parenthesized compound with the same operator
    if (
      operand.focus.type === NodeType.ExpressionConstraint &&
      !operand.operator &&
      !operand.memberOf &&
      !operand.filters &&
      !operand.historySupplement
    ) {
      const inner = operand.focus.expression;
      if (inner.type === NodeType.CompoundExpression && inner.operator.operator === operator) {
        // Flatten: add inner operands (already normalised) instead of the wrapper
        const innerNorm = normaliseCompoundExpression(inner, src);
        result.push(...innerNorm.operands);
        continue;
      }
    }
    result.push(operand);
  }
  return result;
}

function normaliseRefinedExpression(node: RefinedExpressionNode, src: string): RefinedExpressionNode {
  return {
    ...node,
    expression: normaliseSubExpression(node.expression, src),
    refinement: normaliseRefinement(node.refinement, src),
  };
}

function normaliseRefinement(node: RefinementNode, src: string): RefinementNode {
  const content = node.content ? normaliseRefinementMember(node.content, src) : null;
  const attributes: AttributeNode[] = [];
  collectAttributes(content, attributes);
  return { ...node, attributes, content };
}

/**
 * Normalise a refinement member, preserving the operator and the grouping.
 *
 * Conjunction and disjunction are both commutative, so members within a set are
 * sorted; they are NOT merged across sets, because a comma is a conjunction and
 * flattening a disjunction into one would change the meaning (issue #73).
 */
function normaliseRefinementMember(node: RefinementMemberNode, src: string): RefinementMemberNode {
  switch (node.type) {
    case NodeType.Attribute:
      return normaliseAttribute(node, src);
    case NodeType.AttributeGroup:
      return { ...node, content: normaliseRefinementMember(node.content, src) };
    case NodeType.AttributeSet: {
      // §5.5 rule 2: nested sets with the SAME operator are redundantly
      // parenthesised — flatten them. Different operators are load-bearing.
      const members = flattenSameOperatorMembers(node).map((m) => normaliseRefinementMember(m, src));
      members.sort((a, b) => compareRefinementMembers(a, b, src));
      // Explicit AND and comma mean the same thing — normalise to comma.
      return { ...node, conjunctionStyle: ',', members };
    }
  }
}

function flattenSameOperatorMembers(node: AttributeSetNode): RefinementMemberNode[] {
  const result: RefinementMemberNode[] = [];
  for (const member of node.members) {
    if (member.type === NodeType.AttributeSet && member.operator === node.operator) {
      result.push(...flattenSameOperatorMembers(member));
    } else {
      result.push(member);
    }
  }
  return result;
}

/** Flatten a refinement tree into its attributes, in tree order. */
function collectAttributes(node: RefinementMemberNode | null, out: AttributeNode[]): void {
  if (!node) return;
  switch (node.type) {
    case NodeType.Attribute:
      out.push(node);
      break;
    case NodeType.AttributeGroup:
      collectAttributes(node.content, out);
      break;
    case NodeType.AttributeSet:
      for (const member of node.members) {
        collectAttributes(member, out);
      }
      break;
  }
}

/**
 * §5.3: order refinement members deterministically — plain attributes first
 * (numerically by attribute SCTID), then groups and nested sets by canonical text.
 */
function compareRefinementMembers(a: RefinementMemberNode, b: RefinementMemberNode, src: string): number {
  if (a.type === NodeType.Attribute && b.type === NodeType.Attribute) {
    return compareAttributes(a, b, src);
  }
  if (a.type === NodeType.Attribute) return -1;
  if (b.type === NodeType.Attribute) return 1;
  return printRefinementMember(a, src).localeCompare(printRefinementMember(b, src));
}

function compareAttributes(a: AttributeNode, b: AttributeNode, src: string): number {
  const aId = a.name.conceptId;
  const bId = b.name.conceptId;

  // Both have concept IDs → numeric comparison
  if (aId && bId) {
    const aBig = BigInt(aId);
    const bBig = BigInt(bId);
    if (aBig < bBig) return -1;
    if (aBig > bBig) return 1;
    return 0;
  }

  // Concept IDs sort before expression-based names
  if (aId) return -1;
  if (bId) return 1;

  // Both expression-based → compare canonical strings
  const aKey = a.name.expression ? printCanonical(a.name.expression, src) : '';
  const bKey = b.name.expression ? printCanonical(b.name.expression, src) : '';
  return aKey.localeCompare(bKey);
}

function normaliseAttribute(node: AttributeNode, src: string): AttributeNode {
  return {
    ...node,
    name: normaliseAttributeName(node.name, src),
    value: normaliseAttributeValue(node.value, src),
  };
}

function normaliseAttributeName(node: AttributeNameNode, src: string): AttributeNameNode {
  return {
    ...node,
    term: undefined, // §5.1: strip display terms
    expression: node.expression ? normaliseSubExpression(node.expression, src) : undefined,
  };
}

function normaliseAttributeValue(node: AttributeValueNode, src: string): AttributeValueNode {
  return {
    ...node,
    expression: node.expression ? normaliseSubExpression(node.expression, src) : undefined,
  };
}

function normaliseDottedExpression(node: DottedExpressionNode, src: string): DottedExpressionNode {
  return {
    ...node,
    source: normaliseSubExpression(node.source, src),
    attributes: node.attributes.map((a): DottedAttributeNode => ({
      ...a,
      attributeName: normaliseSubExpression(a.attributeName, src),
    })),
  };
}

function stripTerm(node: ConceptReferenceNode): ConceptReferenceNode {
  return { ...node, term: undefined };
}

function copyFilter(node: FilterConstraintNode): FilterConstraintNode {
  return { ...node };
}
