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
  type RefinementMemberNode,
  type AttributeSetNode,
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
  return printExpression(ast, 0, 0, options, sourceText, true);
}

function printExpression(
  node: ExpressionNode,
  depth: number,
  column: number,
  opts: FormattingOptions,
  src: string,
  isRoot = false,
): string {
  const inner = node.expression;
  switch (inner.type) {
    case NodeType.SubExpressionConstraint:
      return printSubExpression(inner, depth, column, opts, src, isRoot);
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

// eslint-disable-next-line sonarjs/cognitive-complexity -- parenthesis analysis + inline/multi-line layout
function printSubExpression(
  node: SubExpressionNode,
  depth: number,
  column: number,
  opts: FormattingOptions,
  src: string,
  isRoot = false,
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
      const innerExpr = node.focus;

      // Check if parentheses can be removed
      if (
        opts.removeRedundantParentheses &&
        !node.operator &&
        !node.memberOf &&
        !node.filters &&
        !node.historySupplement
      ) {
        const inner = innerExpr.expression;
        // A refined or dotted expression is only a legal sub-expression when it
        // is parenthesised, so its parens are load-bearing everywhere except at
        // the very top of the expression — stripping them elsewhere produces a
        // different (or unparseable) expression.
        const needsParens =
          !isRoot && (inner.type === NodeType.RefinedExpression || inner.type === NodeType.DottedExpression);
        if (inner.type !== NodeType.CompoundExpression && !needsParens) {
          // Rule 1: inner is non-compound → parens always redundant
          result += printExpression(innerExpr, depth, column + result.length, opts, src, isRoot);
          break;
        }
        // Rule 2 (same operator) is handled by flattening in printCompoundExpression
        // Rule 3: different operator → keep parens (fall through)
      }

      // Parenthesized sub-expression — try inline first, fall back to multi-line.
      // When inner is a refined expression, don't add depth for the paren because
      // the refinement handles its own indentation via : → depth+1.
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

  // Flatten same-operator nested compounds when removing redundant parens
  let operands = node.operands;
  if (opts.removeRedundantParentheses && (op === 'AND' || op === 'OR')) {
    operands = flattenSameOperatorOperands(operands, op);
  }

  // Render all operands
  const printed = operands.map((operand) => printSubExpression(operand, depth, 0, opts, src));

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

/**
 * Flatten operands that are parenthesized compound expressions with the same operator.
 * e.g., `(A AND B) AND C` → operands [A, B, C] (parens removed, operands merged).
 */
function flattenSameOperatorOperands(operands: readonly SubExpressionNode[], operator: string): SubExpressionNode[] {
  const result: SubExpressionNode[] = [];
  for (const operand of operands) {
    if (
      operand.focus.type === NodeType.ExpressionConstraint &&
      !operand.operator &&
      !operand.memberOf &&
      !operand.filters &&
      !operand.historySupplement
    ) {
      const inner = operand.focus.expression;
      if (inner.type === NodeType.CompoundExpression && inner.operator.operator === operator) {
        // Recursively flatten in case of deeper nesting
        result.push(...flattenSameOperatorOperands(inner.operands, operator));
        continue;
      }
    }
    result.push(operand);
  }
  return result;
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

  const content = node.refinement.content;
  if (!content) {
    return focus + ':';
  }
  return focus + ':\n' + printMemberBlock(content, attrDepth, opts, src);
}

/**
 * Inline separator between the members of an attribute set.
 *
 * A comma is a CONJUNCTION in ECL, so a disjunction must never be emitted with
 * one — doing so silently changes the selected concept set (issue #73).
 * Keyword operators always keep their surrounding spaces because the grammar
 * requires mandatory whitespace after `AND`/`OR`.
 */
function setSeparator(node: AttributeSetNode): string {
  if (node.operator === 'OR') return ' OR ';
  return node.conjunctionStyle === 'AND' ? ' AND ' : ', ';
}

/**
 * Flatten nested attribute sets that use the SAME operator as their parent.
 *
 * The grammar nests an attribute set inside every refinement, so most nesting is
 * implicit and carries no parentheses in the source — that is always flattened.
 * Sets the source really did parenthesise are kept unless the caller asked for
 * redundant parentheses to be removed.
 *
 * Parentheses around a set with a DIFFERENT operator are load-bearing: ECL gives
 * refinement conjunction and disjunction no relative precedence, so removing them
 * would change the meaning (issue #73). They are never flattened.
 */
function flattenSameOperatorMembers(node: AttributeSetNode, opts: FormattingOptions): RefinementMemberNode[] {
  const result: RefinementMemberNode[] = [];
  for (const member of node.members) {
    const redundant =
      member.type === NodeType.AttributeSet &&
      member.operator === node.operator &&
      (!member.parenthesized || opts.removeRedundantParentheses);
    if (redundant) {
      result.push(...flattenSameOperatorMembers(member, opts));
    } else {
      result.push(member);
    }
  }
  return result;
}

/** Render a refinement member on a single line. */
function printRefinementMember(
  node: RefinementMemberNode,
  depth: number,
  column: number,
  opts: FormattingOptions,
  src: string,
): string {
  switch (node.type) {
    case NodeType.Attribute:
      return printAttribute(node, depth, column, opts, src);
    case NodeType.AttributeGroup: {
      const prefix = (node.cardinality ? node.cardinality + ' ' : '') + '{ ';
      return prefix + printRefinementMember(node.content, depth, column + prefix.length, opts, src) + ' }';
    }
    case NodeType.AttributeSet: {
      const members = flattenSameOperatorMembers(node, opts);
      const sep = setSeparator(node);
      const parts: string[] = [];
      let col = column;
      for (const member of members) {
        const text = printNestedMember(member, depth, col, opts, src);
        parts.push(text);
        col += text.length + sep.length;
      }
      return parts.join(sep);
    }
  }
}

/**
 * Render one member of an attribute set, adding the parentheses that the
 * grammar requires around a nested set (see `flattenSameOperatorMembers`).
 */
function printNestedMember(
  node: RefinementMemberNode,
  depth: number,
  column: number,
  opts: FormattingOptions,
  src: string,
): string {
  if (node.type === NodeType.AttributeSet) {
    return '(' + printRefinementMember(node, depth, column + 1, opts, src) + ')';
  }
  return printRefinementMember(node, depth, column, opts, src);
}

/**
 * Render a refinement member as an indented block starting at `depth`.
 * Every returned line, including the first, carries its own indent.
 */
function printMemberBlock(node: RefinementMemberNode, depth: number, opts: FormattingOptions, src: string): string {
  const ind = getIndentString(depth, opts);

  if (node.type === NodeType.AttributeGroup) {
    const card = node.cardinality ? node.cardinality + ' ' : '';
    return ind + card + '{\n' + printMemberBlock(node.content, depth + 1, opts, src) + '\n' + ind + '}';
  }

  if (node.type === NodeType.AttributeSet) {
    const members = flattenSameOperatorMembers(node, opts);
    const rendered = members.map((member) => {
      const line = ind + printNestedMember(member, depth, ind.length, opts, src);
      // An attribute group only expands onto its own lines when it can't fit.
      if (member.type === NodeType.AttributeGroup && opts.maxLineLength > 0 && line.length > opts.maxLineLength) {
        return printMemberBlock(member, depth, opts, src);
      }
      return line;
    });
    if (node.operator === 'AND' && node.conjunctionStyle === ',') {
      return rendered.join(',\n');
    }
    // Keyword operators lead the continuation line, mirroring compound expressions.
    const keyword = node.operator;
    return rendered.map((text, i) => (i === 0 ? text : ind + keyword + ' ' + text.slice(ind.length))).join('\n');
  }

  return ind + printAttribute(node, depth, ind.length, opts, src);
}

function printRefinement(node: RefinementNode, depth: number, opts: FormattingOptions, src: string): string {
  return node.content ? printRefinementMember(node.content, depth, 0, opts, src) : '';
}

function printAttribute(
  node: AttributeNode,
  depth: number,
  column: number,
  opts: FormattingOptions,
  src: string,
): string {
  const cardinalityPrefix = node.cardinality ? node.cardinality + ' ' : '';

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
