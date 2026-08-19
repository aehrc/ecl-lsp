// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { isEclEvaluationStrategy, type EclEvaluationStrategy } from '@aehrc/ecl-core';

export interface TerminologyConfig {
  serverUrl: string | undefined;
  timeout: number | undefined;
  snomedVersion: string | undefined;
  maxConcurrency: number | undefined;
  evaluationStrategy: EclEvaluationStrategy | undefined;
  /** Non-fatal warnings about values that were provided but ignored (e.g. an invalid maxConcurrency). */
  warnings: string[];
}

/**
 * Extract terminology config from a source object, handling both VSCode-style
 * (workspace.getConfiguration section keys) and Eclipse-style (initializationOptions flat keys).
 */
export function extractTerminologyConfig(config: Record<string, unknown> | null | undefined): TerminologyConfig {
  if (!config)
    return {
      serverUrl: undefined,
      timeout: undefined,
      snomedVersion: undefined,
      maxConcurrency: undefined,
      evaluationStrategy: undefined,
      warnings: [],
    };
  // VSCode: { serverUrl, timeout, snomedVersion, maxConcurrency, evaluationStrategy } from section 'ecl.terminology'
  // Eclipse initializationOptions: { fhirTerminologyServerUrl, timeout, snomedVersion, maxConcurrency, evaluationStrategy }
  const warnings: string[] = [];
  const rawUrl = config.serverUrl ?? config.fhirTerminologyServerUrl;
  const serverUrl = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl.trim() : undefined;
  const rawTimeout = config.timeout;
  const timeout = typeof rawTimeout === 'number' && rawTimeout >= 500 ? rawTimeout : undefined;
  const rawVersion = config.snomedVersion;
  const snomedVersion = typeof rawVersion === 'string' && rawVersion.trim() ? rawVersion.trim() : undefined;
  const rawConcurrency = config.maxConcurrency;
  let maxConcurrency: number | undefined;
  if (rawConcurrency !== undefined) {
    if (typeof rawConcurrency === 'number' && Number.isInteger(rawConcurrency) && rawConcurrency > 0) {
      maxConcurrency = rawConcurrency;
    } else {
      warnings.push(
        `Ignoring invalid maxConcurrency ${JSON.stringify(rawConcurrency)}: expected a positive integer — using the default instead`,
      );
    }
  }
  const rawStrategy = config.evaluationStrategy;
  const evaluationStrategy = isEclEvaluationStrategy(rawStrategy) ? rawStrategy : undefined;
  if (rawStrategy !== undefined && evaluationStrategy === undefined) {
    warnings.push(
      `Ignoring invalid evaluationStrategy ${JSON.stringify(rawStrategy)}: expected 'auto', 'implicit-url' or 'post' — using the default instead`,
    );
  }
  return { serverUrl, timeout, snomedVersion, maxConcurrency, evaluationStrategy, warnings };
}
