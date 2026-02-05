// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

export interface FormattingOptions {
  indentSize: number;
  indentStyle: 'space' | 'tab';
  spaceAroundOperators: boolean;
  maxLineLength: number;
  alignTerms: boolean;
  /** Wrap comment text that exceeds maxLineLength. Defaults to false. */
  wrapComments: boolean;
  /**
   * Force a newline before every AND, OR, or MINUS operator.
   * When true, each logical operator begins on its own continuation line,
   * indented one level from the expression start.
   * Defaults to false (operators are kept on the same line up to maxLineLength).
   */
  breakOnOperators: boolean;
  /**
   * Force a newline after every comma inside a refinement attribute list.
   * When true, each attribute starts on its own line, indented appropriately.
   * Defaults to false.
   */
  breakOnRefinementComma: boolean;
  /**
   * Force a newline after the refinement colon (:).
   * When true, the attributes or attribute group following a colon start on
   * a new line, indented one level from the focus concept.
   * Defaults to false.
   */
  breakAfterColon: boolean;
}

export const defaultFormattingOptions: FormattingOptions = {
  indentSize: 2,
  indentStyle: 'space',
  spaceAroundOperators: true,
  maxLineLength: 80,
  alignTerms: true,
  wrapComments: false,
  breakOnOperators: false,
  breakOnRefinementComma: false,
  breakAfterColon: false,
};
