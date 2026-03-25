// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Monaco editor action: Toggle display terms (Shift+Alt+T)
//
// Smart toggle — if any concept IDs lack display terms, adds them via FHIR
// lookup; if all already have terms, strips them.

import type * as Monaco from 'monaco-editor';
import { parseECL, extractConceptIds, resolveAddDisplayTerms } from '@aehrc/ecl-core';
import type { ITerminologyService, CoreCodeAction } from '@aehrc/ecl-core';

// eslint-disable-next-line sonarjs/slow-regex -- pipe-delimited terms in ECL are short; no ReDoS risk
const DISPLAY_TERM_PATTERN = /\s*\|[^|]+\|/g;

/** Analyse concept IDs in the text and return bare IDs plus a flag for existing terms. */
function analyseTerms(text: string): {
  hasBare: boolean;
  hasTerms: boolean;
  bareConceptIds: { id: string; offset: number }[];
} {
  const result = parseECL(text);
  const concepts = result.ast ? extractConceptIds(result.ast, { deduplicate: false }) : [];

  let hasBare = false;
  let hasTerms = false;
  const bareConceptIds: { id: string; offset: number }[] = [];

  for (const c of concepts) {
    if (!c.term || c.term.trim() === '') {
      hasBare = true;
      bareConceptIds.push({ id: c.id, offset: c.range.start.offset });
    } else {
      hasTerms = true;
    }
  }

  return { hasBare, hasTerms, bareConceptIds };
}

/** Add display terms to bare concept IDs via FHIR lookup. */
async function addTerms(
  ed: Monaco.editor.ICodeEditor,
  model: Monaco.editor.ITextModel,
  fullText: string,
  bareConceptIds: { id: string; offset: number }[],
  service: ITerminologyService,
): Promise<void> {
  const fullRange = model.getFullModelRange();
  const codeAction: CoreCodeAction = {
    title: 'Add display terms',
    kind: 'refactor',
    documentUri: model.uri.toString(),
    data: {
      kind: 'ecl.refactoring.resolve',
      action: 'addDisplayTerms',
      uri: model.uri.toString(),
      expressionText: fullText,
      expressionRange: {
        start: { line: fullRange.startLineNumber - 1, character: fullRange.startColumn - 1 },
        end: { line: fullRange.endLineNumber - 1, character: fullRange.endColumn - 1 },
      },
      bareConceptIds,
    },
  };

  const resolved = await resolveAddDisplayTerms(codeAction, service);
  if (resolved.edits && resolved.edits.length > 0) {
    const edit = resolved.edits[0];
    ed.executeEdits('ecl.toggleDisplayTerms', [{ range: model.getFullModelRange(), text: edit.newText }]);
  }
}

/**
 * Register the "Toggle display terms" action on a Monaco editor instance.
 *
 * @param editor - The Monaco editor instance
 * @param monaco - The Monaco namespace (for KeyMod/KeyCode)
 * @param getService - Getter for the current terminology service (may be null)
 * @returns A disposable to remove the action
 */
export function registerToggleTermsAction(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof import('monaco-editor'),
  getService: () => ITerminologyService | null,
): Monaco.IDisposable {
  return editor.addAction({
    id: 'ecl.toggleDisplayTerms',
    label: 'Toggle Display Terms',
    keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyT],
    contextMenuGroupId: 'ecl',
    contextMenuOrder: 1,

    run: async (ed) => {
      const model = ed.getModel();
      if (!model) return;

      const fullText = model.getValue();
      const { hasBare, hasTerms, bareConceptIds } = analyseTerms(fullText);

      if (hasBare) {
        const service = getService();
        if (!service || bareConceptIds.length === 0) return;
        await addTerms(ed, model, fullText, bareConceptIds, service);
      } else if (hasTerms) {
        const stripped = fullText.replace(DISPLAY_TERM_PATTERN, '');
        if (stripped !== fullText) {
          ed.executeEdits('ecl.toggleDisplayTerms', [{ range: model.getFullModelRange(), text: stripped }]);
        }
      }
    },
  });
}
