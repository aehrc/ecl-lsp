# @aehrc/ecl-editor-core

Headless ECL editor integration for Monaco Editor — syntax registration, diagnostics engine, completion, hover, formatting, and FHIR terminology support.

Built on [ecl-core](../ecl-core/).

## Install

```bash
npm install @aehrc/ecl-editor-core
```

**Peer dependency:** `monaco-editor` >= 0.40.0

## Quick Start

```typescript
import * as monaco from 'monaco-editor';
import { registerEclLanguage } from '@aehrc/ecl-editor-core';

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

## Monaco web workers

Monaco runs some services in a web worker and expects **you** to tell your bundler
how to load it. If you do not, monaco reports:

```
Failed to load worker script for label: editorWorkerService.
Ensure your bundler properly bundles modules referenced by
"new URL('...?esm', import.meta.url)".
```

The editor still works, but every operation that waits on the worker pays a
timeout first. Measured on the same document, formatting via
`editor.action.formatDocument`:

| monaco 0.56.0         | time to format |
| --------------------- | -------------- |
| worker not configured | ~1025 ms       |
| worker configured     | ~15-150 ms     |

That is a ~60x difference, and it is silent - nothing throws, and the only signal
is a console error most people never look for.

### Vite

```typescript
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};
```

The specifier changed in monaco 0.56.0. Use whichever matches your version:

| monaco    | worker specifier                            |
| --------- | ------------------------------------------- |
| >= 0.56.0 | `monaco-editor/editor/editor.worker`        |
| <= 0.55.x | `monaco-editor/esm/vs/editor/editor.worker` |

0.56.0 [reorganised its ESM entry points](https://github.com/microsoft/monaco-editor/pull/5155)
so that `./*` maps to `./esm/vs/*`. The older deep path therefore resolves to a
doubled `esm/vs/esm/vs/...` and fails with `ERR_MODULE_NOT_FOUND` - which is worth
knowing for any deep import into monaco, not just the worker.

### Webpack

Use [`monaco-editor-webpack-plugin`](https://github.com/microsoft/monaco-editor/tree/main/webpack-plugin),
which wires the workers up for you.

### AMD loader / script tag

No setup needed. `monaco-editor/min/vs/loader.js` configures its own workers.

ECL support itself needs only the editor worker: this package registers plain
language providers and does not add a worker of its own.

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

### `registerToggleTermsAction(editor, monaco, getService)`

Registers a "Toggle Display Terms" editor action bound to **Shift+Alt+T**. If any concept IDs lack display terms, looks them up via FHIR and inserts them; if all concepts already have terms, strips them. Returns a disposable.

```typescript
import { registerToggleTermsAction } from '@aehrc/ecl-editor-core';

const disposable = registerToggleTermsAction(editor, monaco, () => registration.getTerminologyService());
```

### `ECL_LANGUAGE_ID`

Language ID constant: `"ecl"`.

## Invoking code actions

Trigger quick fixes through the editor's command path, not `getAction`:

```typescript
editor.trigger('my-app', 'editor.action.quickFix', {});
```

The widely-used idiom

```typescript
editor.getAction('editor.action.quickFix')?.run(); // breaks on monaco >= 0.56.0
```

**fails silently** on monaco 0.56.0 and later: `getAction('editor.action.quickFix')`
returns `undefined` there, so the optional chain short-circuits and nothing
happens - no error, no widget, no indication that the call did nothing. The
command path works on 0.55.x and 0.56.x alike.

This is a lookup change, not a broken feature. Invoked correctly, the action
widget renders identically on both versions, ECL quick fixes included.

## CORS

When running in a browser, FHIR requests may be blocked by CORS. Use the `corsProxy` option to route requests through a proxy:

```typescript
registerEclLanguage(monaco, {
  corsProxy: 'https://your-cors-proxy.example.com/',
});
```

## License

Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO) ABN 41 687 119 230

Apache License 2.0 — see [LICENSE](../../LICENSE).
