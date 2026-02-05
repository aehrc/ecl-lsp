# ecl-editor-core

Headless ECL editor integration for Monaco Editor — syntax registration, diagnostics engine, completion, hover, formatting, and FHIR terminology support.

Built on [ecl-core](../ecl-core/).

## Install

```bash
npm install ecl-editor-core
```

**Peer dependency:** `monaco-editor` >= 0.40.0

## Quick Start

```typescript
import * as monaco from 'monaco-editor';
import { registerEclLanguage } from 'ecl-editor-core';

const disposable = registerEclLanguage(monaco, {
  fhirServerUrl: 'https://tx.ontoserver.csiro.au/fhir',
  semanticValidation: true,
});

// Create an editor instance
const editor = monaco.editor.create(document.getElementById('editor'), {
  language: 'ecl',
  value: '<< 404684003 |Clinical finding|',
});

// Update config at runtime
disposable.updateConfig({ snomedVersion: 'http://snomed.info/sct/32506021000036107' });

// Clean up
disposable.dispose();
```

## API

### `registerEclLanguage(monaco, config?)`

Registers the ECL language with Monaco. Returns an `EclEditorDisposable` with `dispose()` and `updateConfig()` methods. Safe to call multiple times (idempotent).

### `EclEditorConfig`

```typescript
interface EclEditorConfig {
  fhirServerUrl?: string; // Default: 'https://tx.ontoserver.csiro.au/fhir'
  snomedVersion?: string; // SNOMED CT edition/version URI
  terminologyService?: ITerminologyService; // Custom service (bypasses fhirServerUrl)
  formattingOptions?: Partial<FormattingOptions>;
  semanticValidation?: boolean; // Default: true
  semanticDebounceMs?: number; // Default: 500
  corsProxy?: string; // Prepended to FHIR URLs for browser CORS
  onResolvedSnomedVersion?: (uri: string) => void;
}
```

### `DiagnosticsEngine`

Framework-agnostic two-phase diagnostics engine. Immediate syntax errors + debounced FHIR-powered semantic validation.

### `ECL_LANGUAGE_ID`

Language ID constant: `"ecl"`.

## CORS

When running in a browser, FHIR requests may be blocked by CORS. Use the `corsProxy` option to route requests through a proxy:

```typescript
registerEclLanguage(monaco, {
  corsProxy: 'https://your-cors-proxy.example.com/',
});
```

## License

Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO) ABN 41 687 119 230

Apache License 2.0 — see [LICENSE](../../LICENSE).
