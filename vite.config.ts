import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Cross-origin isolation unlocks SharedArrayBuffer, which the assistant's wllama needs for multi-threaded
// inference (as in Andai). Firebase Hosting sends the same headers (firebase.json).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 2000 },
  server: { port: 5173, headers: isolation },
  preview: { headers: isolation },
  optimizeDeps: { exclude: ['@wllama/wllama'] },
  // Sim-heavy tests (founding city, crisis collapse) take 2-4 s locally and ~2.5x that on CI runners.
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
});
