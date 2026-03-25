// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Pure extraction and mapping logic for embedded ECL support.
// This module has ZERO dependencies on vscode or LSP — it is directly testable.

// ── Types ────────────────────────────────────────────────────────────────────

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface RawFragment {
  range: Range;
  text: string;
  index: number;
  charMap?: number[];
}

export interface StringLocation {
  start: number;
  end: number;
  value: string;
  charMap?: number[];
}

// ── Position mapping ─────────────────────────────────────────────────────────

export function hostToVirtualPos(fragStart: Position, hostPos: Position, charMap?: number[]): Position {
  const line = hostPos.line - fragStart.line;
  let character = line === 0 ? hostPos.character - fragStart.character : hostPos.character;

  if (charMap && line === 0) {
    const rawOffset = character;
    let decodedIdx = 0;
    for (let i = 0; i < charMap.length; i++) {
      if (charMap[i] <= rawOffset) decodedIdx = i;
      else break;
    }
    character = decodedIdx;
  }

  return { line, character: Math.max(0, character) };
}

export function virtualToHostRange(fragStart: Position, r: Range, charMap?: number[]): Range {
  return {
    start: {
      line: r.start.line + fragStart.line,
      character: mapVirtualCharToHost(fragStart, r.start.line, r.start.character, charMap),
    },
    end: {
      line: r.end.line + fragStart.line,
      character: mapVirtualCharToHost(fragStart, r.end.line, r.end.character, charMap),
    },
  };
}

function mapVirtualCharToHost(
  fragStart: Position,
  virtualLine: number,
  virtualChar: number,
  charMap?: number[],
): number {
  if (virtualLine !== 0) return virtualChar;
  if (charMap) {
    return fragStart.character + (charMap[virtualChar] ?? virtualChar);
  }
  return virtualChar + fragStart.character;
}

// ── Virtual URI helpers ──────────────────────────────────────────────────────

export function makeVirtualUriString(hostScheme: string, hostPath: string, index: number): string {
  return `ecl-embedded://${hostScheme}${hostPath}/fragment/${index}`;
}

export function parseVirtualUriString(uri: string): { hostScheme: string; hostPath: string; index: number } | null {
  const schemeEnd = uri.indexOf('://');
  if (schemeEnd === -1) return null;
  if (uri.substring(0, schemeEnd) !== 'ecl-embedded') return null;
  const rest = uri.substring(schemeEnd + 3);
  const slashIdx = rest.indexOf('/');
  if (slashIdx === -1) return null;
  const hostScheme = rest.substring(0, slashIdx);
  const path = rest.substring(slashIdx);
  const match = /^(.+)\/fragment\/(\d+)$/.exec(path);
  if (!match) return null;
  return { hostScheme, hostPath: match[1], index: parseInt(match[2], 10) };
}

// ── FSH fragment extractor ───────────────────────────────────────────────────

const FSH_PATTERN = /where\s+constraint\s*=\s*"([^"]*)"/g;

export function extractFshFragments(text: string): RawFragment[] {
  const fragments: RawFragment[] = [];
  const lines = text.split('\n');
  let index = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    FSH_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = FSH_PATTERN.exec(line)) !== null) {
      const eclText = match[1];
      if (!eclText.trim()) continue;
      const quotePos = line.indexOf('"', match.index) + 1;
      fragments.push({
        range: {
          start: { line: lineNum, character: quotePos },
          end: { line: lineNum, character: quotePos + eclText.length },
        },
        text: eclText,
        index: index++,
      });
    }
  }

  return fragments;
}

// ── FHIR JSON fragment extractor ─────────────────────────────────────────────

const ECL_FILTER_PROPERTIES = new Set(['constraint', 'expression']);
const ECL_PARAMETER_NAMES = new Set(['used-ecl', 'ecl']);

export function extractFhirJsonFragments(text: string): RawFragment[] {
  if (
    !text.includes('"constraint"') &&
    !text.includes('"expression"') &&
    !text.includes('"used-ecl"') &&
    !text.includes('"ecl"')
  ) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isObject(parsed)) return [];

  const locations: StringLocation[] = [];
  collectComposeFilterLocations(parsed, text, locations);
  collectExpansionParameterLocations(parsed, text, locations);
  return locations.map((loc, i) => locationToFragment(text, loc, i));
}

function collectComposeFilterLocations(root: Record<string, unknown>, text: string, out: StringLocation[]): void {
  const compose = isObject(root.compose) ? root.compose : null;
  if (!compose) return;
  for (const key of ['include', 'exclude'] as const) {
    for (const entry of asArray(compose[key])) {
      collectFiltersFromEntry(entry, text, out);
    }
  }
}

function collectFiltersFromEntry(entry: unknown, text: string, out: StringLocation[]): void {
  if (!isObject(entry)) return;
  for (const filter of asArray(entry.filter)) {
    if (!isEclFilter(filter)) continue;
    const searchFrom = out.length > 0 ? (out.at(-1)?.end ?? 0) : 0;
    const loc = findStringValueInText(text, 'value', filter.value, searchFrom);
    if (loc) out.push(loc);
  }
}

function collectExpansionParameterLocations(root: Record<string, unknown>, text: string, out: StringLocation[]): void {
  const expansion = isObject(root.expansion) ? root.expansion : null;
  if (!expansion) return;
  for (const param of asArray(expansion.parameter)) {
    if (!isEclParameter(param)) continue;
    const searchFrom = out.length > 0 ? (out.at(-1)?.end ?? 0) : 0;
    const loc = findStringValueInText(text, 'valueString', param.valueString, searchFrom);
    if (loc) out.push(loc);
  }
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? (v as unknown[]) : [];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isEclFilter(filter: unknown): filter is Record<string, unknown> & { value: string } {
  if (!isObject(filter)) return false;
  return (
    typeof filter.property === 'string' &&
    ECL_FILTER_PROPERTIES.has(filter.property) &&
    typeof filter.value === 'string' &&
    filter.value.trim().length > 0
  );
}

function isEclParameter(param: unknown): param is Record<string, unknown> & { valueString: string } {
  if (!isObject(param)) return false;
  return (
    typeof param.name === 'string' &&
    ECL_PARAMETER_NAMES.has(param.name) &&
    typeof param.valueString === 'string' &&
    param.valueString.trim().length > 0
  );
}

function findStringValueInText(text: string, key: string, value: string, searchFrom = 0): StringLocation | null {
  const escapedValue = JSON.stringify(value);
  const rawValueLength = escapedValue.length - 2;
  const pattern = `"${key}"\\s*:\\s*${escapeRegExp(escapedValue)}`;
  const re = new RegExp(pattern, 'g');
  re.lastIndex = searchFrom;
  const match = re.exec(text);
  if (!match) return null;
  const matchText = match[0];
  const valueQuoteStart = matchText.lastIndexOf(escapedValue);
  const valueStart = match.index + valueQuoteStart + 1;
  return { start: valueStart, end: valueStart + rawValueLength, value };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function locationToFragment(text: string, loc: StringLocation, index: number): RawFragment {
  let line = 0;
  let col = 0;
  for (let i = 0; i < loc.start; i++) {
    if (text[i] === '\n') {
      line++;
      col = 0;
    } else {
      col++;
    }
  }
  const rawLength = loc.end - loc.start;
  return {
    range: { start: { line, character: col }, end: { line, character: col + rawLength } },
    text: loc.value,
    index,
    charMap: loc.charMap,
  };
}

// ── FHIR XML fragment extractor ──────────────────────────────────────────────

const XML_FILTER_RE = /<filter\b[^>]*>([\s\S]*?)<\/filter>/g;
const XML_PARAMETER_RE = /<parameter\b[^>]*>([\s\S]*?)<\/parameter>/g;
const XML_ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
};
const XML_ENTITY_RE = /&(?:lt|gt|amp|quot|apos);/g;

export function decodeXmlEntities(raw: string): { decoded: string; charMap: number[] } {
  const charMap: number[] = [];
  let decoded = '';
  let rawIdx = 0;
  let lastEnd = 0;
  XML_ENTITY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = XML_ENTITY_RE.exec(raw)) !== null) {
    for (let i = lastEnd; i < m.index; i++) {
      charMap.push(rawIdx);
      decoded += raw[i];
      rawIdx++;
    }
    charMap.push(rawIdx);
    decoded += XML_ENTITIES[m[0]] ?? m[0];
    rawIdx += m[0].length;
    lastEnd = m.index + m[0].length;
  }
  for (let i = lastEnd; i < raw.length; i++) {
    charMap.push(rawIdx);
    decoded += raw[i];
    rawIdx++;
  }
  charMap.push(rawIdx);
  return { decoded, charMap };
}

export function extractFhirXmlFragments(text: string): RawFragment[] {
  if (!/<ValueSet\b/.test(text)) return [];
  const locations: StringLocation[] = [];
  collectXmlFilterLocations(text, locations);
  collectXmlParameterLocations(text, locations);
  return locations.map((loc, i) => locationToFragment(text, loc, i));
}

function collectXmlFilterLocations(text: string, out: StringLocation[]): void {
  XML_FILTER_RE.lastIndex = 0;
  let fm: RegExpExecArray | null;
  while ((fm = XML_FILTER_RE.exec(text)) !== null) {
    const property = extractXmlChildAttrValue(fm[1], 'property');
    if (!property || !ECL_FILTER_PROPERTIES.has(property)) continue;
    const loc = findXmlAttrLocation(text, fm.index, fm[0].length, 'value');
    if (loc?.value.trim()) out.push(loc);
  }
}

function collectXmlParameterLocations(text: string, out: StringLocation[]): void {
  XML_PARAMETER_RE.lastIndex = 0;
  let pm: RegExpExecArray | null;
  while ((pm = XML_PARAMETER_RE.exec(text)) !== null) {
    const name = extractXmlChildAttrValue(pm[1], 'name');
    if (!name || !ECL_PARAMETER_NAMES.has(name)) continue;
    const loc = findXmlAttrLocation(text, pm.index, pm[0].length, 'valueString');
    if (loc?.value.trim()) out.push(loc);
  }
}

function extractXmlChildAttrValue(parentBody: string, elementName: string): string | null {
  const re = new RegExp(`<${elementName}\\b[^>]*value="([^"]*)"`);
  const m = re.exec(parentBody);
  return m ? decodeXmlEntities(m[1]).decoded : null;
}

function findXmlAttrLocation(
  fullText: string,
  blockStart: number,
  blockLength: number,
  elementName: string,
): StringLocation | null {
  const block = fullText.substring(blockStart, blockStart + blockLength);
  const re = new RegExp(`<${elementName}\\b[^>]*value="([^"]*)"`);
  const m = re.exec(block);
  if (!m) return null;
  const rawAttrValue = m[1];
  const { decoded, charMap } = decodeXmlEntities(rawAttrValue);
  const matchOffset = blockStart + m.index;
  const attrStart = fullText.indexOf(`value="${rawAttrValue}"`, matchOffset);
  if (attrStart === -1) return null;
  const start = attrStart + 'value="'.length;
  return { start, end: start + rawAttrValue.length, value: decoded, charMap };
}

// ── Comment-trigger fragment extractor ───────────────────────────────────────

const ECL_COMMENT_RE = /^\s*(?:\/\/\s*ecl\s*|\/\*\s*ecl\s*\*\/\s*)$/;

export function extractCommentTriggerFragments(text: string): RawFragment[] {
  const fragments: RawFragment[] = [];
  const lines = text.split('\n');
  let index = 0;

  for (let lineNum = 0; lineNum < lines.length - 1; lineNum++) {
    if (!ECL_COMMENT_RE.test(lines[lineNum])) continue;
    const loc = findStringLiteralOnLine(lines[lineNum + 1]);
    if (!loc?.value.trim()) continue;
    fragments.push({
      range: {
        start: { line: lineNum + 1, character: loc.start },
        end: { line: lineNum + 1, character: loc.end },
      },
      text: loc.value,
      index: index++,
    });
  }

  return fragments;
}

function findStringLiteralOnLine(line: string): { start: number; end: number; value: string } | null {
  return findQuotedString(line, '"') ?? findQuotedString(line, "'") ?? findQuotedString(line, '`');
}

function findQuotedString(line: string, quote: string): { start: number; end: number; value: string } | null {
  const idx = line.indexOf(quote);
  if (idx === -1) return null;
  let content = '';
  let i = idx + 1;
  while (i < line.length) {
    if (line[i] === '\\' && i + 1 < line.length) {
      content += unescapeChar(line[i + 1]);
      i += 2;
    } else if (line[i] === quote) {
      return { start: idx + 1, end: i, value: content };
    } else {
      content += line[i];
      i++;
    }
  }
  return null;
}

function unescapeChar(ch: string): string {
  switch (ch) {
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    default:
      return ch;
  }
}
