/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * GitHub Pages serves 404.html for unknown paths. Shipping a copy of index.html as 404.html lets
 * deep links and page refreshes boot the SPA, which then routes client-side.
 */
function spaFallback(): Plugin {
  let outDir = 'dist';
  return {
    name: 'nukva-spa-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const index = path.join(outDir, 'index.html');
      if (fs.existsSync(index)) fs.copyFileSync(index, path.join(outDir, '404.html'));
    },
  };
}

function normalizeBase(value: string | undefined): string {
  if (!value || value === '/') return '/';
  return `/${value.replace(/^\/+|\/+$/g, '')}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Vercel and local builds serve from the domain root; GitHub Pages project sites need /<repo>/.
  const base = normalizeBase(env.VITE_BASE_PATH);
  return {
    base,
    plugins: [react(), tailwindcss(), spaFallback()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('motion')) return 'motion';
              if (id.includes('react-router')) return 'router';
              if (id.includes('react')) return 'react';
            }
            return undefined;
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
