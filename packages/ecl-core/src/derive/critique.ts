// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Code list critique (issue #149): structural checks that fall out of deriving
// ECL from a list, after the checks of the NHS ValueSet Management Tool. This
// module holds the local parts: CHK12 (a list that holds most, but not all,
// of `<< X`; deriveEcl counts what is missing on the server) and CHK13
// (different concepts with the same term).

import { byId } from './set-queries';
import type { TaxonomyGraph } from './taxonomy-graph';

/** A grouper the list nearly fills, counted on the graph. */
export interface LocalNearMiss {
  conceptId: string;
  /** Concepts in `<< conceptId`. */
  descendants: number;
  /** Members in `<< conceptId`. */
  listed: number;
}

/**
 * Concepts X whose `<< X` has at least `minSize` concepts, of which the list
 * holds at least `share` but not all; largest first, nested ones included.
 * Only concepts with their descendants loaded are considered.
 */
export function nearMissCandidates(g: TaxonomyGraph, share: number, minSize: number): LocalNearMiss[] {
  const found: LocalNearMiss[] = [];
  for (const conceptId of g.ancestors()) {
    if (!g.hasDescendants(conceptId)) continue;
    const descendants = g.descendants(conceptId).length;
    const listed = g.truePos(conceptId);
    if (descendants >= minSize && listed < descendants && listed / descendants >= share) {
      found.push({ conceptId, descendants, listed });
    }
  }
  return found.sort((a, b) => b.descendants - a.descendants || byId(a.conceptId, b.conceptId));
}

/**
 * The first `max` of `items` (largest first) that are not inside one already
 * taken: its missing members are among that one's.
 */
export function outermost<T extends { conceptId: string }>(g: TaxonomyGraph, items: T[], max: number): T[] {
  const kept: T[] = [];
  const covered = new Set<string>();
  for (const n of items) {
    if (kept.length >= max) break;
    if (covered.has(n.conceptId)) continue;
    kept.push(n);
    for (const d of g.descendants(n.conceptId)) covered.add(d);
  }
  return kept;
}

/** The near misses on the graph alone: {@link nearMissCandidates}, outermost first, at most `max`. */
export function findNearMisses(g: TaxonomyGraph, share: number, minSize: number, max: number): LocalNearMiss[] {
  return outermost(g, nearMissCandidates(g, share, minSize), max);
}

/** Different concepts of the list with the same preferred term (CHK13). */
export interface LocalDuplicateTerm {
  /** The term as the lowest id has it. */
  term: string;
  /** Sorted. */
  conceptIds: string[];
}

/**
 * Groups of two or more concepts whose terms match, ordered by term. Runs of
 * whitespace and the case of the first letter are ignored, as SNOMED CT
 * terms are mostly case-insensitive only there. Concepts without a term are
 * left out.
 */
export function findDuplicateTerms(concepts: { code: string; display: string }[]): LocalDuplicateTerm[] {
  const groups = new Map<string, Map<string, string>>();
  for (const { code, display } of concepts) {
    const term = display.trim().replaceAll(/\s+/g, ' ');
    if (!term) continue;
    const key = term.charAt(0).toLowerCase() + term.slice(1);
    const group = groups.get(key) ?? new Map<string, string>();
    group.set(code, display.trim());
    groups.set(key, group);
  }
  return [...groups]
    .filter(([, g]) => g.size > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => {
      const conceptIds = [...g.keys()].sort(byId);
      return { term: g.get(conceptIds[0]) ?? '', conceptIds };
    });
}
