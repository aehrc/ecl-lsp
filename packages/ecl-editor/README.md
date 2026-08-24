# @aehrc/ecl-editor

Web Component (`<ecl-editor>`) for editing SNOMED CT Expression Constraint Language (ECL) expressions with Monaco Editor.

Built on [ecl-editor-core](../ecl-editor-core/).

## Install

```bash
npm install @aehrc/ecl-editor
```

**Peer dependency:** `monaco-editor` >= 0.40.0

## Usage

### Module

You supply monaco yourself, so you also configure its web worker. Without that,
monaco waits on a worker that never loads and formatting takes ~1 s instead of
~15 ms - silently. See [Monaco web workers](#monaco-web-workers) below.

```typescript
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'; // vite
import { defineEclEditor } from '@aehrc/ecl-editor';

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// Assign monaco globally. The element checks `globalThis.monaco` first and
// otherwise polls for it for up to 30 seconds before falling back to a dynamic
// `import('monaco-editor')` - so skipping this costs a 30 s delay before the
// editor appears, even when monaco is already bundled.
(globalThis as any).monaco = monaco;

// Register the custom element (call once)
defineEclEditor();
```

```html
<ecl-editor
  value="< 404684003 |Clinical finding|"
  fhir-server-url="https://tx.ontoserver.csiro.au/fhir"
  height="400px"
></ecl-editor>
```

### Script Tag

When loaded via `<script>` (non-module), the element auto-registers as `<ecl-editor>`.

```html
<script src="monaco-editor/min/vs/loader.js"></script>
<script src="ecl-editor/dist/index.js"></script>

<ecl-editor value="<< 404684003"></ecl-editor>
```

No worker setup is needed on this path - the AMD loader configures its own.

## Monaco web workers

`monaco-editor` is a peer dependency, so wiring its web worker into your bundler
is your responsibility. Skipping it is not fatal but is expensive and silent: on
monaco 0.56.0, formatting takes **~1025 ms** without the worker versus
**~15-150 ms** with it.

```typescript
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'; // vite

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};
```

The specifier is `monaco-editor/editor/editor.worker` on monaco >= 0.56.0 and
`monaco-editor/esm/vs/editor/editor.worker` on <= 0.55.x - 0.56.0 reorganised its
ESM entry points. Webpack users can use `monaco-editor-webpack-plugin` instead,
and the AMD loader needs nothing.

Full details, including why it matters, are in
[`@aehrc/ecl-editor-core`](../ecl-editor-core/README.md#monaco-web-workers).

## Attributes

| Attribute             | Type      | Default                                 | Description                                      |
| --------------------- | --------- | --------------------------------------- | ------------------------------------------------ |
| `value`               | `string`  | `''`                                    | Editor content                                   |
| `fhir-server-url`     | `string`  | `'https://tx.ontoserver.csiro.au/fhir'` | FHIR terminology server URL                      |
| `snomed-version`      | `string`  | `''`                                    | SNOMED CT edition/version URI                    |
| `theme`               | `string`  | `'vs'`                                  | Monaco theme (`'vs'`, `'vs-dark'`, `'hc-black'`) |
| `height`              | `string`  | `'300px'`                               | Editor height                                    |
| `width`               | `string`  | `'100%'`                                | Editor width                                     |
| `read-only`           | `boolean` | `false`                                 | Read-only mode                                   |
| `minimap`             | `boolean` | `false`                                 | Show minimap                                     |
| `line-numbers`        | `boolean` | `true`                                  | Show line numbers                                |
| `semantic-validation` | `boolean` | `true`                                  | Enable semantic validation                       |
| `cors-proxy`          | `string`  |                                         | CORS proxy URL prefix                            |

## Events

| Event             | Detail                              | Description                       |
| ----------------- | ----------------------------------- | --------------------------------- |
| `ecl-change`      | `{ value: string }`                 | Fired when editor content changes |
| `ecl-diagnostics` | `{ diagnostics: CoreDiagnostic[] }` | Fired when diagnostics update     |

```javascript
document.querySelector('ecl-editor').addEventListener('ecl-change', (e) => {
  console.log('New value:', e.detail.value);
});
```

## Keyboard Shortcuts

| Shortcut               | Action               |
| ---------------------- | -------------------- |
| Cmd+Space / Ctrl+Space | Autocomplete         |
| Shift+Alt+F            | Format document      |
| Shift+Alt+T            | Toggle display terms |
| Cmd+. / Ctrl+.         | Quick fix            |

## Methods

| Method             | Returns            | Description             |
| ------------------ | ------------------ | ----------------------- |
| `format()`         | `void`             | Format the document     |
| `getDiagnostics()` | `CoreDiagnostic[]` | Get current diagnostics |

## Storybook

```bash
cd packages/ecl-editor
npm run storybook
```

## License

Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO) ABN 41 687 119 230

Apache License 2.0 — see [LICENSE](../../LICENSE).
