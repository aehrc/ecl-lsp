// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type * as Monaco from 'monaco-editor';
import { getCompletionItemsWithSearch, groupIntoExpressions } from '@aehrc/ecl-core';
import type { CoreCompletionItem, CoreCompletionItemKind, ITerminologyService } from '@aehrc/ecl-core';

type MonacoApi = typeof import('monaco-editor');

/**
 * Core kind → Monaco CompletionItemKind member name. The numeric values are read from the
 * monaco instance at runtime because Monaco renumbers this enum between releases
 * (e.g. Tool = 27 was inserted before Snippet).
 */
const KIND_MAP: Record<CoreCompletionItemKind, keyof typeof Monaco.languages.CompletionItemKind> = {
  keyword: 'Keyword',
  operator: 'Operator',
  snippet: 'Snippet',
  value: 'Value',
  concept: 'Variable',
  property: 'Property',
  text: 'Text',
  function: 'Function',
};

function mapCompletionItem(
  monaco: MonacoApi,
  item: CoreCompletionItem,
  defaultRange: Monaco.IRange,
  model: Monaco.editor.ITextModel,
): Monaco.languages.CompletionItem {
  let insertText = item.insertText ?? item.label;
  let range = defaultRange;
  let filterText = item.filterText;

  if (item.textEdit) {
    insertText = item.textEdit.newText;
    const editRange: Monaco.IRange = {
      startLineNumber: item.textEdit.range.start.line + 1,
      startColumn: item.textEdit.range.start.character + 1,
      endLineNumber: item.textEdit.range.end.line + 1,
      endColumn: item.textEdit.range.end.character + 1,
    };
    range = editRange;
    // Set filterText to the text currently in the edit range so Monaco matches
    // the item against what the user actually typed (including multi-word queries)
    const currentText = model.getValueInRange(editRange);
    if (currentText) {
      filterText = currentText;
    }
  }

  const result: Monaco.languages.CompletionItem = {
    label: item.label,
    kind: monaco.languages.CompletionItemKind[KIND_MAP[item.kind]],
    insertText,
    insertTextRules:
      item.insertTextFormat === 'snippet' ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
    detail: item.detail,
    documentation: item.documentation,
    sortText: item.sortText,
    filterText,
    range,
  };
  return result;
}

/**
 * Determine if the cursor is inside an ECL expression (not on a blank/comment-only line).
 */
function isInsideExpression(text: string, lineNumber: number): boolean {
  const expressions = groupIntoExpressions(text);
  for (const expr of expressions) {
    const exprStartLine = expr.startLine;
    const exprEndLine = exprStartLine + expr.lineOffsets.length - 1;
    if (lineNumber >= exprStartLine && lineNumber <= exprEndLine) {
      return true;
    }
  }
  return false;
}

const SEARCH_DEBOUNCE_MS = 200;

export function createCompletionProvider(
  monaco: MonacoApi,
  getTerminologyService: () => ITerminologyService | null,
): Monaco.languages.CompletionItemProvider {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let latestSearchItems: CoreCompletionItem[] = [];

  return {
    triggerCharacters: ['^', ':', '=', '{', '<', '>', '!', ' '],
    provideCompletionItems: async (
      model: Monaco.editor.ITextModel,
      position: Monaco.Position,
    ): Promise<Monaco.languages.CompletionList> => {
      try {
        const text = model.getValue();
        const line0 = position.lineNumber - 1; // 0-based

        // Compute the text before cursor within the whole document
        const textBeforeCursor = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const currentLine = model.getLineContent(position.lineNumber);
        const cursorColumn = position.column - 1; // 0-based
        const inExpression = isInsideExpression(text, line0);

        // Return static completions (operators/snippets) immediately without waiting for
        // concept search, so the dropdown is never empty while the debounce is pending.
        const staticItems: CoreCompletionItem[] = await getCompletionItemsWithSearch(
          inExpression,
          textBeforeCursor,
          currentLine,
          cursorColumn,
          line0,
          null,
        );

        const service = getTerminologyService();
        if (service) {
          // Cancel previous pending search and schedule a new one after the debounce window.
          if (debounceTimer !== null) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            getCompletionItemsWithSearch(inExpression, textBeforeCursor, currentLine, cursorColumn, line0, service)
              .then((items: CoreCompletionItem[]) => {
                latestSearchItems = items;
              })
              .catch(() => {
                /* silently degrade */
              });
          }, SEARCH_DEBOUNCE_MS);
        }

        // Merge static items with results from the most recent completed search.
        // Monaco's `incomplete: true` causes a re-query when latestSearchItems updates.
        const seen = new Set(staticItems.map((i) => i.label));
        const merged = [...staticItems, ...latestSearchItems.filter((i) => !seen.has(i.label))];

        const word = model.getWordUntilPosition(position);
        const range: Monaco.IRange = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn,
        };

        return {
          incomplete: true,
          suggestions: merged.map((item) => mapCompletionItem(monaco, item, range, model)),
        };
      } catch {
        return { incomplete: true, suggestions: [] };
      }
    },
  };
}
