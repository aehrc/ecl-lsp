// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// eslint-disable-next-line sonarjs/deprecation -- antlr4ts only provides ANTLRInputStream
import { ANTLRInputStream, CommonTokenStream, Token } from 'antlr4ts';
import { ECLLexer } from './generated/grammar/ECLLexer';
import { ECLParser } from './generated/grammar/ECLParser';
import { ECLASTVisitor } from './visitor';
import { ECLErrorListener, ParseError } from './error-listener';
import { ExpressionNode, Range } from './ast';
import { analyzeExpression } from './error-analysis';
import { checkMixedRefinementOperators, RefinementWarning } from './refinement-check';

export interface TokenInfo {
  type: number;
  text: string;
  range: Range;
}

export interface ParseResult {
  ast: ExpressionNode | null;
  errors: ParseError[];
  /**
   * Warnings about spec-compliance issues that the ANTLR grammar accepts
   * but the ECL specification does not allow.
   *
   * Currently detects mixed AND/OR in refinements (IHTSDO/snomed-expression-constraint-language#12).
   * This field can be removed once the upstream grammar is fixed.
   */
  warnings: RefinementWarning[];
  tokens: TokenInfo[];
}

// Single-entry parse cache — eliminates redundant parsing across validation,
// code actions, and hover for the same expression text.
let lastInput: string | null = null;
let lastResult: ParseResult | null = null;

// eslint-disable-next-line sonarjs/cognitive-complexity -- main parser orchestration with error recovery
export function parseECL(input: string): ParseResult {
  if (input === lastInput && lastResult !== null) {
    return lastResult;
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated, sonarjs/deprecation
  const inputStream = new ANTLRInputStream(input);
  const lexer = new ECLLexer(inputStream);
  const tokenStream = new CommonTokenStream(lexer);

  // Extract tokens with position information
  tokenStream.fill();
  const tokens: TokenInfo[] = tokenStream.getTokens().map((token: Token) => ({
    type: token.type,
    text: token.text ?? '',
    range: {
      start: {
        line: token.line,
        column: token.charPositionInLine,
        offset: token.startIndex,
      },
      end: {
        line: token.line,
        column: token.charPositionInLine + (token.text?.length ?? 0),
        offset: token.stopIndex + 1,
      },
    },
  }));

  const parser = new ECLParser(tokenStream);

  // Add custom error listener
  const errorListener = new ECLErrorListener();
  parser.removeErrorListeners();
  parser.addErrorListener(errorListener);

  // Parse and build AST
  let ast: ExpressionNode | null = null;
  try {
    const tree = parser.expressionconstraint();
    const visitor = new ECLASTVisitor();
    ast = visitor.visit(tree) as ExpressionNode | null;

    // Check if all input was consumed
    const currentToken = parser.currentToken;
    if (currentToken.type !== Token.EOF) {
      // There's unparsed input remaining
      const remainingText = input.substring(currentToken.startIndex);
      const firstLine = remainingText.split('\n')[0].trim();
      // If the remaining text starts with a logical operator, the issue is mixed
      // operators, not a missing operator — use a more accurate message.
      const startsWithOp = /^(AND|OR|MINUS)\b/.exec(firstLine);
      const unparsedMessage = startsWithOp
        ? `Unexpected '${startsWithOp[1]}' — cannot mix logical operators without parentheses`
        : `Unexpected input: '${firstLine}' - missing operator between expressions`;
      errorListener.getErrors().push({
        line: currentToken.line - 1, // Convert to 0-indexed
        column: currentToken.charPositionInLine,
        message: unparsedMessage,
        offendingSymbol: currentToken.text ?? '',
      });
    }
  } catch {
    // Parser threw an exception — errors captured by error listener
  }

  // Post-parse: replace cryptic ANTLR errors with clear, actionable messages.
  // Single-pass analysis detects all issues; we apply them in priority order.
  const existingErrors = errorListener.getErrors();
  if (existingErrors.length > 0) {
    const issues = analyzeExpression(input);

    if (issues.mixedOperator) {
      const m = issues.mixedOperator;
      existingErrors.length = 0;
      existingErrors.push({
        line: m.line,
        column: m.column,
        message:
          `Cannot mix ${m.firstOp} and ${m.conflictOp} operators without parentheses. ` +
          `Add parentheses to clarify precedence, e.g.: ` +
          `(... ${m.firstOp} ...) ${m.conflictOp} ... ` +
          `or ... ${m.firstOp} (... ${m.conflictOp} ...)`,
        offendingSymbol: m.conflictOp,
      });
    } else if (issues.missingColonBeforeBrace) {
      const mc = issues.missingColonBeforeBrace;
      existingErrors.length = 0;
      existingErrors.push({
        line: mc.line,
        column: mc.column,
        message:
          `Missing ':' before '{'. Attribute groups must be preceded by a colon. ` +
          `Use: concept : { attribute = value }`,
        offendingSymbol: '{',
      });
    } else if (issues.trailingOperator) {
      const t = issues.trailingOperator;
      existingErrors.length = 0;
      existingErrors.push({
        line: t.line,
        column: t.column,
        message: `Incomplete expression: '${t.op}' must be followed by a concept constraint`,
        offendingSymbol: t.op,
      });
    } else if (issues.duplicateOperator) {
      const d = issues.duplicateOperator;
      existingErrors.length = 0;
      existingErrors.push({
        line: d.line,
        column: d.column,
        message: `Duplicate '${d.op}' — expected a concept constraint after '${d.op}', not another '${d.op}'`,
        offendingSymbol: d.op,
      });
    } else if (issues.danglingEquals) {
      const de = issues.danglingEquals;
      existingErrors.length = 0;
      existingErrors.push({
        line: de.line,
        column: de.column,
        message: `Incomplete attribute: '=' must be followed by a concept expression (e.g., '= < 123456789')`,
        offendingSymbol: '=',
      });
    } else if (issues.unclosedParen) {
      const up = issues.unclosedParen;
      existingErrors.length = 0;
      existingErrors.push({
        line: up.line,
        column: up.column,
        message: `Missing closing ')' — every '(' must have a matching ')'`,
        offendingSymbol: '(',
      });
    } else if (issues.missingWhitespace) {
      const ns = issues.missingWhitespace;
      existingErrors.length = 0;
      existingErrors.push({
        line: ns.line,
        column: ns.column,
        message: `Missing space ${ns.side === 'before' ? 'before' : 'after'} '${ns.op}' — operators must be surrounded by spaces`,
        offendingSymbol: ns.op,
      });
    } else {
      // Consolidate: when ANTLR "no viable alternative" and our "missing operator"
      // both fire for the same issue, keep only our clearer message.
      const missingOpIdx = existingErrors.findIndex(
        (e) => typeof e.message === 'string' && e.message.includes('missing operator between expressions'),
      );
      const noViableIdx = existingErrors.findIndex(
        (e) => typeof e.message === 'string' && e.message.includes('no viable alternative'),
      );
      if (missingOpIdx !== -1 && noViableIdx !== -1) {
        const good = { ...existingErrors[missingOpIdx] };
        // Truncate long quoted text in the message
        good.message = good.message.replace(
          /Unexpected input: '([^']{25,})' - /,
          (_: string, txt: string) => `Unexpected input: '${txt.substring(0, 20).trimEnd()}…' - `,
        );
        existingErrors.length = 0;
        existingErrors.push(good);
      }
    }
  }

  // Post-parse: check for spec-compliance issues the grammar accepts.
  // This can be removed once IHTSDO/snomed-expression-constraint-language#12 is fixed.
  const warnings: RefinementWarning[] = ast ? checkMixedRefinementOperators(ast, input) : [];

  const result: ParseResult = {
    ast,
    errors: errorListener.getErrors(),
    warnings,
    tokens,
  };

  lastInput = input;
  lastResult = result;

  return result;
}

export * from './ast';
export * from './visitor';
export * from './error-listener';
