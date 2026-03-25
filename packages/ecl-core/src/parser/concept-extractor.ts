// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Utility to extract concept IDs from ECL AST or text

import {
  ExpressionNode,
  SubExpressionNode,
  CompoundExpressionNode,
  RefinedExpressionNode,
  DottedExpressionNode,
  DottedAttributeNode,
  ConceptReferenceNode,
  OperatorNode,
  LogicalOperatorNode,
  RefinementNode,
  AttributeNode,
  AttributeNameNode,
  AttributeValueNode,
  WildcardNode,
  FilterConstraintNode,
  HistorySupplementNode,
  NodeType,
  Range,
} from './ast';

/** Union of all ECL AST node types for type-safe traversal. */
type EclAstNode =
  | ExpressionNode
  | SubExpressionNode
  | CompoundExpressionNode
  | RefinedExpressionNode
  | DottedExpressionNode
  | DottedAttributeNode
  | ConceptReferenceNode
  | OperatorNode
  | LogicalOperatorNode
  | RefinementNode
  | AttributeNode
  | AttributeNameNode
  | AttributeValueNode
  | WildcardNode
  | FilterConstraintNode
  | HistorySupplementNode;

export interface ConceptReference {
  id: string;
  range: Range;
  term?: string;
}

/**
 * Extracts all concept IDs from an ECL AST.
 * @param ast The root expression node
 * @returns Array of concept references with their positions
 */
export function extractConceptIds(ast: ExpressionNode, options?: { deduplicate?: boolean }): ConceptReference[] {
  const concepts: ConceptReference[] = [];
  const deduplicate = options?.deduplicate ?? true;
  const seenIds = new Set<string>();

  // eslint-disable-next-line sonarjs/cognitive-complexity -- exhaustive switch over AST node types
  function visitNode(node: EclAstNode): void {
    switch (node.type) {
      case NodeType.ConceptReference:
        if (!deduplicate || !seenIds.has(node.conceptId)) {
          concepts.push({
            id: node.conceptId,
            range: node.range,
            term: node.term,
          });
          seenIds.add(node.conceptId);
        }
        break;

      case NodeType.AttributeName:
        if (node.conceptId && (!deduplicate || !seenIds.has(node.conceptId))) {
          concepts.push({
            id: node.conceptId,
            range: node.range,
            term: node.term,
          });
          seenIds.add(node.conceptId);
        }
        if (node.expression) {
          visitNode(node.expression);
        }
        break;

      case NodeType.ExpressionConstraint:
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- visitor may return null for invalid parse trees
        if (node.expression) visitNode(node.expression);
        break;

      case NodeType.SubExpressionConstraint:
        visitNode(node.focus);
        if (node.filters) {
          for (const filter of node.filters) {
            visitNode(filter);
          }
        }
        if (node.historySupplement) {
          visitNode(node.historySupplement);
        }
        break;

      case NodeType.CompoundExpression:
        for (const operand of node.operands) {
          visitNode(operand);
        }
        break;

      case NodeType.RefinedExpression:
        visitNode(node.expression);
        visitNode(node.refinement);
        break;

      case NodeType.DottedExpression:
        visitNode(node.source);
        for (const attr of node.attributes) {
          visitNode(attr);
        }
        break;

      case NodeType.DottedAttribute:
        visitNode(node.attributeName);
        break;

      case NodeType.Refinement:
        for (const attr of node.attributes) {
          visitNode(attr);
        }
        break;

      case NodeType.Attribute:
        visitNode(node.name);
        visitNode(node.value);
        break;

      case NodeType.AttributeValue:
        if (node.expression) {
          visitNode(node.expression);
        }
        break;

      case NodeType.FilterConstraint:
        for (const expr of node.conceptExpressions) {
          visitNode(expr);
        }
        for (const ref of node.conceptReferences) {
          visitNode(ref);
        }
        break;

      case NodeType.HistorySupplement:
        if (node.subsetExpression) {
          visitNode(node.subsetExpression);
        }
        break;

      case NodeType.ConstraintOperator:
      case NodeType.LogicalOperator:
      case NodeType.Wildcard:
        // Leaf nodes — no children to visit
        break;
    }
  }

  visitNode(ast);

  return concepts;
}

/**
 * Extracts concept IDs from text using regex (fallback when AST is unavailable or incomplete)
 * @param text The ECL text
 * @returns Array of concept IDs found (6-18 digit numbers)
 */
export function extractConceptIdsFromText(text: string): string[] {
  const conceptIdPattern = /\b\d{6,18}\b/g;
  const matches = text.match(conceptIdPattern);
  // Deduplicate while preserving order
  return matches ? [...new Set(matches)] : [];
}
