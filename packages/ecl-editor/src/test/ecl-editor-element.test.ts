// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock ecl-editor-core before importing the element
vi.mock('@aehrc/ecl-editor-core', () => ({
  registerEclLanguage: vi.fn(() => ({
    dispose: vi.fn(),
    updateConfig: vi.fn(),
  })),
  ECL_LANGUAGE_ID: 'ecl',
}));

// Import after mocks are set up
import { EclEditorElement } from '../ecl-editor-element';

// Register with a unique tag name to avoid collision with index.ts auto-registration
const TAG_NAME = 'ecl-editor-test';
if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, class extends EclEditorElement {});
}

afterEach(() => {
  // Clean up any elements added to the DOM
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
});

describe('EclEditorElement', () => {
  describe('class definition', () => {
    it('should be a class that extends HTMLElement', () => {
      expect(EclEditorElement).toBeDefined();
      expect(EclEditorElement.prototype).toBeInstanceOf(HTMLElement);
    });

    it('should be constructable via document.createElement', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el).toBeInstanceOf(EclEditorElement);
    });
  });

  describe('observedAttributes', () => {
    it('should declare observedAttributes as a static getter', () => {
      const attrs = EclEditorElement.observedAttributes;
      expect(Array.isArray(attrs)).toBe(true);
    });

    it('should include all expected attributes', () => {
      const attrs = EclEditorElement.observedAttributes;
      expect(attrs).toContain('value');
      expect(attrs).toContain('fhir-server-url');
      expect(attrs).toContain('snomed-version');
      expect(attrs).toContain('theme');
      expect(attrs).toContain('height');
      expect(attrs).toContain('width');
      expect(attrs).toContain('read-only');
      expect(attrs).toContain('minimap');
      expect(attrs).toContain('line-numbers');
      expect(attrs).toContain('semantic-validation');
      expect(attrs).toContain('cors-proxy');
    });

    it('should include the theme and gutter attributes', () => {
      const attrs = EclEditorElement.observedAttributes;
      expect(attrs).toContain('light-theme');
      expect(attrs).toContain('dark-theme');
      expect(attrs).toContain('gutter');
      expect(attrs).toContain('glyph-margin');
      expect(attrs).toContain('folding');
    });

    it('should return exactly 16 observed attributes', () => {
      expect(EclEditorElement.observedAttributes).toHaveLength(16);
    });
  });

  describe('Light DOM rendering', () => {
    it('should not use Shadow DOM', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      expect(el.shadowRoot).toBeNull();
    });

    it('should contain a div container in light DOM after connecting', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      const divEl = el.querySelector('div');
      expect(divEl).not.toBeNull();
    });

    it('should set display to block on the host element', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      expect(el.style.display).toBe('block');
    });

    it('should set default height to 300px', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      expect(el.style.height).toBe('300px');
    });
  });

  describe('value getter/setter', () => {
    it('should return empty string initially', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      expect(el.value).toBe('');
    });

    it('should store value via setter when no editor is present', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      el.value = '< 404684003';
      // Without Monaco editor, value is stored in _value via the setter
      expect(el.value).toBe('< 404684003');
    });

    it('should accept empty string as value', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      el.value = 'some text';
      el.value = '';
      expect(el.value).toBe('');
    });
  });

  describe('format() method', () => {
    it('should exist and be a function', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      expect(typeof el.format).toBe('function');
    });

    it('should not throw when called without Monaco initialized', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      expect(() => {
        el.format();
      }).not.toThrow();
    });
  });

  describe('getDiagnostics()', () => {
    it('should return an empty array when no editor is present', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      const diagnostics = el.getDiagnostics();
      expect(diagnostics).toEqual([]);
    });

    it('should return an array type', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      expect(Array.isArray(el.getDiagnostics())).toBe(true);
    });
  });

  describe('attribute change behavior', () => {
    it('should update height style on height attribute change', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      el.setAttribute('height', '500px');
      expect(el.style.height).toBe('500px');
    });

    it('should update width style on width attribute change', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      el.setAttribute('width', '800px');
      expect(el.style.width).toBe('800px');
    });

    it('should reset height to default when height attribute is removed', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      el.setAttribute('height', '500px');
      expect(el.style.height).toBe('500px');
      el.removeAttribute('height');
      expect(el.style.height).toBe('300px');
    });

    it('should reset width to default when width attribute is removed', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      el.setAttribute('width', '800px');
      expect(el.style.width).toBe('800px');
      el.removeAttribute('width');
      expect(el.style.width).toBe('100%');
    });

    // Setting any of these before Monaco has loaded must be a no-op rather than a throw.
    it.each([
      ['theme', 'vs-dark'],
      ['read-only', ''],
      ['value', '< 404684003'],
      ['fhir-server-url', 'https://tx.example.com/fhir'],
    ])('should not throw when setting %s before the editor exists', (attribute, value) => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      expect(() => {
        el.setAttribute(attribute, value);
      }).not.toThrow();
    });

    it('should ignore duplicate attribute values', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      el.setAttribute('height', '400px');
      expect(el.style.height).toBe('400px');
      // Setting the same value again should be a no-op
      el.setAttribute('height', '400px');
      expect(el.style.height).toBe('400px');
    });
  });

  describe('connectedCallback idempotency', () => {
    it('should only create container once on multiple connections', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      const firstContainer = el.querySelector('div');

      // Remove and re-attach
      document.body.removeChild(el);
      document.body.appendChild(el);
      const secondContainer = el.querySelector('div');

      // Should be the same container, not a duplicate (3 divs: container + hintsBar + resizeHandle)
      expect(secondContainer).toBe(firstContainer);
      expect(el.querySelectorAll('div')).toHaveLength(3);
    });
  });

  describe('disconnectedCallback', () => {
    it('should not throw when disconnecting before Monaco init', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      expect(() => document.body.removeChild(el)).not.toThrow();
    });

    it('should not throw on double disconnect', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      document.body.removeChild(el);
      // Manually trigger disconnectedCallback again
      expect(() => (el as any).disconnectedCallback?.()).not.toThrow();
    });
  });

  describe('resolveMonaco()', () => {
    // Regression tests for #96: the poll for `globalThis.monaco` used to run to
    // completion *before* the dynamic import was attempted, so a consumer who
    // bundled monaco as an ES module but never assigned the global waited the
    // full 30 s budget for an import that would have resolved immediately.
    const g = globalThis as unknown as { monaco?: unknown };

    afterEach(() => {
      delete g.monaco;
    });

    it('should return globalThis.monaco immediately when it is already set', async () => {
      const sentinel = { editor: {}, languages: {} };
      g.monaco = sentinel;

      const el = document.createElement(TAG_NAME) as EclEditorElement;
      const resolved: unknown = await (el as any).resolveMonaco();

      expect(resolved).toBe(sentinel);
    });

    it('should resolve without waiting out the 30s poll when no global is set', async () => {
      expect(g.monaco).toBeUndefined();

      const el = document.createElement(TAG_NAME) as EclEditorElement;
      const start = Date.now();
      await (el as any).resolveMonaco();
      const elapsed = Date.now() - start;

      // The pre-fix implementation could not return before ~30_000 ms here.
      // The generous ceiling keeps this from being a latency benchmark: it only
      // has to distinguish "raced the import" from "waited out the poll".
      expect(elapsed).toBeLessThan(2_000);
    });

    it('should pick up a global that arrives while polling', async () => {
      // The AMD/CDN path: the loader assigns `globalThis.monaco` some time after
      // the element starts looking. Exercised against the poll directly, because
      // under vitest the aliased `monaco-editor` stub always resolves, so
      // resolveMonaco()'s race would settle on the import before the global
      // lands - the opposite of a real AMD page, where the bare specifier
      // cannot resolve at all.
      const sentinel = { editor: {}, languages: {}, __late: true };
      const el = document.createElement(TAG_NAME) as EclEditorElement;

      setTimeout(() => {
        g.monaco = sentinel;
      }, 120);

      const resolved = (await (el as any).pollForGlobalMonaco(5_000, { value: false })) as {
        __late?: boolean;
      } | null;

      expect(resolved?.__late).toBe(true);
    });

    it('should stop polling once the race has been decided', async () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      const stopped = { value: false };

      const pending = (el as any).pollForGlobalMonaco(30_000, stopped) as Promise<unknown>;
      stopped.value = true;

      // Without the stop flag this would hold a timer for the full 30 s budget.
      const start = Date.now();
      await expect(pending).resolves.toBeNull();
      expect(Date.now() - start).toBeLessThan(2_000);
    });

    it('should prefer an already-set global over the bundled import', async () => {
      // The global is how a host page pins which monaco instance every editor
      // shares, so it has to keep winning even though the import would resolve.
      const sentinel = { editor: {}, languages: {}, __fromGlobal: true };
      g.monaco = sentinel;

      const el = document.createElement(TAG_NAME) as EclEditorElement;
      const resolved = (await (el as any).resolveMonaco()) as { __fromGlobal?: boolean };

      expect(resolved.__fromGlobal).toBe(true);
    });
  });

  describe('theme resolution', () => {
    const originalMatchMedia = globalThis.matchMedia;

    /** Stub `prefers-color-scheme: dark` and capture any listener registered. */
    function stubColorScheme(dark: boolean) {
      const listeners: (() => void)[] = [];
      const query = {
        matches: dark,
        addEventListener: (_: string, fn: () => void) => listeners.push(fn),
        removeEventListener: (_: string, fn: () => void) => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        },
      };
      (globalThis as any).matchMedia = () => query;
      return { query, listeners };
    }

    afterEach(() => {
      (globalThis as any).matchMedia = originalMatchMedia;
    });

    it('should default to the light theme when no theme attribute is set', () => {
      stubColorScheme(true);
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      // Absent theme keeps the historical light default rather than silently
      // following the OS — only an explicit `auto` opts in.
      expect(el.resolvedTheme).toBe('vs');
    });

    it.each([
      {
        name: 'should pass an explicit theme through unchanged',
        dark: true,
        attrs: { theme: 'hc-black' },
        expected: 'hc-black',
      },
      {
        name: 'should resolve auto to vs-dark when the OS prefers dark',
        dark: true,
        attrs: { theme: 'auto' },
        expected: 'vs-dark',
      },
      {
        name: 'should resolve auto to vs when the OS prefers light',
        dark: false,
        attrs: { theme: 'auto' },
        expected: 'vs',
      },
      {
        name: 'should honour a custom dark theme in auto mode',
        dark: true,
        attrs: { theme: 'auto', 'light-theme': 'hc-light', 'dark-theme': 'hc-black' },
        expected: 'hc-black',
      },
      {
        name: 'should honour a custom light theme in auto mode',
        dark: false,
        attrs: { theme: 'auto', 'light-theme': 'hc-light', 'dark-theme': 'hc-black' },
        expected: 'hc-light',
      },
    ])('$name', ({ dark, attrs, expected }) => {
      stubColorScheme(dark);
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val);
      expect(el.resolvedTheme).toBe(expected);
    });

    it('should treat hc-black as dark for the element chrome', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      // hc-black contains no "dark", so a name substring check got this wrong.
      expect((el as any).isDarkTheme('hc-black')).toBe(true);
      expect((el as any).isDarkTheme('hc-light')).toBe(false);
      expect((el as any).isDarkTheme('vs')).toBe(false);
      expect((el as any).isDarkTheme('vs-dark')).toBe(true);
    });

    it('should fall back to a name heuristic for unknown custom themes', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      expect((el as any).isDarkTheme('my-dark-theme')).toBe(true);
      expect((el as any).isDarkTheme('solarized-light')).toBe(false);
    });

    it('should register a colour-scheme listener only in auto mode', () => {
      const { listeners } = stubColorScheme(false);
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      el.setAttribute('theme', 'auto');
      document.body.appendChild(el);
      expect(listeners).toHaveLength(1);
    });

    it('should not register a colour-scheme listener for a fixed theme', () => {
      const { listeners } = stubColorScheme(false);
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      el.setAttribute('theme', 'vs-dark');
      document.body.appendChild(el);
      expect(listeners).toHaveLength(0);
    });

    it('should drop the colour-scheme listener when the element disconnects', () => {
      const { listeners } = stubColorScheme(false);
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      el.setAttribute('theme', 'auto');
      document.body.appendChild(el);
      expect(listeners).toHaveLength(1);
      el.remove();
      expect(listeners).toHaveLength(0);
    });

    it('should drop the listener when switching from auto to a fixed theme', () => {
      const { listeners } = stubColorScheme(false);
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      el.setAttribute('theme', 'auto');
      document.body.appendChild(el);
      el.setAttribute('theme', 'vs');
      expect(listeners).toHaveLength(0);
    });

    it('should emit ecl-theme-change when the theme attribute changes', () => {
      stubColorScheme(false);
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      const seen: { theme: string; dark: boolean }[] = [];
      el.addEventListener('ecl-theme-change', ((e: CustomEvent) => {
        seen.push(e.detail as { theme: string; dark: boolean });
      }) as EventListener);
      el.setAttribute('theme', 'vs-dark');
      expect(seen).toEqual([{ theme: 'vs-dark', dark: true }]);
    });
  });

  describe('gutter options', () => {
    function gutterOptions(attrs: Record<string, string>) {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return (el as any).buildGutterOptions() as Record<string, unknown>;
    }

    it('should show the full gutter by default', () => {
      expect(gutterOptions({})).toMatchObject({ lineNumbers: 'on', glyphMargin: true, folding: true });
    });

    it('should reclaim the whole left margin for gutter="none"', () => {
      // The point of the preset: no reserved width left behind.
      expect(gutterOptions({ gutter: 'none' })).toMatchObject({
        lineNumbers: 'off',
        glyphMargin: false,
        folding: false,
        lineNumbersMinChars: 0,
        lineDecorationsWidth: 0,
      });
    });

    it('should keep the glyph margin for gutter="minimal" so the lightbulb still renders', () => {
      expect(gutterOptions({ gutter: 'minimal' })).toMatchObject({
        lineNumbers: 'off',
        glyphMargin: true,
        folding: false,
      });
    });

    it('should let individual attributes override the preset', () => {
      expect(gutterOptions({ gutter: 'none', 'line-numbers': 'relative' })).toMatchObject({
        lineNumbers: 'relative',
        glyphMargin: false,
      });
      expect(gutterOptions({ gutter: 'none', 'glyph-margin': 'true' })).toMatchObject({ glyphMargin: true });
    });

    it('should still accept the original boolean line-numbers values', () => {
      expect(gutterOptions({ 'line-numbers': 'false' })).toMatchObject({ lineNumbers: 'off' });
      expect(gutterOptions({ 'line-numbers': 'true' })).toMatchObject({ lineNumbers: 'on' });
    });

    it('should support monaco line-number modes', () => {
      expect(gutterOptions({ 'line-numbers': 'relative' })).toMatchObject({ lineNumbers: 'relative' });
      expect(gutterOptions({ 'line-numbers': 'interval' })).toMatchObject({ lineNumbers: 'interval' });
    });

    it('should ignore an unrecognised gutter preset', () => {
      expect(gutterOptions({ gutter: 'nonsense' })).toMatchObject({ lineNumbers: 'on', glyphMargin: true });
    });

    it('should zero the line-number width whenever numbers are off', () => {
      // Monaco otherwise keeps reserving the column, which is what made the
      // margin stay visible after setting line-numbers="false".
      expect(gutterOptions({ 'line-numbers': 'false' })).toMatchObject({ lineNumbersMinChars: 0 });
    });
  });
});
