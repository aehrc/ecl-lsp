// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Utilities for extracting clean ECL text from Slack message payloads.

/** Slack HTML-encodes angle brackets in event text (but not slash command text). */
export function unescapeSlackHtml(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** Strip the bot @mention tag from Slack event text. */
export function stripMention(text: string): string {
  return text.replace(/<@\w+>/gi, '').trim();
}

/**
 * Strip Slack formatting characters that users wrap around ECL expressions.
 * Handles: ```code blocks```, `inline code`, *bold*, _italic_, ~strikethrough~,
 * and Slack's "smart quote" characters.
 *
 * Used by the slash command pipeline where backticks are purely cosmetic.
 */
export function stripSlackFormatting(text: string): string {
  let s = text.trim();
  // Triple backticks (code block): ```ECL``` or ```\nECL\n```
  if (s.startsWith('```') && s.endsWith('```') && s.length > 6) {
    s = s.slice(3, -3).trim();
  }
  // Single backticks (inline code): `ECL`
  if (s.startsWith('`') && s.endsWith('`') && s.length > 2) {
    s = s.slice(1, -1).trim();
  }
  // Smart quotes → straight quotes (Slack sometimes converts these)
  s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  // Strip surrounding bold/italic/strikethrough markers
  for (const marker of ['*', '_', '~']) {
    if (s.startsWith(marker) && s.endsWith(marker) && s.length > 2) {
      s = s.slice(1, -1).trim();
    }
  }
  return s;
}

/**
 * Extract ECL expressions from backtick-quoted sections in the text.
 * Supports both triple-backtick code blocks and single-backtick inline code.
 * Returns an empty array if no backtick expressions are found.
 */
export function extractBacktickExpressions(text: string): string[] {
  // Collect all matches with their positions so we can mix triple and single backticks
  const matches: { index: number; end: number; content: string }[] = [];

  // Find triple-backtick expressions
  const triplePattern = /```([\s\S]+?)```/g;
  let match;
  while ((match = triplePattern.exec(text)) !== null) {
    const content = match[1].trim();
    if (content) matches.push({ index: match.index, end: match.index + match[0].length, content });
  }

  // Find single-backtick expressions, skipping any that overlap with triple-backtick matches
  const singlePattern = /`([^`]+)`/g;
  while ((match = singlePattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const overlaps = matches.some((m) => start < m.end && end > m.index);
    if (!overlaps) {
      const content = match[1].trim();
      if (content) matches.push({ index: start, end, content });
    }
  }

  // Return in document order
  matches.sort((a, b) => a.index - b.index);
  return matches.map((m) => m.content);
}

/**
 * Full cleaning pipeline for Slack event text (e.g. @mention or DM).
 *
 * Returns an array of ECL expressions to process. If the message contains
 * backtick-quoted sections, each is treated as a separate ECL expression.
 * Otherwise, the entire text (after stripping the mention and flags) is
 * treated as a single ECL expression.
 */
export function cleanSlackEventText(text: string): string[] {
  let cleaned = unescapeSlackHtml(stripMention(text));

  // Smart quotes → straight quotes
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

  // Strip surrounding bold/italic/strikethrough markers
  cleaned = cleaned.trim();
  for (const marker of ['*', '_', '~']) {
    if (cleaned.startsWith(marker) && cleaned.endsWith(marker) && cleaned.length > 2) {
      cleaned = cleaned.slice(1, -1).trim();
    }
  }

  // Extract leading --flags before splitting expressions.
  // Handles both valueless flags (--no-terms, --eval) and flags with values (--edition au).
  let flags = '';
  let rest = cleaned;
  while (rest.startsWith('--')) {
    const flagWithValue = /^(--edition\s+\S+)\s+/.exec(rest);
    const flagAlone = /^(--\S+)\s+/.exec(rest);
    const match = flagWithValue ?? flagAlone;
    if (!match) break;
    flags += match[1] + ' ';
    rest = rest.slice(match[0].length);
  }

  // If backtick-quoted sections exist, each is a separate ECL expression
  const backtickExprs = extractBacktickExpressions(rest);
  if (backtickExprs.length > 0) {
    return backtickExprs.map((expr) => flags + expr);
  }

  // No backticks — entire remaining text is the ECL expression
  const result = (flags + rest).trim();
  return result ? [result] : [];
}

/**
 * Full cleaning pipeline for slash command text.
 * Slash commands don't HTML-encode angle brackets, so only formatting is stripped.
 * No prose extraction — slash commands use structured flags (--edition, --eval).
 */
export function cleanSlackCommandText(text: string): string {
  return stripSlackFormatting(text);
}
