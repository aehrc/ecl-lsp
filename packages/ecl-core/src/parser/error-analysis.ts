// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

/**
 * Single-pass error analysis for ECL expressions.
 *
 * Replaces 7 independent character-scanning heuristics with:
 *   1. groupTokens() — one pass to produce logical tokens
 *   2. analyzeExpression() — one iteration over tokens for all checks
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface ExpressionIssues {
  mixedOperator: { firstOp: string; conflictOp: string; line: number; column: number } | null;
  missingColonBeforeBrace: { line: number; column: number } | null;
  trailingOperator: { op: string; line: number; column: number } | null;
  duplicateOperator: { op: string; line: number; column: number } | null;
  danglingEquals: { line: number; column: number } | null;
  unclosedParen: { line: number; column: number } | null;
  missingWhitespace: { op: string; side: 'before' | 'after'; line: number; column: number } | null;
}

export interface GroupedToken {
  kind: 'keyword' | 'word' | 'symbol' | 'whitespace';
  text: string;
  line: number; // 1-indexed (ANTLR convention)
  column: number; // 0-indexed
  offset: number; // absolute char offset
  inTerm: boolean; // between |...| pipes
}

// ── Tokeniser ───────────────────────────────────────────────────────────────

const KEYWORDS = new Set(['AND', 'OR', 'MINUS']); // canonical forms (uppercased for lookup)

// eslint-disable-next-line sonarjs/cognitive-complexity -- tokenizer with multi-char operator recognition
export function groupTokens(text: string): GroupedToken[] {
  const tokens: GroupedToken[] = [];
  let inTerm = false;
  let line = 1;
  let col = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // ── Pipe toggles term mode ──────────────────────────────────────────
    if (ch === '|') {
      tokens.push({ kind: 'symbol', text: '|', line, column: col, offset: i, inTerm });
      inTerm = !inTerm;
      i++;
      col++;
      continue;
    }

    // ── Inside a term: consume everything until next pipe ────────────────
    if (inTerm) {
      const start = i;
      const startCol = col;
      while (i < text.length && text[i] !== '|') {
        if (text[i] === '\n') {
          line++;
          col = 0;
        } else {
          col++;
        }
        i++;
      }
      tokens.push({ kind: 'word', text: text.slice(start, i), line, column: startCol, offset: start, inTerm: true });
      continue;
    }

    // ── Whitespace (outside terms) ──────────────────────────────────────
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      const start = i;
      const startLine = line;
      const startCol = col;
      while (i < text.length && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) {
        if (text[i] === '\n') {
          line++;
          col = 0;
        } else {
          col++;
        }
        i++;
      }
      tokens.push({
        kind: 'whitespace',
        text: text.slice(start, i),
        line: startLine,
        column: startCol,
        offset: start,
        inTerm: false,
      });
      continue;
    }

    // ── Letters → word (may become keyword) ────────────────────────────
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
      const start = i;
      const startCol = col;
      while (i < text.length && ((text[i] >= 'A' && text[i] <= 'Z') || (text[i] >= 'a' && text[i] <= 'z'))) {
        i++;
        col++;
      }
      const word = text.slice(start, i);
      const kind = KEYWORDS.has(word.toUpperCase()) ? 'keyword' : 'word';
      tokens.push({ kind, text: word, line, column: startCol, offset: start, inTerm: false });
      continue;
    }

    // ── Structural symbols (single char each) ───────────────────────────
    tokens.push({ kind: 'symbol', text: ch, line, column: col, offset: i, inTerm: false });
    i++;
    col++;
  }

  return tokens;
}

// ── Analyser ────────────────────────────────────────────────────────────────

// eslint-disable-next-line sonarjs/cognitive-complexity -- single-pass heuristic analyzer scanning all error patterns
export function analyzeExpression(text: string): ExpressionIssues {
  const tokens = groupTokens(text);

  const result: ExpressionIssues = {
    mixedOperator: null,
    missingColonBeforeBrace: null,
    trailingOperator: null,
    duplicateOperator: null,
    danglingEquals: null,
    unclosedParen: null,
    missingWhitespace: null,
  };

  // ── Shared state ────────────────────────────────────────────────────────
  let parenDepth = 0;
  let braceDepth = 0;

  // Mixed operator (parenDepth === 0 only, braces don't count)
  let firstOp: string | null = null;

  // Missing colon before brace (parenDepth === 0 && braceDepth === 0)
  let seenColonAtTopLevel = false;
  let lastNonWsText = '';

  // Trailing operator (combined depth === 0)
  let lastTopLevelOp: { op: string; line: number; column: number } | null = null;
  let hasContentAfterLastOp = false;

  // Duplicate operator (combined depth === 0)
  let prevOp: string | null = null;

  // Unclosed paren
  const parenStack: { line: number; column: number }[] = [];

  for (const tok of tokens) {
    // Skip term content entirely — only process the pipes themselves
    if (tok.inTerm && tok.kind !== 'symbol') continue;

    // Skip whitespace (doesn't affect any state except it doesn't reset prevOp etc.)
    if (tok.kind === 'whitespace') continue;

    const sym = tok.text;

    // ── Pipe symbol ─────────────────────────────────────────────────────
    if (sym === '|') {
      lastNonWsText = '|';
      continue;
    }

    // ── Parentheses ─────────────────────────────────────────────────────
    if (sym === '(') {
      parenDepth++;
      parenStack.push({ line: tok.line, column: tok.column });
      lastNonWsText = '(';
      // Reset duplicate-op tracking when entering parens
      if (parenDepth + braceDepth === 1) prevOp = null;
      continue;
    }
    if (sym === ')') {
      parenDepth--;
      if (parenStack.length > 0) parenStack.pop();
      lastNonWsText = ')';
      // Reset duplicate-op tracking when exiting parens
      if (parenDepth + braceDepth === 0) prevOp = null;
      continue;
    }

    // ── Braces ──────────────────────────────────────────────────────────
    if (sym === '{') {
      // Missing colon check (parenDepth === 0 && braceDepth === 0)
      if (parenDepth === 0 && braceDepth === 0 && !result.missingColonBeforeBrace) {
        if (lastNonWsText !== ':' && !seenColonAtTopLevel) {
          result.missingColonBeforeBrace = { line: tok.line, column: tok.column };
        }
      }
      braceDepth++;
      lastNonWsText = '{';
      // Reset duplicate-op tracking when entering braces
      if (parenDepth + braceDepth === 1) prevOp = null;
      continue;
    }
    if (sym === '}') {
      if (braceDepth > 0) braceDepth--;
      lastNonWsText = '}';
      // Reset duplicate-op tracking when exiting braces
      if (parenDepth + braceDepth === 0) prevOp = null;
      continue;
    }

    // ── Colon ───────────────────────────────────────────────────────────
    if (sym === ':' && parenDepth === 0 && braceDepth === 0) {
      seenColonAtTopLevel = true;
    }

    // ── Keyword (AND / OR / MINUS — case-insensitive) ─────────────────
    if (tok.kind === 'keyword') {
      const op = sym;
      const opUpper = op.toUpperCase();

      // Mixed operator check (parenDepth === 0 only, braces don't matter)
      if (parenDepth === 0 && !result.mixedOperator) {
        if (firstOp === null) {
          firstOp = opUpper;
        } else if (opUpper !== firstOp) {
          result.mixedOperator = { firstOp, conflictOp: op, line: tok.line, column: tok.column };
        }
      }

      // Duplicate operator check (combined depth === 0)
      if (parenDepth + braceDepth === 0 && !result.duplicateOperator) {
        if (prevOp === opUpper) {
          result.duplicateOperator = { op, line: tok.line, column: tok.column };
        }
        prevOp = opUpper;
      } else if (parenDepth + braceDepth !== 0) {
        // Inside nesting — don't track
      }

      // Trailing operator check (combined depth === 0)
      if (parenDepth + braceDepth === 0) {
        lastTopLevelOp = { op, line: tok.line, column: tok.column };
        hasContentAfterLastOp = false;
      }

      // Missing whitespace check (all depths, but skip terms — already skipped above)
      if (!result.missingWhitespace) {
        const before = tok.offset > 0 ? text[tok.offset - 1] : ' ';
        const after = tok.offset + op.length < text.length ? text[tok.offset + op.length] : ' ';
        const validBefore = before === ' ' || before === '\t' || before === '\n' || before === '(';
        const validAfter = after === ' ' || after === '\t' || after === '\n' || after === ')' || after === '';
        if (!validBefore) {
          result.missingWhitespace = { op, side: 'before', line: tok.line, column: tok.column };
        } else if (!validAfter) {
          result.missingWhitespace = { op, side: 'after', line: tok.line, column: tok.column };
        }
      }

      lastNonWsText = op;
      continue;
    }

    // ── Any other non-whitespace token ──────────────────────────────────
    if (parenDepth + braceDepth === 0) {
      // Content after a top-level operator → not trailing
      if (lastTopLevelOp) hasContentAfterLastOp = true;
      // Non-operator token resets duplicate tracking
      prevOp = null;
    }
    if (sym !== ' ' && sym !== '\t') {
      lastNonWsText = sym;
    }
  }

  // ── Post-loop: trailing operator ────────────────────────────────────────
  if (lastTopLevelOp && !hasContentAfterLastOp) {
    result.trailingOperator = lastTopLevelOp;
  }

  // ── Post-loop: dangling equals ──────────────────────────────────────────
  if (text.trimEnd().endsWith('=')) {
    const eqIdx = text.lastIndexOf('=');
    if (text.slice(eqIdx + 1).trim() === '') {
      let eqLine = 1,
        eqCol = 0;
      for (let i = 0; i < eqIdx; i++) {
        if (text[i] === '\n') {
          eqLine++;
          eqCol = 0;
        } else {
          eqCol++;
        }
      }
      result.danglingEquals = { line: eqLine, column: eqCol };
    }
  }

  // ── Post-loop: unclosed paren ───────────────────────────────────────────
  if (parenStack.length > 0) {
    result.unclosedParen = parenStack[0];
  }

  return result;
}
