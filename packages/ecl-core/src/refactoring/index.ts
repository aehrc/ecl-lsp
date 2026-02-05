// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Refactoring code actions for ECL expressions

import type { CoreCodeAction, CoreRange } from '../types';
import { positionAt, offsetAt, getText } from '../text-utils';
import { parseECL } from '../parser';
import type { ExpressionNode } from '../parser/ast';
import { groupIntoExpressions } from '../parser/expression-grouper';
import { getStripDisplayTermsAction } from './strip-display-terms';
import { getAddDisplayTermsAction } from './add-display-terms';
import { getUnifiedSimplifyAction } from './simplify-expression';
import { getAddParenthesesAction } from './add-parentheses';
import { getAddHistorySupplementActions } from './add-history-supplement';
import { getAddDescriptionFilterAction } from './add-description-filter';
import { getRemoveParenthesesAction } from './remove-parentheses';

export interface RefactoringContext {
  documentText: string;
  documentUri: string;
  range: CoreRange;
  /** The full text of the line (or expression) under the cursor */
  expressionText: string;
  /** The range of the expression in the document */
  expressionRange: CoreRange;
  /** Parsed AST, if available */
  ast?: ExpressionNode;
}

/**
 * Find the innermost balanced parenthesized group that contains the
 * cursor offset.  Returns the content start/end (inside the parens),
 * or null if the cursor is not inside any parenthesized group.
 *
 * Correctly skips pipe-delimited display terms (`|...|`) and quoted
 * strings (`"..."`) which may contain literal parentheses.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- paren matching with pipe/quote/depth tracking
function findInnermostParenContent(text: string, cursorOffset: number): { start: number; end: number } | null {
  const openStack: number[] = [];
  let best: { start: number; end: number } | null = null;
  let i = 0;

  while (i < text.length) {
    // Skip pipe-delimited display terms
    if (text[i] === '|') {
      i++;
      while (i < text.length && text[i] !== '|') i++;
      if (i < text.length) i++;
      continue;
    }

    // Skip quoted strings
    if (text[i] === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) i++;
        i++;
      }
      if (i < text.length) i++;
      continue;
    }

    if (text[i] === '(') {
      openStack.push(i);
      i++;
      continue;
    }

    if (text[i] === ')' && openStack.length > 0) {
      const openPos = openStack.pop();
      if (openPos === undefined) continue;
      // Cursor must be strictly inside the parens (not on them)
      if (cursorOffset > openPos && cursorOffset < i) {
        // Inner parens close first, so the first match is the innermost
        best ??= { start: openPos + 1, end: i };
      }
      i++;
      continue;
    }

    i++;
  }

  return best;
}

/**
 * Collect refactoring actions for a given expression context.
 * Used for both the whole-line expression and sub-expressions.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- orchestrator collecting actions from multiple refactoring modules
function collectActions(ctx: RefactoringContext, subExpression: boolean): CoreCodeAction[] {
  const actions: CoreCodeAction[] = [];

  // Text-based refactorings only for the whole line
  if (!subExpression) {
    const stripAction = getStripDisplayTermsAction(ctx);
    if (stripAction) actions.push(stripAction);

    const addTermsAction = getAddDisplayTermsAction(ctx);
    if (addTermsAction) actions.push(addTermsAction);
  }

  if (ctx.ast) {
    // Unified simplify handles all nesting internally, so only offer
    // for the whole line (not sub-expressions).
    if (!subExpression) {
      const simplifyAction = getUnifiedSimplifyAction(ctx);
      if (simplifyAction) actions.push(simplifyAction);
    }

    const parenAction = getAddParenthesesAction(ctx);
    if (parenAction) actions.push(parenAction);

    const removeParenAction = getRemoveParenthesesAction(ctx);
    if (removeParenAction) actions.push(removeParenAction);

    // Append-style refactorings only for the whole line
    if (!subExpression) {
      const historyActions = getAddHistorySupplementActions(ctx);
      actions.push(...historyActions);

      const filterAction = getAddDescriptionFilterAction(ctx);
      if (filterAction) actions.push(filterAction);
    }
  }

  return actions;
}

/**
 * Find the expression (possibly multi-line) that contains the cursor line.
 * Uses `groupIntoExpressions` to respect `/* ECL-END *\/` delimiters.
 * Returns the expression text, its document range, and the cursor offset
 * within the expression text.
 */
function findExpressionAtCursor(
  documentText: string,
  cursorLine: number,
  cursorChar: number,
): { text: string; range: CoreRange; cursorOffset: number } | null {
  const expressions = groupIntoExpressions(documentText);

  for (const expr of expressions) {
    if (cursorLine >= expr.startLine && cursorLine <= expr.endLine) {
      const exprText = expr.text;
      if (!exprText.trim()) continue;

      // Calculate the expression range in the document
      // startLine/endLine from groupIntoExpressions are document lines
      // The expression text starts at the first non-empty character of startLine
      // and ends at the last character of endLine
      const startLineText = getText(documentText, {
        start: { line: expr.startLine, character: 0 },
        end: { line: expr.startLine + 1, character: 0 },
      });
      const startChar = startLineText.length - startLineText.trimStart().length;

      const endLineText = getText(documentText, {
        start: { line: expr.endLine, character: 0 },
        end: { line: expr.endLine + 1, character: 0 },
      }).replace(/\n$/, '');
      const endChar = endLineText.length;

      const exprRange: CoreRange = {
        start: { line: expr.startLine, character: startChar },
        end: { line: expr.endLine, character: endChar },
      };

      // Calculate cursor offset within the expression text.
      // Walk through lineOffsets to find how many characters precede the cursor line.
      let cursorOffset = 0;
      for (const mappedLine of expr.lineOffsets) {
        if (mappedLine === cursorLine) {
          cursorOffset += cursorChar;
          break;
        }
        // Each line in the joined expression text contributes its content + '\n'
        const lineContent = getText(documentText, {
          start: { line: mappedLine, character: 0 },
          end: { line: mappedLine + 1, character: 0 },
        });
        cursorOffset += lineContent.length;
      }

      return { text: exprText, range: exprRange, cursorOffset };
    }
  }

  return null;
}

/**
 * Returns refactoring code actions for the given document and cursor range.
 * Called from the onCodeAction handler alongside diagnostic quick fixes.
 *
 * Finds the full (possibly multi-line) expression containing the cursor,
 * offers whole-expression refactorings, and also offers sub-expression
 * refactorings when the cursor is inside a parenthesized group.
 */
export function getRefactoringActions(documentUri: string, documentText: string, range: CoreRange): CoreCodeAction[] {
  const cursorLine = range.start.line;
  const cursorChar = range.start.character;

  const expr = findExpressionAtCursor(documentText, cursorLine, cursorChar);
  if (!expr) {
    return [];
  }

  // Parse the full expression
  const result = parseECL(expr.text);

  const ctx: RefactoringContext = {
    documentText,
    documentUri,
    range,
    expressionText: expr.text,
    expressionRange: expr.range,
    ast: result.ast ?? undefined,
  };

  // Collect whole-expression actions
  const actions = collectActions(ctx, false);

  // Also try the innermost parenthesized sub-expression around the cursor
  const sub = findInnermostParenContent(expr.text, expr.cursorOffset);
  if (sub) {
    const rawSub = expr.text.substring(sub.start, sub.end);
    const leadingWs = rawSub.length - rawSub.trimStart().length;
    const trailingWs = rawSub.length - rawSub.trimEnd().length;
    const subText = rawSub.trim();
    if (subText) {
      const subResult = parseECL(subText);
      // Map sub-expression offsets back to document positions
      const subStartOffset = offsetAt(documentText, expr.range.start) + sub.start + leadingWs;
      const subEndOffset = offsetAt(documentText, expr.range.start) + sub.end - trailingWs;
      const subRange: CoreRange = {
        start: positionAt(documentText, subStartOffset),
        end: positionAt(documentText, subEndOffset),
      };
      const subCtx: RefactoringContext = {
        documentText,
        documentUri,
        range,
        expressionText: subText,
        expressionRange: subRange,
        ast: subResult.ast ?? undefined,
      };

      const subActions = collectActions(subCtx, true);
      if (subActions.length > 0) {
        // Label whole-expression actions so scope is clear when both are present
        for (const action of actions) {
          action.title += ' (whole expression)';
        }
        for (const action of subActions) {
          action.title += ' (sub-expression)';
          actions.push(action);
        }
      }
    }
  }

  return actions;
}

/** Marker for code actions that need async resolution (FHIR lookups) */
export const REFACTORING_RESOLVE_KIND = 'ecl.refactoring.resolve';

export { resolveAddDisplayTerms } from './add-display-terms';
export { resolveUnifiedSimplify } from './simplify-expression';
