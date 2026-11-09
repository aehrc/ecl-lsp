// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Code list critique (issue #149): structural checks that fall out of deriving
// ECL from a list, after the checks of the NHS ValueSet Management Tool. This
// module holds the local part of CHK12 (a list that holds most, but not all,
// of `<< X`); deriveEcl counts what is missing on the server.

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
 * holds at least `share` but not all; largest first, at most `max`. Only
 * concepts with their descendants loaded are considered, and one inside an
 * already reported concept is left out (its missing members are among that
 * concept's).
 */
export function findNearMisses(g: TaxonomyGraph, share: number, minSize: number, max: number): LocalNearMiss[] {
  const found: LocalNearMiss[] = [];
  for (const conceptId of g.ancestors()) {
    if (!g.hasDescendants(conceptId)) continue;
    const descendants = g.descendants(conceptId).length;
    const listed = g.truePos(conceptId);
    if (descendants >= minSize && listed < descendants && listed / descendants >= share) {
      found.push({ conceptId, descendants, listed });
    }
  }
  found.sort((a, b) => b.descendants - a.descendants || byId(a.conceptId, b.conceptId));

  const kept: LocalNearMiss[] = [];
  const covered = new Set<string>();
  for (const n of found) {
    if (kept.length >= max) break;
    if (covered.has(n.conceptId)) continue;
    kept.push(n);
    for (const d of g.descendants(n.conceptId)) covered.add(d);
  }
  return kept;
}
