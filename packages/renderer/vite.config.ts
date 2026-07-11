import { defineConfig } from 'vite-plus';
import { createLibraryPackConfig } from '@techsquidtv/canvas-timeline-scripts/library-pack';

export default defineConfig({
  pack: createLibraryPackConfig({
    entry: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}'],
    neverBundle: [/^@techsquidtv\//, 'react', 'react/jsx-runtime'],
    sourcemap: false,
  }),
});
