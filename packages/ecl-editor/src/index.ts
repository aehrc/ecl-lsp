// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { EclEditorElement } from './ecl-editor-element';

export { EclEditorElement } from './ecl-editor-element';

// Re-export key types from ecl-editor-core for convenience
export type { EclEditorConfig, EclEditorDisposable } from '@aehrc/ecl-editor-core';

/**
 * Register the <ecl-editor> custom element.
 * Call this once in your application before using the element.
 */
export function defineEclEditor(tagName = 'ecl-editor'): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, EclEditorElement);
  }
}

// Auto-register if not in a module context (script tag usage)
if (typeof globalThis.window !== 'undefined' && !customElements.get('ecl-editor')) {
  defineEclEditor();
}
