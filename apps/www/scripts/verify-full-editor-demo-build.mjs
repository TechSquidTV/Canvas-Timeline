import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const appRoot = resolve(import.meta.dirname, '..');
const distRoot = join(appRoot, 'dist/client');
const demoRoute = '/demos/full-editor-demo/';
const demoIndexPath = join(distRoot, 'demos/full-editor-demo/index.html');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!existsSync(demoIndexPath)) {
  fail(`Missing full editor demo build at ${relative(appRoot, demoIndexPath)}.`);
  process.exit();
}

const html = readFileSync(demoIndexPath, 'utf8');
const assetPaths = [
  ...new Set(
    [...html.matchAll(/\b(?:src|href)="([^"]+)"/gu)]
      .map((match) => match[1])
      .filter((value) => value.includes('/assets/'))
  ),
];

if (assetPaths.length === 0) {
  fail('Full editor demo build does not reference any emitted assets.');
}

for (const assetPath of assetPaths) {
  if (!assetPath.startsWith(`${demoRoute}assets/`)) {
    fail(
      `Full editor demo asset uses the wrong base path: ${assetPath}. Expected ${demoRoute}assets/.`
    );
    continue;
  }

  const assetFilePath = join(distRoot, assetPath.slice(1));
  if (!existsSync(assetFilePath)) {
    fail(
      `Full editor demo asset is referenced but missing: ${relative(dirname(demoIndexPath), assetFilePath)}.`
    );
  }
}

if (process.exitCode) {
  process.exit();
}

console.info(`Verified ${assetPaths.length} full editor demo build assets.`);
