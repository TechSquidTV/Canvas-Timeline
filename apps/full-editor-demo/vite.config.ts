import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, lazyPlugins } from 'vite-plus';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const workspaceRoot = path.resolve(appRoot, '../..');

export default defineConfig({
  plugins: lazyPlugins(() => [react(), tailwindcss()]),
  resolve: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(appRoot, 'src'),
      },
      {
        find: /^@techsquidtv\/canvas-timeline-core$/,
        replacement: path.resolve(workspaceRoot, 'packages/core/src/index.ts'),
      },
      {
        find: /^@techsquidtv\/canvas-timeline-core\/(.*)$/,
        replacement: path.resolve(workspaceRoot, 'packages/core/src/$1'),
      },
      {
        find: /^@techsquidtv\/canvas-timeline-mediabunny-adapter$/,
        replacement: path.resolve(workspaceRoot, 'packages/mediabunny-adapter/src/index.ts'),
      },
      {
        find: /^@techsquidtv\/canvas-timeline-mediabunny-adapter\/(.*)$/,
        replacement: path.resolve(workspaceRoot, 'packages/mediabunny-adapter/src/$1'),
      },
      {
        find: /^@techsquidtv\/canvas-timeline-react$/,
        replacement: path.resolve(workspaceRoot, 'packages/react/src/index.ts'),
      },
      {
        find: /^@techsquidtv\/canvas-timeline-react\/(.*)$/,
        replacement: path.resolve(workspaceRoot, 'packages/react/src/$1'),
      },
      {
        find: /^@techsquidtv\/canvas-timeline-renderer$/,
        replacement: path.resolve(workspaceRoot, 'packages/renderer/src/index.ts'),
      },
      {
        find: /^@techsquidtv\/canvas-timeline-renderer\/(.*)$/,
        replacement: path.resolve(workspaceRoot, 'packages/renderer/src/$1'),
      },
      {
        find: /^@techsquidtv\/canvas-timeline-utils$/,
        replacement: path.resolve(workspaceRoot, 'packages/utils/src/index.ts'),
      },
      {
        find: /^@techsquidtv\/canvas-timeline-utils\/(.*)$/,
        replacement: path.resolve(workspaceRoot, 'packages/utils/src/$1'),
      },
    ],
  },
});
