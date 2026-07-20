import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeHtmlAttribute } from '#www/lib/html-entities';
import { assertUniqueSearchDocumentUrls } from '#www/lib/search';

type SearchDocumentKind = 'docs' | 'package' | 'demo' | 'registry' | 'blog' | 'api';

interface SearchCatalogDocument {
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly kind: SearchDocumentKind;
  readonly weight: number;
  readonly packageSlug?: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly sourcePath: string;
}

interface SearchCatalog {
  readonly generatedAt: string;
  readonly documents: readonly SearchCatalogDocument[];
  readonly counts: Readonly<Record<SearchDocumentKind, number>>;
  readonly excludedHtmlPages: readonly string[];
}

const searchDocumentKinds = new Set<SearchDocumentKind>([
  'docs',
  'package',
  'demo',
  'registry',
  'blog',
  'api',
]);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '../..');
const distDir = resolve(appDir, 'dist/client');
const generatedDir = resolve(appDir, '.generated');
const catalogPath = resolve(generatedDir, 'search-catalog.json');

const htmlPaths = await listHtmlFiles(distDir);
const documents: SearchCatalogDocument[] = [];
const excludedHtmlPages: string[] = [];

for (const htmlPath of htmlPaths) {
  const source = await readFile(htmlPath, 'utf8');
  const sourcePath = relative(distDir, htmlPath);

  if (!source.includes('data-pagefind-body')) {
    excludedHtmlPages.push(sourcePath);
    continue;
  }

  const metadata = collectMetadata(source);
  const kind = collectKind(source);
  const url = collectCanonicalPath(source);
  const weight = collectWeight(source);

  if (!kind || !searchDocumentKinds.has(kind)) {
    throw new Error(`${sourcePath} is missing a supported Pagefind kind filter.`);
  }

  for (const key of ['title', 'description', 'kind', 'tags'] as const) {
    if (!metadata[key]) {
      throw new Error(`${sourcePath} is missing Pagefind ${key} metadata.`);
    }
  }

  if (!url) {
    throw new Error(`${sourcePath} is missing a canonical URL.`);
  }

  if (weight === undefined) {
    throw new Error(`${sourcePath} is missing a valid Pagefind weight.`);
  }

  documents.push({
    url,
    title: metadata.title,
    description: metadata.description,
    kind,
    weight,
    packageSlug: metadata.package,
    tags: splitTerms(metadata.tags),
    aliases: splitTerms(metadata.aliases ?? ''),
    sourcePath,
  });
}

assertUniqueSearchDocumentUrls(documents);

const counts = Object.fromEntries(
  [...searchDocumentKinds].map((kind) => [
    kind,
    documents.filter((document) => document.kind === kind).length,
  ])
) as Record<SearchDocumentKind, number>;
const catalog: SearchCatalog = {
  generatedAt: new Date().toISOString(),
  documents: documents.sort((first, second) => first.url.localeCompare(second.url)),
  counts,
  excludedHtmlPages: excludedHtmlPages.sort(),
};

for (const kind of searchDocumentKinds) {
  if (counts[kind] === 0) {
    throw new Error(`Pagefind catalog is missing ${kind} documents.`);
  }
}

await mkdir(generatedDir, { recursive: true });
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

console.info(
  `Generated ${relative(appDir, catalogPath)} with ${documents.length} documents: ` +
    [...searchDocumentKinds].map((kind) => `${kind}=${counts[kind]}`).join(', ')
);

async function listHtmlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        return listHtmlFiles(path);
      }

      return entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
    })
  );

  return paths.flat();
}

function collectMetadata(source: string): Record<string, string> {
  const metadata: Record<string, string> = {};

  for (const match of source.matchAll(/<meta\b[^>]*>/gu)) {
    const tag = match[0];
    const field = attributeValue(tag, 'data-pagefind-meta');
    const content = attributeValue(tag, 'content');

    if (!field || !content) {
      continue;
    }

    metadata[field.replace(/\[.*$/u, '')] = decodeHtmlAttribute(content);
  }

  return metadata;
}

function collectKind(source: string): SearchDocumentKind | undefined {
  for (const match of source.matchAll(/<meta\b[^>]*>/gu)) {
    const filter = attributeValue(match[0], 'data-pagefind-filter');

    if (filter?.startsWith('kind:')) {
      return filter.slice('kind:'.length) as SearchDocumentKind;
    }
  }

  return undefined;
}

function collectCanonicalPath(source: string): string | undefined {
  const canonicalTag = source.match(/<link\b[^>]*rel="canonical"[^>]*>/u)?.[0];
  const canonicalUrl = canonicalTag ? attributeValue(canonicalTag, 'href') : undefined;

  if (!canonicalUrl) {
    return undefined;
  }

  return new URL(canonicalUrl).pathname;
}

function collectWeight(source: string): number | undefined {
  const bodyTag = source.match(/<main\b[^>]*>/u)?.[0];
  const value = bodyTag ? attributeValue(bodyTag, 'data-pagefind-weight') : undefined;

  if (!value) {
    return undefined;
  }

  const weight = Number(value);

  return Number.isFinite(weight) && weight >= 0 && weight <= 10 ? weight : undefined;
}

function attributeValue(tag: string, attribute: string): string | undefined {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = tag.match(new RegExp(`\\b${escapedAttribute}="([^"]*)"`, 'u'));

  return match?.[1];
}

function splitTerms(value: string): string[] {
  return value
    .split('|')
    .map((term) => term.trim())
    .filter(Boolean);
}
