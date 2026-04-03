// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import {
  parseECL,
  formatDocument,
  defaultFormattingOptions,
  extractConceptIds,
  refineParseError,
  validateSemantics,
} from '@aehrc/ecl-core';
import type { ITerminologyService, ConceptInfo, HistoricalAssociation } from '@aehrc/ecl-core';

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
  concepts: { code: string; display: string }[];
}

export interface ProcessResult {
  formatted: string;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  evaluation?: EvaluationResult;
  edition: string;
  /** Raw resolved SNOMED CT version URI for building Shrimp links. */
  editionUri?: string;
  /** FHIR server base URL for building Shrimp links. */
  fhirServerUrl?: string;
  /** ECL with inactive concepts replaced by active equivalents, if any were found. */
  replacement?: { ecl: string; evaluation?: EvaluationResult };
}

export interface ParsedInput {
  ecl: string;
  evaluate: boolean;
  edition?: string;
  noTerms?: boolean;
  help?: boolean;
  error?: string;
}

// ── Flag parsing ────────────────────────────────────────────────────────

export function parseInput(raw: string): ParsedInput {
  const trimmed = raw.trim();

  if (!trimmed || trimmed.toLowerCase() === 'help') {
    return { ecl: '', evaluate: false, help: true };
  }

  let runEval = false;
  let noTerms = false;
  let edition: string | undefined;
  let rest = trimmed;

  // Consume flags from the beginning.
  // Require word boundary after flag name to avoid prefix-matching.
  const runEvalPattern = /^--eval(?:\s|$)/;
  const noTermsPattern = /^--no-terms(?:\s|$)/;
  const editionPattern = /^--edition(?:\s|$)/;
  while (rest.startsWith('--')) {
    if (runEvalPattern.test(rest)) {
      runEval = true;
      rest = rest.slice('--eval'.length).trimStart();
    } else if (noTermsPattern.test(rest)) {
      noTerms = true;
      rest = rest.slice('--no-terms'.length).trimStart();
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

  // Strip backticks the user may have wrapped around the ECL expression
  rest = stripSurroundingBackticks(rest);

  return { ecl: rest, evaluate: runEval, edition, noTerms };
}

/** Strip surrounding ``` or ` from text (users often wrap ECL in code formatting). */
function stripSurroundingBackticks(text: string): string {
  let s = text.trim();
  if (s.startsWith('```') && s.endsWith('```') && s.length > 6) {
    s = s.slice(3, -3).trim();
  }
  if (s.startsWith('`') && s.endsWith('`') && s.length > 2) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

// ── Process pipeline ────────────────────────────────────────────────────

// eslint-disable-next-line sonarjs/cognitive-complexity -- 9-step pipeline with graceful error handling at each step
export async function processEcl(
  ecl: string,
  terminologyService: ITerminologyService,
  options?: { evaluate?: boolean; edition?: string; maxEvalResults?: number; noTerms?: boolean },
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
  // Skipped when --no-terms flag is set.
  // Use deduplicate: false to get every occurrence, not just the first per ID.
  // Process in reverse offset order to preserve earlier positions when inserting.
  let withTerms = ecl;
  if (conceptMap.size > 0 && parseResult.ast && !options?.noTerms) {
    const allRefs = extractConceptIds(parseResult.ast, { deduplicate: false });
    const bareRefs = allRefs.filter((ref) => !ref.term).sort((a, b) => b.range.start.offset - a.range.start.offset);
    for (const ref of bareRefs) {
      const info = conceptMap.get(ref.id);
      if (info) {
        const startOffset = ref.range.start.offset;
        const endOffset = ref.range.end.offset;
        withTerms = withTerms.slice(0, startOffset) + `${ref.id} |${info.fsn}|` + withTerms.slice(endOffset);
      }
    }
  }

  // Step 6: Format (alignTerms off — pipe alignment adds noise in Slack)
  const formatted = formatDocument(withTerms, {
    ...defaultFormattingOptions,
    alignTerms: false,
    removeRedundantParentheses: true,
  });

  // Step 7: Concept warnings
  // AST Position.line is 1-indexed (from ANTLR), column is 0-indexed
  for (const ref of conceptIds) {
    const info = conceptMap.get(ref.id);
    if (info && !info.active) {
      warnings.push({
        line: ref.range.start.line,
        column: ref.range.start.column + 1,
        endColumn: ref.range.end.column + 1,
        message: `${ref.id}${ref.term ? ' |' + ref.term + '|' : ''} — Inactive concept`,
        severity: 'warning',
      });
    } else if (conceptMap.has(ref.id) && info === null) {
      warnings.push({
        line: ref.range.start.line,
        column: ref.range.start.column + 1,
        endColumn: ref.range.end.column + 1,
        message: `${ref.id}${ref.term ? ' |' + ref.term + '|' : ''} — Unknown concept`,
        severity: 'warning',
      });
    }
  }

  // Step 7b: Build replacement ECL for inactive concepts
  let replacement: ProcessResult['replacement'];
  const inactiveIds = conceptIds.filter((ref) => {
    const info = conceptMap.get(ref.id);
    return info && !info.active;
  });
  if (inactiveIds.length > 0 && terminologyService.getHistoricalAssociations) {
    const replacementEcl = await buildReplacementEcl(ecl, inactiveIds, terminologyService);
    if (replacementEcl) {
      let evalResult: EvaluationResult | undefined;
      try {
        const limit = options?.maxEvalResults ?? 5;
        const evalResponse = await terminologyService.evaluateEcl(replacementEcl, limit);
        evalResult = {
          count: evalResponse.total,
          concepts: evalResponse.concepts.slice(0, limit).map((c) => ({ code: c.code, display: c.display })),
        };
      } catch {
        // Evaluation failure is non-fatal
      }
      replacement = { ecl: replacementEcl, evaluation: evalResult };
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

  // Step 9: Evaluate (always for valid expressions)
  let evaluation: EvaluationResult | undefined;
  if (parseResult.errors.length === 0) {
    try {
      const limit = options?.maxEvalResults ?? 5;
      const evalResponse = await terminologyService.evaluateEcl(ecl, limit);
      evaluation = {
        count: evalResponse.total,
        concepts: evalResponse.concepts.slice(0, limit).map((c) => ({
          code: c.code,
          display: c.display,
        })),
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

  return { formatted, errors, warnings, evaluation, edition: editionLabel, replacement };
}

// ── Inactive concept replacement ───────────────────────────────────────

/**
 * Build replacement ECL by substituting each inactive concept with the union
 * of all its historical association targets. Returns formatted replacement ECL,
 * or undefined if no replacements were found.
 */
async function buildReplacementEcl(
  ecl: string,
  inactiveRefs: { id: string; range: { start: { offset: number }; end: { offset: number } }; term?: string }[],
  terminologyService: ITerminologyService,
): Promise<string | undefined> {
  // Fetch associations for all inactive concepts in parallel
  const associationMap = new Map<string, HistoricalAssociation[]>();
  await Promise.all(
    // Deduplicate by concept ID — only look up each once
    [...new Set(inactiveRefs.map((r) => r.id))].map(async (id) => {
      try {
        const associations = await terminologyService.getHistoricalAssociations!(id);
        if (associations.length > 0) {
          associationMap.set(id, associations);
        }
      } catch {
        // Non-fatal
      }
    }),
  );

  if (associationMap.size === 0) return undefined;

  // Re-parse to get all occurrences (not deduplicated) with correct offsets
  const parseResult = parseECL(ecl);
  if (!parseResult.ast) return undefined;
  const allRefs = extractConceptIds(parseResult.ast, { deduplicate: false });

  // Build replacement text by substituting in reverse offset order
  let replaced = ecl;
  const refsToReplace = allRefs
    .filter((ref) => associationMap.has(ref.id))
    .sort((a, b) => b.range.start.offset - a.range.start.offset);

  for (const ref of refsToReplace) {
    const associations = associationMap.get(ref.id);
    if (!associations) continue;

    // Collect ALL targets across all association types into one OR disjunction
    const allTargets = associations.flatMap((a) => a.targets);
    if (allTargets.length === 0) continue;

    let replacement: string;
    if (allTargets.length === 1) {
      const t = allTargets[0];
      replacement = t.display ? `${t.code} |${t.display}|` : t.code;
    } else {
      const parts = allTargets.map((t) => (t.display ? `${t.code} |${t.display}|` : t.code));
      replacement = '(' + parts.join(' OR ') + ')';
    }

    replaced = replaced.slice(0, ref.range.start.offset) + replacement + replaced.slice(ref.range.end.offset);
  }

  if (replaced === ecl) return undefined;

  // Format the replacement ECL
  return formatDocument(replaced, { ...defaultFormattingOptions, alignTerms: false, removeRedundantParentheses: true });
}
