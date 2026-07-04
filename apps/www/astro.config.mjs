import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import astroExpressiveCode from 'astro-expressive-code';
import tailwindcss from '@tailwindcss/vite';
import sentry from '@sentry/astro';
import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { expressiveCodeOptions } from './src/lib/expressive-code-config.mjs';

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
      alias: [
        {
          find: /^@techsquidtv\/canvas-timeline-core$/,
          replacement: `${workspaceRoot}/packages/core/src/index.ts`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-core\/(.*)$/,
          replacement: `${workspaceRoot}/packages/core/src/$1`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-react$/,
          replacement: `${workspaceRoot}/packages/react/src/index.ts`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-react\/range-scrollbar$/,
          replacement: `${workspaceRoot}/packages/react/src/rangeScrollbar/index.ts`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-react\/timecode-field$/,
          replacement: `${workspaceRoot}/packages/react/src/timecodeField/index.ts`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-react\/timecode-input$/,
          replacement: `${workspaceRoot}/packages/react/src/timecodeInput/index.ts`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-react\/(.*)$/,
          replacement: `${workspaceRoot}/packages/react/src/$1`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-html-media-adapter$/,
          replacement: `${workspaceRoot}/packages/html-media-adapter/src/index.ts`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-html-media-adapter\/(.*)$/,
          replacement: `${workspaceRoot}/packages/html-media-adapter/src/$1`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-mediabunny-adapter$/,
          replacement: `${workspaceRoot}/packages/mediabunny-adapter/src/index.ts`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-mediabunny-adapter\/(.*)$/,
          replacement: `${workspaceRoot}/packages/mediabunny-adapter/src/$1`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-renderer$/,
          replacement: `${workspaceRoot}/packages/renderer/src/index.ts`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-renderer\/(.*)$/,
          replacement: `${workspaceRoot}/packages/renderer/src/$1`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-utils$/,
          replacement: `${workspaceRoot}/packages/utils/src/index.ts`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline-utils\/(.*)$/,
          replacement: `${workspaceRoot}/packages/utils/src/$1`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline$/,
          replacement: `${workspaceRoot}/packages/timeline/src/index.ts`,
        },
        {
          find: /^@techsquidtv\/canvas-timeline\/(.*)$/,
          replacement: `${workspaceRoot}/packages/timeline/src/$1`,
        },
      ],
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
