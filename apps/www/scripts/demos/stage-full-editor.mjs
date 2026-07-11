import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const sourceDir = join(appRoot, '../full-editor-demo/dist');
const outputDir = join(appRoot, 'public/demos/full-editor-demo');
const legacyOutputDir = join(appRoot, 'public/full-editor-demo');

await rm(outputDir, { force: true, recursive: true });
await rm(legacyOutputDir, { force: true, recursive: true });
await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputDir, { recursive: true });

console.info('Staged full editor demo at public/demos/full-editor-demo.');
