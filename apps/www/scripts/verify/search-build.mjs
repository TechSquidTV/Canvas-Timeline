import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '../..');
const distDir = resolve(appDir, 'dist/client');
const catalogPath = resolve(appDir, '.generated/search-catalog.json');
const requiredPagefindAssets = [
  'pagefind/pagefind-component-ui.css',
  'pagefind/pagefind-component-ui.js',
];
const expectedKinds = ['docs', 'package', 'demo', 'registry', 'blog', 'api'];

await Promise.all(
  requiredPagefindAssets.map(async (assetPath) => {
    await access(resolve(distDir, assetPath));
  })
);

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));

if (!Array.isArray(catalog.documents) || catalog.documents.length === 0) {
  throw new Error('Pagefind search catalog did not contain any indexed documents.');
}

for (const kind of expectedKinds) {
  if (!Number.isInteger(catalog.counts?.[kind]) || catalog.counts[kind] < 1) {
    throw new Error(`Pagefind search catalog did not include ${kind} documents.`);
  }
}

const documentWeights = catalog.documents.map((document) => document.weight);

if (!documentWeights.every((weight) => Number.isFinite(weight) && weight >= 0 && weight <= 10)) {
  throw new Error('Pagefind search catalog contains an invalid document weight.');
}

const apiWeights = catalog.documents
  .filter((document) => document.kind === 'api')
  .map((document) => document.weight);
const guideWeights = catalog.documents
  .filter((document) => document.kind === 'docs')
  .map((document) => document.weight);

if (Math.max(...apiWeights) >= Math.min(...guideWeights)) {
  throw new Error('Pagefind API documents must rank below documentation guides.');
}

for (const document of catalog.documents) {
  if (typeof document.sourcePath !== 'string' || !document.sourcePath.endsWith('.html')) {
    throw new Error('Pagefind search catalog contains an invalid source path.');
  }

  const source = await readFile(resolve(distDir, document.sourcePath), 'utf8');

  if (!source.includes(`data-pagefind-filter="kind:${document.kind}"`)) {
    throw new Error(`${document.sourcePath} is missing its indexed Pagefind kind filter.`);
  }
}

console.info(
  `Verified Pagefind assets and ${catalog.documents.length} indexed documents in ${distDir}.`
);
