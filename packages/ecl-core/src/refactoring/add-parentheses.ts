// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Refactoring: Add explicit parentheses to ambiguous ECL expressions
//
// Two cases where parentheses are needed:
//
// 1. Mixed operators: The ECL grammar does not allow mixing AND, OR, and
//    MINUS without explicit parentheses.  When an expression uses two or
//    more different operators at the top level, this refactoring adds
//    parentheses to make the grouping explicit.
//
//    Precedence used for grouping (tightest → loosest):
//      AND  >  OR  >  MINUS
//
//    Examples:
//      < A AND < B OR < C            →  (< A AND < B) OR < C
//      < A AND < B MINUS < C         →  (< A AND < B) MINUS < C
//      < A OR < B MINUS < C          →  (< A OR < B) MINUS < C
//
// 2. Refinement ambiguity: Multiple refined sub-expressions joined by
//    AND/OR without brackets.  The parser treats AND/OR after a colon as
//    refinement-level conjunction, causing parse errors when the intent
//    is compound-level conjunction.
//
//    Examples:
//      < A : x = v1 AND < B : y = v2
//        → (< A : x = v1) AND (< B : y = v2)
//      < A : x = v1 AND x2 = v2 AND < B : y = v3
//        → (< A : x = v1 AND x2 = v2) AND (< B : y = v3)
//
// Only one level of parenthesisation is applied per invocation.  The
// user can invoke again to further disambiguate inner mixed groups.

import type { CoreCodeAction } from '../types';
import { coreReplace } from '../types';
import type { RefactoringContext } from './index';

/**
 * Token types recognized while scanning the expression text.
 */
const enum TokenKind {
  Text,
  AND,
  OR,
  MINUS,
  Colon,
  OpenParen,
  CloseParen,
}

interface Token {
  kind: TokenKind;
  start: number;
  end: number;
  text: string;
}

/** Operator precedence (higher = tighter binding). */
const PRECEDENCE: Record<number, number> = {
  [TokenKind.AND]: 2,
  [TokenKind.OR]: 1,
  [TokenKind.MINUS]: 0,
};

/** Map TokenKind to its source keyword for rejoining. */
const OPERATOR_TEXT: Record<number, string> = {
  [TokenKind.AND]: 'AND',
  [TokenKind.OR]: 'OR',
  [TokenKind.MINUS]: 'MINUS',
};

/**
 * Tokenize an ECL expression string into a flat list of tokens,
 * correctly skipping over pipe-delimited display terms (`|...|`)
 * and quoted strings (`"..."`).
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- tokenizer with multiple character-class branches
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  function pushToken(kind: TokenKind, start: number, end: number): void {
    tokens.push({ kind, start, end, text: text.slice(start, end) });
  }

  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }

    // Pipe-delimited display terms: |...|
    if (text[i] === '|') {
      const termStart = i;
      i++;
      while (i < text.length && text[i] !== '|') i++;
      if (i < text.length) i++;
      pushToken(TokenKind.Text, termStart, i);
      continue;
    }

    // Quoted strings: "..."
    if (text[i] === '"') {
      const qStart = i;
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) i++;
        i++;
      }
      if (i < text.length) i++;
      pushToken(TokenKind.Text, qStart, i);
      continue;
    }

    // Parentheses
    if (text[i] === '(') {
      pushToken(TokenKind.OpenParen, i, i + 1);
      i++;
      continue;
    }
    if (text[i] === ')') {
      pushToken(TokenKind.CloseParen, i, i + 1);
      i++;
      continue;
    }

    // Colon (refinement separator)
    if (text[i] === ':') {
      pushToken(TokenKind.Colon, i, i + 1);
      i++;
      continue;
    }

    // Keywords: AND, OR, MINUS (must be whole-word, case-insensitive)
    const rest = text.slice(i);
    const kwMatch = /^(AND|OR|MINUS)(?=\s|$|\(|\)|,)/i.exec(rest);
    if (kwMatch) {
      const kw = kwMatch[1].toUpperCase();
      const orOrMinus = kw === 'OR' ? TokenKind.OR : TokenKind.MINUS;
      const kind = kw === 'AND' ? TokenKind.AND : orOrMinus;
      pushToken(kind, i, i + kw.length);
      i += kw.length;
      continue;
    }

    // Any other character sequence
    const textStart = i;
    while (i < text.length) {
      if (/[\s()|":]/.test(text[i])) break;
      const ahead = text.slice(i);
      if (/^(AND|OR|MINUS)(?=\s|$|\(|\)|,)/i.test(ahead) && i > textStart) break;
      i++;
    }
    if (i > textStart) {
      pushToken(TokenKind.Text, textStart, i);
    }
  }

  return tokens;
}

// ── Mixed-operator parenthesisation ──────────────────────────────────────

/**
 * Collect the distinct operator TokenKinds that appear at depth 0.
 */
function topLevelOperators(tokens: Token[]): Set<TokenKind> {
  const operators = new Set<TokenKind>();
  let depth = 0;

  for (const tok of tokens) {
    switch (tok.kind) {
      case TokenKind.OpenParen:
        depth++;
        break;
      case TokenKind.CloseParen:
        depth--;
        break;
      case TokenKind.AND:
      case TokenKind.OR:
      case TokenKind.MINUS:
        if (depth === 0) operators.add(tok.kind);
        break;
    }
  }

  return operators;
}

/**
 * Find the lowest-precedence operator kind present in a set.
 */
function lowestPrecedenceOperator(ops: Set<TokenKind>): TokenKind {
  let lowest: TokenKind | undefined;
  let lowestPrec = Infinity;
  for (const op of ops) {
    const p = PRECEDENCE[op];
    if (p < lowestPrec) {
      lowestPrec = p;
      lowest = op;
    }
  }
  // ops is guaranteed non-empty by callers
  return lowest!; // eslint-disable-line @typescript-eslint/no-non-null-assertion -- callers guarantee non-empty set
}

/**
 * Split the token list by top-level occurrences of a given operator kind.
 * Returns the text segments and whether each contains operators of a
 * different kind (indicating it should be wrapped in parens).
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- segment analysis with depth tracking
function splitAndWrap(text: string, tokens: Token[], splitOp: TokenKind): string | null {
  // Find top-level positions of the split operator
  const splitIndices: number[] = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind === TokenKind.OpenParen) depth++;
    else if (tok.kind === TokenKind.CloseParen) depth--;
    else if (tok.kind === splitOp && depth === 0) splitIndices.push(i);
  }

  if (splitIndices.length === 0) return null;

  // Build segments between split operators
  interface Segment {
    startTokenIdx: number;
    endTokenIdx: number;
    hasDifferentOp: boolean;
  }

  const segments: Segment[] = [];
  let segStart = 0;
  for (const splitIdx of splitIndices) {
    segments.push(analyseSegment(tokens, segStart, splitIdx - 1, splitOp));
    segStart = splitIdx + 1;
  }
  segments.push(analyseSegment(tokens, segStart, tokens.length - 1, splitOp));

  // If no segment needs wrapping, nothing to do
  if (!segments.some((s) => s.hasDifferentOp)) return null;

  // Rebuild expression
  const parts: string[] = [];
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const spanStart = si === 0 ? 0 : tokens[seg.startTokenIdx].start;
    const spanEnd = si === segments.length - 1 ? text.length : tokens[seg.endTokenIdx].end;
    const trimmed = text.slice(spanStart, spanEnd).trim();

    parts.push(seg.hasDifferentOp ? `(${trimmed})` : trimmed);
  }

  return parts.join(` ${OPERATOR_TEXT[splitOp]} `);
}

/**
 * Analyse a segment of tokens (between split operators) and determine
 * whether it contains any top-level operators different from the split operator.
 */
function analyseSegment(
  tokens: Token[],
  startIdx: number,
  endIdx: number,
  splitOp: TokenKind,
): { startTokenIdx: number; endTokenIdx: number; hasDifferentOp: boolean } {
  let hasDifferentOp = false;
  let depth = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    const tok = tokens[i];
    if (tok.kind === TokenKind.OpenParen) depth++;
    else if (tok.kind === TokenKind.CloseParen) depth--;
    else if (
      depth === 0 &&
      (tok.kind === TokenKind.AND || tok.kind === TokenKind.OR || tok.kind === TokenKind.MINUS) &&
      tok.kind !== splitOp
    ) {
      hasDifferentOp = true;
    }
  }
  return { startTokenIdx: startIdx, endTokenIdx: endIdx, hasDifferentOp };
}

// ── Refinement ambiguity parenthesisation ────────────────────────────────

/**
 * Detect refinement ambiguity: 2+ colons at paren depth 0 means multiple
 * refined sub-expressions that need brackets to disambiguate.
 *
 * Returns the token indices of the AND/OR operators that separate the
 * refined sub-expressions (compound separators), or null if no ambiguity.
 *
 * Strategy: for each depth-0 colon after the first, the closest preceding
 * depth-0 AND/OR is the compound separator.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- refinement ambiguity detection with nested loops
function findRefinementSplitPoints(tokens: Token[]): number[] | null {
  // Collect depth-0 colon positions and AND/OR positions
  const colonIndices: number[] = [];
  const operatorIndices: number[] = [];
  let depth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind === TokenKind.OpenParen) depth++;
    else if (tok.kind === TokenKind.CloseParen) depth--;
    else if (depth === 0) {
      if (tok.kind === TokenKind.Colon) colonIndices.push(i);
      else if (tok.kind === TokenKind.AND || tok.kind === TokenKind.OR) {
        operatorIndices.push(i);
      }
    }
  }

  if (colonIndices.length < 2) return null;
  if (operatorIndices.length === 0) return null;

  // For each colon after the first, find the closest preceding AND/OR
  const splitPoints = new Set<number>();

  for (let ci = 1; ci < colonIndices.length; ci++) {
    const colonIdx = colonIndices[ci];
    // Find closest AND/OR before this colon that's after the previous colon
    const prevColonIdx = colonIndices[ci - 1];
    let bestOp = -1;
    for (const opIdx of operatorIndices) {
      if (opIdx > prevColonIdx && opIdx < colonIdx) {
        bestOp = opIdx; // Keep updating to get the closest one (last before colon)
      }
    }
    if (bestOp >= 0) {
      splitPoints.add(bestOp);
    }
  }

  if (splitPoints.size === 0) return null;
  return Array.from(splitPoints).sort((a, b) => a - b);
}

/**
 * Fix refinement ambiguity by wrapping each refined sub-expression in parens.
 * Splits at the identified compound separator operators.
 */
function wrapRefinedSegments(text: string, tokens: Token[], splitPoints: number[]): string {
  // Build segments between split points
  const segments: { startIdx: number; endIdx: number }[] = [];
  let segStart = 0;

  for (const splitIdx of splitPoints) {
    segments.push({ startIdx: segStart, endIdx: splitIdx - 1 });
    segStart = splitIdx + 1;
  }
  segments.push({ startIdx: segStart, endIdx: tokens.length - 1 });

  // Rebuild: wrap each segment that contains a colon
  const parts: string[] = [];
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];

    // Find text span
    const spanStart = si === 0 ? 0 : tokens[seg.startIdx].start;
    const spanEnd = si === segments.length - 1 ? text.length : tokens[seg.endIdx].end;
    const trimmed = text.slice(spanStart, spanEnd).trim();

    // Check if segment contains a colon
    let hasColon = false;
    for (let i = seg.startIdx; i <= seg.endIdx; i++) {
      if (tokens[i].kind === TokenKind.Colon) {
        hasColon = true;
        break;
      }
    }

    parts.push(hasColon ? `(${trimmed})` : trimmed);
  }

  // Use the operator text from the first split point for joining
  const opText = tokens[splitPoints[0]].text.toUpperCase();
  return parts.join(` ${opText} `);
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Returns an "Add explicit parentheses" code action when the expression
 * has ambiguity that requires brackets:
 *
 * 1. Mixed operators (AND/OR/MINUS) at the top level
 * 2. Multiple refined sub-expressions without brackets
 *
 * Splits on the lowest-precedence operator and wraps segments that
 * contain different operators.  One level of grouping per invocation.
 */
export function getAddParenthesesAction(ctx: RefactoringContext): CoreCodeAction | null {
  const tokens = tokenize(ctx.expressionText);
  const operators = topLevelOperators(tokens);

  // Case 1: Mixed operators at top level
  if (operators.size >= 2) {
    const splitOp = lowestPrecedenceOperator(operators);
    const rewritten = splitAndWrap(ctx.expressionText, tokens, splitOp);

    if (rewritten !== null && rewritten !== ctx.expressionText) {
      return {
        title: 'Add explicit parentheses',
        kind: 'refactor' as const,
        documentUri: ctx.documentUri,
        edits: [coreReplace(ctx.expressionRange, rewritten)],
      };
    }
  }

  // Case 2: Refinement ambiguity (multiple colons at depth 0)
  const splitPoints = findRefinementSplitPoints(tokens);
  if (splitPoints) {
    const rewritten = wrapRefinedSegments(ctx.expressionText, tokens, splitPoints);

    if (rewritten !== ctx.expressionText) {
      return {
        title: 'Add explicit parentheses',
        kind: 'refactor' as const,
        documentUri: ctx.documentUri,
        edits: [coreReplace(ctx.expressionRange, rewritten)],
      };
    }
  }

  return null;
}
