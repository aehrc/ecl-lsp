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

    it('should return exactly 11 observed attributes', () => {
      expect(EclEditorElement.observedAttributes).toHaveLength(11);
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

    it('should not throw when setting theme without Monaco', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      expect(() => {
        el.setAttribute('theme', 'vs-dark');
      }).not.toThrow();
    });

    it('should not throw when setting read-only without Monaco', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      expect(() => {
        el.setAttribute('read-only', '');
      }).not.toThrow();
    });

    it('should not throw when setting value without editor', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      expect(() => {
        el.setAttribute('value', '< 404684003');
      }).not.toThrow();
    });

    it('should not throw when setting fhir-server-url without registration', () => {
      const el = document.createElement(TAG_NAME) as EclEditorElement;
      document.body.appendChild(el);
      expect(() => {
        el.setAttribute('fhir-server-url', 'https://tx.example.com/fhir');
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
      expect(el.querySelectorAll('div').length).toBe(3);
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
});
