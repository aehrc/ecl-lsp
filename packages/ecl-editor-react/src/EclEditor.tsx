import { useRef, useEffect, useCallback } from 'react';
import Editor, { type OnMount, type OnChange } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { registerEclLanguage, ECL_LANGUAGE_ID } from 'ecl-editor-core';
import type { EclEditorConfig, EclEditorDisposable } from 'ecl-editor-core';
import type { CoreDiagnostic } from 'ecl-core';
import type { FormattingOptions } from 'ecl-core';

export interface EclEditorProps {
  /** Controlled value. */
  value?: string;
  /** Default value for uncontrolled mode. */
  defaultValue?: string;
  /** Called when the editor content changes. */
  onChange?: (value: string) => void;
  /** FHIR server URL. */
  fhirServerUrl?: string;
  /** SNOMED CT version URI. */
  snomedVersion?: string;
  /** Formatting options. */
  formattingOptions?: Partial<FormattingOptions>;
  /** Enable semantic validation. Default: true */
  semanticValidation?: boolean;
  /** Debounce for semantic validation in ms. Default: 500 */
  semanticDebounceMs?: number;
  /** CORS proxy URL prefix. */
  corsProxy?: string;
  /** Called when diagnostics update. */
  onDiagnostics?: (diagnostics: CoreDiagnostic[]) => void;
  /** Called when SNOMED CT version is resolved from server. */
  onResolvedSnomedVersion?: (uri: string) => void;
  /** Read-only mode. */
  readOnly?: boolean;
  /** Monaco theme. Default: 'vs' */
  theme?: string;
  /** Editor height. Default: '300px' */
  height?: string | number;
  /** Editor width. Default: '100%' */
  width?: string | number;
  /** Show minimap. Default: false */
  minimap?: boolean;
  /** Show line numbers. Default: true */
  lineNumbers?: boolean;
  /** Additional Monaco editor options. */
  options?: Monaco.editor.IStandaloneEditorConstructionOptions;
  /** Custom terminology service (bypasses fhirServerUrl). */
  terminologyService?: EclEditorConfig['terminologyService'];
}

/** React component wrapping Monaco with full ECL language support. */
export function EclEditor({
  value,
  defaultValue,
  onChange,
  fhirServerUrl,
  snomedVersion,
  formattingOptions,
  semanticValidation,
  semanticDebounceMs,
  corsProxy,
  onDiagnostics,
  onResolvedSnomedVersion,
  readOnly = false,
  theme = 'vs',
  height = '300px',
  width = '100%',
  minimap = false,
  lineNumbers = true,
  options,
  terminologyService,
}: Readonly<EclEditorProps>) {
  const registrationRef = useRef<EclEditorDisposable | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  // Track latest callbacks in refs to avoid re-registration
  const onDiagnosticsRef = useRef(onDiagnostics);
  onDiagnosticsRef.current = onDiagnostics;

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Register ECL language (idempotent — will be cleaned up on unmount)
      registrationRef.current ??= registerEclLanguage(monaco, {
        fhirServerUrl,
        snomedVersion,
        formattingOptions,
        semanticValidation,
        semanticDebounceMs,
        corsProxy,
        terminologyService,
        onResolvedSnomedVersion,
        onDiagnostics: (diags) => onDiagnosticsRef.current?.(diags),
      });
    },
    [
      fhirServerUrl,
      snomedVersion,
      formattingOptions,
      semanticValidation,
      semanticDebounceMs,
      corsProxy,
      terminologyService,
      onResolvedSnomedVersion,
    ],
  );

  // Update config when props change
  useEffect(() => {
    registrationRef.current?.updateConfig({
      fhirServerUrl,
      snomedVersion,
      formattingOptions,
      semanticValidation,
      semanticDebounceMs,
      corsProxy,
      terminologyService,
      onResolvedSnomedVersion,
    });
  }, [
    fhirServerUrl,
    snomedVersion,
    formattingOptions,
    semanticValidation,
    semanticDebounceMs,
    corsProxy,
    terminologyService,
    onResolvedSnomedVersion,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      registrationRef.current?.dispose();
      registrationRef.current = null;
    };
  }, []);

  const handleChange: OnChange = useCallback(
    (val) => {
      if (val !== undefined) {
        onChange?.(val);
      }
    },
    [onChange],
  );

  const mergedOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
    readOnly,
    minimap: { enabled: minimap },
    lineNumbers: lineNumbers ? 'on' : 'off',
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
    ...options,
  };

  const isMac = typeof navigator !== 'undefined' && /Macintosh|iPhone|iPad/.test(navigator.userAgent);
  const mod = isMac ? '\u2318' : 'Ctrl';
  const alt = isMac ? '\u2325' : 'Alt';

  return (
    <div style={{ width, height: 'auto' }}>
      <Editor
        height={height}
        width="100%"
        language={ECL_LANGUAGE_ID}
        theme={theme}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        onMount={handleMount}
        options={mergedOptions}
      />
      <div
        style={{
          height: 18,
          lineHeight: '18px',
          fontSize: 11,
          fontFamily: 'system-ui, sans-serif',
          padding: '0 6px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: '#999',
          background: '#fafafa',
          borderTop: '1px solid #eee',
        }}
      >
        {mod}+Space autocomplete &middot; Shift+{alt}+F format &middot; {mod}+. quick fix &middot; Hover over concepts
        for info
      </div>
    </div>
  );
}
