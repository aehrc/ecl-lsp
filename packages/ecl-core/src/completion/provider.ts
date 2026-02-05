// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { CoreCompletionItem, CoreCompletionItemKind } from '../types';
import { coreReplace } from '../types';
import { eclSnippetCompletions } from './snippets';
import { detectCursorContext, detectFilterContext, FilterSubContext } from './context-detector';
import * as ci from './context-items';
import type { ITerminologyService } from '../terminology/types';
import { getFhirFilterCompletions, FILTER_ECL_CONSTRAINTS } from './filter-cache';
export { clearFilterCache } from './filter-cache';

// ── Filter completion routing ────────────────────────────────────────────

function getFilterCompletions(filterType: 'D' | 'C' | 'M' | '+', subContext: FilterSubContext): CoreCompletionItem[] {
  if (filterType === '+') return ci.historyCompletions;

  const keywordsMap = { D: ci.descriptionFilterKeywords, C: ci.conceptFilterKeywords, M: ci.memberFilterKeywords };
  const keywords = keywordsMap[filterType];

  if (subContext === 'after-opening' || subContext === 'after-value') {
    return keywords;
  }
  if (subContext === 'after-keyword') {
    return [ci.equalsOperator, ci.notEqualsOperator];
  }
  if (typeof subContext === 'object') {
    return getFilterValueCompletions(filterType, subContext.keyword);
  }

  return keywords;
}

/** Return value completions based on which filter keyword precedes the = sign. */
function getFilterValueCompletions(filterType: 'D' | 'C' | 'M', keyword: string | null): CoreCompletionItem[] {
  switch (keyword) {
    case 'typeid':
    case 'type':
      return keyword === 'typeid' ? [...ci.typeIdValues] : [...ci.descriptionTypeValues, ...ci.typeIdValues];
    case 'dialectid':
    case 'dialect':
      return [...ci.dialectIdValues];
    case 'moduleid':
      return [...ci.moduleIdValues];
    case 'definitionstatusid':
    case 'definitionstatus':
      return keyword === 'definitionstatusid'
        ? [...ci.definitionStatusIdValues]
        : [...ci.definitionStatusValues, ...ci.definitionStatusIdValues];
    case 'active':
      return ci.booleanValues;
    case 'effectivetime':
      return [ci.effectiveTimeHint];
    case 'language':
      return [...ci.languageCodeValues];
    case 'term':
    case 'id':
      return []; // User types free text
    default:
      // Fall back to previous generic behavior
      if (filterType === 'D') return [...ci.descriptionTypeValues, ...ci.booleanValues];
      if (filterType === 'C') return [...ci.definitionStatusValues, ...ci.booleanValues];
      return ci.booleanValues; // M
  }
}

// ── Main completion function ─────────────────────────────────────────────

/**
 * Determines which completion items to return given cursor context.
 *
 * Pure function — no LSP dependencies — so it can be unit-tested.
 *
 * @param inExpression  Whether the cursor is inside a recognised expression
 * @param textBeforeCursor  Full text from expression start to cursor (multi-line)
 * @param currentLine  Text of the current line only
 * @param cursorColumn  Column position of cursor within the current line
 * @returns Array of CompletionItem to present
 */
export function getCompletionItems(
  inExpression: boolean,
  textBeforeCursor: string,
  _currentLine: string,
  _cursorColumn: number,
): CoreCompletionItem[] {
  // Between expressions — offer only snippets to start a new expression
  if (!inExpression) {
    return eclSnippetCompletions;
  }

  const context = detectCursorContext(textBeforeCursor);

  switch (context.kind) {
    case 'expression-start':
      return [...ci.constraintOperators, ci.conceptSearch, ...eclSnippetCompletions];

    case 'after-operator': {
      // If text doesn't end with whitespace, user may be typing a longer operator
      // (e.g. `<` could become `<<` or `<!`). Include operators for prefix matching.
      const lastChar = textBeforeCursor.at(-1);
      if (lastChar && !/\s/.test(lastChar)) {
        return [...ci.constraintOperators, ci.conceptSearch, ...eclSnippetCompletions];
      }
      // Operator is committed (followed by space) — concept expected
      return [ci.conceptSearch];
    }

    case 'after-concept':
      return [ci.andOperator, ci.orOperator, ci.minusOperator, ci.refinementColon, ci.dotNotation, ...ci.filterOpeners];

    case 'after-logical-operator':
      return [...ci.constraintOperators, ci.conceptSearch, ...eclSnippetCompletions];

    case 'refinement-start':
      return [
        ...ci.constraintOperators,
        ...ci.cardinalitySnippets,
        ci.attributeGroup,
        ci.reverseFlag,
        ci.conceptSearch,
      ];

    case 'after-attribute-name':
      return [ci.equalsOperator, ci.notEqualsOperator];

    case 'after-comparison-operator':
      return [...ci.constraintOperators, ci.wildcardValue, ci.conceptSearch];

    case 'after-cardinality':
      return [ci.attributeGroup, ci.reverseFlag, ...ci.constraintOperators, ci.conceptSearch];

    case 'dotted-awaiting-attribute':
      return [...ci.constraintOperators, ci.conceptSearch];

    case 'filter-block':
      return getFilterCompletions(context.filterType, context.subContext);

    case 'inside-display-term':
      return [];

    case 'unknown':
      // Fail open — return everything so the user isn't missing valid options
      return [
        ...ci.constraintOperators,
        ci.andOperator,
        ci.orOperator,
        ci.minusOperator,
        ci.refinementColon,
        ci.conceptSearch,
        ...eclSnippetCompletions,
      ];
  }

  // Exhaustiveness guard (unreachable with current union)
  return [...ci.constraintOperators, ci.conceptSearch, ...eclSnippetCompletions];
}

// ── Concept search extraction ────────────────────────────────────────────

/** ECL operator keywords that should not trigger concept search. */
const OPERATOR_KEYWORDS = new Set(['AND', 'OR', 'MINUS', 'NOT']);

/**
 * Extracts a partial concept term from the text before the cursor.
 *
 * Returns the search query string if the user appears to be typing a term
 * after a constraint operator, logical operator, colon, equals, or open paren.
 * Returns null if no valid search query is detected.
 *
 * Guards:
 * - Minimum 3 characters
 * - Not purely numeric (concept IDs are not term searches)
 * - Not an ECL operator keyword
 */
export function extractConceptSearchQuery(textBeforeCursor: string): string | null {
  // Match text after an operator followed by whitespace:
  //   constraint operators: <<, <, >>, >, ^
  //   logical operators: AND, OR, MINUS
  //   refinement: :, =
  //   grouping: (, {
  // Capture the trailing word(s) that the user is typing
  // eslint-disable-next-line sonarjs/slow-regex -- bounded to single-line cursor context; no ReDoS risk
  let match = /.*(?:<<|>>|[<>^]|\bAND\b|\bOR\b|\bMINUS\b|[(:={,])\s+(.+)$/i.exec(textBeforeCursor);

  // Fallback: bare text at the start of a line (no preceding operator)
  // Allows concept search when typing a term without an operator prefix
  // eslint-disable-next-line sonarjs/slow-regex -- simple fallback pattern on single line
  match ??= /^\s*(.+)$/i.exec(textBeforeCursor);
  if (!match) return null;

  const query = match[1].trim();

  // Must be at least 3 characters
  if (query.length < 3) return null;

  // Must not be purely numeric (user is typing a concept ID, not a term)
  if (/^\d+$/.test(query)) return null;

  // Must not be an operator keyword
  if (OPERATOR_KEYWORDS.has(query.toUpperCase())) return null;

  return query;
}

// ── Async wrapper with concept search ────────────────────────────────────

/**
 * Async wrapper around getCompletionItems that also searches for concepts
 * via the terminology service when the user appears to be typing a term.
 */
export async function getCompletionItemsWithSearch(
  inExpression: boolean,
  textBeforeCursor: string,
  currentLine: string,
  cursorColumn: number,
  lineNumber: number,
  terminologyService: ITerminologyService | null,
): Promise<CoreCompletionItem[]> {
  // Get base completion items (operators, snippets, search command)
  const baseItems = getCompletionItems(inExpression, textBeforeCursor, currentLine, cursorColumn);

  // Only search when inside an expression and we have a terminology service
  if (!inExpression || !terminologyService) {
    return baseItems;
  }

  // FHIR filter enrichment: if cursor is in a filter after-equals for typeId/dialectId/moduleId,
  // fetch FHIR-powered completions and merge with base items (deduplicated by concept code)
  const filterCtx = detectFilterContext(textBeforeCursor);
  if (filterCtx?.kind === 'filter-block') {
    const sub = filterCtx.subContext;
    if (typeof sub === 'object' && sub.keyword) {
      const keyword = sub.keyword.toLowerCase();
      if (keyword in FILTER_ECL_CONSTRAINTS) {
        const fhirItems = await getFhirFilterCompletions(keyword, terminologyService);
        if (fhirItems.length > 0) {
          // Deduplicate: extract concept codes from static items
          const staticCodes = new Set(
            baseItems
              .map((item) => {
                const codeMatch = /^(\d{6,18})\s/.exec(typeof item.label === 'string' ? item.label : '');
                return codeMatch ? codeMatch[1] : null;
              })
              .filter((code): code is string => code !== null),
          );
          const uniqueFhirItems = fhirItems.filter((item) => {
            const codeMatch = /^(\d{6,18})\s/.exec(typeof item.label === 'string' ? item.label : '');
            return codeMatch ? !staticCodes.has(codeMatch[1]) : true;
          });
          return [...baseItems, ...uniqueFhirItems];
        }
      }
    }
  }

  const query = extractConceptSearchQuery(currentLine.substring(0, cursorColumn));
  if (!query) {
    return baseItems;
  }

  try {
    const response = await terminologyService.searchConcepts(query);
    if (response.results.length === 0) {
      return baseItems;
    }

    // Calculate the column where the query text starts
    const textUpToCursor = currentLine.substring(0, cursorColumn);
    const queryStartCol = textUpToCursor.lastIndexOf(query);

    const conceptItems: CoreCompletionItem[] = response.results.map((result, index) => {
      // Extract semantic tag from FSN (e.g., "Has active ingredient (attribute)" -> "(attribute)")
      // eslint-disable-next-line sonarjs/slow-regex -- bounded FSN string
      const tagMatch = /\s*(\([^)]+\))\s*$/.exec(result.fsn);
      const displayLabel = tagMatch ? `${result.pt} ${tagMatch[1]}` : result.pt;
      return {
        label: `${result.id} |${displayLabel}|`,
        kind: 'concept' as CoreCompletionItemKind,
        detail: result.fsn,
        filterText: result.pt,
        sortText: `g${String(index).padStart(3, '0')}`,
        textEdit: coreReplace(
          { start: { line: lineNumber, character: queryStartCol }, end: { line: lineNumber, character: cursorColumn } },
          `${result.id} |${result.pt}|`,
        ),
      };
    });

    return [...baseItems, ...conceptItems];
  } catch {
    // Graceful degradation — return base items if search fails
    return baseItems;
  }
}
