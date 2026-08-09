import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@hoops/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  // Baked in so a shared build already knows where the server is.
  define: {
    __HOOPS_SERVER_URL__: JSON.stringify(process.env.HOOPS_SERVER_URL ?? ''),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
