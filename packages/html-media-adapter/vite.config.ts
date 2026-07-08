import { defineConfig } from 'vite-plus';
import { createLibraryPackConfig } from '@techsquidtv/canvas-timeline-scripts/vite-plus-pack-config';

export default defineConfig({
  pack: createLibraryPackConfig({
    entry: ['src/**/*.ts', '!src/**/*.test.ts'],
    neverBundle: [/^@techsquidtv\//, 'react', 'react/jsx-runtime'],
  }),
});
