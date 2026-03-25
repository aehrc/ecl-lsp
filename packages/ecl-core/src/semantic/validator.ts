// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import {
  ExpressionNode,
  SubExpressionNode,
  CompoundExpressionNode,
  RefinedExpressionNode,
  DottedExpressionNode,
  NodeType,
  Range,
} from '../parser/ast';
import { ITerminologyService } from '../terminology/types';
import { extractRefinementInfo, extractCompoundOperands, AttributeInfo } from './ecl-text';

const LINKAGE_CONCEPT = '106237007';

export interface SemanticDiagnostic {
  range: Range;
  message: string;
  severity: 'warning' | 'info';
}

/**
 * Validate semantic correctness of an ECL expression.
 * Returns diagnostics for attribute scope issues, value constraint issues,
 * empty sub-expressions, and impossible refinements.
 */
export async function validateSemantics(
  ast: ExpressionNode,
  sourceText: string,
  terminologyService: ITerminologyService,
): Promise<SemanticDiagnostic[]> {
  const checks: Promise<SemanticDiagnostic[]>[] = [];

  walkExpression(ast.expression, sourceText, terminologyService, checks);

  const results = await Promise.all(checks);
  return results.flat();
}

/**
 * Walk the AST and collect validation check promises.
 */
function walkExpression(
  node: SubExpressionNode | CompoundExpressionNode | RefinedExpressionNode | DottedExpressionNode,
  sourceText: string,
  svc: ITerminologyService,
  checks: Promise<SemanticDiagnostic[]>[],
): void {
  switch (node.type) {
    case NodeType.RefinedExpression:
      handleRefinedExpression(node, sourceText, svc, checks);
      break;
    case NodeType.CompoundExpression:
      handleCompoundExpression(node, sourceText, svc, checks);
      break;
    case NodeType.SubExpressionConstraint:
      // A standalone sub-expression with a nested expression — recurse
      if (node.focus.type === NodeType.ExpressionConstraint) {
        walkExpression(node.focus.expression, sourceText, svc, checks);
      }
      break;
    case NodeType.DottedExpression:
      // Dotted expressions: check if source sub-expression has nested content
      if (node.source.focus.type === NodeType.ExpressionConstraint) {
        walkExpression(node.source.focus.expression, sourceText, svc, checks);
      }
      break;
  }
}

/**
 * Handle a refined expression: check attributes, values, and individual refinements.
 */
function handleRefinedExpression(
  node: RefinedExpressionNode,
  sourceText: string,
  svc: ITerminologyService,
  checks: Promise<SemanticDiagnostic[]>[],
): void {
  const info = extractRefinementInfo(node, sourceText);

  // Check each attribute
  for (const attr of info.attributes) {
    // Attribute scope check (always, even if value is wildcard)
    checks.push(checkAttributeScope(attr, svc));

    // Value constraint check (skip wildcard values and wildcard focus)
    if (!attr.isWildcardValue && !attr.isWildcardFocus && attr.valueEcl && attr.valueRange) {
      checks.push(checkValueConstraint(info.focusEcl, attr, svc));
    }

    // Individual refinement check (skip wildcard values)
    if (!attr.isWildcardValue && attr.valueEcl) {
      checks.push(checkIndividualRefinement(info.focusEcl, attr, svc));
    }
  }

  // Check focus expression for empty results
  checks.push(checkEmptyExpression(info.focusEcl, info.focusRange, svc));

  // Recurse into focus if it contains nested expressions
  if (node.expression.focus.type === NodeType.ExpressionConstraint) {
    walkExpression(node.expression.focus.expression, sourceText, svc, checks);
  }
}

/**
 * Handle a compound expression: check each operand for empty results.
 */
function handleCompoundExpression(
  node: CompoundExpressionNode,
  sourceText: string,
  svc: ITerminologyService,
  checks: Promise<SemanticDiagnostic[]>[],
): void {
  const operands = extractCompoundOperands(sourceText, node.operands);

  for (const op of operands) {
    checks.push(checkEmptyExpression(op.ecl, op.range, svc));
  }

  // Recurse into each operand for nested expressions
  for (const operand of node.operands) {
    if (operand.focus.type === NodeType.ExpressionConstraint) {
      walkExpression(operand.focus.expression, sourceText, svc, checks);
    }
  }
}

/**
 * Check if an attribute is a valid SNOMED linkage concept.
 * Evaluates: (<attr-ecl>) MINUS (< 106237007)
 */
async function checkAttributeScope(attr: AttributeInfo, svc: ITerminologyService): Promise<SemanticDiagnostic[]> {
  try {
    const ecl = `(${attr.nameEcl}) MINUS (< ${LINKAGE_CONCEPT})`;
    const result = await svc.evaluateEcl(ecl, 5);

    if (result.total > 0) {
      const conceptList = result.concepts
        .slice(0, 5)
        .map((c) => `${c.code} |${c.display}|`)
        .join(', ');
      const message =
        result.total === 1
          ? `Attribute concept is not a valid SNOMED CT attribute (not a descendant of 106237007 |Linkage concept|): ${conceptList}`
          : `${result.total} attribute concept(s) are not valid SNOMED CT attributes (not descendants of 106237007 |Linkage concept|): ${conceptList}`;

      return [
        {
          range: attr.nameRange,
          message,
          severity: 'warning',
        },
      ];
    }
  } catch {
    // Graceful degradation — skip this check
  }
  return [];
}

/**
 * Check if a value constraint is compatible with the valid range.
 * Evaluates: (<value-ecl>) AND (<focus-ecl>.<attr-name-ecl>)
 * Warns if result is 0 (completely disjoint).
 */
async function checkValueConstraint(
  focusEcl: string,
  attr: AttributeInfo,
  svc: ITerminologyService,
): Promise<SemanticDiagnostic[]> {
  try {
    const ecl = `(${attr.valueEcl}) AND ((${focusEcl}).${attr.nameEcl})`;
    const result = await svc.evaluateEcl(ecl, 1);

    if (result.total === 0) {
      return [
        {
          range: attr.valueRange ?? attr.attributeRange,
          message: `Value constraint has no concepts in common with the valid range for this attribute. The value is completely outside the expected range for ${attr.nameEcl} on ${focusEcl}.`,
          severity: 'warning',
        },
      ];
    }
  } catch {
    // Graceful degradation — skip this check (e.g., server doesn't support dotted attributes)
  }
  return [];
}

/**
 * Check if an individual refinement evaluates to 0 results.
 * Evaluates: <focus-ecl> : <attr-name-ecl> = <attr-value-ecl>
 */
async function checkIndividualRefinement(
  focusEcl: string,
  attr: AttributeInfo,
  svc: ITerminologyService,
): Promise<SemanticDiagnostic[]> {
  try {
    const ecl = `(${focusEcl}) : ${attr.nameEcl} = ${attr.valueEcl}`;
    const result = await svc.evaluateEcl(ecl, 1);

    if (result.total === 0) {
      return [
        {
          range: attr.attributeRange,
          message: `This refinement matches no concepts. No ${focusEcl} concepts have ${attr.nameEcl} = ${attr.valueEcl}.`,
          severity: 'warning',
        },
      ];
    }
  } catch {
    // Graceful degradation
  }
  return [];
}

/**
 * Check if a sub-expression evaluates to 0 results.
 */
async function checkEmptyExpression(
  ecl: string,
  range: Range,
  svc: ITerminologyService,
): Promise<SemanticDiagnostic[]> {
  try {
    const result = await svc.evaluateEcl(ecl, 1);

    if (result.total === 0) {
      return [
        {
          range,
          message: `Expression matches no concepts: ${ecl}`,
          severity: 'warning',
        },
      ];
    }
  } catch {
    // Graceful degradation
  }
  return [];
}
