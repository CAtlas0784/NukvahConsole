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

/**
 * Serves the local game-icon cache (`.cache/game-assets`, filled by `npm run assets`) at
 * `/game-assets/` for `vite dev` and `vite preview` only. The folder is git-ignored and is never
 * copied into `dist/`, so a deployed build contains no game artwork.
 */
function localGameAssets(): Plugin {
  const dir = path.resolve(import.meta.dirname, '.cache/game-assets');
  const middleware = (req: { url?: string }, res: import('node:http').ServerResponse, next: () => void) => {
    // Icons, plus index.json: the verified-key list written by scripts/verify-assets.mjs.
    const match = /\/game-assets\/(UI_[A-Za-z0-9_]+\.png|index\.json)(?:\?.*)?$/.exec(req.url ?? '');
    if (!match) return next();
    const file = path.join(dir, match[1]);
    if (!fs.existsSync(file)) {
      res.statusCode = 404;
      return res.end();
    }
    const isIndex = match[1] === 'index.json';
    res.setHeader('Content-Type', isIndex ? 'application/json' : 'image/png');
    res.setHeader('Cache-Control', isIndex ? 'no-cache' : 'public, max-age=86400');
    fs.createReadStream(file).pipe(res);
  };
  return {
    name: 'nukva-local-game-assets',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
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
    plugins: [react(), tailwindcss(), spaFallback(), localGameAssets()],
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
