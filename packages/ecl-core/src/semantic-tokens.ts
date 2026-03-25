// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { groupIntoExpressions } from './parser/expression-grouper';
import { parseECL } from './parser';
import { NodeType, type ExpressionNode, type SubExpressionNode } from './parser/ast';

// --- Token type indices ---
const TOKEN_KEYWORD = 0;
const TOKEN_OPERATOR = 1;
const TOKEN_NUMBER = 2;
const TOKEN_STRING = 3;
const TOKEN_COMMENT = 4;
const TOKEN_PROPERTY = 5;
const TOKEN_TYPE = 6;
const TOKEN_VARIABLE = 7;
const TOKEN_MACRO = 8;

/** Standard ECL semantic token type names. */
export const eclTokenTypes = [
  'keyword', // 0 — AND, OR, MINUS, NOT
  'operator', // 1 — constraint/structural operators
  'number', // 2 — SNOMED CT concept IDs
  'string', // 3 — display terms |...|
  'comment', // 4 — block and line comments
  'property', // 5 — attribute name concept IDs
  'type', // 6 — filter keywords
  'variable', // 7 — wildcard *
  'macro', // 8 — history supplement keywords
] as const;

export const eclTokenModifiers: string[] = [];

export interface SemanticToken {
  line: number;
  character: number;
  length: number;
  tokenType: number;
  tokenModifiers: number;
}

// --- Attribute name position set ---

// Node type constants — must match ecl-core's NodeType enum values
const NT = {
  ExpressionConstraint: 'ExpressionConstraint',
  SubExpressionConstraint: 'SubExpressionConstraint',
  CompoundExpression: 'CompoundExpression',
  RefinedExpression: 'RefinedExpression',
  DottedExpression: 'DottedExpression',
  DottedAttribute: 'DottedAttribute',
  Refinement: 'Refinement',
  Attribute: 'Attribute',
  AttributeName: 'AttributeName',
  ConceptReference: 'ConceptReference',
  FilterConstraint: 'FilterConstraint',
  HistorySupplement: 'HistorySupplement',
} as const;

/**
 * Walk the AST to collect document-level positions of concept IDs used as attribute names.
 */
function collectAttributeNamePositions(ast: ExpressionNode, lineOffsets: number[]): Set<string> {
  const positions = new Set<string>();

  // eslint-disable-next-line sonarjs/cognitive-complexity, @typescript-eslint/no-explicit-any -- priority-ordered AST visitor with 12 node types; ANTLR4 AST nodes are inherently untyped
  function visit(node: any): void {
    if (!node?.type) return;
    switch (node.type) {
      case NT.ExpressionConstraint:
        if (node.expression) visit(node.expression);
        break;
      case NT.SubExpressionConstraint:
        if (node.focus) visit(node.focus);
        if (node.filters) {
          for (const f of node.filters) visit(f);
        }
        if (node.historySupplement) visit(node.historySupplement);
        break;
      case NT.CompoundExpression:
        for (const op of node.operands) visit(op);
        break;
      case NT.RefinedExpression:
        visit(node.expression);
        visit(node.refinement);
        break;
      case NT.DottedExpression:
        visit(node.source);
        for (const attr of node.attributes) visit(attr);
        break;
      case NT.DottedAttribute:
        if (node.attributeName) {
          markSubExpressionAsAttrName(node.attributeName, lineOffsets, positions);
        }
        break;
      case NT.Refinement:
        for (const attr of node.attributes) visit(attr);
        break;
      case NT.Attribute:
        markAttributeName(node.name, lineOffsets, positions);
        if (node.value?.expression) visit(node.value.expression);
        break;
      case NT.FilterConstraint:
        for (const ce of node.conceptExpressions) visit(ce);
        break;
      case NT.HistorySupplement:
        if (node.subsetExpression) visit(node.subsetExpression);
        break;
      default:
        break;
    }
  }

  visit(ast);
  return positions;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function markAttributeName(name: any, lineOffsets: number[], positions: Set<string>): void {
  if (name.conceptId) {
    const exprLine = Math.max(0, name.range.start.line - 1);
    const docLine = lineOffsets[exprLine] ?? 0;
    positions.add(`${docLine}:${name.range.start.column}`);
  }
  if (name.expression) {
    markSubExpressionAsAttrName(name.expression, lineOffsets, positions);
  }
}

function markSubExpressionAsAttrName(sub: SubExpressionNode, lineOffsets: number[], positions: Set<string>): void {
  if (sub.focus.type === NodeType.ConceptReference) {
    const exprLine = Math.max(0, sub.focus.range.start.line - 1);
    const docLine = lineOffsets[exprLine] ?? 0;
    positions.add(`${docLine}:${sub.focus.range.start.column}`);
  }
}

// --- Consumed ranges (shadowing) ---

interface ConsumedRange {
  line: number;
  start: number;
  end: number;
}

function isConsumed(ranges: ConsumedRange[], line: number, start: number, end: number): boolean {
  for (const r of ranges) {
    if (r.line === line && start >= r.start && end <= r.end) return true;
  }
  return false;
}

// --- Main tokenizer ---

// eslint-disable-next-line sonarjs/cognitive-complexity -- priority-ordered regex tokenizer with shadowing
export function computeSemanticTokens(text: string): SemanticToken[] {
  const tokens: SemanticToken[] = [];
  const consumed: ConsumedRange[] = [];

  // Step 1: Build attribute-name position set from AST
  const attrNamePositions = new Set<string>();
  const expressions = groupIntoExpressions(text);
  for (const expr of expressions) {
    const result = parseECL(expr.text);
    if (result.ast) {
      const exprPositions = collectAttributeNamePositions(result.ast, expr.lineOffsets);
      for (const pos of exprPositions) {
        attrNamePositions.add(pos);
      }
    }
  }

  const lines = text.split('\n');

  // Step 2: Scan with priority-ordered patterns

  // a. Block comments (multi-line)
  const blockCommentRe = /\/\*[\s\S]*?\*\//g;
  let m: RegExpExecArray | null;
  while ((m = blockCommentRe.exec(text)) !== null) {
    const commentText = m[0];
    const startOffset = m.index;
    const { line: startLine, character: startChar } = offsetToPosition(lines, startOffset);
    const commentLines = commentText.split('\n');
    for (let i = 0; i < commentLines.length; i++) {
      const cLine = startLine + i;
      const cChar = i === 0 ? startChar : 0;
      const cLen = commentLines[i].length;
      if (cLen > 0) {
        tokens.push({
          line: cLine,
          character: cChar,
          length: cLen,
          tokenType: TOKEN_COMMENT,
          tokenModifiers: 0,
        });
        consumed.push({ line: cLine, start: cChar, end: cChar + cLen });
      }
    }
  }

  // b. Line comments
  // eslint-disable-next-line sonarjs/slow-regex -- `.*$` is linear in line length; no backtracking risk
  const lineCommentRe = /\/\/.*$/gm;
  while ((m = lineCommentRe.exec(text)) !== null) {
    const { line, character } = offsetToPosition(lines, m.index);
    if (!isConsumed(consumed, line, character, character + m[0].length)) {
      tokens.push({
        line,
        character,
        length: m[0].length,
        tokenType: TOKEN_COMMENT,
        tokenModifiers: 0,
      });
      consumed.push({ line, start: character, end: character + m[0].length });
    }
  }

  // c. Display terms |...|
  const displayTermRe = /\|[^|\n]*\|/g;
  while ((m = displayTermRe.exec(text)) !== null) {
    const { line, character } = offsetToPosition(lines, m.index);
    if (!isConsumed(consumed, line, character, character + m[0].length)) {
      tokens.push({
        line,
        character,
        length: m[0].length,
        tokenType: TOKEN_STRING,
        tokenModifiers: 0,
      });
      consumed.push({ line, start: character, end: character + m[0].length });
    }
  }

  // d. History keywords
  const historyRe = /\bHISTORY(?:-(?:MIN|MOD|MAX))?\b/gi;
  while ((m = historyRe.exec(text)) !== null) {
    const { line, character } = offsetToPosition(lines, m.index);
    if (!isConsumed(consumed, line, character, character + m[0].length)) {
      tokens.push({
        line,
        character,
        length: m[0].length,
        tokenType: TOKEN_MACRO,
        tokenModifiers: 0,
      });
      consumed.push({ line, start: character, end: character + m[0].length });
    }
  }

  // e. Logical operators AND, OR, MINUS, NOT
  const logicalRe = /\b(AND|OR|MINUS|NOT)\b/gi;
  while ((m = logicalRe.exec(text)) !== null) {
    const { line, character } = offsetToPosition(lines, m.index);
    if (!isConsumed(consumed, line, character, character + m[0].length)) {
      tokens.push({
        line,
        character,
        length: m[0].length,
        tokenType: TOKEN_KEYWORD,
        tokenModifiers: 0,
      });
      consumed.push({ line, start: character, end: character + m[0].length });
    }
  }

  // f. Filter keywords — only inside {{ }} filter blocks
  const filterBlockRanges = collectFilterBlockRanges(text);
  const filterRe = /\b(typeId|moduleId|dialectId|definitionStatusId|term|language|active|effectiveTime|id)\b/gi;
  while ((m = filterRe.exec(text)) !== null) {
    const { line, character } = offsetToPosition(lines, m.index);
    if (
      !isConsumed(consumed, line, character, character + m[0].length) &&
      isInsideFilterBlock(filterBlockRanges, m.index, m.index + m[0].length)
    ) {
      tokens.push({
        line,
        character,
        length: m[0].length,
        tokenType: TOKEN_TYPE,
        tokenModifiers: 0,
      });
      consumed.push({ line, start: character, end: character + m[0].length });
    }
  }

  // g. Constraint operators (longest first)
  const constraintPatterns: RegExp[] = [/<<!/g, /<</g, /<!/g, />>!/g, />>/g, />!/g, /!!>/g, /!!</g, /</g, />/g, /\^/g];

  for (const re of constraintPatterns) {
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const { line, character } = offsetToPosition(lines, m.index);
      if (!isConsumed(consumed, line, character, character + m[0].length)) {
        tokens.push({
          line,
          character,
          length: m[0].length,
          tokenType: TOKEN_OPERATOR,
          tokenModifiers: 0,
        });
        consumed.push({ line, start: character, end: character + m[0].length });
      }
    }
  }

  // h. Structural operators != = : .
  const structuralRe = /!=|=|:|\./g;
  while ((m = structuralRe.exec(text)) !== null) {
    const { line, character } = offsetToPosition(lines, m.index);
    if (!isConsumed(consumed, line, character, character + m[0].length)) {
      tokens.push({
        line,
        character,
        length: m[0].length,
        tokenType: TOKEN_OPERATOR,
        tokenModifiers: 0,
      });
      consumed.push({ line, start: character, end: character + m[0].length });
    }
  }

  // i. Concept IDs (6-18 digit numbers)
  const conceptIdRe = /\b\d{6,18}\b/g;
  while ((m = conceptIdRe.exec(text)) !== null) {
    const { line, character } = offsetToPosition(lines, m.index);
    if (!isConsumed(consumed, line, character, character + m[0].length)) {
      const key = `${line}:${character}`;
      const tokenType = attrNamePositions.has(key) ? TOKEN_PROPERTY : TOKEN_NUMBER;
      tokens.push({
        line,
        character,
        length: m[0].length,
        tokenType,
        tokenModifiers: 0,
      });
      consumed.push({ line, start: character, end: character + m[0].length });
    }
  }

  // j. Wildcards *
  const wildcardRe = /\*/g;
  while ((m = wildcardRe.exec(text)) !== null) {
    const { line, character } = offsetToPosition(lines, m.index);
    if (!isConsumed(consumed, line, character, character + m[0].length)) {
      tokens.push({
        line,
        character,
        length: 1,
        tokenType: TOKEN_VARIABLE,
        tokenModifiers: 0,
      });
      consumed.push({ line, start: character, end: character + 1 });
    }
  }

  // Step 3: Sort by (line, character)
  tokens.sort((a, b) => a.line - b.line || a.character - b.character);

  return tokens;
}

// --- Helpers ---

function offsetToPosition(lines: string[], offset: number): { line: number; character: number } {
  let remaining = offset;
  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i].length + 1; // +1 for newline
    if (remaining < lineLen) {
      return { line: i, character: remaining };
    }
    remaining -= lineLen;
  }
  return { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 };
}

// --- Filter block range detection ---

interface OffsetRange {
  start: number;
  end: number;
}

function collectFilterBlockRanges(text: string): OffsetRange[] {
  const ranges: OffsetRange[] = [];
  const openRe = /\{\{/g;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(text)) !== null) {
    const openOffset = match.index;
    const closeIdx = text.indexOf('}}', openOffset + 2);
    if (closeIdx !== -1) {
      ranges.push({ start: openOffset, end: closeIdx + 2 });
    }
  }
  return ranges;
}

function isInsideFilterBlock(ranges: OffsetRange[], matchStart: number, matchEnd: number): boolean {
  for (const r of ranges) {
    if (matchStart >= r.start && matchEnd <= r.end) return true;
  }
  return false;
}
