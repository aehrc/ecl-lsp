// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { CoreCompletionItem, CoreCompletionItemKind, CoreInsertTextFormat } from '../types';

/**
 * ECL snippet completions for common expression patterns.
 * These are offered when the cursor is between expressions or at the
 * start of an expression where constraint operators are valid.
 *
 * All snippets use `sortText` starting with 'z' so they sort after
 * keyword/operator completions.
 */
export const eclSnippetCompletions: CoreCompletionItem[] = [
  {
    label: 'Descendant of',
    kind: 'snippet' as CoreCompletionItemKind,
    detail: '< conceptId |term|',
    insertText: '< ${1:conceptId} |${2:term}|',
    insertTextFormat: 'snippet' as CoreInsertTextFormat,
    sortText: 'z1-desc',
  },
  {
    label: 'Descendant or self of',
    kind: 'snippet' as CoreCompletionItemKind,
    detail: '<< conceptId |term|',
    insertText: '<< ${1:conceptId} |${2:term}|',
    insertTextFormat: 'snippet' as CoreInsertTextFormat,
    sortText: 'z2-desc-self',
  },
  {
    label: 'Ancestor of',
    kind: 'snippet' as CoreCompletionItemKind,
    detail: '> conceptId |term|',
    insertText: '> ${1:conceptId} |${2:term}|',
    insertTextFormat: 'snippet' as CoreInsertTextFormat,
    sortText: 'z3-anc',
  },
  {
    label: 'Ancestor or self of',
    kind: 'snippet' as CoreCompletionItemKind,
    detail: '>> conceptId |term|',
    insertText: '>> ${1:conceptId} |${2:term}|',
    insertTextFormat: 'snippet' as CoreInsertTextFormat,
    sortText: 'z4-anc-self',
  },
  {
    label: 'Simple refinement',
    kind: 'snippet' as CoreCompletionItemKind,
    detail: '<< concept: attr = << value',
    insertText: '<< ${1:concept}: ${2:attribute} = << ${3:value}',
    insertTextFormat: 'snippet' as CoreInsertTextFormat,
    sortText: 'z5-refine',
  },
  {
    label: 'Grouped refinement',
    kind: 'snippet' as CoreCompletionItemKind,
    detail: '<< concept: { attr = << value }',
    insertText: '<< ${1:concept}: { ${2:attribute} = << ${3:value} }',
    insertTextFormat: 'snippet' as CoreInsertTextFormat,
    sortText: 'z6-refine-group',
  },
  {
    label: 'Nested expression',
    kind: 'snippet' as CoreCompletionItemKind,
    detail: '<< concept: attr = (<< value)',
    insertText: '<< ${1:concept}: ${2:attribute} = (<< ${3:value})',
    insertTextFormat: 'snippet' as CoreInsertTextFormat,
    sortText: 'z7-nested',
  },
  {
    label: 'Multi-attribute refinement',
    kind: 'snippet' as CoreCompletionItemKind,
    detail: '<< concept: attr1 = << val1, attr2 = << val2',
    insertText: '<< ${1:concept}: ${2:attr1} = << ${3:val1}, ${4:attr2} = << ${5:val2}',
    insertTextFormat: 'snippet' as CoreInsertTextFormat,
    sortText: 'z8-refine-multi',
  },
];
