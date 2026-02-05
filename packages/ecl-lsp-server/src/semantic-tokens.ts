// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Re-export semantic tokens from ecl-core, adding the LSP-specific tokenLegend type.
import { SemanticTokensLegend } from 'vscode-languageserver/node';
import { eclTokenTypes, eclTokenModifiers } from 'ecl-core';

export { computeSemanticTokens } from 'ecl-core';
export type { SemanticToken } from 'ecl-core';

export const tokenLegend: SemanticTokensLegend = {
  tokenTypes: [...eclTokenTypes],
  tokenModifiers: [...eclTokenModifiers],
};
