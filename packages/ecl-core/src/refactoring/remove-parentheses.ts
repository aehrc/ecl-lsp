// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Refactoring: Remove redundant parentheses from ECL expressions
//
// Detects `(...)` groups where the content is a single sub-expression
// (no top-level AND/OR/MINUS compound operators inside), making the
// parentheses unnecessary.
//
// Cases handled:
//   (< 404684003) AND < 19829001  →  < 404684003 AND < 19829001
//   (< 404684003)                 →  < 404684003
//
// NOT redundant:
//   (< A AND < B) OR < C  — parens change evaluation order

import type { CoreCodeAction } from '../types';
import { coreReplace } from '../types';
import type { RefactoringContext } from './index';

/**
 * Scan the expression for depth-0 `(...)` groups whose inner content
 * has no top-level compound operators.  Returns the expression with
 * redundant parens removed, or null if nothing to remove.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- paren scanner with depth/term/quote tracking
function removeRedundantParens(text: string): string | null {
  // Find all depth-0 paren groups and check if any are redundant
  const groups: { openIdx: number; closeIdx: number }[] = [];
  const stack: number[] = [];
  let inTerm = false;
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    if (!inQuote && text[i] === '|') {
      inTerm = !inTerm;
      continue;
    }
    if (inTerm) continue;

    if (text[i] === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;

    if (text[i] === '(') {
      stack.push(i);
    } else if (text[i] === ')' && stack.length > 0) {
      const openPos = stack.pop();
      if (openPos === undefined) continue;
      if (stack.length === 0) {
        // This is a depth-0 paren group
        groups.push({ openIdx: openPos, closeIdx: i });
      }
    }
  }

  if (groups.length === 0) return null;

  // Check each depth-0 group for redundancy
  const redundant: { openIdx: number; closeIdx: number }[] = [];

  for (const group of groups) {
    const inner = text.substring(group.openIdx + 1, group.closeIdx);
    if (hasTopLevelCompoundOperator(inner)) continue;

    // A paren group wrapping a refinement (e.g., `(< A : x = v) AND ...`)
    // is NOT redundant — removing them would change binding.
    if (hasTopLevelColon(inner)) continue;

    // Skip if inner content contains filter blocks
    if (inner.includes('{{')) continue;

    redundant.push(group);
  }

  if (redundant.length === 0) return null;

  // Remove redundant parens (process from right to left to preserve indices)
  let result = text;
  for (let i = redundant.length - 1; i >= 0; i--) {
    const group = redundant[i];
    const inner = result.substring(group.openIdx + 1, group.closeIdx).trim();
    result = result.substring(0, group.openIdx) + inner + result.substring(group.closeIdx + 1);
  }

  // Normalize multiple spaces to single
  result = result.replaceAll(/ {2,}/g, ' ').trim();

  return result === text ? null : result;
}

/**
 * Returns true if the text has AND/OR/MINUS at paren depth 0.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- depth/term/quote tracking requires nested conditions
function hasTopLevelCompoundOperator(text: string): boolean {
  let depth = 0;
  let inTerm = false;
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    if (!inQuote && text[i] === '|') {
      inTerm = !inTerm;
      continue;
    }
    if (inTerm) continue;
    if (text[i] === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;

    if (text[i] === '(' || text[i] === '{') {
      depth++;
      continue;
    }
    if (text[i] === ')' || text[i] === '}') {
      depth--;
      continue;
    }

    if (depth === 0) {
      const rest = text.substring(i);
      const match = /^(AND|OR|MINUS)(?=\s|$|\(|\)|,)/i.exec(rest);
      if (match) return true;
    }
  }

  return false;
}

/**
 * Returns true if the text has a colon `:` at paren depth 0 (refinement).
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- depth/term/quote tracking requires nested conditions
function hasTopLevelColon(text: string): boolean {
  let depth = 0;
  let inTerm = false;
  let inQuote = false;

  for (const ch of text) {
    if (!inQuote && ch === '|') {
      inTerm = !inTerm;
      continue;
    }
    if (inTerm) continue;
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;

    if (ch === '(' || ch === '{') {
      depth++;
      continue;
    }
    if (ch === ')' || ch === '}') {
      depth--;
      continue;
    }

    if (depth === 0 && ch === ':') return true;
  }

  return false;
}

/**
 * Returns a "Remove redundant parentheses" code action if the expression
 * contains unnecessary parentheses.  Returns null otherwise.
 */
export function getRemoveParenthesesAction(ctx: RefactoringContext): CoreCodeAction | null {
  const rewritten = removeRedundantParens(ctx.expressionText);
  if (rewritten === null) return null;

  return {
    title: 'Remove redundant parentheses',
    kind: 'refactor' as const,
    documentUri: ctx.documentUri,
    edits: [coreReplace(ctx.expressionRange, rewritten)],
  };
}
