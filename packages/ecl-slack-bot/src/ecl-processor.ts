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

  // Consume flags from the beginning
  while (rest.startsWith('--')) {
    if (rest.startsWith('--eval')) {
      evaluate = true;
      rest = rest.slice('--eval'.length).trimStart();
    } else if (rest.startsWith('--edition')) {
      rest = rest.slice('--edition'.length).trimStart();
      if (!rest || rest.startsWith('--')) {
        return { ecl: '', evaluate: false, error: '--edition requires a value (e.g. --edition au)' };
      }
      // Extract next word as edition value
      const spaceIdx = rest.search(/\s/);
      if (spaceIdx === -1) {
        return { ecl: '', evaluate: false, error: '--edition requires a value (e.g. --edition au)' };
      }
      edition = rest.slice(0, spaceIdx);
      rest = rest.slice(spaceIdx).trimStart();
    } else {
      break; // Unknown flag — treat rest as ECL
    }
  }

  return { ecl: rest, evaluate, edition };
}
