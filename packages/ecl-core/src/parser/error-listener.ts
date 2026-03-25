// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { ANTLRErrorListener, RecognitionException, Recognizer } from 'antlr4ts';

export interface ParseError {
  line: number;
  column: number;
  message: string;
  offendingSymbol?: any;
}

export class ECLErrorListener implements ANTLRErrorListener<any> {
  private readonly errors: ParseError[] = [];

  syntaxError(
    recognizer: Recognizer<any, any>,
    offendingSymbol: any,
    line: number,
    charPositionInLine: number,
    msg: string,
    _e: RecognitionException | undefined,
  ): void {
    this.errors.push({
      line,
      column: charPositionInLine,
      message: msg,
      offendingSymbol,
    });
  }

  getErrors(): ParseError[] {
    return this.errors;
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}
