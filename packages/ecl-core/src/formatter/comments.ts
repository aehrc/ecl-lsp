// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Task 5.1-5.5: Comment preservation during formatting

export interface Comment {
  content: string;
  startOffset: number;
  endOffset: number;
  type: 'block' | 'line';
  position: 'before' | 'inline' | 'between';
  trailingWhitespace?: string; // Whitespace after this comment (before next comment or code)
}

// Task 5.1: Identify block comments (/* */) and line comments (//) in input document
// eslint-disable-next-line sonarjs/cognitive-complexity -- char-by-char comment parser with nested state tracking
export function extractComments(text: string): { comments: Comment[]; textWithoutComments: string } {
  const comments: Comment[] = [];

  // Find all comments (both block and line)
  // Important: Process line comments first since they take precedence
  // (a block comment marker inside a line comment is just text)
  const allComments: { start: number; end: number; content: string; type: 'block' | 'line' }[] = [];

  // First, find all line comments
  const lineCommentRegex = /\/\/[^\n]*/g;
  let match: RegExpExecArray | null;
  const lineCommentRanges: { start: number; end: number }[] = [];

  while ((match = lineCommentRegex.exec(text)) !== null) {
    const range = { start: match.index, end: lineCommentRegex.lastIndex };
    lineCommentRanges.push(range);
    allComments.push({
      start: range.start,
      end: range.end,
      content: match[0],
      type: 'line',
    });
  }

  // Helper to check if a position is inside a line comment
  const isInsideLineComment = (pos: number): boolean => {
    return lineCommentRanges.some((range) => pos >= range.start && pos < range.end);
  };

  // Then find block comments, but skip ones inside line comments
  const blockCommentRegex = /\/\*[\s\S]*?\*\//g;
  while ((match = blockCommentRegex.exec(text)) !== null) {
    // Skip if this block comment is inside a line comment
    if (!isInsideLineComment(match.index)) {
      allComments.push({
        start: match.index,
        end: blockCommentRegex.lastIndex,
        content: match[0],
        type: 'block',
      });
    }
  }

  // Sort by start position
  allComments.sort((a, b) => a.start - b.start);

  // Build text without comments and collect comment info
  const parts: string[] = [];
  let lastIndex = 0;

  for (const commentMatch of allComments) {
    // Add text before comment
    if (commentMatch.start > lastIndex) {
      parts.push(text.substring(lastIndex, commentMatch.start));
    }

    // Replace comment with newline (for line comments) or spaces (for block comments)
    // This preserves line structure
    if (commentMatch.type === 'line') {
      parts.push(''); // Line comments already end at newline
    } else {
      parts.push(' '.repeat(commentMatch.content.length));
    }

    lastIndex = commentMatch.end;
  }

  // Add remaining text after last comment
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  const textWithoutComments = parts.join('');

  // Find if there's any actual ECL code (non-whitespace in textWithoutComments)
  const hasCode = textWithoutComments.trim().length > 0;

  // Now classify comments based on their position relative to actual code
  for (let i = 0; i < allComments.length; i++) {
    const commentMatch = allComments[i];

    // Task 5.2: Track comment positions relative to expressions
    const textBefore = text.substring(0, commentMatch.start);
    const textAfter = text.substring(commentMatch.end);

    // Capture trailing whitespace after this comment
    let trailingWhitespace = '';
    const nextCommentStart = i + 1 < allComments.length ? allComments[i + 1].start : -1;

    if (nextCommentStart !== -1) {
      // There's another comment after this one - capture whitespace between them
      const betweenText = text.substring(commentMatch.end, nextCommentStart);
      // Only capture if it's just whitespace (newlines, spaces, tabs)
      if (/^\s*$/.test(betweenText)) {
        trailingWhitespace = betweenText;
      }
    }

    let position: 'before' | 'inline' | 'between';

    // Check if this is an ECL-END comment (special case - should be preserved as-is)
    if (commentMatch.content.trim() === '/* ECL-END */') {
      position = 'between';
    }
    // Check if on same line as code (inline)
    else if (textBefore.length > 0 && !textBefore.endsWith('\n') && textBefore.trim().length > 0) {
      position = 'inline';
    }
    // Check if comment comes before any code by looking at textWithoutComments
    // Build textWithoutComments up to this comment's position
    else {
      // Reconstruct what textWithoutComments looks like up to this point
      let textWithoutCommentsUpToHere = '';
      let originalPos = 0;

      for (const otherComment of allComments) {
        if (otherComment.start >= commentMatch.start) break;

        // Add text before this other comment
        if (otherComment.start > originalPos) {
          textWithoutCommentsUpToHere += text.substring(originalPos, otherComment.start);
        }

        // Skip the comment (add spaces or nothing)
        if (otherComment.type === 'block') {
          textWithoutCommentsUpToHere += ' '.repeat(otherComment.content.length);
        }

        originalPos = otherComment.end;
      }

      // Add text before current comment
      if (commentMatch.start > originalPos) {
        textWithoutCommentsUpToHere += text.substring(originalPos, commentMatch.start);
      }

      // Check if there's any actual code before this comment
      const hasCodeBefore = textWithoutCommentsUpToHere.trim().length > 0;
      const hasContentAfter = textAfter.trim().length > 0;

      if (!hasCodeBefore && hasCode) {
        // No code before this comment, but there is code in the expression
        position = 'before';
      } else if (hasCodeBefore && hasContentAfter) {
        // Code both before and after
        position = 'between';
      } else {
        // Default to before
        position = 'before';
      }
    }

    comments.push({
      content: commentMatch.content,
      startOffset: commentMatch.start,
      endOffset: commentMatch.end,
      type: commentMatch.type,
      position,
      trailingWhitespace,
    });
  }

  return { comments, textWithoutComments };
}

// Task 5.3-5.5: Reinsert comments into formatted text
// eslint-disable-next-line sonarjs/cognitive-complexity -- comment reinsertion with line-position tracking
export function reinsertComments(formattedText: string, originalText: string, comments: Comment[]): string {
  // If no comments, return formatted text as-is
  if (comments.length === 0) {
    return formattedText;
  }

  // For now, use a simple heuristic approach:
  // - 'before' comments: add at the start with original spacing
  // - 'inline' comments: try to add at end of line if space permits
  // - 'between' comments: add between expressions (especially /* ECL-END */)

  let result = formattedText;

  // Handle /* ECL-END */ comments specially - they should be preserved as delimiters
  const otherComments = comments.filter((c) => c.content.trim() !== '/* ECL-END */');

  // ECL-END comments are already preserved by the multi-expression handling
  // Just need to handle other comments

  // For MVP: Prepend 'before' comments to the result with original spacing
  const beforeComments = otherComments.filter((c) => c.position === 'before');
  if (beforeComments.length > 0) {
    // Preserve original spacing by including trailing whitespace after each comment
    const commentLines = beforeComments
      .map((c) => {
        if (c.trailingWhitespace) {
          return c.content + c.trailingWhitespace;
        }
        return c.content;
      })
      .join('');

    // Detect whether the last before-comment was on the same line as the following code
    // in the original text (e.g. "/* comment */ << 123"). If so, join without a newline.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed by length > 0 guard above
    const lastBefore = beforeComments.at(-1)!;
    const afterLastComment = originalText.substring(lastBefore.endOffset);
    const sameLineAsCode = afterLastComment.length > 0 && !/^\s*\n/.test(afterLastComment);

    if (sameLineAsCode) {
      // Comment is on the same line as code — preserve that relationship
      result = commentLines.trimEnd() + ' ' + result.trimStart();
    } else if (commentLines.endsWith('\n')) {
      result = commentLines + result;
    } else {
      result = commentLines + '\n' + result;
    }
  }

  const inlineComments = otherComments.filter((c) => c.position === 'inline');
  const betweenComments = otherComments.filter((c) => c.position === 'between');

  // Inline comments stay on the same line as the code (append to end of last line)
  if (inlineComments.length > 0) {
    const inlineText = inlineComments.map((c) => c.content).join(' ');
    const lines = result.split('\n');
    const lastIdx = lines.length - 1;
    lines[lastIdx] = lines[lastIdx].trimEnd() + ' ' + inlineText;
    result = lines.join('\n');
  }

  // Between comments: standalone comments that appear between code blocks.
  // Place each one before the code that follows it in the original text.
  for (const betweenComment of betweenComments) {
    // Find the first significant token of the code that came after this comment in the original
    const codeAfter = originalText.substring(betweenComment.endOffset).trimStart();
    // Get the first word/token of that code (up to 20 chars, stopping at whitespace)
    const firstTokenMatch = /^(\S+)/.exec(codeAfter);
    let inserted = false;
    if (firstTokenMatch) {
      const firstToken = firstTokenMatch[1].substring(0, 20);
      const pos = result.indexOf(firstToken);
      if (pos !== -1) {
        // Insert comment on its own line just before the following code token
        const commentLine = betweenComment.content + '\n';
        result = result.substring(0, pos) + commentLine + result.substring(pos);
        inserted = true;
      }
    }
    if (!inserted) {
      // Fallback: append at the end
      if (result.trim()) result = result + '\n' + betweenComment.content;
      else result = betweenComment.content;
    }
  }

  return result;
}
