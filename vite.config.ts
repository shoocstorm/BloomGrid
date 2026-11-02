import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

// The game's version comes from package.json, which `bun run release` bumps: every release shows its own number.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Cross-origin isolation unlocks SharedArrayBuffer, which the assistant's wllama needs for multi-threaded
// inference (as in Andai). Firebase Hosting sends the same headers (firebase.json).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 2000 },
  server: { port: 3000, headers: isolation },
  preview: { headers: isolation },
  optimizeDeps: { exclude: ['@wllama/wllama'] },
  // Sim-heavy tests (founding city, crisis collapse) take 2-4 s locally and ~2.5x that on CI runners.
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
});
