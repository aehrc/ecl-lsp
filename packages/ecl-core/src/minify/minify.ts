// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Minify an ECL expression: the shortest text that parses to the same expression.
//
// Built for storing ECL where size and RF2 safety matter, such as the query
// field of a query specification reference set: no tabs or line breaks, no
// display terms, no optional whitespace.
//
// It walks the ANTLR parse tree rather than the AST because the AST drops what
// this must handle exactly: where the grammar makes whitespace optional (`ws`)
// and where it makes it mandatory (`mws`), comments, and the contents of quoted
// strings. Nothing is reordered or regrouped, so the result is the same
// expression, not merely an equivalent one. The output is re-parsed and checked
// against the input's structure before it is returned.

import { ParserRuleContext } from 'antlr4ts';
import type { ParseTree } from 'antlr4ts/tree/ParseTree';
import { TerminalNode } from 'antlr4ts/tree/TerminalNode';
import { ECLParser } from '../parser/generated/grammar/ECLParser';
import { parseConcreteTree, parseECL } from '../parser';
import type { ParseError } from '../parser/error-listener';

export interface MinifyOptions {
  /**
   * Remove block comments. Default `false`: comments are kept, with the
   * whitespace inside them collapsed, because they cannot be reconstructed.
   */
  removeComments?: boolean;
}

export class MinifyError extends Error {
  constructor(
    message: string,
    public readonly parseErrors: ParseError[],
  ) {
    super(message);
    this.name = 'MinifyError';
  }
}

/**
 * Returns the shortest form of an ECL expression that parses to the same
 * expression.
 *
 * - Display terms (`404684003 |Clinical finding|`) are removed.
 * - Whitespace is removed wherever the grammar makes it optional, and becomes a
 *   single space where it is mandatory (after `AND`, `OR` and `MINUS`, and
 *   between the items of a set such as `(en-au (prefer) en-gb)`).
 * - A space is also kept where removing it would join two words or numbers
 *   (`D term`, `R 363698007`) or two characters into a different operator
 *   (`< !!>`, `{ {`).
 * - Quoted strings (term filters, alternate identifiers, dates) are kept as
 *   written, except that a tab or line break in one becomes a space.
 * - Block comments are kept unless `removeComments` is set.
 *
 * The result contains no tab, carriage return or line feed, so it is safe for
 * an RF2 file. Operand order, brackets and refinement groups are unchanged.
 *
 * Throws `MinifyError` if the expression cannot be parsed.
 */
export function minifyExpression(expression: string, options: MinifyOptions = {}): string {
  const tree = parseOrThrow(expression);
  const minified = new Minifier(options.removeComments ?? false).print(tree);

  // The tree walk is the only thing standing between an author's ECL and a
  // stored expression that means something else, so check its work.
  const check = parseConcreteTree(minified);
  if (!check.tree || check.errors.length > 0 || structureOf(check.tree) !== structureOf(tree)) {
    throw new MinifyError(`Minifying changed the expression's structure; the result was: ${minified}`, check.errors);
  }
  return minified;
}

function parseOrThrow(expression: string): ParserRuleContext {
  const { tree, errors } = parseConcreteTree(expression);
  if (tree && errors.length === 0) return tree;
  // Only an invalid expression pays for a second parse, to get parseECL's clearer messages.
  const friendly = parseECL(expression).errors;
  const reported = friendly.length > 0 ? friendly : errors;
  throw new MinifyError(`Cannot minify invalid ECL: ${reported[0]?.message ?? 'unknown error'}`, reported);
}

// Rules whose text is copied as written: a quoted search term's spaces are
// word separators the grammar parses with `ws`/`mws`, but they belong to the
// string, not to the expression's layout.
const VERBATIM_RULES = new Set([ECLParser.RULE_matchsearchtermset]);

// Rules that end with an optional display term: `( ws PIPE ws term ws PIPE )?`.
const TERM_BEARING_RULES = new Set([ECLParser.RULE_eclconceptreference, ECLParser.RULE_altidentifier]);

// Whitespace the grammar allows inside strings. Each becomes a space, so the
// output stays on one line.
const LINE_BREAK_OR_TAB = /[\t\r\n]/g;

// A tab or line break inside a string becomes a space, so these compare as `sp`.
const WHITESPACE_CHAR_RULES = new Set([ECLParser.RULE_htab, ECLParser.RULE_cr, ECLParser.RULE_lf]);

// Two of these either side of dropped whitespace would run together into one
// word: `D term`, `R 363698007`.
const WORD_CHAR = /[\p{L}\p{N}_]/u;

// Character pairs that read as something else once the space between them is
// gone: `< !!>` is not `<!` followed by `!>`, nor `{ {` a filter. `//` is not
// ECL, but tools (this formatter among them) treat it as a line comment, so
// two adjacent block comments stay apart: `/* a */ /* b */`.
const JOINING_PAIRS = new Set([
  '<<',
  '<!',
  '<=',
  '>>',
  '>!',
  '>=',
  '!!',
  '!=',
  '!<',
  '!>',
  '{{',
  '}}',
  '/*',
  '*/',
  '//',
  '..',
]);

function needsSpace(before: string, after: string): boolean {
  if (WORD_CHAR.test(before) && WORD_CHAR.test(after)) return true;
  return JOINING_PAIRS.has(before + after);
}

class Minifier {
  private out = '';
  // True when the source had whitespace or a comment here that was dropped, so
  // the next character may need a space to stay apart from the previous one.
  private brokenHere = false;
  // True just after an unquoted alternate identifier code. Such a code may
  // contain `.` (`ICD#A01.9`), so a following dotted attribute needs a space:
  // `ICD#A01.363698007` would read the attribute as part of the code.
  private afterUnquotedCode = false;

  constructor(private readonly removeComments: boolean) {}

  print(tree: ParseTree): string {
    this.visit(tree);
    return this.out;
  }

  private visit(node: ParseTree): void {
    if (node instanceof TerminalNode) {
      // Outside strings, whitespace characters only occur inside `ws`, `mws`,
      // comments and terms, which are handled below; so this is a string.
      this.append(node.text.replaceAll(LINE_BREAK_OR_TAB, ' '));
      return;
    }
    if (!(node instanceof ParserRuleContext)) return;

    switch (node.ruleIndex) {
      case ECLParser.RULE_ws:
        this.separator(node, false);
        return;
      case ECLParser.RULE_mws:
        this.separator(node, true);
        return;
    }
    if (VERBATIM_RULES.has(node.ruleIndex)) {
      this.append(node.text.replaceAll(LINE_BREAK_OR_TAB, ' '));
      return;
    }
    if (TERM_BEARING_RULES.has(node.ruleIndex)) {
      this.visitWithoutTerm(node);
      return;
    }
    for (const child of node.children ?? []) this.visit(child);
  }

  /** Prints a concept reference or alternate identifier without its `|term|`. */
  private visitWithoutTerm(node: ParserRuleContext): void {
    const children = node.children ?? [];
    const firstPipe = children.findIndex((c) => c instanceof TerminalNode && c.text === '|');
    if (firstPipe === -1) {
      for (const child of children) this.visit(child);
      this.noteUnquotedCode(node);
      return;
    }
    // Everything before the `ws` that precedes the first pipe is the identifier.
    for (const child of children.slice(0, firstPipe - 1)) this.visit(child);
    this.noteUnquotedCode(node);
    // The rest is `ws | ws term ws |`: drop the term, keep any comments.
    for (const child of children.slice(firstPipe - 1)) {
      if (child instanceof ParserRuleContext && child.ruleIndex === ECLParser.RULE_ws) this.visit(child);
    }
    this.brokenHere = true;
  }

  private noteUnquotedCode(node: ParserRuleContext): void {
    const first = node.children?.[0];
    const quoted = first instanceof ParserRuleContext && first.ruleIndex === ECLParser.RULE_qm;
    this.afterUnquotedCode = node.ruleIndex === ECLParser.RULE_altidentifier && !quoted;
  }

  /** Optional (`ws`) or mandatory (`mws`) whitespace, which may hold comments. */
  private separator(node: ParserRuleContext, mandatory: boolean): void {
    if (node.text.length === 0) return;

    const comments = this.removeComments
      ? []
      : (node.children ?? []).filter(
          (c): c is ParserRuleContext => c instanceof ParserRuleContext && c.ruleIndex === ECLParser.RULE_comment,
        );

    this.brokenHere = true;
    for (const comment of comments) {
      this.append(comment.text.replaceAll(/\s+/g, ' '));
      this.brokenHere = true;
    }
    // A comment on its own satisfies `mws`.
    if (mandatory && comments.length === 0) {
      this.out += ' ';
      this.brokenHere = false;
    }
  }

  private append(text: string): void {
    if (text.length === 0) return;
    const last = this.out.at(-1);
    const keepApart = needsSpace(last ?? '', text[0]) || (this.afterUnquotedCode && text.startsWith('.'));
    if (this.brokenHere && last !== undefined && keepApart) {
      this.out += ' ';
    }
    this.out += text;
    this.brokenHere = false;
    this.afterUnquotedCode = false;
  }
}

/**
 * The parse tree reduced to what the expression means: rule names and
 * characters, without whitespace, comments, display terms, or the difference
 * between a tab and a space inside a string.
 */
function structureOf(tree: ParseTree): string {
  const parts: string[] = [];
  const walk = (node: ParseTree): void => {
    if (node instanceof TerminalNode) {
      parts.push(node.text.replaceAll(LINE_BREAK_OR_TAB, ' '));
      return;
    }
    if (!(node instanceof ParserRuleContext)) return;
    const rule = WHITESPACE_CHAR_RULES.has(node.ruleIndex) ? ECLParser.RULE_sp : node.ruleIndex;
    if (rule === ECLParser.RULE_ws || rule === ECLParser.RULE_mws) return;
    if (VERBATIM_RULES.has(rule)) {
      parts.push(`[${rule}]`, node.text.replaceAll(LINE_BREAK_OR_TAB, ' '));
      return;
    }
    parts.push(`[${rule}]`);
    const children = node.children ?? [];
    const firstPipe = TERM_BEARING_RULES.has(rule)
      ? children.findIndex((c) => c instanceof TerminalNode && c.text === '|')
      : -1;
    const kept = firstPipe === -1 ? children : children.slice(0, firstPipe - 1);
    for (const child of kept) walk(child);
    parts.push(']');
  };
  walk(tree);
  return parts.join('');
}
