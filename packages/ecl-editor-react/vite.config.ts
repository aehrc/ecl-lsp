import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [react(), dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@monaco-editor/react',
        'monaco-editor',
        '@aehrc/ecl-editor-core',
        '@aehrc/ecl-core',
      ],
    },
    sourcemap: true,
    minify: false,
  },
});
