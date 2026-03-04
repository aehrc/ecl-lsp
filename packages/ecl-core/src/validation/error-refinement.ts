// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { ParseError } from '../parser/error-listener';

/** Safely extract the text from an offendingSymbol (which is typed as `any` in the ANTLR API). */
function getSymbolText(sym: unknown): string {
  if (typeof sym === 'string') return sym;
  if (sym && typeof sym === 'object' && 'text' in sym) {
    const text = (sym as { text: unknown }).text;
    return typeof text === 'string' ? text : '';
  }
  return '';
}

/**
 * Context needed to refine a raw ANTLR parse error into a user-friendly diagnostic.
 */
export interface ErrorContext {
  /** The ANTLR parse error. */
  error: ParseError;
  /** All document lines (for EOF relocation). */
  lines: string[];
  /** The document line index where the error was reported. */
  docLineIndex: number;
  /** Line offsets mapping expression-local lines to document lines. */
  lineOffsets: number[];
  /** Start line of the expression in the document. */
  startLine: number;
}

/**
 * The refined error message and highlight range.
 */
export interface RefinedError {
  message: string;
  startChar: number;
  endChar: number;
  docLineIndex: number;
}

/** Compute highlight range for a symbol-width token (operator name with fallback). */
function highlightSymbol(column: number, sym: unknown): { startChar: number; endChar: number } {
  const opName = getSymbolText(sym);
  // ANTLR's column (charPositionInLine) is already 0-indexed from the start
  // of the full input line, including any leading whitespace.
  return { startChar: column, endChar: column + (opName.length > 0 ? opName.length : 3) };
}

/** Compute highlight range for a single character. */
function highlightChar(column: number): { startChar: number; endChar: number } {
  return { startChar: column, endChar: column + 1 };
}

/**
 * Refine a raw ANTLR parse error into a user-friendly message with accurate
 * highlight positions. This is a pure function — no side effects.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- large if/else chain mapping error patterns to messages
export function refineParseError(ctx: ErrorContext): RefinedError {
  let { docLineIndex } = ctx;
  const { error, lines, lineOffsets } = ctx;

  let message = error.message;
  let docLine = lines[docLineIndex] || '';

  // ── EOF relocation ──────────────────────────────────────────────────────
  // For errors at END of expression (EOF-related), position at the last line with content.
  const hasUnclosedParen = Boolean(
    message.includes('no viable alternative') && /at input '(\(.+?)'/.exec(message)?.[1] && !message.includes(')'),
  );
  const isEOFError = [
    message.includes('<EOF>'),
    message.includes('Unexpected input'),
    hasUnclosedParen,
    message.includes('missing') && [message.includes(')'), message.includes('RIGHT_PAREN')].some(Boolean),
  ].some(Boolean);

  if (isEOFError && lineOffsets.length > 0) {
    docLineIndex = lineOffsets.at(-1) ?? 0;
    docLine = lines[docLineIndex] || '';
  }

  // ── Positioning helpers ─────────────────────────────────────────────────
  const leadingWhitespace = docLine.length - docLine.trimStart().length;
  const trimmed = docLine.trim();

  let startChar = error.column;
  let endChar = error.column + 1;

  // ── Message refinement ──────────────────────────────────────────────────
  // Group A: highlight the offending symbol (operator-width)
  const isSymbolHighlight =
    (message.includes('Cannot mix') && message.includes('operators without parentheses')) ||
    (message.includes('Incomplete expression:') && message.includes('must be followed by')) ||
    (message.startsWith("Duplicate '") && message.includes('expected a concept constraint')) ||
    (message.includes('Missing space') && message.includes('operators must be surrounded by spaces'));

  // Group B: highlight a single character
  const isSingleCharHighlight =
    message.includes("Missing ':' before '{'") ||
    (message.includes('Incomplete attribute:') && message.includes("'=' must be followed by")) ||
    message.includes("Missing closing ')'");

  if (isSymbolHighlight) {
    ({ startChar, endChar } = highlightSymbol(error.column, error.offendingSymbol));
  } else if (isSingleCharHighlight) {
    ({ startChar, endChar } = highlightChar(error.column));
  } else if (message.includes('no viable alternative at input')) {
    const match = /at input '(.+?)'/.exec(message);
    if (match) {
      const found = match[1].trim();
      if (found.startsWith('(') && !found.includes(')')) {
        message = 'Missing closing parenthesis )';
        startChar = Math.max(0, docLine.length - 1);
        endChar = docLine.length;
      } else if (/^(AND|OR|MINUS)$/i.test(found)) {
        message = `Duplicate ${found} operator or missing concept`;
        const firstOccurrence = trimmed.indexOf(found);
        const secondOccurrence = trimmed.indexOf(found, firstOccurrence + 1);
        if (secondOccurrence === -1) {
          startChar = error.column;
          endChar = startChar + found.length;
        } else {
          startChar = leadingWhitespace + secondOccurrence;
          endChar = startChar + found.length;
        }
      } else if (found.includes('<')) {
        message = `Missing operator or invalid syntax`;
        const pos = trimmed.indexOf('<', Math.max(0, error.column - leadingWhitespace));
        if (pos === -1) {
          startChar = error.column;
          endChar = startChar + 1;
        } else {
          startChar = leadingWhitespace + pos;
          endChar = startChar + (/^<<|^</.exec(trimmed.substring(pos)) ?? ['<'])[0].length;
        }
      } else {
        message = `Invalid syntax near '${found}'`;
        startChar = error.column;
        endChar = startChar + Math.min(found.length, 15);
      }
    }
  } else if (message.includes("mismatched input '<EOF>'")) {
    message = 'Incomplete expression - missing concept ID or closing parenthesis';
    const lastToken = /(\S+)$/.exec(trimmed); // eslint-disable-line sonarjs/slow-regex -- trimmed single line
    if (lastToken) {
      const lastTokenStart = trimmed.lastIndexOf(lastToken[1]);
      startChar = leadingWhitespace + lastTokenStart;
      endChar = startChar + lastToken[1].length;
    } else {
      startChar = leadingWhitespace + Math.max(0, trimmed.length - 3);
      endChar = leadingWhitespace + trimmed.length;
    }
  } else if (message.includes('mismatched input')) {
    const match = /mismatched input '(.+?)'/.exec(message);
    if (match) {
      const found = match[1];
      message = `Unexpected '${found}' - check syntax`;
      const pos = trimmed.indexOf(found, Math.max(0, error.column - leadingWhitespace - 2));
      if (pos === -1) {
        startChar = error.column;
        endChar = startChar + Math.min(found.length, 10);
      } else {
        startChar = leadingWhitespace + pos;
        endChar = startChar + found.length;
      }
    }
  } else if (message.includes('extraneous input')) {
    const match = /extraneous input '(.+?)'/.exec(message);
    if (match) {
      const found = match[1];
      message = `Extra '${found}' - remove or fix syntax`;
      const pos = trimmed.indexOf(found, Math.max(0, error.column - leadingWhitespace - 2));
      if (pos === -1) {
        startChar = error.column;
        endChar = startChar + found.length;
      } else {
        startChar = leadingWhitespace + pos;
        endChar = startChar + found.length;
      }
    }
  } else if (message.includes('missing')) {
    if (message.includes(')') || message.includes('RIGHT_PAREN')) {
      message = 'Missing closing parenthesis )';
      startChar = Math.max(0, docLine.length - 1);
      endChar = docLine.length;
    } else {
      message = message.replace('missing ', 'Missing: ');
      ({ startChar, endChar } = highlightChar(error.column));
    }
  } else {
    ({ startChar, endChar } = highlightChar(error.column));
  }

  return { message, startChar, endChar, docLineIndex };
}
