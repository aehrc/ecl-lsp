// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type * as Monaco from 'monaco-editor';
import {
  getRefactoringActions,
  resolveAddDisplayTerms,
  resolveUnifiedSimplify,
  buildReplacementText,
} from '@aehrc/ecl-core';
import type { CoreCodeAction, CoreTextEdit, ITerminologyService } from '@aehrc/ecl-core';

function coreEditToMonaco(edit: CoreTextEdit): { range: Monaco.IRange; text: string } {
  return {
    range: {
      startLineNumber: edit.range.start.line + 1,
      startColumn: edit.range.start.character + 1,
      endLineNumber: edit.range.end.line + 1,
      endColumn: edit.range.end.character + 1,
    },
    text: edit.newText,
  };
}

function buildWorkspaceEdit(modelUri: Monaco.Uri, edits: CoreTextEdit[]): Monaco.languages.WorkspaceEdit {
  return {
    edits: edits.map((e) => ({
      resource: modelUri,
      textEdit: coreEditToMonaco(e),
      versionId: undefined,
    })),
  };
}

export function createCodeActionProvider(
  getTerminologyService: () => ITerminologyService | null,
): Monaco.languages.CodeActionProvider {
  // Stash model URI for resolve — only one model at a time in a single editor
  let lastModelUri: Monaco.Uri | null = null;

  return {
    provideCodeActions(
      model: Monaco.editor.ITextModel,
      range: Monaco.Range,
      context?: Monaco.languages.CodeActionContext,
    ): Monaco.languages.CodeActionList {
      lastModelUri = model.uri;
      const text = model.getValue();
      const uri = model.uri.toString();
      // Convert Monaco 1-based range to 0-based CoreRange
      const coreRange = {
        start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
        end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
      };

      const coreActions = getRefactoringActions(uri, text, coreRange);

      const actions: Monaco.languages.CodeAction[] = coreActions.map((action) => {
        const monacoAction: Monaco.languages.CodeAction & { _coreAction?: CoreCodeAction } = {
          title: action.title,
          kind: action.kind === 'quickfix' ? 'quickfix' : 'refactor',
          diagnostics: [],
          isPreferred: false,
        };

        if (action.edits && !action.data) {
          monacoAction.edit = buildWorkspaceEdit(model.uri, action.edits);
        } else if (action.data) {
          monacoAction._coreAction = action;
        }

        return monacoAction;
      });

      // Add quick fixes for inactive concept diagnostics
      for (const marker of context?.markers ?? []) {
        const inactiveMatch = /^Inactive concept (\d+)/.exec(marker.message);
        if (!inactiveMatch) continue;

        const conceptId = inactiveMatch[1];
        actions.push({
          title: 'Replace inactive concept with active replacement\u2026',
          kind: 'quickfix',
          diagnostics: [],
          isPreferred: false,
          _coreAction: {
            title: 'Replace inactive concept',
            kind: 'quickfix',
            data: {
              action: 'replaceInactiveConcept',
              conceptId,
              // Store the marker range (1-based Monaco) for the replacement edit
              markerRange: {
                startLineNumber: marker.startLineNumber,
                startColumn: marker.startColumn,
                endLineNumber: marker.endLineNumber,
                endColumn: marker.endColumn,
              },
            },
          },
        } as Monaco.languages.CodeAction & { _coreAction?: CoreCodeAction });
      }

      return {
        actions,
        dispose: () => {
          /* no-op */
        },
      };
    },

    async resolveCodeAction(
      codeAction: Monaco.languages.CodeAction & { _coreAction?: CoreCodeAction },
    ): Promise<Monaco.languages.CodeAction> {
      try {
        const coreAction = codeAction._coreAction;
        if (!coreAction?.data || !lastModelUri) return codeAction;

        const service = getTerminologyService();
        if (!service) return codeAction;

        const data = coreAction.data as Record<string, unknown>;

        // Resolve inactive concept replacement
        if (data.action === 'replaceInactiveConcept') {
          return await resolveInactiveConceptAction(codeAction, data, service, lastModelUri);
        }

        // Resolve the action via ecl-core (FHIR calls happen here)
        const resolved = await resolveAddDisplayTerms(coreAction, service);
        if (resolved.edits) {
          codeAction.edit = buildWorkspaceEdit(lastModelUri, resolved.edits);
          return codeAction;
        }

        const simplifyResolved = await resolveUnifiedSimplify(coreAction, service);
        if (simplifyResolved.edits) {
          codeAction.edit = buildWorkspaceEdit(lastModelUri, simplifyResolved.edits);
          return codeAction;
        }

        return codeAction;
      } catch {
        return codeAction;
      }
    },
  };
}

async function resolveInactiveConceptAction(
  codeAction: Monaco.languages.CodeAction,
  data: Record<string, unknown>,
  service: ITerminologyService,
  modelUri: Monaco.Uri,
): Promise<Monaco.languages.CodeAction> {
  const conceptId = data.conceptId as string;
  const markerRange = data.markerRange as {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  if (!service.getHistoricalAssociations) return codeAction;

  const associations = await service.getHistoricalAssociations(conceptId);
  if (associations.length === 0) {
    codeAction.title = 'No historical association mappings found for this concept';
    return codeAction;
  }

  // Use the most specific association type
  const { replacement, label } = buildReplacementText(associations[0]);
  codeAction.title = label;
  if (!replacement) return codeAction;

  codeAction.edit = {
    edits: [
      {
        resource: modelUri,
        textEdit: {
          range: markerRange,
          text: replacement,
        },
        versionId: undefined,
      },
    ],
  };

  return codeAction;
}
