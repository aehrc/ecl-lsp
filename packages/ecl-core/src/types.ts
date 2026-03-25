// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Core types that replace LSP-specific types.
// The LSP server maps these to protocol types.

/** Position in a text document (0-based line and character). */
export interface CorePosition {
  line: number;
  character: number;
}

/** Range in a text document. */
export interface CoreRange {
  start: CorePosition;
  end: CorePosition;
}

/** A text edit to apply to a document. */
export interface CoreTextEdit {
  range: CoreRange;
  newText: string;
}

/** A text edit that inserts at a position (convenience). */
export function coreInsert(position: CorePosition, newText: string): CoreTextEdit {
  return { range: { start: position, end: position }, newText };
}

/** A text edit that replaces a range (convenience). */
export function coreReplace(range: CoreRange, newText: string): CoreTextEdit {
  return { range, newText };
}

/** A code action (refactoring or quick fix). */
export interface CoreCodeAction {
  title: string;
  kind: 'quickfix' | 'refactor';
  edits?: CoreTextEdit[];
  /** URI of the document these edits apply to. */
  documentUri?: string;
  /** Opaque data for deferred resolution (e.g., FHIR lookups). */
  data?: unknown;
}

/** Insert text format for completions. */
export type CoreInsertTextFormat = 'plainText' | 'snippet';

/** Completion item kind. */
export type CoreCompletionItemKind =
  | 'keyword'
  | 'operator'
  | 'snippet'
  | 'value'
  | 'concept'
  | 'property'
  | 'text'
  | 'function';

/** A completion item. */
export interface CoreCompletionItem {
  label: string;
  kind: CoreCompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: CoreInsertTextFormat;
  /** Text edit to apply instead of insertText. */
  textEdit?: CoreTextEdit;
  /** Sort order string. */
  sortText?: string;
  /** Filter text for matching. */
  filterText?: string;
  /** Command to execute after insertion. */
  command?: { command: string; title: string; arguments?: unknown[] };
}

/** Diagnostic severity levels. */
export type CoreDiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint';

/** A diagnostic (error, warning, etc.). */
export interface CoreDiagnostic {
  range: CoreRange;
  message: string;
  severity: CoreDiagnosticSeverity;
  source?: string;
}
