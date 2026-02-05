# ecl-editor

Web Component (`<ecl-editor>`) for editing SNOMED CT Expression Constraint Language (ECL) expressions with Monaco Editor.

Built on [ecl-editor-core](../ecl-editor-core/).

## Install

```bash
npm install ecl-editor
```

**Peer dependency:** `monaco-editor` >= 0.40.0

## Usage

### Module

```typescript
import { defineEclEditor } from 'ecl-editor';

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

Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO) ABN 41 687 119 230

Apache License 2.0 — see [LICENSE](../../LICENSE).
