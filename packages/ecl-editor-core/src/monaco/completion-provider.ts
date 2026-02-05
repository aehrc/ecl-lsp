// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type * as Monaco from 'monaco-editor';
import { getCompletionItemsWithSearch, groupIntoExpressions } from 'ecl-core';
import type { CoreCompletionItem, CoreCompletionItemKind, ITerminologyService } from 'ecl-core';

const KIND_MAP: Record<CoreCompletionItemKind, number> = {
  keyword: 14, // Monaco.languages.CompletionItemKind.Keyword
  operator: 12, // Monaco.languages.CompletionItemKind.Operator
  snippet: 27, // Monaco.languages.CompletionItemKind.Snippet
  value: 12, // Monaco.languages.CompletionItemKind.Value → Operator (closest)
  concept: 6, // Monaco.languages.CompletionItemKind.Variable
  property: 9, // Monaco.languages.CompletionItemKind.Property
  text: 18, // Monaco.languages.CompletionItemKind.Text
  function: 1, // Monaco.languages.CompletionItemKind.Function
};

function mapCompletionItem(
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
    kind: KIND_MAP[item.kind],
    insertText,
    insertTextRules:
      item.insertTextFormat === 'snippet'
        ? 4 // Monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
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

export function createCompletionProvider(
  getTerminologyService: () => ITerminologyService | null,
): Monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['^', ':', '=', '{', '<', '>', '!', ' '],
    provideCompletionItems: async (
      model: Monaco.editor.ITextModel,
      position: Monaco.Position,
    ): Promise<Monaco.languages.CompletionList> => {
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

      const service = getTerminologyService();
      const coreItems: CoreCompletionItem[] = await getCompletionItemsWithSearch(
        inExpression,
        textBeforeCursor,
        currentLine,
        cursorColumn,
        line0,
        service ?? null,
      );

      const word = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };

      return {
        incomplete: true,
        suggestions: coreItems.map((item) => mapCompletionItem(item, range, model)),
      };
    },
  };
}
