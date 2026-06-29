// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

export interface TerminologyConfig {
  serverUrl: string | undefined;
  timeout: number | undefined;
  snomedVersion: string | undefined;
  maxConcurrency: number | undefined;
}

/**
 * Extract terminology config from a source object, handling both VSCode-style
 * (workspace.getConfiguration section keys) and Eclipse-style (initializationOptions flat keys).
 */
export function extractTerminologyConfig(config: Record<string, unknown> | null | undefined): TerminologyConfig {
  if (!config) return { serverUrl: undefined, timeout: undefined, snomedVersion: undefined, maxConcurrency: undefined };
  // VSCode: { serverUrl, timeout, snomedVersion, maxConcurrency } from section 'ecl.terminology'
  // Eclipse initializationOptions: { fhirTerminologyServerUrl, timeout, snomedVersion, maxConcurrency }
  const rawUrl = config.serverUrl ?? config.fhirTerminologyServerUrl;
  const serverUrl = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl.trim() : undefined;
  const rawTimeout = config.timeout;
  const timeout = typeof rawTimeout === 'number' && rawTimeout >= 500 ? rawTimeout : undefined;
  const rawVersion = config.snomedVersion;
  const snomedVersion = typeof rawVersion === 'string' && rawVersion.trim() ? rawVersion.trim() : undefined;
  const rawConcurrency = config.maxConcurrency;
  const maxConcurrency =
    typeof rawConcurrency === 'number' && Number.isInteger(rawConcurrency) && rawConcurrency > 0
      ? rawConcurrency
      : undefined;
  return { serverUrl, timeout, snomedVersion, maxConcurrency };
}
