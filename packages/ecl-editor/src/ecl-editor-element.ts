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
      this.container.style.height = '100%';

      // Default host element styles
      this.style.display = 'block';
      this.style.width = '100%';
      this.style.height = '300px';
      this.style.overflow = 'hidden';

      this.appendChild(this.container);
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
      fontSize: 14,
      tabSize: 2,
      glyphMargin: true,
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
    // Check global
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
    if (g.monaco) return g.monaco;

    // Try dynamic import
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
