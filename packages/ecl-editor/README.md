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

| Attribute             | Type      | Default                                 | Description                                |
| --------------------- | --------- | --------------------------------------- | ------------------------------------------ |
| `value`               | `string`  | `''`                                    | Editor content                             |
| `fhir-server-url`     | `string`  | `'https://tx.ontoserver.csiro.au/fhir'` | FHIR terminology server URL                |
| `snomed-version`      | `string`  | `''`                                    | SNOMED CT edition/version URI              |
| `theme`               | `string`  | `'vs'`                                  | Monaco theme, or `'auto'` — see below      |
| `light-theme`         | `string`  | `'vs'`                                  | Theme used by `theme="auto"` in light mode |
| `dark-theme`          | `string`  | `'vs-dark'`                             | Theme used by `theme="auto"` in dark mode  |
| `height`              | `string`  | `'300px'`                               | Editor height                              |
| `width`               | `string`  | `'100%'`                                | Editor width                               |
| `read-only`           | `boolean` | `false`                                 | Read-only mode                             |
| `minimap`             | `boolean` | `false`                                 | Show minimap                               |
| `gutter`              | `string`  | `'full'`                                | Gutter preset — see below                  |
| `line-numbers`        | `string`  | `'on'`                                  | `on`, `off`, `relative` or `interval`      |
| `glyph-margin`        | `boolean` | `true`                                  | Show the glyph margin                      |
| `folding`             | `boolean` | `true`                                  | Show folding controls                      |
| `semantic-validation` | `boolean` | `true`                                  | Enable semantic validation                 |
| `cors-proxy`          | `string`  |                                         | CORS proxy URL prefix                      |

## Dark mode

The `theme` attribute takes any Monaco theme name (`vs`, `vs-dark`, `hc-black`, `hc-light`,
or one you registered yourself), plus a special value `auto`:

```html
<ecl-editor theme="auto"></ecl-editor>
```

`auto` follows the operating system's `prefers-color-scheme` and **switches live** when it
changes — no reload or attribute update needed. It picks `vs` or `vs-dark` by default; point
it at your own themes with `light-theme` and `dark-theme`:

```html
<ecl-editor theme="auto" light-theme="my-light" dark-theme="my-dark"></ecl-editor>
```

The default is still `vs`, so existing embedders keep a light editor regardless of OS
setting. Opt in with `auto` when you want the editor to follow the page.

The element's own chrome (the shortcut hints bar and resize handle) is recoloured to match,
and an `ecl-theme-change` event fires whenever the resolved theme changes, so you can keep
surrounding UI in sync. The current theme is also readable as a property:

```javascript
document.querySelector('ecl-editor').resolvedTheme; // 'vs-dark'
```

> **Note:** Monaco applies themes globally, so all editors on a page share one theme. Mixing
> a light and a dark `<ecl-editor>` on the same page is a Monaco limitation, not this
> component's.

## Gutter

Monaco's left margin holds line numbers, the glyph margin (where the quick-fix lightbulb
appears) and folding controls. For a compact single-expression input that margin is often
wasted space, so `gutter` offers three presets:

| Preset    | Line numbers | Glyph margin | Folding | Use for                                |
| --------- | ------------ | ------------ | ------- | -------------------------------------- |
| `full`    | yes          | yes          | yes     | Default — a full editing surface       |
| `minimal` | no           | yes          | no      | Compact, but quick fixes still visible |
| `none`    | no           | no           | no      | No left margin at all                  |

```html
<ecl-editor gutter="none" height="60px"></ecl-editor>
```

`none` zeroes the reserved widths as well as hiding the content — setting `line-numbers`
alone leaves Monaco still reserving the column.

The individual `line-numbers`, `glyph-margin` and `folding` attributes override whichever
preset is in effect, so you can start from a preset and adjust one thing:

```html
<!-- No glyph margin or folding, but keep relative line numbers -->
<ecl-editor gutter="none" line-numbers="relative"></ecl-editor>
```

> **Note:** `gutter="none"` removes the glyph margin, which is where the quick-fix lightbulb
> renders. Quick fixes still work via Cmd+. / Ctrl+., but there is no lightbulb to click.
> Use `minimal` if you want a compact gutter that keeps it.

All of these attributes can be changed at runtime and take effect immediately.

## Events

| Event              | Detail                              | Description                           |
| ------------------ | ----------------------------------- | ------------------------------------- |
| `ecl-change`       | `{ value: string }`                 | Fired when editor content changes     |
| `ecl-diagnostics`  | `{ diagnostics: CoreDiagnostic[] }` | Fired when diagnostics update         |
| `ecl-theme-change` | `{ theme: string, dark: boolean }`  | Fired when the resolved theme changes |

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

## Properties

| Property        | Type     | Description                                                      |
| --------------- | -------- | ---------------------------------------------------------------- |
| `value`         | `string` | Editor content (get/set)                                         |
| `resolvedTheme` | `string` | The Monaco theme currently applied, after resolving `auto` (get) |

## Storybook

```bash
cd packages/ecl-editor
npm run storybook
```

## License

Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO) ABN 41 687 119 230

Apache License 2.0 — see [LICENSE](../../LICENSE).
