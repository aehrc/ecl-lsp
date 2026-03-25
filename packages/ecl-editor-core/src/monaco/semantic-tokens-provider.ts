// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type * as Monaco from 'monaco-editor';
import { computeSemanticTokens, eclTokenTypes, eclTokenModifiers } from '@aehrc/ecl-core';

/** Monaco semantic tokens legend for ECL. */
export const eclSemanticTokensLegend: Monaco.languages.SemanticTokensLegend = {
  tokenTypes: [...eclTokenTypes],
  tokenModifiers: [...eclTokenModifiers],
};

export function createSemanticTokensProvider(): Monaco.languages.DocumentSemanticTokensProvider {
  return {
    getLegend(): Monaco.languages.SemanticTokensLegend {
      return eclSemanticTokensLegend;
    },

    provideDocumentSemanticTokens(model: Monaco.editor.ITextModel): Monaco.languages.SemanticTokens {
      const text = model.getValue();
      const tokens = computeSemanticTokens(text);

      // Encode as delta-encoded array per LSP spec
      const data: number[] = [];
      let prevLine = 0;
      let prevChar = 0;

      for (const token of tokens) {
        const deltaLine = token.line - prevLine;
        const deltaChar = deltaLine === 0 ? token.character - prevChar : token.character;
        data.push(deltaLine, deltaChar, token.length, token.tokenType, token.tokenModifiers);
        prevLine = token.line;
        prevChar = token.character;
      }

      return { data: new Uint32Array(data) };
    },

    releaseDocumentSemanticTokens(): void {
      // No-op — tokens are not cached
    },
  };
}
