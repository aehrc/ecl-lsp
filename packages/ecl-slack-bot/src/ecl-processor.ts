// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import {
  parseECL,
  formatDocument,
  defaultFormattingOptions,
  extractConceptIds,
  refineParseError,
  validateSemantics,
} from 'ecl-core';
import type { ITerminologyService, ConceptInfo } from 'ecl-core';

// ── Types ───────────────────────────────────────────────────────────────

export interface Diagnostic {
  line: number;
  column: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface EvaluationResult {
  count: number;
  sample: string[];
}

export interface ProcessResult {
  formatted: string;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  evaluation?: EvaluationResult;
  edition: string;
}

export interface ParsedInput {
  ecl: string;
  evaluate: boolean;
  edition?: string;
  help?: boolean;
  error?: string;
}

// ── Flag parsing ────────────────────────────────────────────────────────

export function parseInput(raw: string): ParsedInput {
  const trimmed = raw.trim();

  if (!trimmed || trimmed.toLowerCase() === 'help') {
    return { ecl: '', evaluate: false, help: true };
  }

  let evaluate = false;
  let edition: string | undefined;
  let rest = trimmed;

  // Consume flags from the beginning.
  // Require word boundary after flag name to avoid prefix-matching
  // (e.g. --evaluate should not match the evaluate flag).
  const evalPattern = /^--eval(?:\s|$)/;
  const editionPattern = /^--edition(?:\s|$)/;
  while (rest.startsWith('--')) {
    if (evalPattern.test(rest)) {
      evaluate = true;
      rest = rest.slice('--eval'.length).trimStart();
    } else if (editionPattern.test(rest)) {
      rest = rest.slice('--edition'.length).trimStart();
      if (!rest || rest.startsWith('--')) {
        return { ecl: '', evaluate: false, error: '--edition requires a value (e.g. --edition au)' };
      }
      // Extract next word as edition value
      const spaceIdx = rest.search(/\s/);
      if (spaceIdx === -1) {
        // Edition value is the only remaining text — no ECL expression
        return { ecl: '', evaluate: false, error: 'No ECL expression provided after --edition' };
      }
      edition = rest.slice(0, spaceIdx);
      rest = rest.slice(spaceIdx).trimStart();
    } else {
      break; // Unknown flag — treat rest as ECL
    }
  }

  return { ecl: rest, evaluate, edition };
}

// ── Process pipeline ────────────────────────────────────────────────────

export async function processEcl(
  ecl: string,
  terminologyService: ITerminologyService,
  options?: { evaluate?: boolean; edition?: string; maxEvalResults?: number },
): Promise<ProcessResult> {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  let editionLabel = 'Server default';

  // Step 1: Parse
  const parseResult = parseECL(ecl);

  // Step 2: Refine syntax errors
  const lines = ecl.split('\n');
  // lineOffsets maps expression-local line indices to document line indices.
  // Since the bot input IS the full document, this is an identity mapping.
  const lineOffsets = lines.map((_line, i) => i);
  for (const err of parseResult.errors) {
    const ctx = {
      error: err,
      lines,
      docLineIndex: err.line - 1,
      lineOffsets,
      startLine: 0,
    };
    const refined = refineParseError(ctx);
    errors.push({
      line: refined.docLineIndex + 1,
      column: refined.startChar + 1,
      endColumn: refined.endChar + 1,
      message: refined.message,
      severity: 'error',
    });
  }

  // Step 3: Extract concepts
  const conceptIds = parseResult.ast ? extractConceptIds(parseResult.ast) : [];

  // Step 4: FHIR batch lookup (graceful on failure)
  let conceptMap = new Map<string, ConceptInfo | null>();
  try {
    if (conceptIds.length > 0) {
      conceptMap = await terminologyService.validateConcepts(conceptIds.map((c) => c.id));
    }
  } catch {
    warnings.push({
      line: 1,
      column: 1,
      endColumn: 1,
      message: 'Terminology server unavailable — concept validation and display terms skipped',
      severity: 'warning',
    });
  }

  // Step 5: Add display terms (inject FSN for ALL bare concept IDs)
  // Use deduplicate: false to get every occurrence, not just the first per ID.
  // Process in reverse offset order to preserve earlier positions when inserting.
  let withTerms = ecl;
  if (conceptMap.size > 0 && parseResult.ast) {
    const allRefs = extractConceptIds(parseResult.ast, { deduplicate: false });
    const bareRefs = allRefs
      .filter((ref) => !ref.term)
      .sort((a, b) => b.range.start.offset - a.range.start.offset);
    for (const ref of bareRefs) {
      const info = conceptMap.get(ref.id);
      if (info) {
        const startOffset = ref.range.start.offset;
        const endOffset = ref.range.end.offset;
        withTerms = withTerms.slice(0, startOffset) + `${ref.id} |${info.fsn}|` + withTerms.slice(endOffset);
      }
    }
  }

  // Step 6: Format
  const formatted = formatDocument(withTerms, defaultFormattingOptions);

  // Step 7: Concept warnings
  // AST Position.line is 1-indexed (from ANTLR), column is 0-indexed
  for (const ref of conceptIds) {
    const info = conceptMap.get(ref.id);
    if (info && !info.active) {
      warnings.push({
        line: ref.range.start.line,
        column: ref.range.start.column + 1,
        endColumn: ref.range.end.column + 1,
        message: `${ref.id}${ref.term ? ` |${ref.term}|` : ''} — Inactive concept`,
        severity: 'warning',
      });
    } else if (conceptMap.has(ref.id) && info === null) {
      warnings.push({
        line: ref.range.start.line,
        column: ref.range.start.column + 1,
        endColumn: ref.range.end.column + 1,
        message: `${ref.id}${ref.term ? ` |${ref.term}|` : ''} — Unknown concept`,
        severity: 'warning',
      });
    }
  }

  // Step 8: Semantic validation (graceful on failure)
  if (parseResult.ast) {
    try {
      const semanticDiags = await validateSemantics(parseResult.ast, ecl, terminologyService);
      for (const diag of semanticDiags) {
        warnings.push({
          line: diag.range.start.line,
          column: diag.range.start.column + 1,
          endColumn: diag.range.end.column + 1,
          message: diag.message,
          severity: 'warning',
        });
      }
    } catch {
      // Semantic validation failure is non-fatal
    }
  }

  // Step 9: Evaluate (opt-in)
  let evaluation: EvaluationResult | undefined;
  if (options?.evaluate && parseResult.errors.length === 0) {
    try {
      const evalResponse = await terminologyService.evaluateEcl(ecl);
      evaluation = {
        count: evalResponse.total,
        sample: evalResponse.concepts.slice(0, options?.maxEvalResults ?? 5).map((c) => `${c.code} |${c.display}|`),
      };
    } catch {
      warnings.push({
        line: 1,
        column: 1,
        endColumn: 1,
        message: 'Evaluation failed — terminology server error or timeout',
        severity: 'warning',
      });
    }
  }

  // Edition label
  if (options?.edition) {
    editionLabel = options.edition;
  }

  return { formatted, errors, warnings, evaluation, edition: editionLabel };
}
