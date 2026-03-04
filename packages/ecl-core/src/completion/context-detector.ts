// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Context detection for ECL completion — hybrid AST + text approach
//
// Uses ANTLR partial AST for core grammar (refinements, compounds, dots)
// and text scanning for filter blocks (opaque to ANTLR).

import { parseECL } from '../parser';
import { NodeType } from '../parser/ast';

/** Sub-context within a filter block. */
export type FilterSubContext =
  | 'after-opening' // right after {{ D, {{ C, {{ M, {{ +
  | 'after-keyword' // after a keyword like "term", "type", "active"
  | { kind: 'after-equals'; keyword: string | null } // after keyword =, with the preceding keyword
  | 'after-value'; // after a complete value (ready for comma or }})

/** Filter type character for filter blocks. */
export type FilterType = 'D' | 'C' | 'M' | '+';

/** Discriminated union of all cursor contexts for ECL completion. */
export type CursorContext =
  | { kind: 'expression-start' }
  | { kind: 'after-operator'; operator: string }
  | { kind: 'after-concept' }
  | { kind: 'after-logical-operator'; operator: string }
  | { kind: 'refinement-start' }
  | { kind: 'after-attribute-name' }
  | { kind: 'after-comparison-operator' }
  | { kind: 'after-cardinality' }
  | { kind: 'dotted-awaiting-attribute' }
  | { kind: 'filter-block'; filterType: FilterType; subContext: FilterSubContext }
  | { kind: 'inside-display-term' }
  | { kind: 'unknown' };

// ── Display term detection ──────────────────────────────────────────────

/**
 * Check if the cursor is inside a pipe-delimited display term `|...|`.
 * Skips pipes that appear inside block comments or line comments.
 */
function isInsideDisplayTerm(text: string): boolean {
  let inBlockComment = false;
  let inTerm = false;

  let i = 0;
  while (i < text.length) {
    if (!inTerm && text[i] === '/' && text[i + 1] === '*') {
      inBlockComment = true;
      i += 2;
    } else if (inBlockComment && text[i] === '*' && text[i + 1] === '/') {
      inBlockComment = false;
      i += 2;
    } else if (inBlockComment) {
      // skip comment content
      i++;
    } else if (text[i] === '/' && text[i + 1] === '/') {
      // Line comment — skip to end of line
      const newline = text.indexOf('\n', i);
      if (newline === -1) break;
      i = newline + 1;
    } else if (text[i] === '|') {
      inTerm = !inTerm;
      i++;
    } else {
      i++;
    }
  }

  return inTerm;
}

// ── Filter block text scanner ───────────────────────────────────────────

/** Filter keywords by filter type. */
const DESCRIPTION_FILTER_KEYWORDS = [
  'term',
  'type',
  'typeid',
  'language',
  'dialect',
  'dialectid',
  'moduleid',
  'effectivetime',
  'active',
  'id',
];
const CONCEPT_FILTER_KEYWORDS = ['definitionstatus', 'definitionstatusid', 'moduleid', 'effectivetime', 'active'];
const MEMBER_FILTER_KEYWORDS = ['moduleid', 'effectivetime', 'active'];

function getFilterKeywords(filterType: FilterType): string[] {
  switch (filterType) {
    case 'D':
      return DESCRIPTION_FILTER_KEYWORDS;
    case 'C':
      return CONCEPT_FILTER_KEYWORDS;
    case 'M':
      return MEMBER_FILTER_KEYWORDS;
    case '+':
      return [];
  }
}

/**
 * Scan text for an unmatched `{{` to find the filter block start index.
 * Skips `{{`/`}}` inside block comments and pipe-delimited terms.
 * Returns -1 if not inside an open filter block.
 */
function findOpenFilterStart(text: string): number {
  let inComment = false;
  let inTerm = false;
  let filterStart = -1;

  let i = 0;
  while (i < text.length) {
    if (!inTerm && text[i] === '/' && text[i + 1] === '*') {
      inComment = true;
      i += 2;
    } else if (inComment && text[i] === '*' && text[i + 1] === '/') {
      inComment = false;
      i += 2;
    } else if (inComment) {
      // skip comment content
      i++;
    } else if (text[i] === '|') {
      inTerm = !inTerm;
      i++;
    } else if (!inTerm && text[i] === '{' && text[i + 1] === '{') {
      filterStart = i;
      i += 2;
    } else if (!inTerm && text[i] === '}' && text[i + 1] === '}') {
      filterStart = -1;
      i += 2;
    } else {
      i++;
    }
  }

  return filterStart;
}

/**
 * Detect if the cursor is inside a filter block by scanning for unmatched `{{`.
 *
 * Returns a filter-block CursorContext if inside one, or null otherwise.
 */
export function detectFilterContext(text: string): CursorContext | null {
  // Quick check: no `{{` means no filter block
  if (!text.includes('{{')) return null;

  const filterStart = findOpenFilterStart(text);
  if (filterStart === -1) return null;

  // Extract content after {{ up to cursor
  const afterOpening = text.substring(filterStart + 2).trimStart();

  // Determine filter type from prefix
  const { filterType, contentAfterType } = parseFilterPrefix(afterOpening);

  // Determine sub-context within the filter block
  const subContext = detectFilterSubContext(contentAfterType, filterType);

  return { kind: 'filter-block', filterType, subContext };
}

/** Parse the filter type prefix character after `{{`. */
function parseFilterPrefix(afterOpening: string): { filterType: FilterType; contentAfterType: string } {
  if (/^[Dd]\s/.test(afterOpening)) {
    return { filterType: 'D', contentAfterType: afterOpening.substring(1).trimStart() };
  }
  if (/^[Cc]\s/.test(afterOpening)) {
    return { filterType: 'C', contentAfterType: afterOpening.substring(1).trimStart() };
  }
  if (/^[Mm]\s/.test(afterOpening)) {
    return { filterType: 'M', contentAfterType: afterOpening.substring(1).trimStart() };
  }
  if (afterOpening.startsWith('+')) {
    return { filterType: '+', contentAfterType: afterOpening.substring(1).trimStart() };
  }
  // No prefix or just opened — default to description filter
  return { filterType: 'D', contentAfterType: afterOpening };
}

// eslint-disable-next-line sonarjs/function-return-type -- returns discriminated union FilterSubContext (string | object)
function detectFilterSubContext(content: string, filterType: FilterType): FilterSubContext {
  if (content.length === 0) return 'after-opening';

  // For history supplement, everything after + is handled by history completions
  if (filterType === '+') return 'after-opening';

  // Check if the content ends with a comma (ready for next keyword)
  if (/,\s*$/.test(content)) return 'after-opening';

  // Check if content ends with = followed by optional whitespace (awaiting value)
  if (/[=!]=?\s*$/.test(content)) {
    // Extract the keyword preceding the = sign
    // eslint-disable-next-line sonarjs/slow-regex -- bounded to filter block content
    const kwMatch = /(\w+)\s*[=!]=?\s*$/.exec(content);
    const keyword = kwMatch ? kwMatch[1].toLowerCase() : null;
    return { kind: 'after-equals', keyword };
  }

  // Check if a keyword is present by looking at the last token
  const keywords = getFilterKeywords(filterType);
  const trimmed = content.trimEnd();
  const lastWord = trimmed.split(/\s+/).pop()?.toLowerCase() ?? '';

  // If the last word matches a keyword exactly, we're after-keyword (awaiting operator)
  if (keywords.includes(lastWord) && /\s$/.test(content)) {
    return 'after-keyword';
  }

  // If there's a value after an = sign, we're after-value
  // Pattern: keyword = value (where value is non-empty)
  if (/[=!]=?\s+\S+/.test(content) && /\S\s*$/.test(content)) {
    return 'after-value';
  }

  return 'after-opening';
}

// ── AST-based context detection ─────────────────────────────────────────

/** Match constraint operators at end of text. */
const CONSTRAINT_OP_REGEX = /(?:<<!|<<|<!|<|>>!|>>|>!|>|\^|!!>|!!<)\s*$/;

/**
 * Detect the cursor context for ECL completion.
 *
 * 1. Checks for filter block context first via text scan (filters are opaque to ANTLR)
 * 2. Parses with parseECL() and inspects the partial AST for everything else
 */
export function detectCursorContext(textBeforeCursor: string): CursorContext {
  const trimmed = textBeforeCursor.trim();

  // Empty or whitespace only
  if (trimmed.length === 0) return { kind: 'expression-start' };

  // 1. Display term detection — suppress completions inside |...|
  if (isInsideDisplayTerm(textBeforeCursor)) {
    return { kind: 'inside-display-term' };
  }

  // 2. Filter block detection (text-based, runs first)
  const filterContext = detectFilterContext(textBeforeCursor);
  if (filterContext) return filterContext;

  // 3. Cardinality detection (text-based, not in AST)
  if (/\[\d+\.\.\d+\]\s*$/.test(trimmed) || /\[\d+\.\.\*\]\s*$/.test(trimmed)) {
    return { kind: 'after-cardinality' };
  }

  // 4. Parse and inspect AST
  const result = parseECL(trimmed);
  const ast = result.ast;

  // No AST or null expression — check if last token is an operator
  if (!ast?.expression) {
    return detectFromOperatorOrStart(trimmed);
  }

  return detectFromAST(ast.expression, trimmed, result.errors.length);
}

/** When there's no AST expression, check for trailing operator or default to expression-start. */
function detectFromOperatorOrStart(trimmed: string): CursorContext {
  const operatorMatch = CONSTRAINT_OP_REGEX.exec(trimmed);
  if (operatorMatch) {
    return { kind: 'after-operator', operator: operatorMatch[0].trim() };
  }
  return { kind: 'expression-start' };
}

/** Detect context from a parsed AST expression node. */
// eslint-disable-next-line sonarjs/cognitive-complexity -- unavoidable: one branch per AST node type
function detectFromAST(
  inner: NonNullable<NonNullable<ReturnType<typeof parseECL>['ast']>['expression']>,
  trimmed: string,
  errorCount: number,
): CursorContext {
  // RefinedExpression — after :, after attribute name, or after comparison operator
  if (inner.type === NodeType.RefinedExpression) {
    if (inner.refinement.attributes.length === 0) {
      return { kind: 'refinement-start' };
    }
    if (/[!=]=?\s*$/.test(trimmed)) {
      return { kind: 'after-comparison-operator' };
    }
    if (/\d{6,18}(\s*\|[^|]*\|)?\s*$/.test(trimmed) && !/=\s*\d{6,18}/.test(trimmed.slice(-50))) {
      return { kind: 'after-attribute-name' };
    }
    return { kind: 'refinement-start' };
  }

  // DottedExpression — after .
  if (inner.type === NodeType.DottedExpression) {
    if (inner.attributes.length === 0) {
      return { kind: 'dotted-awaiting-attribute' };
    }
    return errorCount === 0 ? { kind: 'after-concept' } : { kind: 'dotted-awaiting-attribute' };
  }

  // CompoundExpression — after AND/OR/MINUS
  if (inner.type === NodeType.CompoundExpression) {
    const lastOperand = inner.operands.at(-1);
    if (!lastOperand) return { kind: 'unknown' };
    if (lastOperand.focus.type === NodeType.Wildcard) {
      const range = lastOperand.focus.range;
      if (range.start.offset === range.end.offset) {
        return { kind: 'after-logical-operator', operator: inner.operator.operator };
      }
    }
    if (/\b(AND|OR|MINUS)\s*$/i.test(trimmed)) {
      return { kind: 'after-logical-operator', operator: inner.operator.operator };
    }
    if (errorCount === 0) {
      return { kind: 'after-concept' };
    }
    return { kind: 'unknown' };
  }

  // SubExpressionConstraint — continuation point or after operator
  if (errorCount === 0) {
    return { kind: 'after-concept' };
  }
  const operatorMatch = CONSTRAINT_OP_REGEX.exec(trimmed);
  if (operatorMatch) {
    return { kind: 'after-operator', operator: operatorMatch[0].trim() };
  }
  return { kind: 'unknown' };
}
