// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { ITerminologyService, FormattingOptions, EclEvaluationStrategy } from '@aehrc/ecl-core';

export type EvaluateEclStrategy = EclEvaluationStrategy;

/** Configuration for the ECL editor integration. */
export interface EclEditorConfig {
  /** FHIR server URL. Default: 'https://tx.ontoserver.csiro.au/fhir' */
  fhirServerUrl?: string;
  /** SNOMED CT version URI (e.g. 'http://snomed.info/sct/32506021000036107/version/20240731') */
  snomedVersion?: string;
  /** ECL evaluation strategy for terminology servers. Default: 'auto' */
  evaluateEcl?: EvaluateEclStrategy;
  /** Custom terminology service override (bypasses fhirServerUrl). */
  terminologyService?: ITerminologyService;
  /** Formatting options. */
  formattingOptions?: Partial<FormattingOptions>;
  /** Enable semantic validation (FHIR-dependent). Default: true */
  semanticValidation?: boolean;
  /** Debounce for semantic validation in ms. Default: 500 */
  semanticDebounceMs?: number;
  /** CORS proxy URL prefix (prepended to FHIR URLs). */
  corsProxy?: string;
  /** Callback when SNOMED CT version is resolved from server response. */
  onResolvedSnomedVersion?: (uri: string) => void;
}

/**
 * Merge a partial config update into a base config.
 *
 * A key in `partial` applies only when its value is `!== undefined` — this mirrors the `??`
 * fallback idiom used throughout the config-consuming code (`createTerminologyService`,
 * Monaco provider options, etc.). Consequently **a config value cannot be unset by passing
 * `undefined`**: once a key has been set (at construction or via a prior partial update),
 * only supplying an explicit replacement value changes it.
 */
export function mergeEclEditorConfig(base: EclEditorConfig, partial: Partial<EclEditorConfig>): EclEditorConfig {
  return {
    fhirServerUrl: partial.fhirServerUrl ?? base.fhirServerUrl,
    snomedVersion: partial.snomedVersion ?? base.snomedVersion,
    evaluateEcl: partial.evaluateEcl ?? base.evaluateEcl,
    terminologyService: partial.terminologyService ?? base.terminologyService,
    formattingOptions: partial.formattingOptions ?? base.formattingOptions,
    semanticValidation: partial.semanticValidation ?? base.semanticValidation,
    semanticDebounceMs: partial.semanticDebounceMs ?? base.semanticDebounceMs,
    corsProxy: partial.corsProxy ?? base.corsProxy,
    onResolvedSnomedVersion: partial.onResolvedSnomedVersion ?? base.onResolvedSnomedVersion,
  };
}

/** Disposable handle returned by registerEclLanguage(). */
export interface EclEditorDisposable {
  /** Dispose all registered providers and clean up resources. */
  dispose(): void;
  /** Update configuration (e.g. switch SNOMED version, toggle semantic validation). */
  updateConfig(config: Partial<EclEditorConfig>): void;
  /** Get the current terminology service (may be null if not configured). */
  getTerminologyService(): ITerminologyService | null;
}
