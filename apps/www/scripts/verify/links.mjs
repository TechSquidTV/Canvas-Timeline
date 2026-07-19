import { access, readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { toString } from 'mdast-util-to-string';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '../..');
const workspaceDir = resolve(appDir, '..', '..');
const srcDir = resolve(appDir, 'src');
const contentDir = resolve(appDir, 'src/content');
const dataDir = resolve(appDir, 'src/data');
const publicDir = resolve(appDir, 'public');
const apiReferencePath = resolve(appDir, '.generated/api-reference.json');
const sameSiteHosts = new Set(['canvastimeline.com']);
const apiDocTextKeys = new Set(['summary', 'remarks', 'returnsSummary', 'examples', 'see']);
const generatedAssetPaths = new Set([
  '/pagefind/pagefind-component-ui.css',
  '/pagefind/pagefind-component-ui.js',
]);

const apiReference = await readApiReference().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
const contentFiles = await listFiles(contentDir, (path) => path.endsWith('.mdx'));
const dataFiles = await listFiles(dataDir, (path) => path.endsWith('.ts'));
const astroFiles = await listFiles(srcDir, (path) => path.endsWith('.astro'));
const routes = await buildRouteIndex(apiReference);
const errors = [];

for (const filePath of contentFiles) {
  const source = await readFile(filePath, 'utf8');
  const tree = unified().use(remarkParse).use(remarkMdx).parse(source);
  const headingSlugs = collectHeadingSlugs(tree);
  const contentRoute = contentRouteFor(filePath);

  if (contentRoute !== null) {
    routes.set(contentRoute, { sourcePath: filePath, headings: headingSlugs });
    routes.set(`${contentRoute}.md`, { sourcePath: filePath, headings: headingSlugs });
  }
}

for (const filePath of contentFiles) {
  const source = await readFile(filePath, 'utf8');
  const tree = unified().use(remarkParse).use(remarkMdx).parse(source);
  const contentRoute = contentRouteFor(filePath);

  for (const link of collectMdxLinks(tree)) {
    await validateReference({
      filePath,
      line: link.line,
      raw: link.url,
      sourceRoute: contentRoute,
    });
  }

  for (const codePath of collectWorkspacePathLiterals(tree)) {
    await validateWorkspacePath({
      filePath,
      line: codePath.line,
      referencedPath: codePath.path,
    });
  }
}

for (const filePath of dataFiles) {
  const source = await readFile(filePath, 'utf8');
  for (const link of collectDataLinks(source)) {
    await validateReference({
      filePath,
      line: link.line,
      raw: link.url,
      sourceRoute: null,
    });
  }
}

for (const filePath of astroFiles) {
  const source = await readFile(filePath, 'utf8');
  for (const link of collectAstroLiteralLinks(source)) {
    await validateReference({
      filePath,
      line: link.line,
      raw: link.url,
      sourceRoute: null,
    });
  }
}

for (const link of collectApiReferenceLinks(apiReference)) {
  await validateReference({
    filePath: apiReferencePath,
    line: 1,
    raw: link.url,
    sourceRoute: null,
  });
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(
  [
    `Verified ${contentFiles.length} content files`,
    `${dataFiles.length} data files`,
    `${astroFiles.length} Astro files`,
    `and ${routes.size} local routes.`,
  ].join(', ')
);

async function buildRouteIndex(reference) {
  const routeMap = new Map(
    [
      '/',
      '/sitemap-index.xml',
      '/docs',
      '/docs.md',
      '/blog',
      '/demos',
      '/packages',
      '/packages/react/registry',
    ].map((route) => [route, { sourcePath: null, headings: null }])
  );

  for (const filePath of contentFiles) {
    const route = contentRouteFor(filePath);
    if (route !== null) {
      routeMap.set(route, { sourcePath: filePath, headings: null });
      routeMap.set(`${route}.md`, { sourcePath: filePath, headings: null });
    }
  }

  for (const slug of extractSingleQuotedValues(await readAppSource('src/data/demos.ts'), 'slug')) {
    routeMap.set(`/demos/${slug}`, { sourcePath: null, headings: null });
  }

  for (const slug of extractSingleQuotedValues(
    await readAppSource('src/data/packages.ts'),
    'slug'
  )) {
    routeMap.set(`/packages/${slug}`, { sourcePath: null, headings: null });
    routeMap.set(`/packages/${slug}/api`, { sourcePath: null, headings: null });
    routeMap.set(`/packages/${slug}/api.md`, { sourcePath: null, headings: null });
  }

  for (const slug of extractSingleQuotedValues(
    await readAppSource('src/data/react-registry.ts'),
    'slug'
  )) {
    routeMap.set(`/packages/react/registry/${slug}`, { sourcePath: null, headings: null });
    routeMap.set(`/packages/react/registry/${slug}.llms.md`, {
      sourcePath: null,
      headings: null,
    });
  }

  for (const packageDoc of reference.packages ?? []) {
    for (const symbol of packageDoc.symbols ?? []) {
      routeMap.set(`/packages/${packageDoc.slug}/api/${symbol.slug}`, {
        sourcePath: null,
        headings: null,
      });
      routeMap.set(`/packages/${packageDoc.slug}/api/${symbol.slug}.md`, {
        sourcePath: null,
        headings: null,
      });
    }
  }

  return routeMap;
}

async function readApiReference() {
  try {
    return JSON.parse(await readFile(apiReferencePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `Missing ${relative(workspaceDir, apiReferencePath)}. ` +
          'Run "vp run --filter @techsquidtv/canvas-timeline-www docs:api" before docs:links.'
      );
    }

    throw error;
  }
}

function collectMdxLinks(tree) {
  const links = [];

  visit(tree, (node) => {
    if (node.type === 'link' || node.type === 'definition') {
      links.push({
        url: node.url,
        line: node.position?.start.line ?? 1,
      });
    }

    if (
      (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
      Array.isArray(node.attributes)
    ) {
      for (const attribute of node.attributes) {
        if (
          (attribute.name === 'href' || attribute.name === 'src') &&
          typeof attribute.value === 'string'
        ) {
          links.push({
            url: attribute.value,
            line: attribute.position?.start.line ?? node.position?.start.line ?? 1,
          });
        }
      }
    }
  });

  return links;
}

function collectWorkspacePathLiterals(tree) {
  const paths = [];

  visit(tree, (node) => {
    if (node.type !== 'inlineCode' && node.type !== 'code') {
      return;
    }

    for (const match of node.value.matchAll(
      /(?:apps|packages|scripts|tools|\.github)\/[^\s`"'<>),;]+/g
    )) {
      paths.push({
        path: match[0],
        line: node.position?.start.line ?? 1,
      });
    }
  });

  return paths;
}

function collectHeadingSlugs(tree) {
  const headings = new Map();

  visit(tree, 'heading', (node) => {
    const slug = slugifyHeading(toString(node));
    if (slug.length === 0) {
      return;
    }

    const count = headings.get(slug) ?? 0;
    headings.set(slug, count + 1);
    if (count > 0) {
      headings.set(`${slug}-${count}`, 1);
    }
  });

  return new Set(headings.keys());
}

function collectDataLinks(source) {
  return [...source.matchAll(/\b(?:externalUrl|href|url):\s*['"]([^'"]+)['"]/g)]
    .filter((match) => !isInsideTemplateLiteral(source, match.index))
    .map((match) => ({
      url: match[1],
      line: source.slice(0, match.index).split('\n').length,
    }));
}

function collectAstroLiteralLinks(source) {
  return [...source.matchAll(/\b(?:href|src)\s*=\s*(["'])([^"']*)\1/g)].map((match) => ({
    url: match[2],
    line: source.slice(0, match.index).split('\n').length,
  }));
}

function collectApiReferenceLinks(reference) {
  const links = [];
  collectApiDocLinks(reference, links, false);
  return links;
}

function collectApiDocLinks(value, links, collectStrings) {
  if (typeof value === 'string') {
    if (collectStrings) {
      for (const url of extractReferencesFromText(value)) {
        links.push({ url });
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectApiDocLinks(item, links, collectStrings);
    }
    return;
  }

  if (value === null || typeof value !== 'object') {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'source') {
      continue;
    }

    collectApiDocLinks(child, links, collectStrings || apiDocTextKeys.has(key));
  }
}

function extractReferencesFromText(value) {
  const references = new Set();

  for (const match of value.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    references.add(cleanReferenceToken(match[1]));
  }

  for (const match of value.matchAll(/\b(?:href|src)\s*=\s*(["'])([^"']*)\1/g)) {
    references.add(cleanReferenceToken(match[2]));
  }

  for (const match of value.matchAll(/https?:\/\/canvastimeline\.com(?:\/[^\s`"'<>)]*)?/giu)) {
    references.add(cleanReferenceToken(match[0]));
  }

  const prose = value.replace(/```[\s\S]*?```/g, '');
  for (const match of prose.matchAll(/(?<![\w@.:/-])(\/[A-Za-z0-9][^\s`"'<>),;\]}]*)/g)) {
    references.add(cleanReferenceToken(match[1]));
  }

  return [...references].filter((reference) => reference.length > 0);
}

function cleanReferenceToken(value) {
  return value.replace(/[.!?:;,]+$/u, '');
}

async function validateReference({ filePath, line, raw, sourceRoute }) {
  if (shouldSkipReference(raw)) {
    return;
  }

  const parsed = parseLocalReference(raw);
  if (parsed === null) {
    errors.push(`${formatLocation(filePath, line)} has unsupported relative link: ${raw}`);
    return;
  }

  if (parsed.path === '') {
    validateFragment(filePath, line, raw, sourceRoute, parsed.fragment);
    return;
  }

  if (routes.has(parsed.path)) {
    validateFragment(filePath, line, raw, parsed.path, parsed.fragment);
    return;
  }

  if (parsed.path.startsWith('/')) {
    await validatePublicPath(filePath, line, parsed.path, raw);
    return;
  }

  errors.push(`${formatLocation(filePath, line)} points to unknown local route: ${raw}`);
}

function validateFragment(filePath, line, raw, route, fragment) {
  if (!fragment) {
    return;
  }

  if (route === null) {
    return;
  }

  const routeEntry = routes.get(route);
  if (routeEntry?.headings === null) {
    return;
  }

  if (!routeEntry?.headings?.has(fragment)) {
    errors.push(`${formatLocation(filePath, line)} points to missing heading fragment: ${raw}`);
  }
}

async function validatePublicPath(filePath, line, routePath, raw) {
  if (generatedAssetPaths.has(routePath)) {
    return;
  }

  const publicPath = resolve(publicDir, routePath.slice(1));
  if (!isInsideDirectory(publicDir, publicPath)) {
    errors.push(`${formatLocation(filePath, line)} points outside public assets: ${raw}`);
    return;
  }

  try {
    await access(publicPath);
  } catch {
    errors.push(`${formatLocation(filePath, line)} points to unknown local route or asset: ${raw}`);
  }
}

async function validateWorkspacePath({ filePath, line, referencedPath }) {
  const absolutePath = resolve(workspaceDir, referencedPath);
  if (!isInsideDirectory(workspaceDir, absolutePath)) {
    errors.push(
      `${formatLocation(filePath, line)} references path outside workspace: ${referencedPath}`
    );
    return;
  }

  try {
    const referenceStats = await stat(absolutePath);
    if (referencedPath.endsWith('/') && !referenceStats.isDirectory()) {
      errors.push(
        `${formatLocation(filePath, line)} references ${referencedPath}, but it is not a directory.`
      );
    }
  } catch {
    errors.push(
      `${formatLocation(filePath, line)} references missing workspace path: ${referencedPath}`
    );
  }
}

function parseLocalReference(raw) {
  const normalized = normalizeReference(raw);
  const [withoutFragment, ...fragmentParts] = normalized.split('#');
  const fragment = fragmentParts.join('#');
  const [path] = withoutFragment.split('?');

  if (path === '') {
    return { path: '', fragment: fragment ?? '' };
  }

  if (path.startsWith('/')) {
    return {
      path: normalizeRoute(path),
      fragment: fragment ? decodeReferenceFragment(fragment) : '',
    };
  }

  return null;
}

function shouldSkipReference(raw) {
  if (isSameSiteReference(raw)) {
    return false;
  }

  return (
    raw === '' ||
    /^[a-z][a-z0-9+.-]*:/iu.test(raw) ||
    raw.startsWith('//') ||
    raw.startsWith('{') ||
    raw.startsWith('${')
  );
}

function normalizeReference(raw) {
  const url = parseSameSiteUrl(raw);
  if (url === null) {
    return raw;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function isSameSiteReference(raw) {
  return parseSameSiteUrl(raw) !== null;
}

function parseSameSiteUrl(raw) {
  try {
    const url = new URL(raw);
    const isHttp = url.protocol === 'https:' || url.protocol === 'http:';
    if (isHttp && sameSiteHosts.has(url.hostname)) {
      return url;
    }

    return null;
  } catch {
    return null;
  }
}

function decodeReferenceFragment(fragment) {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

function normalizeRoute(route) {
  if (route === '/') {
    return route;
  }

  return route.endsWith('/') ? route.slice(0, -1) : route;
}

function contentRouteFor(filePath) {
  const relativePath = relative(contentDir, filePath);
  const extension = extname(relativePath);
  const slug = relativePath.slice(0, -extension.length);

  if (slug.startsWith('docs/')) {
    return `/docs/${slug.slice('docs/'.length)}`;
  }

  if (slug.startsWith('blog/')) {
    return `/blog/${slug.slice('blog/'.length)}`;
  }

  return null;
}

function extractSingleQuotedValues(source, propertyName) {
  return [...source.matchAll(new RegExp(`\\b${propertyName}:\\s*'([^']+)'`, 'g'))].map(
    (match) => match[1]
  );
}

function isInsideDirectory(directory, path) {
  const relativePath = relative(directory, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

async function readAppSource(path) {
  return readFile(resolve(appDir, path), 'utf8');
}

async function listFiles(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        return listFiles(path, predicate);
      }

      return entry.isFile() && predicate(path) ? [path] : [];
    })
  );

  return files.flat();
}

function slugifyHeading(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`]/gu, '')
    .replace(/&/gu, 'and')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '');
}

function isInsideTemplateLiteral(source, index) {
  let escaped = false;
  let backticks = 0;

  for (let position = 0; position < index; position += 1) {
    const character = source[position];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (character === '`') {
      backticks += 1;
    }
  }

  return backticks % 2 === 1;
}

function formatLocation(filePath, line) {
  return `${relative(workspaceDir, filePath)}:${line}`;
}
