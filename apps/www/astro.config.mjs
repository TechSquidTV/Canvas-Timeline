import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import astroExpressiveCode from 'astro-expressive-code';
import tailwindcss from '@tailwindcss/vite';
import sentry from '@sentry/astro';
import { createWorkspaceAliases } from '@techsquidtv/canvas-timeline-scripts/workspace-aliases';
import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { expressiveCodeOptions } from '#www/lib/expressive-code-config.mjs';

const isBuild =
  process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'build';
const mediabunnySsrStubId = '\0mediabunny-ssr-stub';
const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const sentryDsn =
  process.env.PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? readWranglerSentryDsn();

function readWranglerSentryDsn() {
  const wranglerConfig = readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8');
  return wranglerConfig.match(/"PUBLIC_SENTRY_DSN":\s*"([^"]+)"/)?.[1];
}

function mediabunnySsrStub() {
  return {
    name: 'mediabunny-ssr-stub',
    enforce: 'pre',
    resolveId(id, _importer, options) {
      return options?.ssr === true && id === 'mediabunny' ? mediabunnySsrStubId : null;
    },
    load(id) {
      return id === mediabunnySsrStubId ? 'export {};' : null;
    },
  };
}

export default defineConfig({
  site: 'https://canvastimeline.com',
  adapter: cloudflare(),
  integrations: [
    sentry(),
    astroExpressiveCode({
      emitExternalStylesheet: false,
      ...expressiveCodeOptions,
    }),
    mdx(),
    react(),
    sitemap(),
  ],
  markdown: {
    syntaxHighlight: false,
  },
  vite: {
    cacheDir: isBuild ? 'node_modules/.vite-build' : 'node_modules/.vite-dev',
    define: sentryDsn
      ? {
          'import.meta.env.PUBLIC_SENTRY_DSN': JSON.stringify(sentryDsn),
        }
      : undefined,
    plugins: [mediabunnySsrStub(), tailwindcss()],
    resolve: {
      alias: createWorkspaceAliases({ workspaceRoot }),
    },
    build: {
      // Mediabunny is loaded only by the media-preview demo through dynamic import().
      chunkSizeWarningLimit: 700,
    },
    ssr: {
      optimizeDeps: {
        exclude: ['mediabunny'],
      },
      noExternal: [
        '@techsquidtv/canvas-timeline-react',
        '@techsquidtv/canvas-timeline-html-media-adapter',
        '@techsquidtv/canvas-timeline-mediabunny-adapter',
        '@techsquidtv/canvas-timeline',
      ],
    },
  },
});
