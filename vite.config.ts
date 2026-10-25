import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 2000 },
  server: { port: 5173 },
  // Sim-heavy tests (founding city, crisis collapse) take 2-4 s locally and ~2.5x that on CI runners.
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
});
