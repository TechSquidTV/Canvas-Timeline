import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..');
const demosPath = resolve(appDir, 'src/data/demos.ts');
const registryPath = resolve(appDir, 'src/data/demo-code.ts');
const componentRegistryPath = resolve(appDir, 'src/data/demo-components.ts');

const demosSource = await readFile(demosPath, 'utf8');
const registrySource = await readFile(registryPath, 'utf8');
const componentRegistrySource = await readFile(componentRegistryPath, 'utf8');
const registryObjectSource = registryBlockSource(registrySource, 'demoCodeExamples');
const componentRegistryObjectSource = registryBlockSource(
  componentRegistrySource,
  'liveDemoLoaders'
);

const liveDemoIds = [...demosSource.matchAll(/liveDemoId:\s*'([^']+)'/g)].map((match) => match[1]);
const registryIds = [
  ...registryObjectSource.matchAll(/^ {2}(?:'([^']+)'|([A-Za-z_$][\w$]*)):\s*{/gm),
].map((match) => match[1] ?? match[2]);
const componentRegistryIds = [
  ...componentRegistryObjectSource.matchAll(/^ {2}(?:'([^']+)'|([A-Za-z_$][\w$]*)):\s*/gm),
].map((match) => match[1] ?? match[2]);
const sourceFilesById = new Map();
const entryBlocks = new Map();

for (const id of registryIds) {
  const block = registryBlock(id);
  entryBlocks.set(id, block);
  const files = [
    ...block.matchAll(/(?:component|data|styles|utilities):\s*(?:'([^']+)'|\[([\s\S]*?)\])/g),
  ].flatMap((fileMatch) => {
    if (fileMatch[1] !== undefined) {
      return [fileMatch[1]];
    }

    return [...fileMatch[2].matchAll(/'([^']+)'/g)].map((arrayMatch) => arrayMatch[1]);
  });
  sourceFilesById.set(id, files);
}

const errors = [];

for (const id of liveDemoIds) {
  if (!registryIds.includes(id)) {
    errors.push(`liveDemoId "${id}" is used by docs metadata but missing from demoCodeExamples.`);
  }
  if (!componentRegistryIds.includes(id)) {
    errors.push(`liveDemoId "${id}" is used by docs metadata but missing from liveDemoLoaders.`);
  }
}

for (const id of registryIds) {
  if (!liveDemoIds.includes(id)) {
    errors.push(`demoCodeExamples contains "${id}" but no docs metadata uses it.`);
  }

  const block = entryBlocks.get(id) ?? '';
  for (const fileKey of ['component', 'data']) {
    if (!new RegExp(`\\b${fileKey}:\\s*'[^']+'`).test(block)) {
      errors.push(`demoCodeExamples["${id}"] must list ${fileKey} in sourceFiles.`);
    }
  }

  const files = sourceFilesById.get(id) ?? [];
  for (const file of files) {
    try {
      const absolutePath = resolve(appDir, '..', '..', file);
      await access(absolutePath);
      const source = await readFile(absolutePath, 'utf8');

      if (/import\s+['"]\.\/timeline-editor\.css['"]/.test(source)) {
        if (!/\bcss:\s*/.test(block)) {
          errors.push(`demoCodeExamples["${id}"] imports timeline-editor.css but has no CSS tab.`);
        }
        if (!/\bstyles:\s*'[^']+'/.test(block)) {
          errors.push(
            `demoCodeExamples["${id}"] imports timeline-editor.css but does not list styles in sourceFiles.`
          );
        }
      }

      if (file.endsWith('timeline-demo-data.ts') && /\bcolor:\s*['"]#/.test(source)) {
        errors.push(`demoCodeExamples["${id}"] defines demo clip or marker colors in ${file}.`);
      }

      if (
        file.endsWith('DOMTimelineComponents.tsx') &&
        /backgroundColor:\s*clip\.color\s*\|\|/.test(source)
      ) {
        errors.push(`demoCodeExamples["${id}"] defines a hardcoded DOM clip fallback in ${file}.`);
      }

      if (file.endsWith('timeline-controls.tsx') && /const\s+markerColor\s*=/.test(source)) {
        errors.push(`demoCodeExamples["${id}"] defines a hardcoded marker color in ${file}.`);
      }
    } catch {
      errors.push(`demoCodeExamples["${id}"] points to missing source file: ${file}`);
    }
  }
}

for (const id of componentRegistryIds) {
  if (!liveDemoIds.includes(id)) {
    errors.push(`liveDemoLoaders contains "${id}" but no docs metadata uses it.`);
  }
}

const expectedTabs = ['tsx', 'data'];
for (const id of registryIds) {
  const block = entryBlocks.get(id) ?? '';
  for (const tab of expectedTabs) {
    if (!new RegExp(`\\b${tab}:`).test(block)) {
      errors.push(`demoCodeExamples["${id}"] is missing the ${tab} code tab source.`);
    }
  }

  if (!/\btsx:\s*toCopyableDemoSource\(/.test(block)) {
    errors.push(
      `demoCodeExamples["${id}"] must project the Component tab through toCopyableDemoSource.`
    );
  }

  if (!/\bdata:\s*toCopyableDemoSource\(/.test(block)) {
    errors.push(
      `demoCodeExamples["${id}"] must project the Data tab through toCopyableDemoSource.`
    );
  }

  if (/\bcss:\s*/.test(block) && !/\bcss:\s*\w+StylesSource/.test(block)) {
    errors.push(`demoCodeExamples["${id}"] must source CSS tabs from a raw stylesheet import.`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(`Verified ${registryIds.length} source-backed docs demos.`);

function registryKey(id) {
  return id.includes('-') ? `  '${id}': {` : `  ${id}: {`;
}

function registryBlockSource(source, exportName) {
  const start = source.indexOf(`export const ${exportName}`);
  if (start === -1) {
    return '';
  }

  const objectStart = source.indexOf('{', start);
  const objectEnd = source.indexOf('\n};', objectStart);

  if (objectStart === -1 || objectEnd === -1) {
    return '';
  }

  return source.slice(objectStart + 1, objectEnd);
}

function registryBlock(id) {
  const start = registryObjectSource.indexOf(registryKey(id));
  if (start === -1) {
    return '';
  }

  const nextStarts = registryIds
    .filter((candidate) => candidate !== id)
    .map((candidate) => registryObjectSource.indexOf(registryKey(candidate), start + 1))
    .filter((index) => index > start);
  const end = Math.min(...nextStarts, registryObjectSource.length);

  return registryObjectSource.slice(start, end);
}
