// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Builds replacement text for inactive concepts based on historical associations.

import type { HistoricalAssociation } from '../terminology/types';

export interface ReplacementResult {
  replacement: string;
  label: string;
}

/**
 * Build a replacement ECL fragment for an inactive concept based on a historical association.
 *
 * - SAME AS / REPLACED BY: direct 1:1 replacement
 * - POSSIBLY EQUIVALENT TO / ALTERNATIVE: parenthesized OR disjunction (or bare if single target)
 *
 * Display terms are included in the replacement when available.
 */
export function buildReplacementText(association: HistoricalAssociation): ReplacementResult {
  const targets = association.targets;
  const typeLabel = association.type.replace(/-/g, ' ');

  if (targets.length === 0) {
    return { replacement: '', label: `No targets for ${typeLabel}` };
  }

  if (association.type === 'same-as' || association.type === 'replaced-by') {
    const target = targets[0];
    const display = target.display ? ` |${target.display}|` : '';
    const replacement = target.code + display;
    return { replacement, label: `Replace with ${typeLabel}: ${replacement}` };
  }

  // POSSIBLY EQUIVALENT TO / ALTERNATIVE: OR disjunction
  if (targets.length === 1) {
    const target = targets[0];
    const display = target.display ? ` |${target.display}|` : '';
    const replacement = target.code + display;
    return { replacement, label: `Replace with ${typeLabel}: ${replacement}` };
  }

  const parts = targets.map((t) => {
    const display = t.display ? ` |${t.display}|` : '';
    return t.code + display;
  });
  const replacement = '(' + parts.join(' OR ') + ')';
  return { replacement, label: `Replace with ${typeLabel}: ${replacement}` };
}
