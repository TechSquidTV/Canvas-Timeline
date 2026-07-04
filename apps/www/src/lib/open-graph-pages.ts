import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoDocs } from '../data/demos';
import { packageDocs } from '../data/packages';
import { reactRegistryItems } from '../data/react-registry';
import { apiPackageHref, apiReference, apiSymbolHref } from './api-reference';

export interface OpenGraphPage {
  readonly title: string;
  readonly description: string;
}

type OpenGraphPageEntry = readonly [path: string, page: OpenGraphPage];

interface ContentEntry {
  readonly id: string;
  readonly data: Record<string, string>;
}

const contentRoot = new URL('../content/', import.meta.url);

const staticPages = [
  [
    '/',
    {
      title: 'React Timeline Component & Canvas Editor',
      description:
        'A high-performance canvas react timeline editor and component. Build frame-accurate editing interfaces in React with 60fps rendering, headless state, and customizable UI.',
    },
  ],
  [
    '/docs',
    {
      title: 'Canvas Timeline documentation',
      description:
        'Guides, package notes, interactive demos, and generated references for the Canvas Timeline package family.',
    },
  ],
  [
    '/packages',
    {
      title: 'Canvas Timeline Packages - React Timeline Editor',
      description:
        'Explore modular packages for the Canvas React timeline editor, including headless core engine, React component bindings, 60fps canvas renderer, and sync adapters.',
    },
  ],
  [
    '/packages/react/registry',
    {
      title: 'React Timeline Component Registry',
      description:
        'Browse the component registry for our React timeline component. Reusable primitives, interaction layers, and hook bindings for the canvas timeline editor.',
    },
  ],
  [
    '/demos',
    {
      title: 'Demos',
      description: 'Source-backed Canvas Timeline demos for editor basics.',
    },
  ],
  [
    '/blog',
    {
      title: 'Canvas Timeline Blog',
      description:
        'Engineering notes, release writeups, and practical guides for building high-performance React timeline editors with Canvas Timeline.',
    },
  ],
] as const satisfies readonly OpenGraphPageEntry[];

const packageSeoTitles: Record<string, string> = {
  timeline: 'React Timeline Editor Component - @techsquidtv/canvas-timeline',
  core: 'Headless Timeline Editor React Engine - @techsquidtv/canvas-timeline-core',
  react: 'React Timeline Component Hooks & UI - @techsquidtv/canvas-timeline-react',
  renderer: '60fps Canvas React Timeline Renderer - @techsquidtv/canvas-timeline-renderer',
  utils: 'React Timeline Rational Time Utilities - @techsquidtv/canvas-timeline-utils',
  'html-media-adapter':
    'React Timeline Component Media Sync - @techsquidtv/canvas-timeline-html-media-adapter',
  'mediabunny-adapter':
    'React Timeline Component Mediabunny Adapter - @techsquidtv/canvas-timeline-mediabunny-adapter',
};

export async function getOpenGraphPages(): Promise<Record<string, OpenGraphPage>> {
  const docsEntries = await readContentEntries('docs');
  const blogEntries = await readContentEntries('blog');
  const registryDocs = await readContentEntries('react-registry');
  const registryDocsByKey = new Map(
    registryDocs.map((entry) => [entry.data.registryKey, entry] as const)
  );

  return createOpenGraphPageMap([
    ...staticPages,
    ...docsEntries.map(
      (entry) =>
        [
          `/docs/${entry.id}`,
          {
            title: entry.data.title,
            description: entry.data.description,
          },
        ] as const
    ),
    ...blogEntries.map(
      (entry) =>
        [
          `/blog/${entry.id}`,
          {
            title: entry.data.title,
            description: entry.data.description,
          },
        ] as const
    ),
    ...demoDocs.map(
      (demoDoc) =>
        [
          `/demos/${demoDoc.slug}`,
          {
            title: demoDoc.title,
            description: demoDoc.description,
          },
        ] as const
    ),
    ...packageDocs.map(
      (packageDoc) =>
        [
          `/packages/${packageDoc.slug}`,
          {
            title: packageSeoTitles[packageDoc.slug] ?? packageDoc.name,
            description: packageDoc.description,
          },
        ] as const
    ),
    ...apiReference.packages.flatMap((packageDoc) => [
      [
        apiPackageHref(packageDoc.slug),
        {
          title: `${packageDoc.name} API`,
          description: `Generated API reference for ${packageDoc.name}.`,
        },
      ] as const,
      ...packageDoc.symbols.map(
        (symbol) =>
          [
            apiSymbolHref(packageDoc.slug, symbol.slug),
            {
              title: `${symbol.name} API`,
              description: symbol.summary || `Generated API reference for ${symbol.name}.`,
            },
          ] as const
      ),
    ]),
    ...reactRegistryItems.map((item) => {
      const entry = registryDocsByKey.get(item.slug);
      const pageTitle = entry?.data.title ?? item.title;
      const pageDescription = entry?.data.description ?? item.description;

      return [
        `/packages/react/registry/${item.slug}`,
        {
          title: `${pageTitle} | React Registry`,
          description: pageDescription,
        },
      ] as const;
    }),
  ]);
}

async function readContentEntries(collection: string): Promise<ContentEntry[]> {
  const collectionDirectory = new URL(`${collection}/`, contentRoot);
  const files = await listContentFiles(collectionDirectory);

  return Promise.all(files.map((file) => readContentEntry(collectionDirectory, file)));
}

async function listContentFiles(directory: URL): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryUrl = new URL(entry.name, directory);

      if (entry.isDirectory()) {
        return listContentFiles(new URL(`${entry.name}/`, directory));
      }

      return entry.isFile() && /\.(md|mdx)$/u.test(entry.name) ? [fileURLToPath(entryUrl)] : [];
    })
  );

  return files.flat().sort();
}

async function readContentEntry(collectionDirectory: URL, file: string): Promise<ContentEntry> {
  const body = await readFile(file, 'utf8');
  const data = readFrontmatter(body);
  const relativePath = relative(fileURLToPath(collectionDirectory), file);
  const id = relativePath.slice(0, -extname(relativePath).length).split(sep).join('/');

  return { id, data };
}

function readFrontmatter(body: string): Record<string, string> {
  const frontmatterMatch = body.match(/^---\n(?<frontmatter>[\s\S]*?)\n---/u);
  const frontmatter = frontmatterMatch?.groups?.frontmatter;

  if (!frontmatter) {
    return {};
  }

  const data: Record<string, string> = {};

  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^(?<key>[A-Za-z][A-Za-z0-9]*):\s*(?<value>.+)$/u);
    const key = match?.groups?.key;
    const value = match?.groups?.value;

    if (key && value) {
      data[key] = value.replace(/^['"]|['"]$/gu, '');
    }
  }

  return data;
}

function createOpenGraphPageMap(
  entries: readonly OpenGraphPageEntry[]
): Record<string, OpenGraphPage> {
  const pages: Record<string, OpenGraphPage> = {};

  for (const [path, page] of entries) {
    const route = path === '/' ? 'index' : path.replace(/^\/|\/$/gu, '');

    if (pages[route]) {
      throw new Error(`Duplicate OpenGraph route "${route}"`);
    }

    pages[route] = page;
  }

  return pages;
}
