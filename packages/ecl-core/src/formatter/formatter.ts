// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { parseECL, type ExpressionNode } from '../parser';
import { FormattingOptions } from './options';
import { formatRefinementColon, formatRefinementEquals, getIndentString, normalizeTerm } from './rules';
import { extractComments, reinsertComments } from './comments';

/**
 * Inserts a newline after every refinement colon (:) that has content following
 * it on the same line. Skips colons inside terms (| |). Must run BEFORE
 * applyIndentation so that the colon-based indent logic sees the break.
 */
function applyColonBreaks(text: string): string {
  let result = '';
  let inTerm = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '|') {
      inTerm = !inTerm;
      result += ch;
      continue;
    }
    if (inTerm) {
      result += ch;
      continue;
    }

    if (ch === ':') {
      result += ':';
      // Skip any spaces after the colon
      let j = i + 1;
      while (j < text.length && text[j] === ' ') j++;
      // Only break if there is actual content on the same line (not already a newline)
      if (j < text.length && text[j] !== '\n' && text[j] !== '\r') {
        result += '\n';
        i = j - 1; // eslint-disable-line sonarjs/updated-loop-counter -- skip-ahead pattern NOSONAR
      }
      continue;
    }

    result += ch;
  }

  return result;
}

// Task 3.4: Apply indentation to refinement blocks
// eslint-disable-next-line sonarjs/cognitive-complexity -- indentation state machine with brace/colon tracking
function applyIndentation(text: string, options: FormattingOptions, _ast?: ExpressionNode | null): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let indentLevel = 0;
  let inColonRefinement = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Decrease indent before closing brace
    if (trimmed.startsWith('}')) {
      indentLevel = Math.max(0, indentLevel - 1);
      inColonRefinement = false;
    }

    // Check if we should exit colon-based refinement
    // Exit if we hit a line that starts with a logical operator (AND, OR, MINUS)
    // or if we hit a constraint operator (suggesting new expression)
    if (inColonRefinement) {
      const startsWithLogicalOp = /^\s*(AND|OR|MINUS)\s/.test(trimmed);
      const startsWithConstraintOp = /^\s*[<>]/.test(trimmed);

      if (startsWithLogicalOp || startsWithConstraintOp) {
        indentLevel = Math.max(0, indentLevel - 1);
        inColonRefinement = false;
      }
    }

    // Apply indentation
    if (trimmed) {
      result.push(getIndentString(indentLevel, options) + trimmed);
    } else {
      result.push('');
    }

    // Increase indent after opening brace
    if (trimmed.endsWith('{')) {
      indentLevel++;
      inColonRefinement = false;
    }
    // Increase indent after colon (refinement without braces)
    else if (trimmed.includes(':') && !trimmed.includes('{')) {
      // Skip colons inside filter blocks ({{ ... }}) — these are not refinement colons
      if (trimmed.includes('{{')) {
        // Don't indent — this colon is likely inside a filter block
      } else {
        // Use regex heuristic: concept ID before the colon confirms it's a refinement
        const hasConceptBefore = /\d+[^:]*:/.test(trimmed); // eslint-disable-line sonarjs/slow-regex -- bounded single line
        if (hasConceptBefore) {
          indentLevel++;
          inColonRefinement = true;
        }
      }
    }
  }

  return result.join('\n');
}

/**
 * Scans a line for unmatched '(' (ignoring chars inside term pipes) and returns
 * the column just past the deepest opening-paren group, e.g. "((" → column
 * after the second '('. Returns -1 when all parens are balanced.
 */
function findContinuationColumn(text: string): number {
  const stack: number[] = [];
  let inTerm = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '|') {
      inTerm = !inTerm;
      continue;
    }
    if (inTerm) continue;
    if (text[i] === '(') stack.push(i);
    else if (text[i] === ')' && stack.length > 0) stack.pop();
  }
  if (stack.length === 0) return -1;
  // Skip consecutive open parens (e.g. "((" → align after both)
  let col = stack.at(-1) ?? 0;
  while (col + 1 < text.length && text[col + 1] === '(') col++;
  return col + 1;
}

// Task 3.5: Apply line breaking at maxLineLength
// eslint-disable-next-line sonarjs/cognitive-complexity -- line-breaking logic with operator splitting
function applyLineBreaking(text: string, options: FormattingOptions): string {
  if (options.maxLineLength <= 0) {
    return text;
  }

  const lines = text.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    if (line.length <= options.maxLineLength) {
      result.push(line);
      continue;
    }

    // Try to break at logical operators (AND, OR, MINUS)
    // Put operators at the START of continuation lines for better readability
    const parts: string[] = [];
    const indent = /^(\s*)/.exec(line)?.[1] ?? '';
    const contentIndent = indent + getIndentString(1, options);

    // Split by logical operators, capturing operators separately
    // eslint-disable-next-line sonarjs/slow-regex -- bounded to single expression line
    const tokens = line.split(/\s+(AND|OR|MINUS)\s+/);

    // tokens will be: [expr1, 'AND', expr2, 'OR', expr3, ...]
    // Odd indices are operators, even indices are expressions

    let currentLine = indent + tokens[0].trim(); // Start with first expression

    for (let i = 1; i < tokens.length; i += 2) {
      const operator = tokens[i]; // AND, OR, MINUS
      const expression = tokens[i + 1] || '';

      // Try to fit operator and expression on current line
      const withOperator = currentLine + ' ' + operator + ' ' + expression.trim();

      if (withOperator.length > options.maxLineLength && currentLine !== indent) {
        // Line would be too long - break before operator
        parts.push(currentLine.trimEnd());
        // Align to unmatched parens on the line being continued, or fall back
        const parenCol = findContinuationColumn(currentLine);
        const breakIndent = parenCol >= 0 ? ' '.repeat(parenCol) : contentIndent;
        currentLine = breakIndent + operator + ' ' + expression.trim();
      } else {
        // Fits on current line
        currentLine = withOperator;
      }
    }

    if (currentLine.trim()) {
      parts.push(currentLine.trimEnd());
    }

    result.push(...parts);
  }

  return result.join('\n');
}

// Task 3.7: Apply term alignment for multi-attribute refinements
function applyTermAlignment(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];

  // Find groups of consecutive lines that are attributes (contain =)
  let attributeGroup: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this is an attribute line (contains = and a term with |)
    if (trimmed.includes('=') && trimmed.includes('|')) {
      attributeGroup.push(i);
    } else {
      // Process accumulated group if we have one
      if (attributeGroup.length > 1) {
        alignTermsInGroup(lines, attributeGroup, result);
      } else if (attributeGroup.length === 1) {
        // Single attribute line - just add it as-is
        result.push(lines[attributeGroup[0]]);
      }
      attributeGroup = [];
      result.push(line);
    }
  }

  // Process final group if any
  if (attributeGroup.length > 1) {
    alignTermsInGroup(lines, attributeGroup, result);
  } else if (attributeGroup.length === 1) {
    // Single attribute line at end - just add it as-is
    result.push(lines[attributeGroup[0]]);
  }

  return result.join('\n');
}

// Helper to align terms in a group of attribute lines
function alignTermsInGroup(lines: string[], indices: number[], result: string[]): void {
  // Find the position of the first | in each line
  const positions = indices.map((i) => {
    const line = lines[i];
    const pipePos = line.indexOf('|');
    return pipePos >= 0 ? pipePos : -1;
  });

  // Find the maximum position
  const maxPos = Math.max(...positions.filter((p) => p >= 0));

  // Align each line
  for (const idx of indices) {
    const line = lines[idx];
    const pipePos = line.indexOf('|');

    if (pipePos >= 0 && pipePos < maxPos) {
      // Add spaces before the pipe to align it
      const spacesToAdd = maxPos - pipePos;
      const aligned = line.substring(0, pipePos) + ' '.repeat(spacesToAdd) + line.substring(pipePos);
      result.push(aligned);
    } else {
      result.push(line);
    }
  }
}

// Task 4.1-4.5: Split document by /* ECL-END */ delimiters
// Ignores /* ECL-END */ that appears inside a line comment (//)
function splitExpressions(text: string): { expressions: string[]; hasDelimiters: boolean } {
  const delimiter = '/* ECL-END */';

  // Find all delimiter positions that are NOT inside line comments
  const delimiterPositions: number[] = [];
  let i = 0;
  while (i < text.length) {
    // Skip line comments (// ... \n)
    if (text[i] === '/' && i + 1 < text.length && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    // Check for ECL-END delimiter
    if (text.startsWith(delimiter, i)) {
      delimiterPositions.push(i);
      i += delimiter.length;
      continue;
    }
    i++;
  }

  if (delimiterPositions.length === 0) {
    return { expressions: [text], hasDelimiters: false };
  }

  // Split at delimiter positions
  const parts: string[] = [];
  let lastEnd = 0;
  for (const pos of delimiterPositions) {
    parts.push(text.substring(lastEnd, pos));
    lastEnd = pos + delimiter.length;
  }
  parts.push(text.substring(lastEnd));

  const expressions = parts.map((p) => p.trim()).filter((p) => p.length > 0);
  return { expressions, hasDelimiters: true };
}

// Task 4.3-4.4: Join expressions with preserved delimiters
function joinExpressions(expressions: string[]): string {
  return expressions.join('\n\n/* ECL-END */\n\n');
}

/** Returns true if a single line contains only a comment (or is blank). */
function isCommentOrBlankLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('//')) return true;
  // Strip all block comments from the line and check if nothing remains
  const stripped = trimmed.replace(/\/\*[^]*?\*\//g, '').trim();
  return stripped.length === 0;
}

/**
 * Optionally wraps a single comment line if it exceeds maxLineLength.
 * Only wraps line comments (//); block comments are returned unchanged.
 */
function maybeWrapCommentLine(line: string, options: FormattingOptions): string {
  if (!options.wrapComments || options.maxLineLength <= 0) return line;
  if (line.length <= options.maxLineLength) return line;
  // Only wrap // comments; block comments are more complex and left as-is
  const match = /^(\s*\/\/\s?)(.*)/.exec(line);
  if (!match) return line;
  const prefix = match[1];
  const words = match[2].split(' ');
  const lines: string[] = [];
  let current = prefix;
  for (const word of words) {
    if (current.length + word.length + 1 > options.maxLineLength && current.trim() !== prefix.trim()) {
      lines.push(current.trimEnd());
      current = prefix + word;
    } else {
      current = current === prefix ? prefix + word : current + ' ' + word;
    }
  }
  if (current.trim()) lines.push(current.trimEnd());
  return lines.join('\n');
}

/** Applies optional comment wrapping to a block of comment/blank lines. */
function maybeWrapCommentBlock(text: string, options: FormattingOptions): string {
  if (!options.wrapComments) return text;
  return text
    .split('\n')
    .map((line) => maybeWrapCommentLine(line, options))
    .join('\n');
}

// Format a single expression (core logic)
function formatExpression(text: string, options: FormattingOptions, ast?: ExpressionNode | null): string {
  // Split into leading comment block | body (first..last code line) | trailing comment block.
  // Only the body is formatted; leading/trailing comment lines are preserved verbatim
  // (with optional comment wrapping if wrapComments is enabled).
  const lines = text.split('\n');
  let firstCodeLine = -1;
  let lastCodeLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!isCommentOrBlankLine(lines[i])) {
      if (firstCodeLine === -1) firstCodeLine = i;
      lastCodeLine = i;
    }
  }

  if (firstCodeLine === -1) {
    // No code at all — nothing to format, return as-is
    return text;
  }

  const leadingRaw = firstCodeLine > 0 ? lines.slice(0, firstCodeLine).join('\n') + '\n' : '';
  const trailingRaw = lastCodeLine < lines.length - 1 ? '\n' + lines.slice(lastCodeLine + 1).join('\n') : '';
  const bodyText = lines.slice(firstCodeLine, lastCodeLine + 1).join('\n');

  const leadingText = maybeWrapCommentBlock(leadingRaw, options);
  const trailingText = maybeWrapCommentBlock(trailingRaw, options);
  const formattedBody = formatExpressionBody(bodyText, options, ast);
  return leadingText + formattedBody + trailingText;
}

/**
 * Paren-depth-aware operator line-breaker. Replaces both applyLineBreaking and
 * applyOperatorLineBreaks when breakOnOperators is true.
 *
 * Rules:
 *  - Every AND/OR/MINUS starts on its own line.
 *  - If the expression starts with '(', operators at paren-depth D get D indent levels
 *    (depth 0 = no indent, same visual level as the outer open paren).
 *  - Otherwise operators get D+1 levels (standard continuation indent for simple expressions).
 *  - Consecutive '((' are split: first '(' on its own line, second '(' indented on next line.
 *  - Consecutive '))' are split: first ')' closes its line, second ')' on its own line.
 *  - Lines from applyIndentation (brace-indented) are preserved via soft-newline handling.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- line-breaking with operator/depth/term tracking
function applyParenAwareOperatorBreaks(text: string, options: FormattingOptions): string {
  // If the expression starts with '(' we keep top-level operators unindented so they
  // align with the outer paren. Otherwise add one continuation indent level.
  const depthOffset = text.trimStart().startsWith('(') ? 0 : 1;

  const outputLines: string[] = [];
  let currentLine = '';
  let parenDepth = 0;
  let inTerm = false;
  let prevNonSpace = ''; // last non-whitespace char emitted

  const pushLine = () => {
    const t = currentLine.trimEnd();
    if (t) outputLines.push(t);
    currentLine = '';
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // ── term content ──────────────────────────────────────────────────────────
    if (ch === '|') {
      inTerm = !inTerm;
      currentLine += ch;
      prevNonSpace = ch;
      i++;
      continue;
    }
    if (inTerm) {
      currentLine += ch;
      if (ch > ' ') prevNonSpace = ch;
      i++;
      continue;
    }

    // ── soft newline from applyIndentation (brace-indented lines) ─────────────
    if (ch === '\n' || ch === '\r') {
      // Preserve the line break so brace-indented content stays on its own line
      if (currentLine.trim()) {
        pushLine();
      }
      i++;
      // Consume and restore leading whitespace of the next input line
      let baseIndent = '';
      while (i < text.length && (text[i] === ' ' || text[i] === '\t')) {
        baseIndent += text[i++];
      }
      currentLine = baseIndent;
      // Keep prevNonSpace so consecutive-paren detection works across newlines
      // (e.g. "(\n(" on the second formatting pass must still be treated as "((").
      continue;
    }

    // ── collapse inline whitespace ────────────────────────────────────────────
    if (ch === ' ' || ch === '\t') {
      if (currentLine && !currentLine.endsWith(' ')) currentLine += ' ';
      i++;
      continue;
    }

    // ── open paren ────────────────────────────────────────────────────────────
    if (ch === '(') {
      if (prevNonSpace === '(') {
        // Consecutive '((' — push current line (ending with '(') and start indented.
        // parenDepth was already incremented for the previous '(', so the new
        // line is indented at that depth.
        pushLine();
        currentLine = getIndentString(parenDepth, options);
      }
      // Append '(' directly — do NOT trimEnd here.  If the current line ends with
      // a space (e.g. after an operator "  AND "), we want "  AND (" not "  AND(".
      currentLine += '(';
      parenDepth++;
      prevNonSpace = '(';
      i++;
      continue;
    }

    // ── close paren ───────────────────────────────────────────────────────────
    if (ch === ')') {
      parenDepth--;
      // Remove only trailing content-spaces; preserve indent-only lines.
      if (currentLine.trim() === '') {
        // Line is only whitespace (set by consecutive ')' handler).
        // Emit ')' at the correct depth level rather than at column 0.
        currentLine = getIndentString(parenDepth, options) + ')';
      } else {
        currentLine = currentLine.trimEnd() + ')';
      }
      prevNonSpace = ')';
      i++;
      // Peek: if next non-space is also ')', split here
      let j = i;
      while (j < text.length && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n' || text[j] === '\r')) j++;
      if (j < text.length && text[j] === ')') {
        pushLine();
        currentLine = getIndentString(parenDepth, options);
      }
      continue;
    }

    // ── logical operator ──────────────────────────────────────────────────────
    const opMatch = /^(AND|OR|MINUS)(?=[\s)|]|$)/.exec(text.substring(i));
    if (opMatch) {
      pushLine();
      const opIndent = getIndentString(parenDepth + depthOffset, options);
      currentLine = opIndent + opMatch[1] + ' ';
      i += opMatch[1].length;
      // Skip following spaces
      while (i < text.length && text[i] === ' ') i++;
      prevNonSpace = opMatch[1].slice(-1);
      continue;
    }

    // ── regular character ─────────────────────────────────────────────────────
    currentLine += ch;
    prevNonSpace = ch;
    i++;
  }

  pushLine();
  return outputLines.join('\n');
}

/**
 * Breaks after every comma inside a refinement attribute list, so each attribute
 * starts on its own line, indented to the appropriate level.
 * Only breaks commas that are outside of term pipes (| |) and parentheses.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- comma-break logic with depth/indent tracking
function applyRefinementCommaBreaks(text: string, options: FormattingOptions): string {
  const lines = text.split('\n');
  const result: string[] = [];

  // Track paren/brace depth across lines so multi-line parenthesized
  // sub-expressions don't cause commas to be missed.
  let depth = 0;
  // The indent level for new-line attributes is determined from the first
  // refinement line we see (the one after the colon).
  let refinementIndent: string | null = null;

  for (const line of lines) {
    // Determine the base indent of this line
    const lineIndent = /^(\s*)/.exec(line)?.[1] ?? '';

    // Capture refinement indent from the first indented line at depth 0
    // (this is the line right after the colon break).
    if (refinementIndent === null && depth === 0 && lineIndent.length > 0) {
      refinementIndent = lineIndent;
    }

    // Use captured refinement indent, or fall back to this line's indent,
    // or a single continuation level.
    let commaIndent: string;
    if (depth === 0 && refinementIndent) {
      commaIndent = refinementIndent;
    } else if (lineIndent.length > 0) {
      commaIndent = lineIndent;
    } else {
      commaIndent = getIndentString(1, options);
    }

    // Process commas outside terms and parens
    let output = '';
    let inTerm = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '|') {
        inTerm = !inTerm;
        output += ch;
        continue;
      }
      if (inTerm) {
        output += ch;
        continue;
      }
      if (ch === '(' || ch === '{') {
        depth++;
        output += ch;
        continue;
      }
      if (ch === ')' || ch === '}') {
        depth--;
        output += ch;
        continue;
      }
      if (ch === ',' && depth === 0) {
        // Only break if there is non-whitespace content after the comma on this
        // same line.  A trailing comma (end-of-line) means the next attribute is
        // already on the next line — inserting an extra newline would create a
        // blank line.
        const restOfLine = line.substring(i + 1).trim();
        if (restOfLine.length > 0) {
          output += ',\n' + commaIndent;
          // Skip any trailing whitespace after the comma
          while (i + 1 < line.length && line[i + 1] === ' ') i++; // NOSONAR: skip-ahead past whitespace
        } else {
          output += ch;
        }
        continue;
      }
      output += ch;
    }
    result.push(output);
  }

  return result.join('\n');
}

// ── Filter block normalization ────────────────────────────────────────────

/** Canonical camelCase keyword map (case-insensitive → canonical). */
const FILTER_KEYWORD_MAP: Record<string, string> = {
  term: 'term',
  type: 'type',
  typeid: 'typeId',
  language: 'language',
  dialect: 'dialect',
  dialectid: 'dialectId',
  moduleid: 'moduleId',
  effectivetime: 'effectiveTime',
  active: 'active',
  id: 'id',
  definitionstatus: 'definitionStatus',
  definitionstatusid: 'definitionStatusId',
};

/**
 * Normalize filter blocks: keyword casing, spacing, and filter type letter.
 * Runs before indentation so the result is clean for further formatting.
 */
function normalizeFilterBlocks(text: string): string {
  // Match {{ ... }} blocks (non-greedy within the outer braces)
  // eslint-disable-next-line sonarjs/slow-regex -- bounded ECL expression text; no ReDoS risk
  return text.replace(/\{\{([^}]*(?:\}[^}])*[^}]*)\}\}/g, (_match, content: string) => {
    let normalized = content;

    // Normalize filter type letter to uppercase ({{ d → {{ D, {{ c → {{ C, etc.)
    normalized = normalized.replace(/^(\s*)[dcm](?=\s)/i, (_m, ws: string) => {
      const letter = _m.trim().toUpperCase();
      return ws + letter;
    });

    // Normalize keywords (case-insensitive → canonical camelCase)
    for (const [lower, canonical] of Object.entries(FILTER_KEYWORD_MAP)) {
      // Word-boundary match, case-insensitive
      const regex = new RegExp(String.raw`\b${lower}\b`, 'gi');
      normalized = normalized.replace(regex, (match) => {
        // Only replace if it actually differs (avoids unnecessary mutations)
        return match.toLowerCase() === lower ? canonical : match;
      });
    }

    // Normalize spacing around = and !=
    normalized = normalized.replace(/\s*(!?=)\s*/g, ' $1 '); // eslint-disable-line sonarjs/slow-regex -- bounded filter content

    // Ensure single space after commas
    normalized = normalized.replace(/,\s*/g, ', ');

    // Collapse multiple spaces to single (but preserve leading space after {{)
    normalized = normalized.replace(/ {2,}/g, ' ');

    // Ensure single space padding: {{ X ... }}
    // eslint-disable-next-line sonarjs/slow-regex -- bounded filter content
    normalized = normalized.replace(/^\s*/, ' ').replace(/\s*$/, ' ');

    return '{{' + normalized + '}}';
  });
}

// Core expression formatting — only called on the body (lines with actual ECL code).
function formatExpressionBody(text: string, options: FormattingOptions, ast?: ExpressionNode | null): string {
  // Task 5.1-5.2: Extract comments before formatting (except /* ECL-END */)
  const { comments, textWithoutComments } = extractComments(text);

  // Filter out ECL-END comments as they're handled separately
  const nonDelimiterComments = comments.filter((c) => c.content.trim() !== '/* ECL-END */');

  // Normalize filter blocks (keyword case, spacing, type letter)
  let formatted = normalizeFilterBlocks(textWithoutComments);

  // Normalize spaces around logical operators.
  // Use a negative lookbehind for letters to avoid matching inside words like HISTORY.
  formatted = formatted.replace(
    // eslint-disable-next-line sonarjs/slow-regex -- bounded ECL expression text; no ReDoS risk
    /(\S?)(?<![A-Za-z])\s*(AND|OR|MINUS)\s*(?![A-Za-z])(\S?)/g,
    (match, before, op, after) => {
      const formattedOp = options.spaceAroundOperators ? ` ${op} ` : op;
      return (before ?? '') + formattedOp + (after ?? '');
    },
  );

  // Normalize spaces around refinement operators (preserve newlines)
  /* eslint-disable sonarjs/slow-regex -- bounded ECL expression text; no ReDoS risk */
  formatted = formatted.replace(/[ \t]*(:)[ \t]*/g, formatRefinementColon('$1'));
  // Normalize compound comparison operators (!=, >=, <=) BEFORE standalone =
  formatted = formatted.replace(/[ \t]*(!=|>=|<=)[ \t]*/g, ' $1 ');
  // Normalize standalone = (not preceded by !, <, >)
  formatted = formatted.replace(/[ \t]*(?<![!<>])(=)[ \t]*/g, formatRefinementEquals('$1'));
  /* eslint-enable sonarjs/slow-regex */

  // Normalize spaces after constraint operators (collapse multiple spaces to single space)
  formatted = formatted.replace(/(<<|<|>>|>)\s*(\d)/g, '$1 $2');

  // Remove spaces between concept IDs and terms (normalizeTerm will add the space back)
  formatted = formatted.replace(/(\d)\s+(\|)/g, '$1$2');

  // Normalize terms: ensure single space on each side of pipe
  formatted = formatted.replace(/\|([^|]+)\|/g, (match, content) => {
    return normalizeTerm(content);
  });

  // Break after refinement colons before indentation so applyIndentation
  // naturally indents the attributes on the new line.
  if (options.breakAfterColon) {
    formatted = applyColonBreaks(formatted);
  }

  // Task 3.4: Add indentation for refinement blocks (AST-aware when available)
  formatted = applyIndentation(formatted, options, ast);

  if (options.breakOnOperators) {
    // Paren-aware breaking handles both line-length and operator splitting in one pass.
    // applyLineBreaking is skipped so the two don't interfere.
    formatted = applyParenAwareOperatorBreaks(formatted, options);
  } else if (options.maxLineLength > 0) {
    // Task 3.5: Add line breaking at maxLineLength (only when breakOnOperators is off)
    formatted = applyLineBreaking(formatted, options);
  }

  // Break after every comma in refinement attribute lists when breakOnRefinementComma is enabled.
  if (options.breakOnRefinementComma) {
    formatted = applyRefinementCommaBreaks(formatted, options);
  }

  // Task 3.7: Add term alignment for multi-attribute refinements
  if (options.alignTerms) {
    formatted = applyTermAlignment(formatted);
  }

  // Task 5.3-5.5: Reinsert comments into formatted text
  const withComments = reinsertComments(formatted.trim(), text, nonDelimiterComments);

  return withComments;
}

// Simple formatter that just normalizes spacing for MVP
// Task 6.1-6.5: Implement formatDocument with error handling, timeout, and semantic preservation
export function formatDocument(text: string, options: FormattingOptions): string {
  try {
    // Task 6.3: Add timeout mechanism (5 seconds)
    const timeoutMs = 5000;
    const startTime = Date.now();

    // Task 4.1: Split document by /* ECL-END */ delimiters
    const { expressions, hasDelimiters } = splitExpressions(text);

    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      return text;
    }

    // Task 4.2: Format each expression independently
    const formattedExpressions: string[] = [];

    for (const expr of expressions) {
      // Skip empty expressions
      if (!expr.trim()) {
        continue;
      }

      // Check timeout for each expression
      if (Date.now() - startTime > timeoutMs) {
        return text;
      }

      // Task 6.2: Parse the expression
      const result = parseECL(expr);

      // If parsing completely failed (no AST), use original expression
      // Allow formatting even if there are warnings/errors, as long as we have an AST
      if (!result.ast) {
        formattedExpressions.push(expr.trim());
        continue;
      }

      // Format this expression, passing the AST for indentation hints
      const formatted = formatExpression(expr, options, result.ast);
      formattedExpressions.push(formatted);
    }

    // Task 4.3-4.4: Join expressions with delimiters
    return hasDelimiters ? joinExpressions(formattedExpressions) : formattedExpressions.join('\n\n');
  } catch {
    // Task 6.2: On error, return original text
    return text;
  }
}
