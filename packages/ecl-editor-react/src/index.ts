// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

export { EclEditor } from './EclEditor';
export type { EclEditorProps } from './EclEditor';
export { useEclEditor } from './useEclEditor';
export type { UseEclEditorOptions, UseEclEditorReturn } from './useEclEditor';

// Re-export key types from ecl-editor-core for convenience
export type { EclEditorConfig, EclEditorDisposable } from 'ecl-editor-core';
