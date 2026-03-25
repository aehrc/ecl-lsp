// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

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
import type { FormattingOptions } from './options';
import { getIndentString, normalizeTerm } from './rules';

/**
 * Walk an ECL AST and emit formatted text.
 *
 * Task 1 covers leaf nodes and sub-expressions only.
 * Compound, refined, and dotted expressions will be added in later tasks.
 */
export function printAst(ast: ExpressionNode | null, sourceText: string, options: FormattingOptions): string {
  if (!ast) {
    return '';
  }
  return printExpression(ast, 0, 0, options, sourceText);
}

function printExpression(
  node: ExpressionNode,
  depth: number,
  column: number,
  opts: FormattingOptions,
  src: string,
): string {
  const inner = node.expression;
  switch (inner.type) {
    case NodeType.SubExpressionConstraint:
      return printSubExpression(inner, depth, column, opts, src);
    case NodeType.CompoundExpression:
      return printCompoundExpression(inner, depth, column, opts, src);
    case NodeType.RefinedExpression:
      return printRefinedExpression(inner, depth, column, opts, src);
    case NodeType.DottedExpression:
      return printDottedExpression(inner, depth, column, opts, src);
    default: {
      // Exhaustive check — all known node types are covered above
      const _exhaustive: never = inner;
      return String(_exhaustive);
    }
  }
}

function printSubExpression(
  node: SubExpressionNode,
  depth: number,
  column: number,
  opts: FormattingOptions,
  src: string,
): string {
  let result = '';

  // Constraint operator (e.g. <, <<, >, >>, <!, <<!, >!, >>!)
  if (node.operator) {
    result += node.operator.operator + ' ';
  }

  // Member-of (^)
  if (node.memberOf) {
    result += '^ ';
  }

  // Focus concept, wildcard, or parenthesized sub-expression
  switch (node.focus.type) {
    case NodeType.ConceptReference:
      result += printConceptReference(node.focus);
      break;
    case NodeType.Wildcard:
      result += '*';
      break;
    case NodeType.ExpressionConstraint: {
      // Parenthesized sub-expression — try inline first, fall back to multi-line.
      // When inner is a refined expression, don't add depth for the paren because
      // the refinement handles its own indentation via : → depth+1.
      const innerExpr = node.focus;
      const innerIsRefined = innerExpr.expression.type === NodeType.RefinedExpression;
      const innerDepth = innerIsRefined ? depth : depth + 1;
      const openCol = column + result.length;
      const innerInline = printExpression(innerExpr, innerDepth, openCol + 1, opts, src);

      if (
        !innerInline.includes('\n') &&
        (opts.maxLineLength <= 0 || openCol + 1 + innerInline.length + 1 <= opts.maxLineLength)
      ) {
        // Fits on one line: (inner)
        result += '(' + innerInline + ')';
      } else {
        // Multi-line: re-render inner with fresh column after indent
        const innerInd = getIndentString(innerDepth, opts);
        const innerMulti = printExpression(innerExpr, innerDepth, innerInd.length, opts, src);
        // Closing ) goes on the SAME line as the last line of inner content
        result += '(' + innerMulti + ')';
      }
      break;
    }
  }

  // Filters — emit raw source text (formatting details deferred to later tasks)
  if (node.filters) {
    for (const filter of node.filters) {
      const filterText = src.slice(filter.range.start.offset, filter.range.end.offset);
      result += ' ' + filterText;
    }
  }

  // History supplement — emit raw source text (formatting details deferred to later tasks)
  if (node.historySupplement) {
    const histText = src.slice(node.historySupplement.range.start.offset, node.historySupplement.range.end.offset);
    result += ' ' + histText;
  }

  return result;
}

function printCompoundExpression(
  node: CompoundExpressionNode,
  depth: number,
  column: number,
  opts: FormattingOptions,
  src: string,
): string {
  const op = node.operator.operator; // 'AND' | 'OR' | 'MINUS'
  const opSep = opts.spaceAroundOperators ? ` ${op} ` : op;

  // Render all operands
  const printed = node.operands.map((operand) => printSubExpression(operand, depth, 0, opts, src));

  // Try inline form: operand1 OP operand2 OP operand3
  const inline = printed.join(opSep);

  // Use inline if: maxLineLength is 0 (unlimited), or fits, and breakOnOperators is false
  const fits = opts.maxLineLength <= 0 || column + inline.length <= opts.maxLineLength;
  if (fits && !opts.breakOnOperators) {
    return inline;
  }

  // Multi-line form: first operand on current line, subsequent OP operand on new lines.
  // At depth 0: if the first operand starts with '(' (e.g. "(A OR B) AND C"), operators
  // align at column 0 (no indent). Otherwise, operators get 1 continuation-indent level.
  // At depth 1+: operators align at their nesting depth (the paren already added depth).
  let opDepth: number;
  if (depth > 0) {
    opDepth = depth;
  } else {
    opDepth = printed[0].trimStart().startsWith('(') ? 0 : 1;
  }
  const ind = getIndentString(opDepth, opts);
  const lines = [printed[0]];
  for (let i = 1; i < printed.length; i++) {
    lines.push(`${ind}${op} ${printed[i]}`);
  }
  return lines.join('\n');
}

function printDottedExpression(
  node: DottedExpressionNode,
  depth: number,
  column: number,
  opts: FormattingOptions,
  src: string,
): string {
  const source = printSubExpression(node.source, depth, column, opts, src);
  const dotAttrs = node.attributes.map((a) => printSubExpression(a.attributeName, depth, 0, opts, src));

  // Try inline form: source . attr1 . attr2
  const inline = source + dotAttrs.map((a) => ' . ' + a).join('');
  if (opts.maxLineLength <= 0 || column + inline.length <= opts.maxLineLength) {
    return inline;
  }

  // Multi-line form: source on first line, each dot-attribute indented on subsequent lines
  const ind = getIndentString(depth + 1, opts);
  const lines = [source];
  for (const attr of dotAttrs) {
    lines.push(ind + '. ' + attr);
  }
  return lines.join('\n');
}

function printRefinedExpression(
  node: RefinedExpressionNode,
  depth: number,
  column: number,
  opts: FormattingOptions,
  src: string,
): string {
  const focus = printSubExpression(node.expression, depth, column, opts, src);
  const refinement = printRefinement(node.refinement, depth + 1, opts, src);

  // When focus is multi-line, use lastLineLength for accurate fit calculation
  const inline = focus + ': ' + refinement;
  const inlineEndCol = focus.includes('\n') ? lastLineLength(inline) : column + inline.length;
  const fits = opts.maxLineLength <= 0 || inlineEndCol <= opts.maxLineLength;

  if (fits && !focus.includes('\n') && !opts.breakAfterColon && !opts.breakOnRefinementComma) {
    return inline;
  }

  // When the focus is a multi-line parenthesized compound expression like
  // (A OR B):, the ): closes the group and opens the refinement. The refinement
  // body should indent relative to the paren's inner depth (depth+2), not the
  // outer depth (depth+1). This only applies when the focus itself is a
  // parenthesized sub-expression that rendered as multi-line.
  const focusIsMultilineParen = focus.includes('\n') && node.expression.focus.type === NodeType.ExpressionConstraint;
  const attrDepth = focusIsMultilineParen ? depth + 2 : depth + 1;
  const ind = getIndentString(attrDepth, opts);

  // Check if the entire refinement is a single brace group
  const refSrc = src.slice(node.refinement.range.start.offset, node.refinement.range.end.offset).trim();
  const wholeBraces = refSrc.startsWith('{');

  if (wholeBraces) {
    const innerInd = getIndentString(attrDepth + 1, opts);
    const attrs = node.refinement.attributes.map((a) => printAttribute(a, attrDepth + 1, innerInd.length, opts, src));
    return focus + ':\n' + ind + '{\n' + attrs.map((a) => innerInd + a).join(',\n') + '\n' + ind + '}';
  }

  // Build each attribute, detecting per-attribute brace groups
  const attrParts: string[] = [];
  let prevEnd = node.refinement.range.start.offset;
  for (const attr of node.refinement.attributes) {
    const printed = printAttribute(attr, attrDepth, ind.length, opts, src);
    const inBraces = isAttrInBraceGroup(attr, prevEnd, src);
    attrParts.push(ind + (inBraces ? '{ ' + printed + ' }' : printed));
    prevEnd = attr.range.end.offset;
  }
  return focus + ':\n' + attrParts.join(',\n');
}

/**
 * Check if an attribute is inside a brace group by inspecting the source text
 * between the refinement start (or previous attribute) and the attribute start.
 */
function isAttrInBraceGroup(attr: AttributeNode, prevEnd: number, src: string): boolean {
  const gap = src.slice(prevEnd, attr.range.start.offset);
  return gap.includes('{');
}

function printRefinement(node: RefinementNode, depth: number, opts: FormattingOptions, src: string): string {
  // Build each attribute, detecting individual brace groups from source text
  const parts: string[] = [];
  let prevEnd = node.range.start.offset;

  for (const attr of node.attributes) {
    const printed = printAttribute(attr, depth, 0, opts, src);
    const inBraces = isAttrInBraceGroup(attr, prevEnd, src);
    parts.push(inBraces ? '{ ' + printed + ' }' : printed);
    prevEnd = attr.range.end.offset;
  }

  return parts.join(', ');
}

function printAttribute(
  node: AttributeNode,
  depth: number,
  column: number,
  opts: FormattingOptions,
  src: string,
): string {
  // Cardinality prefix — the AST doesn't model cardinality constraints like [0..0],
  // so recover from source text between the attribute range start and the name start.
  const preNameSrc = src.slice(node.range.start.offset, node.name.range.start.offset).trim();
  const cardinalityPrefix = preNameSrc.length > 0 ? preNameSrc + ' ' : '';

  // Brace-group wrapping flag — set by the caller (printRefinement / printRefinedExpression)
  // when this attribute is inside an individual { } group within a refinement.
  // Detected via the attrHasBraces parameter or caller-level source inspection.

  // Name
  let name: string;
  if (node.name.conceptId) {
    name = node.name.term ? node.name.conceptId + normalizeTerm(node.name.term) : node.name.conceptId;
  } else if (node.name.expression) {
    name = printSubExpression(node.name.expression, depth, column, opts, src);
  } else {
    // Fallback: use source text
    name = src.slice(node.name.range.start.offset, node.name.range.end.offset);
  }

  // Comparison operator — extract from source text between name end and value start.
  // The AST doesn't model the comparison operator (=, !=, >=, <=), so we recover it
  // from the gap between the attribute name and value ranges.
  const between = src.slice(node.name.range.end.offset, node.value.range.start.offset);
  const opMatch = /(!?=|[<>]=)/.exec(between);
  const compOp = opMatch ? opMatch[1] : '=';

  // For >=/#value and <=/#value, check if there's a # prefix before the raw value
  const hasHashPrefix = between.includes('#');

  // Value
  let value: string;
  if (node.value.expression) {
    value = printSubExpression(node.value.expression, depth, column + name.length + 3, opts, src);
  } else if (node.value.rawValue) {
    value = hasHashPrefix ? '#' + node.value.rawValue : node.value.rawValue;
  } else {
    value = src.slice(node.value.range.start.offset, node.value.range.end.offset);
  }

  const reversed = node.reversed ? 'R ' : '';
  return cardinalityPrefix + reversed + name + ' ' + compOp + ' ' + value;
}

function printConceptReference(node: ConceptReferenceNode): string {
  if (node.term) {
    return node.conceptId + normalizeTerm(node.term);
  }
  return node.conceptId;
}

/** Returns the length of the last line in the given text. */
export function lastLineLength(text: string): number {
  const lastNewline = text.lastIndexOf('\n');
  return lastNewline === -1 ? text.length : text.length - lastNewline - 1;
}
