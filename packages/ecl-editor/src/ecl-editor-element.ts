// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { registerEclLanguage, ECL_LANGUAGE_ID, registerToggleTermsAction } from '@aehrc/ecl-editor-core';
import type { EclEditorDisposable } from '@aehrc/ecl-editor-core';
import type { CoreDiagnostic } from '@aehrc/ecl-core';

// Monaco is expected as a peer dependency or from CDN.
// The consumer must ensure `monaco-editor` is available before using this element.

/** Attributes observed by the <ecl-editor> element. */
const OBSERVED_ATTRS = [
  'value',
  'fhir-server-url',
  'snomed-version',
  'theme',
  'light-theme',
  'dark-theme',
  'height',
  'width',
  'read-only',
  'minimap',
  'gutter',
  'line-numbers',
  'glyph-margin',
  'folding',
  'semantic-validation',
  'cors-proxy',
] as const;

/** Monaco's built-in themes, and whether each one is dark. */
const BUILTIN_THEME_DARKNESS: Record<string, boolean> = {
  vs: false,
  'vs-dark': true,
  'hc-black': true,
  'hc-light': false,
};

const DEFAULT_LIGHT_THEME = 'vs';
const DEFAULT_DARK_THEME = 'vs-dark';

/** Gutter presets, from full chrome to none at all. */
type GutterPreset = 'full' | 'minimal' | 'none';

const GUTTER_PRESETS: Record<GutterPreset, { lineNumbers: boolean; glyphMargin: boolean; folding: boolean }> = {
  full: { lineNumbers: true, glyphMargin: true, folding: true },
  // Keeps the glyph margin so the quick-fix lightbulb still has somewhere to render.
  minimal: { lineNumbers: false, glyphMargin: true, folding: false },
  none: { lineNumbers: false, glyphMargin: false, folding: false },
};

/** Shared language registration singleton — prevents duplicate tooltips when multiple editors exist. */
let sharedRegistration: EclEditorDisposable | null = null;

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
  private colorSchemeQuery: MediaQueryList | null = null;
  private onColorSchemeChange: (() => void) | null = null;

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
      this.hintsBar.textContent = `${mod}+Space autocomplete \u00B7 Shift+${alt}+F format \u00B7 Shift+${alt}+T toggle terms \u00B7 ${mod}+. quick fix \u00B7 Hover for info`;

      // Drag handle for vertical resizing (works cross-browser)
      this.resizeHandle = document.createElement('div');
      this.resizeHandle.style.cssText =
        'height:6px;cursor:ns-resize;' +
        'border-bottom-left-radius:3px;border-bottom-right-radius:3px;' +
        'user-select:none;-webkit-user-select:none;';

      // Apply theme-appropriate colors
      this.applyThemeColors(this.resolvedTheme);
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

    this.syncColorSchemeListener();

    // Defer initialization to allow Monaco to load
    requestAnimationFrame(() => void this.initEditor());
  }

  disconnectedCallback(): void {
    this.dispose();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if (this.applyPresentationAttribute(name, newValue)) return;

    // Anything not handled above is language-service configuration.
    this.registration?.updateConfig({
      fhirServerUrl: this.getAttribute('fhir-server-url') ?? undefined,
      snomedVersion: this.getAttribute('snomed-version') ?? undefined,
      corsProxy: this.getAttribute('cors-proxy') ?? undefined,
      semanticValidation: this.getAttribute('semantic-validation') !== 'false',
    });
  }

  /**
   * Apply an attribute that affects presentation rather than configuration.
   *
   * Returns whether the attribute was recognised, so the caller can treat the
   * remainder as language-service config.
   */
  private applyPresentationAttribute(name: string, newValue: string | null): boolean {
    switch (name) {
      case 'value':
        this.applyValueAttribute(newValue);
        return true;
      case 'theme':
      case 'light-theme':
      case 'dark-theme':
        this.syncColorSchemeListener();
        this.applyTheme();
        return true;
      case 'gutter':
      case 'line-numbers':
      case 'glyph-margin':
      case 'folding':
        this.editor?.updateOptions(this.buildGutterOptions());
        return true;
      case 'minimap':
        this.editor?.updateOptions({ minimap: { enabled: newValue !== null && newValue !== 'false' } });
        return true;
      case 'read-only':
        this.editor?.updateOptions({ readOnly: newValue !== null && newValue !== 'false' });
        return true;
      case 'height':
        this.style.height = newValue ?? '300px';
        this.editor?.layout();
        return true;
      case 'width':
        this.style.width = newValue ?? '100%';
        this.editor?.layout();
        return true;
      default:
        return false;
    }
  }

  private applyValueAttribute(newValue: string | null): void {
    if (!this.editor || newValue === null) return;
    if (newValue !== this.editor.getValue()) {
      this.editor.setValue(newValue);
      this._value = newValue;
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

  /**
   * The Monaco theme currently applied.
   *
   * With `theme="auto"` this is whichever of `light-theme`/`dark-theme` the OS
   * colour scheme currently selects, so it is not simply the `theme` attribute.
   */
  get resolvedTheme(): string {
    const requested = this.getAttribute('theme');
    if (requested !== null && requested !== 'auto') return requested;
    // No theme at all keeps the historical light default; only an explicit
    // `auto` opts in to following the OS.
    if (requested === null) return DEFAULT_LIGHT_THEME;
    return this.prefersDark()
      ? (this.getAttribute('dark-theme') ?? DEFAULT_DARK_THEME)
      : (this.getAttribute('light-theme') ?? DEFAULT_LIGHT_THEME);
  }

  /**
   * The dark-mode media query, or undefined where `matchMedia` is unavailable.
   *
   * Non-browser environments (jsdom without a stub, SSR) have no `matchMedia`,
   * and the DOM lib types it as always present, so the lookup is widened here
   * rather than guarded at each call site.
   */
  private darkSchemeQuery(): MediaQueryList | undefined {
    const mm = (globalThis as { matchMedia?: (query: string) => MediaQueryList }).matchMedia;
    return mm?.call(globalThis, '(prefers-color-scheme: dark)');
  }

  private prefersDark(): boolean {
    return this.darkSchemeQuery()?.matches ?? false;
  }

  /**
   * Track the OS colour scheme while `theme="auto"` is in effect.
   *
   * The listener is attached only in auto mode and torn down whenever the mode
   * or the element goes away, so a page full of explicitly-themed editors adds
   * no media query listeners at all.
   */
  private syncColorSchemeListener(): void {
    const isAuto = this.getAttribute('theme') === 'auto';
    if (isAuto && !this.colorSchemeQuery) {
      const query = this.darkSchemeQuery();
      if (!query) return;
      this.onColorSchemeChange = () => {
        this.applyTheme();
      };
      query.addEventListener('change', this.onColorSchemeChange);
      this.colorSchemeQuery = query;
    } else if (!isAuto && this.colorSchemeQuery && this.onColorSchemeChange) {
      this.colorSchemeQuery.removeEventListener('change', this.onColorSchemeChange);
      this.colorSchemeQuery = null;
      this.onColorSchemeChange = null;
    }
  }

  /** Push the resolved theme into Monaco and recolour the element's own chrome. */
  private applyTheme(): void {
    const theme = this.resolvedTheme;
    this.monacoInstance?.editor.setTheme(theme);
    this.applyThemeColors(theme);
    this.dispatchEvent(
      new CustomEvent('ecl-theme-change', {
        detail: { theme, dark: this.isDarkTheme(theme) },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Whether a theme name is dark.
   *
   * Built-in names are looked up rather than pattern-matched — `hc-black` is
   * dark but contains no "dark", and got light chrome before. Custom themes
   * fall back to the name heuristic, which is all we can infer without asking
   * Monaco to resolve the theme.
   */
  private isDarkTheme(theme: string): boolean {
    return BUILTIN_THEME_DARKNESS[theme] ?? /dark|black/i.test(theme);
  }

  private applyThemeColors(theme: string | null): void {
    const isDark = theme !== null && this.isDarkTheme(theme);
    if (this.hintsBar) {
      this.hintsBar.style.color = isDark ? '#858585' : '#999';
      this.hintsBar.style.background = isDark ? '#1e1e1e' : '#fafafa';
      this.hintsBar.style.borderTop = isDark ? '1px solid #333' : '1px solid #eee';
    }
    if (this.resizeHandle) {
      this.resizeHandle.style.background = isDark ? '#333' : '#e0e0e0';
    }
  }

  /** Read a boolean attribute that defaults to `fallback` when absent. */
  private boolAttr(name: string, fallback: boolean): boolean {
    const raw = this.getAttribute(name);
    if (raw === null) return fallback;
    return raw !== 'false';
  }

  /**
   * Build the gutter-related editor options.
   *
   * `gutter` picks a preset; the individual `line-numbers`, `glyph-margin` and
   * `folding` attributes override whatever the preset chose. Widths are zeroed
   * when nothing is left to show, because Monaco still reserves the line-number
   * column and decoration strip otherwise — which is what makes the left margin
   * stay visible after turning line numbers off.
   */
  private buildGutterOptions(): import('monaco-editor').editor.IEditorOptions {
    const presetName = this.getAttribute('gutter');
    const preset =
      presetName !== null && presetName in GUTTER_PRESETS
        ? GUTTER_PRESETS[presetName as GutterPreset]
        : GUTTER_PRESETS.full;

    const rawLineNumbers = this.getAttribute('line-numbers');
    // `relative` and `interval` are Monaco's own modes; `true`/`false` stay
    // supported because they were the original API.
    let lineNumbers: 'on' | 'off' | 'relative' | 'interval';
    if (rawLineNumbers === null) {
      lineNumbers = preset.lineNumbers ? 'on' : 'off';
    } else if (rawLineNumbers === 'relative' || rawLineNumbers === 'interval') {
      lineNumbers = rawLineNumbers;
    } else {
      lineNumbers = rawLineNumbers === 'false' || rawLineNumbers === 'off' ? 'off' : 'on';
    }

    const glyphMargin = this.boolAttr('glyph-margin', preset.glyphMargin);
    const folding = this.boolAttr('folding', preset.folding);
    const bare = lineNumbers === 'off' && !glyphMargin && !folding;

    return {
      lineNumbers,
      glyphMargin,
      folding,
      // Monaco reserves space for line numbers even when they are off unless
      // the minimum character count is zeroed too.
      lineNumbersMinChars: lineNumbers === 'off' ? 0 : 3,
      lineDecorationsWidth: bare ? 0 : 10,
    };
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

    // Share a single language registration across all <ecl-editor> instances to
    // avoid duplicate hover tooltips, completions, and other provider registrations.
    this.registration =
      sharedRegistration ??
      (sharedRegistration = registerEclLanguage(monaco, {
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
      }));

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
      theme: this.resolvedTheme,
      readOnly: this.hasAttribute('read-only') && this.getAttribute('read-only') !== 'false',
      minimap: { enabled: this.hasAttribute('minimap') && this.getAttribute('minimap') !== 'false' },
      ...this.buildGutterOptions(),
      wordWrap: 'on',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      fontSize: 14,
      tabSize: 2,
      renderLineHighlight: 'none',
      hover: { above: false },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      lightbulb: { enabled: 'on' as any },
    });

    // Register toggle display terms action (Shift+Alt+T)
    const reg = this.registration;
    registerToggleTermsAction(this.editor, monaco, () => reg.getTerminologyService());

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

  /**
   * Poll `globalThis.monaco` until it appears or the budget runs out.
   *
   * This is the AMD/CDN path: the loader assigns the global asynchronously, so
   * there is nothing to await other than its arrival.
   */
  private async pollForGlobalMonaco(
    maxWait: number,
    stopped: { value: boolean },
  ): Promise<typeof import('monaco-editor') | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis;
    const start = Date.now();
    let delay = 50;
    while (Date.now() - start < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (stopped.value) return null;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
      if (g.monaco) return g.monaco;
      delay = Math.min(delay * 1.5, 500);
    }
    return null;
  }

  private async resolveMonaco(): Promise<typeof import('monaco-editor') | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis;

    // A global that is already set wins outright: assigning `globalThis.monaco`
    // is how a host page chooses which instance every editor should share.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
    if (g.monaco) return g.monaco;

    // Otherwise race the two remaining sources rather than sequencing them.
    // These are mutually exclusive in practice - a bundled ES module app
    // resolves the import in milliseconds, while an AMD/CDN page cannot resolve
    // the bare specifier at all and rejects immediately, leaving the poll to
    // win. Running the poll first cost bundled consumers the entire 30 s budget
    // before the import that would have succeeded was ever attempted (#96).
    const stopped = { value: false };
    const viaImport = import('monaco-editor').then((mod) => mod).catch(() => null);
    const viaGlobal = this.pollForGlobalMonaco(30_000, stopped);

    const resolved = await Promise.race([
      viaImport.then(async (mod) => mod ?? viaGlobal),
      viaGlobal.then(async (mod) => mod ?? viaImport),
    ]);

    // Let the polling loop exit at its next tick instead of holding a timer for
    // the rest of the budget after the race has already been decided.
    stopped.value = true;
    return resolved;
  }

  private dispose(): void {
    if (this.colorSchemeQuery && this.onColorSchemeChange) {
      this.colorSchemeQuery.removeEventListener('change', this.onColorSchemeChange);
      this.colorSchemeQuery = null;
      this.onColorSchemeChange = null;
    }
    this.editor?.dispose();
    this.editor = null;
    // Don't dispose the shared registration — other instances may still be using it.
    this.registration = null;
  }
}
