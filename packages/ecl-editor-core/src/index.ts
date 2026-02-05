// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Types
export type { EclEditorConfig, EclEditorDisposable } from './types';

// Diagnostics engine (framework-agnostic)
export { DiagnosticsEngine } from './diagnostics-engine';

// Monaco integration
export { registerEclLanguage, ECL_LANGUAGE_ID } from './monaco';
export type { RegisterOptions } from './monaco';
export { eclSemanticTokensLegend } from './monaco';
