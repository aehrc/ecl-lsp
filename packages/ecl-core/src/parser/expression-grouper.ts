// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

/**
 * Represents a single ECL expression in a document.
 * Expressions are separated by ECL-END comment delimiters.
 */
export interface Expression {
  text: string; // The expression text (multi-line, cleaned)
  startLine: number; // Starting line in document (0-indexed)
  endLine: number; // Ending line in document (0-indexed)
  lineOffsets: number[]; // Maps expression line numbers to document line numbers
}

/**
 * Groups document lines into ECL expressions.
 * Expressions are separated by ECL-END comment delimiters.
 * Each expression can be multi-line.
 *
 * @param text - The full document text
 * @returns Array of expressions with their positions in the document
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- char-by-char expression splitter with comment/string tracking
export function groupIntoExpressions(text: string): Expression[] {
  const lines = text.split('\n');
  const expressions: Expression[] = [];

  let currentExprLines: string[] = [];
  let currentExprLineOffsets: number[] = [];
  let exprStartLine = 0;
  let inBlockComment = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    // Check for ECL-END delimiter
    if (line.trim() === '/* ECL-END */') {
      inBlockComment = false;
      // End current expression if it has content
      if (currentExprLines.length > 0) {
        expressions.push({
          text: currentExprLines.join('\n'),
          startLine: exprStartLine,
          endLine: lineIndex - 1,
          lineOffsets: currentExprLineOffsets,
        });
        currentExprLines = [];
        currentExprLineOffsets = [];
      }
      // Next expression starts after this delimiter
      exprStartLine = lineIndex + 1;
      continue;
    }

    // If inside a multi-line block comment, look for closing */
    if (inBlockComment) {
      const closeIdx = line.indexOf('*/');
      if (closeIdx !== -1) {
        inBlockComment = false;
        // Check if there's code after the closing */
        const afterComment = line.substring(closeIdx + 2);
        const trimmedAfter = afterComment.trim();
        if (trimmedAfter && !trimmedAfter.startsWith('//')) {
          if (currentExprLines.length === 0) {
            exprStartLine = lineIndex;
          }
          currentExprLines.push(afterComment);
          currentExprLineOffsets.push(lineIndex);
        }
      }
      // Either way, skip the rest of this line (it's comment content)
      continue;
    }

    // Remove inline comments for processing
    let cleanLine = line;
    const commentStart = line.indexOf('/*');
    const commentEnd = line.indexOf('*/');
    if (commentStart !== -1) {
      if (commentEnd !== -1 && commentEnd > commentStart) {
        // Remove /* ... */ from line
        cleanLine = line.substring(0, commentStart) + line.substring(commentEnd + 2);
      } else {
        // Unclosed block comment — remove everything after /* and enter block comment mode
        cleanLine = line.substring(0, commentStart);
        inBlockComment = true;
      }
    }

    const trimmed = cleanLine.trim();

    // Skip empty lines, lines that are just closing comments, or C++ style comments
    if (!trimmed || trimmed === '*/' || trimmed.startsWith('//')) {
      continue;
    }

    // Add to current expression
    if (currentExprLines.length === 0) {
      exprStartLine = lineIndex;
    }
    currentExprLines.push(cleanLine);
    currentExprLineOffsets.push(lineIndex);
  }

  // Don't forget the last expression
  if (currentExprLines.length > 0) {
    expressions.push({
      text: currentExprLines.join('\n'),
      startLine: exprStartLine,
      endLine: lines.length - 1,
      lineOffsets: currentExprLineOffsets,
    });
  }

  return expressions;
}
