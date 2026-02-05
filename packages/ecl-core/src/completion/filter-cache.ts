// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// FHIR-powered filter value completion cache
//
// Evaluates ECL constraints for filter keywords (typeId, dialectId, moduleId)
// against the terminology server and caches results with a 15-minute TTL.

import type { CoreCompletionItem, CoreCompletionItemKind } from '../types';
import type { ITerminologyService, EvaluationConcept } from '../terminology/types';

/** ECL constraints for filter keywords that support FHIR-powered completions. */
export const FILTER_ECL_CONSTRAINTS: Record<string, string> = {
  typeid: '< 900000000000446008',
  dialectid: '< 900000000000506000',
  moduleid: '< 900000000000443000',
};

/** Maximum number of concepts to fetch per ECL expansion. */
const EXPANSION_LIMIT = 500;

/** Cache TTL in milliseconds (15 minutes). */
const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  items: CoreCompletionItem[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Get FHIR-powered completion items for a filter keyword.
 *
 * Evaluates the ECL constraint for the keyword against the terminology server,
 * caches the result, and returns CompletionItems. Returns [] on FHIR errors.
 */
export async function getFhirFilterCompletions(
  keyword: string,
  terminologyService: ITerminologyService,
): Promise<CoreCompletionItem[]> {
  const key = keyword.toLowerCase();
  const ecl = FILTER_ECL_CONSTRAINTS[key];
  if (!ecl) return [];

  // Check cache
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.items;
  }

  try {
    const response = await terminologyService.evaluateEcl(ecl, EXPANSION_LIMIT);
    const items = response.concepts.map(
      (concept: EvaluationConcept, index: number): CoreCompletionItem => ({
        label: `${concept.code} |${concept.display}|`,
        kind: 'value' as CoreCompletionItemKind,
        detail: concept.display,
        sortText: `e-${(20 + index).toString().padStart(3, '0')}`,
      }),
    );

    cache.set(key, { items, timestamp: Date.now() });
    return items;
  } catch {
    // Graceful degradation — return empty on FHIR errors
    return [];
  }
}

/** Clear all cached filter completions (e.g. on edition change). */
export function clearFilterCache(): void {
  cache.clear();
}
