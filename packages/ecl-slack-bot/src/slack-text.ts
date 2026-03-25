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
 * Attempts to extract the ECL expression from a cleaned message that may
 * contain surrounding prose. Looks for inline code blocks first (the most
 * explicit signal), then falls back to finding the ECL-like substring.
 *
 * Returns the extracted ECL, or the full input if no extraction was possible.
 */
export function extractEclFromProse(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  // 1. If the message contains an inline code span, assume that's the ECL
  const inlineCode = /`([^`]+)`/.exec(trimmed);
  if (inlineCode) return inlineCode[1].trim();

  // 2. If the message contains a triple-backtick code block, extract its content
  const codeBlock = /```([\s\S]+?)```/.exec(trimmed);
  if (codeBlock) return codeBlock[1].trim();

  // 3. Try to find where ECL starts: constraint operator, concept ID, wildcard, or paren
  //    ECL tokens: < << > >> ^ ! * ( and SCTID (\d{6,18})
  const eclStart = /[(<>^!*]|\b\d{6,18}\b/.exec(trimmed);
  if (!eclStart) return trimmed; // No ECL-like content found — pass through as-is

  // 4. Find where ECL ends: scan backwards from the end to find the last
  //    ECL-like character: ) | > digit or wildcard
  const candidate = trimmed.slice(eclStart.index);
  let endIdx = candidate.length;

  // Walk backwards past trailing non-ECL characters (letters, punctuation like ? !)
  while (endIdx > 0) {
    const ch = candidate[endIdx - 1];
    if (')>*|'.includes(ch) || (ch >= '0' && ch <= '9')) break;
    endIdx--;
  }

  if (endIdx <= 0) return candidate.trim();
  return candidate.slice(0, endIdx).trim();
}

/**
 * Full cleaning pipeline for Slack event text (e.g. @mention or DM).
 * Strips mention, unescapes HTML entities, removes Slack formatting,
 * and extracts ECL from surrounding prose while preserving --flags.
 */
export function cleanSlackEventText(text: string): string {
  const cleaned = stripSlackFormatting(unescapeSlackHtml(stripMention(text)));

  // Extract leading --flags before prose extraction (which would strip them).
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

  return flags + extractEclFromProse(rest);
}

/**
 * Full cleaning pipeline for slash command text.
 * Slash commands don't HTML-encode angle brackets, so only formatting is stripped.
 * No prose extraction — slash commands use structured flags (--edition, --eval).
 */
export function cleanSlackCommandText(text: string): string {
  return stripSlackFormatting(text);
}
