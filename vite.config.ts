import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 2000 },
  server: { port: 5173 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
