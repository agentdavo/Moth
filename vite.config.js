import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    rollupOptions: { input: { index: 'index.html', analysis: 'analysis.html' } },
  },
  worker: { format: 'es' },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  server: { host: '127.0.0.1', port: 5173 },
});
