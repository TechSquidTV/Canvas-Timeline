import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createWorkspaceAliases } from '@techsquidtv/canvas-timeline-scripts/workspace-aliases';
import { fileURLToPath } from 'node:url';
import { defineConfig, lazyPlugins } from 'vite-plus';

const appSourceRoot = fileURLToPath(new URL('src', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  base: process.env.CANVAS_TIMELINE_FULL_EDITOR_BASE ?? '/',
  build: {
    chunkSizeWarningLimit: 1024,
    rolldownOptions: {
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              includeDependenciesRecursively: false,
              name: 'mediabunny-aac-encoder',
              priority: 40,
              test: /node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?@mediabunny[\\/]aac-encoder[\\/]/,
            },
            {
              name: 'react-vendor',
              priority: 20,
              test: /node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:react|react-dom|scheduler)[\\/]/,
            },
            {
              name: 'timeline-vendor',
              priority: 15,
              test: /[\\/]packages[\\/](?:core|mediabunny-adapter|react|renderer|utils)[\\/]src[\\/]/,
            },
          ],
        },
      },
    },
  },
  plugins: lazyPlugins(() => [react(), tailwindcss()]),
  resolve: {
    alias: createWorkspaceAliases({
      workspaceRoot,
      internalAliasOverrides: {
        'full-editor': appSourceRoot,
      },
      packageAliases: ['core', 'mediabunny-adapter', 'react', 'renderer', 'utils'],
    }),
  },
});
