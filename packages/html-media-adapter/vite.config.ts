import { defineConfig } from 'vite-plus';
import { createLibraryPackConfig } from '../../scripts/vite-plus-pack-config.js';

export default defineConfig({
  pack: createLibraryPackConfig({
    entry: ['src/**/*.ts', '!src/**/*.test.ts'],
    neverBundle: [/^@techsquidtv\//, 'react', 'react/jsx-runtime'],
  }),
});
