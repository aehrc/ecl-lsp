import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['monaco-editor', '@aehrc/ecl-editor-core', '@aehrc/ecl-core'],
    },
    sourcemap: true,
    minify: false,
  },
});
