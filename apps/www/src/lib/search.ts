import { z } from 'astro/zod';

const searchPriorityValues = ['high', 'normal', 'low'] as const;

export const searchOptionsSchema = z
  .object({
    keywords: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    priority: z.enum(searchPriorityValues).optional(),
    exclude: z.boolean().optional(),
  })
  .strict();

export type SearchOptions = z.infer<typeof searchOptionsSchema>;

type SearchDocumentKind = 'docs' | 'package' | 'demo' | 'registry' | 'blog' | 'api';

export interface SearchDocument {
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly kind: SearchDocumentKind;
  readonly packageSlug?: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly weight: number;
  readonly exclude: boolean;
}

interface SearchDocumentWithUrl {
  readonly url: string;
}

interface SearchDocumentInput {
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly kind: SearchDocumentKind;
  readonly packageSlug?: string;
  readonly tags?: readonly string[];
  readonly search?: SearchOptions;
}

interface DocsSearchInput {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly section: string;
  readonly search?: SearchOptions;
}

interface BlogSearchInput {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly author: string;
  readonly tags: readonly string[];
  readonly search?: SearchOptions;
}

interface PackageSearchInput {
  readonly slug: string;
  readonly name: string;
  readonly shortName: string;
  readonly purpose: string;
  readonly description: string;
  readonly search?: SearchOptions;
}

interface DemoSearchInput {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly difficulty: string;
  readonly packageFocus: readonly string[];
  readonly search?: SearchOptions;
}

interface RegistrySearchInput {
  readonly slug: string;
  readonly title: string;
  readonly name: string;
  readonly description: string;
  readonly kind: string;
  readonly importPath: string;
  readonly packageName?: string;
  readonly search?: SearchOptions;
}

interface ApiPackageSearchInput {
  readonly slug: string;
  readonly name: string;
  readonly entryPoint: string;
}

interface ApiSymbolSearchInput extends ApiPackageSearchInput {
  readonly symbolSlug: string;
  readonly symbolName: string;
  readonly symbolKind: string;
  readonly summary: string;
  readonly sourcePackage: string;
}

const kindWeights = {
  docs: 1.5,
  package: 1.3,
  demo: 1.3,
  registry: 1.3,
  blog: 1,
  api: 0.45,
} satisfies Record<SearchDocumentKind, number>;

const priorityMultipliers = {
  high: 1.25,
  normal: 1,
  low: 0.75,
} satisfies Record<(typeof searchPriorityValues)[number], number>;

export function createSearchDocument(input: SearchDocumentInput): SearchDocument {
  const tags = uniqueTerms(input.tags ?? []);
  const aliases = uniqueTerms(input.search?.keywords ?? []);
  const priority = input.search?.priority ?? 'normal';

  return {
    url: normalizeUrl(input.url),
    title: input.title.trim(),
    description: input.description.trim(),
    kind: input.kind,
    packageSlug: input.packageSlug,
    tags,
    aliases,
    weight: kindWeights[input.kind] * priorityMultipliers[priority],
    exclude: input.search?.exclude ?? false,
  };
}

export function assertUniqueSearchDocumentUrls(documents: readonly SearchDocumentWithUrl[]): void {
  const urls = new Set<string>();

  for (const document of documents) {
    if (urls.has(document.url)) {
      throw new Error(`Duplicate Pagefind catalog URL: ${document.url}`);
    }

    urls.add(document.url);
  }
}

export function assertSearchDocumentMatchesPath(document: SearchDocument, pathname: string): void {
  const normalizedPathname = normalizeUrl(pathname);

  if (document.url !== normalizedPathname) {
    throw new Error(
      `Search document URL ${document.url} does not match rendered page path ${normalizedPathname}.`
    );
  }
}

export function createDocsSearchDocument(input: DocsSearchInput): SearchDocument {
  return createSearchDocument({
    url: `/docs/${input.id}`,
    title: input.title,
    description: input.description,
    kind: 'docs',
    tags: [input.section, 'Canvas Timeline', 'documentation'],
    search: input.search,
  });
}

export function createBlogSearchDocument(input: BlogSearchInput): SearchDocument {
  return createSearchDocument({
    url: `/blog/${input.id}`,
    title: input.title,
    description: input.description,
    kind: 'blog',
    tags: [...input.tags, input.author, 'Canvas Timeline'],
    search: input.search,
  });
}

export function createPackageSearchDocument(input: PackageSearchInput): SearchDocument {
  return createSearchDocument({
    url: `/packages/${input.slug}`,
    title: input.name,
    description: input.description,
    kind: 'package',
    packageSlug: input.slug,
    tags: [input.shortName, input.purpose, input.name, 'Canvas Timeline'],
    search: input.search,
  });
}

export function createDemoSearchDocument(input: DemoSearchInput): SearchDocument {
  return createSearchDocument({
    url: `/demos/${input.slug}`,
    title: input.title,
    description: input.description,
    kind: 'demo',
    tags: [input.status, input.difficulty, ...input.packageFocus, 'Canvas Timeline'],
    search: input.search,
  });
}

export function createRegistrySearchDocument(input: RegistrySearchInput): SearchDocument {
  return createSearchDocument({
    url: `/packages/react/registry/${input.slug}`,
    title: input.title,
    description: input.description,
    kind: 'registry',
    packageSlug: 'react',
    tags: [
      input.kind,
      input.name,
      input.importPath,
      input.packageName ?? 'React',
      'Canvas Timeline',
    ],
    search: input.search,
  });
}

export function createApiPackageSearchDocument(input: ApiPackageSearchInput): SearchDocument {
  return createSearchDocument({
    url: `/packages/${input.slug}/api`,
    title: `${input.name} API`,
    description: `Generated API reference for ${input.name}.`,
    kind: 'api',
    packageSlug: input.slug,
    tags: [input.name, input.entryPoint, 'API reference', 'Canvas Timeline'],
  });
}

export function createApiSymbolSearchDocument(input: ApiSymbolSearchInput): SearchDocument {
  return createSearchDocument({
    url: `/packages/${input.slug}/api/${input.symbolSlug}`,
    title: input.symbolName,
    description: input.summary || `Generated API reference for ${input.symbolName}.`,
    kind: 'api',
    packageSlug: input.slug,
    tags: [
      input.symbolKind,
      input.name,
      input.entryPoint,
      input.sourcePackage,
      'API reference',
      'Canvas Timeline',
    ],
  });
}

function normalizeUrl(url: string): string {
  const trimmedUrl = url.trim();

  if (!trimmedUrl.startsWith('/') || trimmedUrl.startsWith('//')) {
    throw new TypeError(`Search document URLs must be root-relative: ${url}`);
  }

  return trimmedUrl === '/' ? trimmedUrl : trimmedUrl.replace(/\/+$/u, '');
}

function uniqueTerms(terms: readonly string[]): string[] {
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}
