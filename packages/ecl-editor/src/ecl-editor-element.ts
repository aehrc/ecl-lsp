// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { registerEclLanguage, ECL_LANGUAGE_ID } from 'ecl-editor-core';
import type { EclEditorDisposable } from 'ecl-editor-core';
import type { CoreDiagnostic } from 'ecl-core';

// Monaco is expected as a peer dependency or from CDN.
// The consumer must ensure `monaco-editor` is available before using this element.

/** Attributes observed by the <ecl-editor> element. */
const OBSERVED_ATTRS = [
  'value',
  'fhir-server-url',
  'snomed-version',
  'theme',
  'height',
  'width',
  'read-only',
  'minimap',
  'line-numbers',
  'semantic-validation',
  'cors-proxy',
] as const;

export class EclEditorElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return [...OBSERVED_ATTRS];
  }

  private container: HTMLDivElement | null = null;
  private hintsBar: HTMLDivElement | null = null;
  private resizeHandle: HTMLDivElement | null = null;
  private editor: import('monaco-editor').editor.IStandaloneCodeEditor | null = null;
  private registration: EclEditorDisposable | null = null;
  private monacoInstance: typeof import('monaco-editor') | null = null;
  private _value = '';

  connectedCallback(): void {
    // Render in light DOM — Monaco injects CSS into document.head which is
    // incompatible with Shadow DOM style isolation.
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.style.width = '100%';
      this.container.style.height = 'calc(100% - 24px)';

      // Hints bar with keyboard shortcuts
      const isMac = /Macintosh|iPhone|iPad/.test(navigator.userAgent);
      const mod = isMac ? '\u2318' : 'Ctrl';
      const alt = isMac ? '\u2325' : 'Alt';
      this.hintsBar = document.createElement('div');
      this.hintsBar.style.cssText =
        'height:18px;line-height:18px;font-size:11px;font-family:system-ui,sans-serif;' +
        'padding:0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      this.hintsBar.textContent = `${mod}+Space autocomplete \u00B7 Shift+${alt}+F format \u00B7 ${mod}+. quick fix \u00B7 Hover over concepts for info`;

      // Drag handle for vertical resizing (works cross-browser)
      this.resizeHandle = document.createElement('div');
      this.resizeHandle.style.cssText =
        'height:6px;cursor:ns-resize;' +
        'border-bottom-left-radius:3px;border-bottom-right-radius:3px;' +
        'user-select:none;-webkit-user-select:none;';

      // Apply theme-appropriate colors
      this.applyThemeColors(this.getAttribute('theme'));
      this.setupResizeHandle(this.resizeHandle);

      // Default host element styles
      this.style.display = 'block';
      this.style.width = '100%';
      this.style.height = '300px';
      this.style.minHeight = '80px';
      this.style.position = 'relative';

      this.appendChild(this.container);
      this.appendChild(this.hintsBar);
      this.appendChild(this.resizeHandle);
    }

    // Defer initialization to allow Monaco to load
    requestAnimationFrame(() => void this.initEditor());
  }

  disconnectedCallback(): void {
    this.dispose();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    if (name === 'value' && this.editor) {
      const currentVal = this.editor.getValue();
      if (newValue !== null && newValue !== currentVal) {
        this.editor.setValue(newValue);
        this._value = newValue;
      }
    } else if (name === 'theme' && this.monacoInstance && newValue) {
      this.monacoInstance.editor.setTheme(newValue);
      this.applyThemeColors(newValue);
    } else if (name === 'read-only' && this.editor) {
      this.editor.updateOptions({ readOnly: newValue !== null && newValue !== 'false' });
    } else if (name === 'height') {
      this.style.height = newValue ?? '300px';
      this.editor?.layout();
    } else if (name === 'width') {
      this.style.width = newValue ?? '100%';
      this.editor?.layout();
    } else if (this.registration) {
      // Propagate config changes
      this.registration.updateConfig({
        fhirServerUrl: this.getAttribute('fhir-server-url') ?? undefined,
        snomedVersion: this.getAttribute('snomed-version') ?? undefined,
        corsProxy: this.getAttribute('cors-proxy') ?? undefined,
        semanticValidation: this.getAttribute('semantic-validation') !== 'false',
      });
    }
  }

  /** Get the current editor value. */
  get value(): string {
    return this.editor?.getValue() ?? this._value;
  }

  /** Set the editor value. */
  set value(val: string) {
    this._value = val;
    if (this.editor) {
      this.editor.setValue(val);
    }
  }

  /** Format the document. */
  format(): void {
    if (this.editor && this.monacoInstance) {
      void this.editor.getAction('editor.action.formatDocument')?.run();
    }
  }

  /** Get current diagnostics from markers. */
  getDiagnostics(): CoreDiagnostic[] {
    if (!this.editor || !this.monacoInstance) return [];
    const model = this.editor.getModel();
    if (!model) return [];
    const markers = this.monacoInstance.editor.getModelMarkers({ resource: model.uri });
    return markers.map((m) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      const isError = m.severity === 8;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      const isWarning = m.severity === 4;
      let severity: 'error' | 'warning' | 'information';
      if (isError) {
        severity = 'error';
      } else if (isWarning) {
        severity = 'warning';
      } else {
        severity = 'information';
      }
      return {
        range: {
          start: { line: m.startLineNumber - 1, character: m.startColumn - 1 },
          end: { line: m.endLineNumber - 1, character: m.endColumn - 1 },
        },
        message: m.message,
        severity,
        source: m.source ?? undefined,
      };
    });
  }

  private applyThemeColors(theme: string | null): void {
    const isDark = theme?.includes('dark') ?? false;
    if (this.hintsBar) {
      this.hintsBar.style.color = isDark ? '#858585' : '#999';
      this.hintsBar.style.background = isDark ? '#1e1e1e' : '#fafafa';
      this.hintsBar.style.borderTop = isDark ? '1px solid #333' : '1px solid #eee';
    }
    if (this.resizeHandle) {
      this.resizeHandle.style.background = isDark ? '#333' : '#e0e0e0';
    }
  }

  private setupResizeHandle(handle: HTMLDivElement): void {
    let startY = 0;
    let startHeight = 0;

    const onMouseMove = (e: MouseEvent) => {
      const newHeight = Math.max(80, startHeight + (e.clientY - startY));
      this.style.height = newHeight + 'px';
      this.editor?.layout();
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = this.offsetHeight;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  private async initEditor(): Promise<void> {
    // Guard against rAF firing after element is disconnected
    if (!this.isConnected) return;

    // Try to get Monaco from global or require
    const monaco = await this.resolveMonaco();
    if (!monaco) {
      // eslint-disable-next-line no-console
      console.error('<ecl-editor>: monaco-editor not found. Ensure it is loaded before using this component.');
      return;
    }
    this.monacoInstance = monaco;

    // Register ECL language
    this.registration = registerEclLanguage(monaco, {
      fhirServerUrl: this.getAttribute('fhir-server-url') ?? undefined,
      snomedVersion: this.getAttribute('snomed-version') ?? undefined,
      corsProxy: this.getAttribute('cors-proxy') ?? undefined,
      semanticValidation: this.getAttribute('semantic-validation') !== 'false',
      onDiagnostics: (diagnostics) => {
        this.dispatchEvent(
          new CustomEvent('ecl-diagnostics', {
            detail: { diagnostics },
            bubbles: true,
            composed: true,
          }),
        );
      },
    });

    // Apply height/width from attributes
    const height = this.getAttribute('height');
    if (height) this.style.height = height;
    const width = this.getAttribute('width');
    if (width) this.style.width = width;

    // Create editor — container is guaranteed to exist (created in connectedCallback)
    if (!this.container) return;
    this.editor = monaco.editor.create(this.container, {
      value: this.getAttribute('value') ?? this._value,
      language: ECL_LANGUAGE_ID,
      theme: this.getAttribute('theme') ?? 'vs',
      readOnly: this.hasAttribute('read-only') && this.getAttribute('read-only') !== 'false',
      minimap: { enabled: this.hasAttribute('minimap') && this.getAttribute('minimap') !== 'false' },
      lineNumbers: this.getAttribute('line-numbers') === 'false' ? 'off' : 'on',
      wordWrap: 'on',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      fontSize: 14,
      tabSize: 2,
      glyphMargin: true,
      hover: { above: false },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      lightbulb: { enabled: 'on' as any },
    });

    // Listen for changes
    const editorRef = this.editor;
    this.editor.onDidChangeModelContent(() => {
      const val = editorRef.getValue();
      this._value = val;
      this.dispatchEvent(
        new CustomEvent('ecl-change', {
          detail: { value: val },
          bubbles: true,
          composed: true,
        }),
      );
    });
  }

  private async resolveMonaco(): Promise<typeof import('monaco-editor') | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis;

    // Check global immediately
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
    if (g.monaco) return g.monaco;

    // Poll for Monaco (e.g. loading async via AMD loader from CDN).
    // Wait up to 30 seconds with increasing intervals.
    const maxWait = 30_000;
    const start = Date.now();
    let delay = 50;
    while (Date.now() - start < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
      if (g.monaco) return g.monaco;
      delay = Math.min(delay * 1.5, 500);
    }

    // Last resort: try dynamic import (works in bundled ES module environments)
    try {
      const mod = await import('monaco-editor');
      return mod;
    } catch {
      return null;
    }
  }

  private dispose(): void {
    this.editor?.dispose();
    this.editor = null;
    this.registration?.dispose();
    this.registration = null;
  }
}
