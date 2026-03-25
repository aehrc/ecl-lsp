// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

/**
 * Knowledge module types for structured ECL reference documentation.
 */

/** Category of knowledge content */
export type KnowledgeCategory = 'operator' | 'refinement' | 'filter' | 'pattern' | 'grammar' | 'history';

/** A single knowledge article (e.g., one operator, one pattern) */
export interface KnowledgeArticle {
  /** Unique identifier (e.g., 'op:descendantOf', 'pattern:disorders-by-site') */
  id: string;
  /** Category for grouping */
  category: KnowledgeCategory;
  /** Short human-readable name */
  name: string;
  /** One-line description */
  summary: string;
  /** Full Markdown documentation */
  content: string;
  /** ECL example expressions */
  examples: string[];
  /** Related article IDs */
  related: string[];
}

/** A knowledge guide — a curated collection of articles on a topic */
export interface KnowledgeGuide {
  /** URI identifier (e.g., 'ecl://guide/operators') */
  uri: string;
  /** Display name */
  name: string;
  /** Brief description */
  description: string;
  /** Full Markdown content */
  content: string;
}

/** Operator hover documentation — concise markdown for IDE hover tooltips */
export interface OperatorHoverDoc {
  /** The operator symbol or keyword (e.g., '<', '<<', 'AND') */
  operator: string;
  /** Markdown hover content */
  markdown: string;
}
