// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { CodeLens } from 'vscode-languageserver/node';

/**
 * Expression info needed by code lens builder.
 * Matches the shape returned by ecl-core's groupIntoExpressions.
 */
interface Expression {
  text: string;
  startLine: number;
  endLine: number;
}

/**
 * Builds Code Lens items for ECL expressions.
 * Pure function — no side effects — for testability.
 */
export function buildCodeLenses(expressions: Expression[], cache?: Map<string, number>): CodeLens[] {
  return expressions.map((expr) => {
    const exprText = expr.text.trim();
    const cached = cache?.get(exprText);
    const suffix = cached === 1 ? '' : 's';
    const title = cached === undefined ? 'Evaluate' : `${cached} concept${suffix}`;

    return {
      range: { start: { line: expr.startLine, character: 0 }, end: { line: expr.startLine, character: 0 } },
      command: {
        title,
        command: 'ecl.evaluateExpression',
        arguments: [expr.startLine, expr.endLine, exprText],
      },
    };
  });
}
