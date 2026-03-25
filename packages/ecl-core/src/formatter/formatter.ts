// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { parseECL, type ExpressionNode } from '../parser';
import { FormattingOptions } from './options';
import { formatRefinementColon, formatRefinementEquals, getIndentString, normalizeTerm } from './rules';
import { extractComments, reinsertComments } from './comments';
import { printAst } from './ast-printer';

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

  // AST-based indentation and line breaking.
  // The AST printer needs source text that matches the AST's range offsets.
  // The `formatted` text has been through spacing normalization, but the `ast`
  // parameter was parsed from the ORIGINAL text, so offsets won't match.
  // Re-parse the normalized text to get an AST with correct offsets.
  if (ast) {
    try {
      const reParsed = parseECL(formatted);
      // Only use AST printer when the re-parsed AST covers the full input text
      // and there are no parse errors. A partial parse (e.g. missing colon before
      // braces) would truncate the output. Parse errors (e.g. missing spaces when
      // spaceAroundOperators=false) can cause the AST to lose information.
      const astCoversAll =
        reParsed.ast && reParsed.errors.length === 0 && reParsed.ast.range.end.offset >= formatted.trimEnd().length;
      if (astCoversAll && reParsed.ast) {
        formatted = printAst(reParsed.ast, formatted, options);
      } else {
        // Re-parse failed or partial — return normalized text as-is (no indentation)
      }
    } catch {
      // AST printer error — return normalized text as-is
    }
  }

  // Refinement comma breaks still operate as post-processing
  if (options.breakOnRefinementComma) {
    formatted = applyRefinementCommaBreaks(formatted, options);
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
