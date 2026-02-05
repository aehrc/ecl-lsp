// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Refactoring: Add display terms to bare concept IDs
//
// Uses a "resolve" pattern — the code action shell is returned synchronously,
// and the FHIR terminology lookups happen in the resolve handler.

import type { CoreCodeAction } from '../types';
import { coreReplace } from '../types';
import { extractConceptIds } from '../parser/concept-extractor';
import type { ITerminologyService } from '../terminology/types';
import type { RefactoringContext } from './index';

/** Data attached to the unresolved code action for later async resolution. */
interface AddDisplayTermsData {
  kind: 'ecl.refactoring.resolve';
  action: 'addDisplayTerms';
  uri: string;
  expressionText: string;
  expressionRange: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  bareConceptIds: { id: string; offset: number }[];
}

/**
 * Returns an "Add display terms" code action if the expression contains
 * at least one concept ID without a pipe-delimited display term.
 * The action does NOT include an edit — it will be resolved asynchronously
 * via {@link resolveAddDisplayTerms}.
 */
export function getAddDisplayTermsAction(ctx: RefactoringContext): CoreCodeAction | null {
  if (!ctx.ast) {
    return null;
  }

  const concepts = extractConceptIds(ctx.ast);

  // Find concepts that don't already have a display term
  const bareConcepts = concepts.filter((c) => !c.term || c.term.trim() === '');

  if (bareConcepts.length === 0) {
    return null;
  }

  const bareConceptIds = bareConcepts.map((c) => ({
    id: c.id,
    offset: c.range.start.offset,
  }));

  const data: AddDisplayTermsData = {
    kind: 'ecl.refactoring.resolve',
    action: 'addDisplayTerms',
    uri: ctx.documentUri,
    expressionText: ctx.expressionText,
    expressionRange: ctx.expressionRange,
    bareConceptIds,
  };

  return {
    title: 'Add display terms',
    kind: 'refactor' as const,
    documentUri: ctx.documentUri,
    data,
  };
}

/**
 * Resolves an "Add display terms" code action by performing FHIR lookups
 * for each bare concept ID and inserting display terms into the expression.
 *
 * @param codeAction - The unresolved code action (with data attached)
 * @param terminologyService - FHIR terminology service for concept lookups
 * @returns The code action with an edit applied, or unchanged on failure
 */
export async function resolveAddDisplayTerms(
  codeAction: CoreCodeAction,
  terminologyService: ITerminologyService,
): Promise<CoreCodeAction> {
  const data = codeAction.data as AddDisplayTermsData | undefined;
  if (data?.action !== 'addDisplayTerms') {
    return codeAction;
  }

  try {
    // Look up all bare concepts in parallel
    const lookupResults = await Promise.all(
      data.bareConceptIds.map(async (entry) => {
        const info = await terminologyService.getConceptInfo(entry.id);
        return { ...entry, info };
      }),
    );

    // Filter to only concepts we got a term for
    const resolved = lookupResults.filter((r) => r.info !== null);
    if (resolved.length === 0) {
      return codeAction;
    }

    // Sort by offset descending so replacements don't shift earlier positions
    resolved.sort((a, b) => b.offset - a.offset);

    // Build the new expression text by inserting display terms
    let newText = data.expressionText;
    for (const entry of resolved) {
      const term = entry.info?.pt ?? entry.info?.fsn;
      if (!term) continue;

      // Find the concept ID at the expected offset and verify it's bare
      // (not already followed by optional whitespace and a pipe)
      const idStr = entry.id;
      const candidate = newText.substring(entry.offset, entry.offset + idStr.length);
      if (candidate !== idStr) continue;

      // Check that the ID is not already followed by a display term
      const afterId = newText.substring(entry.offset + idStr.length);
      if (/^\s*\|/.test(afterId)) continue;

      // Insert the display term after the concept ID
      newText =
        newText.substring(0, entry.offset + idStr.length) +
        ` |${term}|` +
        newText.substring(entry.offset + idStr.length);
    }

    // Only apply the edit if the text actually changed
    if (newText !== data.expressionText) {
      codeAction.edits = [coreReplace(data.expressionRange, newText)];
      codeAction.documentUri = data.uri;
    }
  } catch {
    // Graceful degradation — return the action unchanged if FHIR fails
  }

  return codeAction;
}
