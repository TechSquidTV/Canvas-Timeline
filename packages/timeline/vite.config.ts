import { defineConfig } from 'vite-plus';
import { createLibraryPackConfig } from '@techsquidtv/canvas-timeline-scripts/library-pack';

export default defineConfig({
  pack: createLibraryPackConfig({
    entry: ['src/**/*.ts', '!src/**/*.test.ts'],
    neverBundle: [/^@techsquidtv\//, 'react'],
  }),
});
