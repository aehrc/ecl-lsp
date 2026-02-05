// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { RefinedExpressionNode, SubExpressionNode, AttributeValueNode, NodeType, Range } from '../parser/ast';

/**
 * Extract the original ECL text for an AST node using its range offsets.
 */
export function extractText(sourceText: string, range: Range): string {
  return sourceText.substring(range.start.offset, range.end.offset);
}

/**
 * Information extracted from a refined expression for semantic validation.
 */
export interface RefinementInfo {
  focusEcl: string;
  focusRange: Range;
  attributes: AttributeInfo[];
}

export interface AttributeInfo {
  nameEcl: string;
  nameRange: Range;
  valueEcl: string | null; // null for wildcard or raw values
  valueRange: Range | null;
  attributeRange: Range; // range of the whole attribute (name = value)
  isWildcardValue: boolean;
  isWildcardFocus: boolean;
}

/**
 * Extract structured refinement info from a RefinedExpressionNode.
 */
export function extractRefinementInfo(node: RefinedExpressionNode, sourceText: string): RefinementInfo {
  const focusEcl = extractText(sourceText, node.expression.range);
  const isWildcardFocus = node.expression.focus.type === NodeType.Wildcard;

  const attributes: AttributeInfo[] = node.refinement.attributes.map((attr) => {
    const nameEcl = extractText(sourceText, attr.name.range);
    const isWildcardValue = isWildcardAttributeValue(attr.value);
    const valueEcl =
      !isWildcardValue && attr.value.expression ? extractText(sourceText, attr.value.expression.range) : null;
    const valueRange = !isWildcardValue && attr.value.expression ? attr.value.expression.range : null;

    return {
      nameEcl,
      nameRange: attr.name.range,
      valueEcl,
      valueRange,
      attributeRange: attr.range,
      isWildcardValue,
      isWildcardFocus,
    };
  });

  return {
    focusEcl,
    focusRange: node.expression.range,
    attributes,
  };
}

/**
 * Check if an attribute value is a wildcard (*).
 */
function isWildcardAttributeValue(value: AttributeValueNode): boolean {
  return value.expression?.focus.type === NodeType.Wildcard;
}

/**
 * Extract ECL text for each operand in a compound expression.
 */
export interface OperandInfo {
  ecl: string;
  range: Range;
}

export function extractCompoundOperands(sourceText: string, operands: SubExpressionNode[]): OperandInfo[] {
  return operands.map((op) => ({
    ecl: extractText(sourceText, op.range),
    range: op.range,
  }));
}
