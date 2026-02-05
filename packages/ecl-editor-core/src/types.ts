// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type { ITerminologyService, FormattingOptions } from 'ecl-core';

/** Configuration for the ECL editor integration. */
export interface EclEditorConfig {
  /** FHIR server URL. Default: 'https://tx.ontoserver.csiro.au/fhir' */
  fhirServerUrl?: string;
  /** SNOMED CT version URI (e.g. 'http://snomed.info/sct/32506021000036107/version/20240731') */
  snomedVersion?: string;
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

/** Disposable handle returned by registerEclLanguage(). */
export interface EclEditorDisposable {
  /** Dispose all registered providers and clean up resources. */
  dispose(): void;
  /** Update configuration (e.g. switch SNOMED version, toggle semantic validation). */
  updateConfig(config: Partial<EclEditorConfig>): void;
}
