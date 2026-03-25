// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

/**
 * ECL Knowledge Module — structured reference documentation for ECL 2.2.
 *
 * Provides a unified source of truth for operator docs, refinement guides,
 * filter syntax, common patterns, grammar reference, and history supplements.
 * Consumed by the LSP server (hover docs) and tests.
 */

export type { KnowledgeArticle, KnowledgeGuide, KnowledgeCategory, OperatorHoverDoc } from './types';

import type { KnowledgeArticle, KnowledgeGuide } from './types';
import { operatorArticles, operatorHoverDocs } from './operators';
import { refinementArticles } from './refinements';
import { filterArticles } from './filters';
import { patternArticles } from './patterns';
import { grammarArticles, historyArticles } from './grammar';

// ── All articles ─────────────────────────────────────────────────────────

/** All knowledge articles across all categories */
export const allArticles: readonly KnowledgeArticle[] = [
  ...operatorArticles,
  ...refinementArticles,
  ...filterArticles,
  ...patternArticles,
  ...grammarArticles,
  ...historyArticles,
];

// ── Article lookups ──────────────────────────────────────────────────────

/** Look up an article by its ID */
export function getArticle(id: string): KnowledgeArticle | undefined {
  return allArticles.find((a) => a.id === id);
}

/** Get all articles in a category */
export function getArticlesByCategory(category: string): KnowledgeArticle[] {
  return allArticles.filter((a) => a.category === category);
}

// ── Hover docs ───────────────────────────────────────────────────────────

/** All operator hover docs (for IDE tooltips) */
export { operatorHoverDocs } from './operators';

const hoverDocMap = new Map<string, string>();
for (const doc of operatorHoverDocs) {
  hoverDocMap.set(doc.operator, doc.markdown);
  // Also index uppercase keyword operators by lowercase
  if (doc.operator === doc.operator.toUpperCase() && doc.operator.length > 1) {
    hoverDocMap.set(doc.operator.toLowerCase(), doc.markdown);
  }
}

/** Get hover markdown for an operator symbol or keyword (case-insensitive for keywords) */
export function getOperatorHoverDoc(operator: string): string | undefined {
  return hoverDocMap.get(operator) ?? hoverDocMap.get(operator.toUpperCase());
}

// ── Knowledge guides ─────────────────────────────────────────────────────

function buildGuideContent(title: string, articles: KnowledgeArticle[]): string {
  const sections = articles.map((a) => {
    const header = `## ${a.name}`;
    return `${header}\n${a.content}`;
  });
  return `# ${title}\n\n${sections.join('\n\n')}`;
}

/** Pre-built knowledge guides, keyed by URI */
export const knowledgeGuides: readonly KnowledgeGuide[] = [
  {
    uri: 'ecl://guide/operators',
    name: 'ECL Operators Guide',
    description: 'All ECL constraint operators with meanings, syntax, and examples',
    content: buildGuideContent('ECL Constraint Operators', operatorArticles),
  },
  {
    uri: 'ecl://guide/refinements',
    name: 'ECL Refinements Guide',
    description: 'Attribute refinement syntax, groups, cardinality, and common attributes',
    content: buildGuideContent('ECL Refinements', refinementArticles),
  },
  {
    uri: 'ecl://guide/filters',
    name: 'ECL Filters Guide',
    description: 'Description, concept, and member filters in ECL 2.2',
    content: buildGuideContent('ECL Filters', filterArticles),
  },
  {
    uri: 'ecl://guide/patterns',
    name: 'ECL Patterns Guide',
    description: 'Common ECL patterns for typical clinical terminology tasks',
    content: buildGuideContent('Common ECL Patterns', patternArticles),
  },
  {
    uri: 'ecl://reference/grammar',
    name: 'ECL Grammar Reference',
    description: 'ECL 2.2 grammar summary',
    content: buildGuideContent('ECL 2.2 Grammar Summary', grammarArticles),
  },
  {
    uri: 'ecl://guide/history-supplements',
    name: 'ECL History Supplements Guide',
    description: 'History supplement profiles and usage for tracking concept changes',
    content: buildGuideContent('ECL History Supplements', historyArticles),
  },
];

/** Look up a knowledge guide by URI */
export function getGuide(uri: string): KnowledgeGuide | undefined {
  return knowledgeGuides.find((g) => g.uri === uri);
}
