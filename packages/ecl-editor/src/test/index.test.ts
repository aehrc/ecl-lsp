// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';

// Mock ecl-editor-core before importing
vi.mock('@aehrc/ecl-editor-core', () => ({
  registerEclLanguage: vi.fn(() => ({
    dispose: vi.fn(),
    updateConfig: vi.fn(),
  })),
  ECL_LANGUAGE_ID: 'ecl',
}));

// Mock monaco-editor
vi.mock('monaco-editor', () => ({
  default: undefined,
}));

describe('index module exports', () => {
  it('should export EclEditorElement', async () => {
    const mod = await import('../index');
    expect(mod.EclEditorElement).toBeDefined();
  });

  it('should export EclEditorElement as a class', async () => {
    const mod = await import('../index');
    expect(typeof mod.EclEditorElement).toBe('function');
    expect(mod.EclEditorElement.prototype).toBeInstanceOf(HTMLElement);
  });

  it('should export defineEclEditor as a function', async () => {
    const mod = await import('../index');
    expect(typeof mod.defineEclEditor).toBe('function');
  });

  it('should auto-register ecl-editor custom element on import', async () => {
    // The module auto-registers if window is defined and element is not yet registered.
    // In jsdom, window is defined.
    await import('../index');
    const registered = customElements.get('ecl-editor');
    expect(registered).toBeDefined();
  });

  it('should not throw when defineEclEditor is called for an already-registered tag', async () => {
    const mod = await import('../index');
    // Calling with the same tag that is already registered should be a no-op
    expect(() => {
      mod.defineEclEditor('ecl-editor');
    }).not.toThrow();
  });

  it('should guard against duplicate registration', async () => {
    const mod = await import('../index');
    // The guard in defineEclEditor checks customElements.get() before calling define.
    // Since 'ecl-editor' is already registered, calling defineEclEditor again is safe.
    mod.defineEclEditor('ecl-editor');
    // Verify it's still registered and nothing broke
    expect(customElements.get('ecl-editor')).toBeDefined();
  });
});
