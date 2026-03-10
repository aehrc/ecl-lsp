import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

export default defineConfig({
  plugins: [nodePolyfills({ include: ['process', 'util'] })],
  resolve: {
    alias: {
      'ecl-editor-core': path.resolve(__dirname, '../ecl-editor-core/src/index.ts'),
      'ecl-core': path.resolve(__dirname, '../ecl-core/src/index.ts'),
    },
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['iife'],
      name: 'EclEditor',
      fileName: () => 'ecl-editor.standalone.js',
    },
    rollupOptions: {
      // Monaco is loaded at runtime via AMD loader (sets window.monaco).
      // Mark it external so it doesn't get bundled.
      external: ['monaco-editor'],
      output: {
        globals: {
          'monaco-editor': 'monaco',
        },
      },
    },
    outDir: 'dist-standalone',
    sourcemap: true,
    minify: true,
  },
});
