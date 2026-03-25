// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// ECL Core Library — public API surface

// Core types
export * from './types';
export { positionAt, offsetAt, getText } from './text-utils';

// Parser
export { parseECL } from './parser';
export type { ParseResult, ParseError } from './parser';
export type {
  ExpressionNode,
  CompoundExpressionNode,
  RefinedExpressionNode,
  SubExpressionNode,
  AttributeNode,
  FilterConstraintNode,
  HistorySupplementNode,
} from './parser/ast';
export { extractConceptIds } from './parser/concept-extractor';
export type { ConceptReference } from './parser/concept-extractor';
export { groupIntoExpressions } from './parser/expression-grouper';
export { checkMixedRefinementOperators } from './parser/refinement-check';
export { analyzeExpression } from './parser/error-analysis';
export {
  isConceptPositionValid,
  getConceptSearchPriority,
  getValidOperatorsAtPosition,
} from './parser/position-detector';

// Terminology
export { FhirTerminologyService } from './terminology/fhir-service';
export type { FhirTerminologyServiceOptions } from './terminology/fhir-service';
export type { ITerminologyService, ConceptInfo, EvaluationResponse } from './terminology/types';
export { isValidSnomedId, isValidConceptId, isValidDescriptionId } from './terminology/verhoeff';

// Validation
export { refineParseError } from './validation/error-refinement';

// Semantic
export { validateSemantics } from './semantic/validator';
export type { SemanticDiagnostic } from './semantic/validator';
export { extractText, extractRefinementInfo, extractCompoundOperands } from './semantic/ecl-text';

// Formatter
export { formatDocument } from './formatter/formatter';
export type { FormattingOptions } from './formatter/options';
export { defaultFormattingOptions } from './formatter/options';
export { expandToExpressionBoundaries, getExpressionsInRange, formatRangeExpressions } from './formatter/range';
export { validateIndentSize, validateIndentStyle, validateMaxLineLength, validateBoolean } from './formatter/config';

// Refactoring
export { getRefactoringActions, REFACTORING_RESOLVE_KIND } from './refactoring';
export type { RefactoringContext } from './refactoring';
export { resolveAddDisplayTerms } from './refactoring/add-display-terms';
export { resolveUnifiedSimplify } from './refactoring/simplify-expression';

// Completion
export { getCompletionItems, getCompletionItemsWithSearch } from './completion/provider';
export { detectCursorContext, detectFilterContext } from './completion/context-detector';
export type { CursorContext, FilterSubContext, FilterType } from './completion/context-detector';
export { eclSnippetCompletions } from './completion/snippets';
export { getFhirFilterCompletions, clearFilterCache } from './completion/filter-cache';

// Semantic Tokens
export { computeSemanticTokens, eclTokenTypes, eclTokenModifiers } from './semantic-tokens';
export type { SemanticToken } from './semantic-tokens';

// Knowledge
export {
  allArticles,
  getArticle,
  getArticlesByCategory,
  operatorHoverDocs,
  getOperatorHoverDoc,
  knowledgeGuides,
  getGuide,
} from './knowledge';
export type { KnowledgeArticle, KnowledgeGuide, KnowledgeCategory, OperatorHoverDoc } from './knowledge';
