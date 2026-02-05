import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // monaco-editor cannot be resolved in jsdom (no browser entry point).
      // Redirect to a stub so vi.mock() can intercept it cleanly.
      'monaco-editor': path.resolve(__dirname, 'src/test/__mocks__/monaco-editor.ts'),
    },
  },
});
