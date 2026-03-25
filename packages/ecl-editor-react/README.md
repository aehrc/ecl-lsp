# @aehrc/ecl-editor-react

React component for editing SNOMED CT Expression Constraint Language (ECL) expressions with Monaco Editor.

Built on [ecl-editor-core](../ecl-editor-core/).

## Install

```bash
npm install @aehrc/ecl-editor-react
```

**Peer dependencies:** `@monaco-editor/react` >= 4.6.0, `monaco-editor` >= 0.40.0, `react` >= 18.0.0, `react-dom` >= 18.0.0

## Usage

```tsx
import { EclEditor } from '@aehrc/ecl-editor-react';

function App() {
  const [value, setValue] = useState('<< 404684003 |Clinical finding|');

  return (
    <EclEditor value={value} onChange={setValue} fhirServerUrl="https://tx.ontoserver.csiro.au/fhir" height="400px" />
  );
}
```

## Props

| Prop                      | Type                                      | Default                                 | Description                                      |
| ------------------------- | ----------------------------------------- | --------------------------------------- | ------------------------------------------------ |
| `value`                   | `string`                                  |                                         | Controlled editor value                          |
| `defaultValue`            | `string`                                  |                                         | Uncontrolled initial value                       |
| `onChange`                | `(value: string) => void`                 |                                         | Called when content changes                      |
| `fhirServerUrl`           | `string`                                  | `'https://tx.ontoserver.csiro.au/fhir'` | FHIR terminology server URL                      |
| `snomedVersion`           | `string`                                  | `''`                                    | SNOMED CT edition/version URI                    |
| `formattingOptions`       | `Partial<FormattingOptions>`              |                                         | ECL formatting options                           |
| `semanticValidation`      | `boolean`                                 | `true`                                  | Enable semantic validation                       |
| `semanticDebounceMs`      | `number`                                  | `500`                                   | Semantic validation debounce (ms)                |
| `corsProxy`               | `string`                                  |                                         | CORS proxy URL prefix                            |
| `onDiagnostics`           | `(diagnostics: CoreDiagnostic[]) => void` |                                         | Called when diagnostics update                   |
| `onResolvedSnomedVersion` | `(uri: string) => void`                   |                                         | Called when SNOMED version is resolved           |
| `readOnly`                | `boolean`                                 | `false`                                 | Read-only mode                                   |
| `theme`                   | `string`                                  | `'vs'`                                  | Monaco theme (`'vs'`, `'vs-dark'`, `'hc-black'`) |
| `height`                  | `string \| number`                        | `'300px'`                               | Editor height                                    |
| `width`                   | `string \| number`                        | `'100%'`                                | Editor width                                     |
| `minimap`                 | `boolean`                                 | `false`                                 | Show minimap                                     |
| `lineNumbers`             | `boolean`                                 | `true`                                  | Show line numbers                                |
| `options`                 | `IStandaloneEditorConstructionOptions`    |                                         | Additional Monaco editor options                 |
| `terminologyService`      | `ITerminologyService`                     |                                         | Custom terminology service                       |

## Keyboard Shortcuts

| Shortcut               | Action               |
| ---------------------- | -------------------- |
| Cmd+Space / Ctrl+Space | Autocomplete         |
| Shift+Alt+F            | Format document      |
| Shift+Alt+T            | Toggle display terms |
| Cmd+. / Ctrl+.         | Quick fix            |

## Hook

The `useEclEditor` hook provides state management for controlled usage:

```tsx
import { EclEditor, useEclEditor } from '@aehrc/ecl-editor-react';

function App() {
  const editor = useEclEditor({ initialValue: '<< 404684003' });

  return (
    <>
      <EclEditor value={editor.value} onChange={editor.onChange} onDiagnostics={editor.onDiagnostics} />
      <p>Errors: {editor.diagnostics.length}</p>
      <button onClick={editor.format}>Format</button>
    </>
  );
}
```

**Returns:** `{ value, setValue, diagnostics, format, getValue, onChange, onDiagnostics }`

## Storybook

```bash
cd packages/ecl-editor-react
npm run storybook
```

## License

Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO) ABN 41 687 119 230

Apache License 2.0 — see [LICENSE](../../LICENSE).
