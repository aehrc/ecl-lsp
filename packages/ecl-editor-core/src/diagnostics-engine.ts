// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import {
  parseECL,
  groupIntoExpressions,
  extractConceptIds,
  refineParseError,
  isValidSnomedId,
  isValidConceptId,
  isValidDescriptionId,
  validateSemantics,
  FhirTerminologyService,
} from '@aehrc/ecl-core';
import type { CoreDiagnostic, ITerminologyService } from '@aehrc/ecl-core';
import type { EclEditorConfig } from './types';

/**
 * Two-phase diagnostics engine for ECL text.
 *
 * Phase 1 (immediate): Syntax parsing, SCTID format validation.
 * Phase 2 (debounced): FHIR concept validation + semantic analysis.
 */
export class DiagnosticsEngine {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number;
  private semanticValidation: boolean;
  private terminologyService: ITerminologyService | null;
  private readonly onDiagnostics: (diagnostics: CoreDiagnostic[]) => void;

  constructor(config: EclEditorConfig, onDiagnostics: (diagnostics: CoreDiagnostic[]) => void) {
    this.onDiagnostics = onDiagnostics;
    this.semanticValidation = config.semanticValidation !== false;
    this.debounceMs = config.semanticDebounceMs ?? 500;
    this.terminologyService = config.terminologyService ?? this.createTerminologyService(config);
  }

  private createTerminologyService(config: EclEditorConfig): ITerminologyService | null {
    const url = config.corsProxy
      ? `${config.corsProxy}${config.fhirServerUrl ?? 'https://tx.ontoserver.csiro.au/fhir'}`
      : config.fhirServerUrl;

    if (!url) return null;

    return new FhirTerminologyService({
      baseUrl: url,
      snomedVersion: config.snomedVersion,
      onResolvedVersion: config.onResolvedSnomedVersion,
    });
  }

  /** Update configuration (e.g. switch SNOMED version, toggle semantic validation). */
  updateConfig(config: Partial<EclEditorConfig>): void {
    if (config.semanticValidation !== undefined) {
      this.semanticValidation = config.semanticValidation;
    }
    if (config.semanticDebounceMs !== undefined) {
      this.debounceMs = config.semanticDebounceMs;
    }
    if (config.terminologyService !== undefined) {
      this.terminologyService = config.terminologyService;
    } else if (
      config.fhirServerUrl !== undefined ||
      config.snomedVersion !== undefined ||
      config.corsProxy !== undefined
    ) {
      this.terminologyService = this.createTerminologyService({
        fhirServerUrl: config.fhirServerUrl,
        snomedVersion: config.snomedVersion,
        corsProxy: config.corsProxy,
        onResolvedSnomedVersion: config.onResolvedSnomedVersion,
      });
    }
  }

  /** Run diagnostics on the given text. Immediate syntax + debounced semantic. */
  update(text: string): void {
    // Phase 1: Immediate syntax diagnostics
    const { diagnostics, conceptValidationTasks, semanticValidationTasks } = this.collectSyntaxDiagnostics(text);

    this.onDiagnostics(diagnostics);

    // Phase 2: Debounced semantic diagnostics
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (
      this.semanticValidation &&
      this.terminologyService &&
      (conceptValidationTasks.length > 0 || semanticValidationTasks.length > 0)
    ) {
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        void this.runSemanticValidation(diagnostics, conceptValidationTasks, semanticValidationTasks);
      }, this.debounceMs);
    }
  }

  /** Clean up timers. */
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  private collectSyntaxDiagnostics(text: string) {
    const diagnostics: CoreDiagnostic[] = [];
    const expressions = groupIntoExpressions(text);
    const lines = text.split('\n');

    // Check for non-standard // comments
    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) {
        const commentStart = line.indexOf('//');
        diagnostics.push({
          severity: 'warning',
          range: {
            start: { line: lineIndex, character: commentStart },
            end: { line: lineIndex, character: commentStart + 2 },
          },
          message: 'Line comments (//) are not part of the ECL 2.2 standard. Use block comments /* ... */ instead.',
          source: 'ecl',
        });
      }
    });

    // Validate description IDs inside {{ D ... }} filter blocks
    const descFilterIdPattern = /\{\{\s*[Dd]\s[^}]*\bid\s*=\s*(\d{6,18})\b/g;
    let descIdMatch;
    while ((descIdMatch = descFilterIdPattern.exec(text)) !== null) {
      const sctid = descIdMatch[1];
      if (!isValidDescriptionId(sctid)) {
        const matchOffset = descIdMatch.index + descIdMatch[0].length - sctid.length;
        let charCount = 0;
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const lineEnd = charCount + lines[lineIdx].length + 1;
          if (matchOffset >= charCount && matchOffset < lineEnd) {
            const startChar = matchOffset - charCount;
            diagnostics.push({
              severity: 'error',
              range: {
                start: { line: lineIdx, character: startChar },
                end: { line: lineIdx, character: startChar + sctid.length },
              },
              message: `Invalid description ID: ${sctid} is not a SNOMED CT description identifier (expected partition 01 or 11).`,
              source: 'ecl',
            });
            break;
          }
          charCount = lineEnd;
        }
      }
    }

    // Collect concept/semantic tasks while parsing
    interface ConceptTask {
      expr: ReturnType<typeof groupIntoExpressions>[0];
      concepts: ReturnType<typeof extractConceptIds>;
      lines: string[];
    }
    interface SemanticTask {
      ast: NonNullable<ReturnType<typeof parseECL>['ast']>;
      sourceText: string;
      expr: ReturnType<typeof groupIntoExpressions>[0];
    }

    const conceptValidationTasks: ConceptTask[] = [];
    const semanticValidationTasks: SemanticTask[] = [];

    for (const expr of expressions) {
      const result = parseECL(expr.text);
      const hasErrors = result.errors.length > 0;

      result.errors.forEach((error) => {
        const exprLineIndex = Math.max(0, error.line - 1);
        const docLineIndex = expr.lineOffsets[exprLineIndex] ?? expr.startLine;

        const refined = refineParseError({
          error,
          lines,
          docLineIndex,
          lineOffsets: expr.lineOffsets,
          startLine: expr.startLine,
        });

        diagnostics.push({
          severity: 'error',
          range: {
            start: { line: refined.docLineIndex, character: refined.startChar },
            end: { line: refined.docLineIndex, character: refined.endChar },
          },
          message: refined.message,
          source: 'ecl',
        });
      });

      for (const warning of result.warnings) {
        const warnExprLine = Math.max(0, warning.line - 1);
        const warnDocLine = expr.lineOffsets[warnExprLine] ?? expr.startLine;

        diagnostics.push({
          severity: 'warning',
          range: {
            start: { line: warnDocLine, character: warning.column },
            end: { line: warnDocLine, character: warning.column + warning.conflictOp.length },
          },
          message: warning.message,
          source: 'ecl',
        });
      }

      if (result.ast && !hasErrors) {
        const concepts = extractConceptIds(result.ast);
        if (concepts.length > 0) {
          conceptValidationTasks.push({ expr, concepts, lines });
        }
        if (this.semanticValidation) {
          semanticValidationTasks.push({ ast: result.ast, sourceText: expr.text, expr });
        }
      }
    }

    // Validate concept ID format (Verhoeff + partition check)
    for (const task of conceptValidationTasks) {
      task.concepts = task.concepts.filter((concept) => {
        if (!isValidSnomedId(concept.id)) {
          const conceptExprLine = Math.max(0, (concept.range.start.line || 1) - 1);
          const conceptDocLine = task.expr.lineOffsets[conceptExprLine] ?? task.expr.startLine;
          const docLine = task.lines[conceptDocLine] || '';
          const conceptIdx = docLine.indexOf(concept.id);
          const startChar = conceptIdx >= 0 ? conceptIdx : concept.range.start.column;
          const endChar = conceptIdx >= 0 ? conceptIdx + concept.id.length : startChar + concept.id.length;

          diagnostics.push({
            severity: 'error',
            range: {
              start: { line: conceptDocLine, character: startChar },
              end: { line: conceptDocLine, character: endChar },
            },
            message: `Invalid SNOMED CT identifier: ${concept.id} has an invalid check digit or format.`,
            source: 'ecl',
          });
          return false;
        }

        if (!isValidConceptId(concept.id)) {
          const conceptExprLine = Math.max(0, (concept.range.start.line || 1) - 1);
          const conceptDocLine = task.expr.lineOffsets[conceptExprLine] ?? task.expr.startLine;
          const docLine = task.lines[conceptDocLine] || '';
          const conceptIdx = docLine.indexOf(concept.id);
          const startChar = conceptIdx >= 0 ? conceptIdx : concept.range.start.column;
          const endChar = conceptIdx >= 0 ? conceptIdx + concept.id.length : startChar + concept.id.length;
          const partitionId = concept.id.substring(concept.id.length - 3, concept.id.length - 1);

          diagnostics.push({
            severity: 'error',
            range: {
              start: { line: conceptDocLine, character: startChar },
              end: { line: conceptDocLine, character: endChar },
            },
            message: `Invalid concept ID: ${concept.id} is not a SNOMED CT concept identifier (expected partition 00 or 10, found ${partitionId}).`,
            source: 'ecl',
          });
          return false;
        }

        return true;
      });
    }

    return { diagnostics, conceptValidationTasks, semanticValidationTasks };
  }

  private async runSemanticValidation(
    baseDiagnostics: CoreDiagnostic[],
    conceptValidationTasks: {
      expr: ReturnType<typeof groupIntoExpressions>[0];
      concepts: ReturnType<typeof extractConceptIds>;
      lines: string[];
    }[],
    semanticValidationTasks: {
      ast: NonNullable<ReturnType<typeof parseECL>['ast']>;
      sourceText: string;
      expr: ReturnType<typeof groupIntoExpressions>[0];
    }[],
  ): Promise<void> {
    const diagnostics = [...baseDiagnostics];
    const service = this.terminologyService;
    if (!service) return;

    // Validate concepts across expressions
    await Promise.all(
      conceptValidationTasks.map(async ({ expr, concepts, lines: docLines }) => {
        try {
          const conceptIds = concepts.map((c) => c.id);
          const validationResults = await service.validateConcepts(conceptIds);

          for (const concept of concepts) {
            const info = validationResults.get(concept.id) ?? null;
            const conceptExprLine = Math.max(0, (concept.range.start.line || 1) - 1);
            const conceptDocLine = expr.lineOffsets[conceptExprLine] ?? expr.startLine;
            const docLine = docLines[conceptDocLine] || '';
            const conceptIdx = docLine.indexOf(concept.id);
            const startChar = conceptIdx >= 0 ? conceptIdx : concept.range.start.column;
            const endChar = conceptIdx >= 0 ? conceptIdx + concept.id.length : startChar + concept.id.length;

            if (info === null) {
              diagnostics.push({
                severity: 'warning',
                range: {
                  start: { line: conceptDocLine, character: startChar },
                  end: { line: conceptDocLine, character: endChar },
                },
                message: `Unknown concept ${concept.id} — not found on terminology server.`,
                source: 'ecl',
              });
            } else if (!info.active) {
              const name = info.pt || info.fsn;
              const nameLabel = name ? ` |${name}|` : '';
              diagnostics.push({
                severity: 'warning',
                range: {
                  start: { line: conceptDocLine, character: startChar },
                  end: { line: conceptDocLine, character: endChar },
                },
                message: `Inactive concept ${concept.id}${nameLabel} — consider using an active replacement.`,
                source: 'ecl',
              });
            }
          }
        } catch {
          // Silently degrade — FHIR server unreachable
        }
      }),
    );

    // Run semantic validation
    if (semanticValidationTasks.length > 0) {
      const semanticResults = await Promise.all(
        semanticValidationTasks.map(async ({ ast, sourceText }) => {
          try {
            return await validateSemantics(ast, sourceText, service);
          } catch {
            return [];
          }
        }),
      );

      for (let i = 0; i < semanticResults.length; i++) {
        const semDiags = semanticResults[i];
        const expr = semanticValidationTasks[i].expr;

        for (const sd of semDiags) {
          const exprLine = Math.max(0, sd.range.start.line - 1);
          const docStartLine = expr.lineOffsets[exprLine] ?? expr.startLine;
          const exprEndLine = Math.max(0, sd.range.end.line - 1);
          const docEndLine = expr.lineOffsets[exprEndLine] ?? expr.startLine;

          diagnostics.push({
            severity: 'warning',
            range: {
              start: { line: docStartLine, character: sd.range.start.column },
              end: { line: docEndLine, character: sd.range.end.column },
            },
            message: sd.message,
            source: 'ecl-semantic',
          });
        }
      }
    }

    this.onDiagnostics(diagnostics);
  }
}
