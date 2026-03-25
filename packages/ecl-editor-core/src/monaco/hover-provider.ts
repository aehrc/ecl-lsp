// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type * as Monaco from 'monaco-editor';
import { getOperatorHoverDoc } from '@aehrc/ecl-core';
import type { ITerminologyService } from '@aehrc/ecl-core';

/** Match operator tokens at the cursor position. */
const OPERATOR_RE = /(?:<<!?|<!?|>>!?|>!?|!![<>]|\^)/;

export function createHoverProvider(
  getTerminologyService: () => ITerminologyService | null,
): Monaco.languages.HoverProvider {
  return {
    provideHover: async (
      model: Monaco.editor.ITextModel,
      position: Monaco.Position,
      // eslint-disable-next-line sonarjs/cognitive-complexity -- Hover logic requires nested checks for operator matching, concept lookup, and FHIR fallback; splitting would obscure the sequential resolution flow.
    ): Promise<Monaco.languages.Hover | undefined> => {
      const lineText = model.getLineContent(position.lineNumber);

      // Check for operator hover
      const operatorMatch = OPERATOR_RE.exec(lineText.substring(0, position.column));
      if (operatorMatch) {
        const opStart = lineText.lastIndexOf(operatorMatch[0], position.column - 1);
        if (opStart >= 0 && position.column - 1 <= opStart + operatorMatch[0].length) {
          const doc = getOperatorHoverDoc(operatorMatch[0]);
          if (doc) {
            return {
              contents: [{ value: doc }],
              range: {
                startLineNumber: position.lineNumber,
                startColumn: opStart + 1,
                endLineNumber: position.lineNumber,
                endColumn: opStart + operatorMatch[0].length + 1,
              },
            };
          }
        }
      }

      // Check for concept hover
      const conceptIdRe = /\b(\d{6,18})\b/g;
      let match;
      while ((match = conceptIdRe.exec(lineText)) !== null) {
        const startCol = match.index + 1; // Monaco is 1-based
        const endCol = startCol + match[1].length;
        if (position.column >= startCol && position.column <= endCol) {
          const conceptId = match[1];
          const service = getTerminologyService();
          if (service) {
            try {
              const info = await service.getConceptInfo(conceptId);
              if (info) {
                const status = info.active ? 'Active' : '**INACTIVE**';
                const markdown = `**${info.fsn}**\n\nID: ${info.id}  \nPreferred term: ${info.pt}  \nStatus: ${status}`;
                return {
                  contents: [{ value: markdown }],
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: startCol,
                    endLineNumber: position.lineNumber,
                    endColumn: endCol,
                  },
                };
              }
            } catch {
              // FHIR unreachable — no hover
            }
          }
          break;
        }
      }

      return undefined;
    },
  };
}
