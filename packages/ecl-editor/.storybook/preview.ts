import type { Preview } from '@storybook/web-components-vite';
import * as monaco from 'monaco-editor';
// Vite turns a `?worker` import into a constructor for a bundled worker chunk.
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

// monaco 0.56.0 loads its editor worker through
// `new URL('...?esm', import.meta.url)`, which vite does not bundle. The fetch
// fails, and the formatting path waits for the worker before giving up and
// proceeding without it: measured at ~1025 ms per format, against ~15 ms on
// 0.55.1, whose worker vite could still resolve. Supplying the worker
// explicitly removes the stall and makes worker-backed services actually work.
//
// The specifier is `monaco-editor/editor/editor.worker`, not
// `monaco-editor/esm/vs/editor/editor.worker`: 0.56.0 rewrote its exports map so
// `./*` maps to `./esm/vs/*`, and the old deep path now resolves to a doubled
// `esm/vs/esm/vs/...` that does not exist. See #75.
(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// Expose Monaco globally so e2e tests can access the API
(window as any).monaco = monaco;

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
};

export default preview;
