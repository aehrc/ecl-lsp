// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import type * as Monaco from 'monaco-editor';
import type { CoreDiagnostic, CoreDiagnosticSeverity } from 'ecl-core';
import { DiagnosticsEngine } from '../diagnostics-engine';
import type { EclEditorConfig } from '../types';

const SEVERITY_MAP: Record<CoreDiagnosticSeverity, number> = {
  error: 8, // Monaco.MarkerSeverity.Error
  warning: 4, // Monaco.MarkerSeverity.Warning
  information: 2, // Monaco.MarkerSeverity.Info
  hint: 1, // Monaco.MarkerSeverity.Hint
};

/**
 * Bridges DiagnosticsEngine to Monaco editor markers.
 */
export class MonacoDiagnosticsAdapter {
  private readonly engine: DiagnosticsEngine;
  private disposables: Monaco.IDisposable[] = [];
  private readonly monaco: typeof import('monaco-editor');

  constructor(
    monaco: typeof import('monaco-editor'),
    model: Monaco.editor.ITextModel,
    config: EclEditorConfig,
    onDiagnostics?: (diagnostics: CoreDiagnostic[]) => void,
  ) {
    this.monaco = monaco;

    this.engine = new DiagnosticsEngine(config, (diagnostics) => {
      const markers: Monaco.editor.IMarkerData[] = diagnostics.map((d) => ({
        severity: SEVERITY_MAP[d.severity],
        startLineNumber: d.range.start.line + 1,
        startColumn: d.range.start.character + 1,
        endLineNumber: d.range.end.line + 1,
        endColumn: d.range.end.character + 1,
        message: d.message,
        source: d.source,
      }));

      monaco.editor.setModelMarkers(model, 'ecl', markers);
      onDiagnostics?.(diagnostics);
    });

    // Listen for model content changes
    this.disposables.push(
      model.onDidChangeContent(() => {
        this.engine.update(model.getValue());
      }),
    );

    // Initial validation
    this.engine.update(model.getValue());
  }

  updateConfig(config: Partial<EclEditorConfig>): void {
    this.engine.updateConfig(config);
  }

  dispose(): void {
    this.engine.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
