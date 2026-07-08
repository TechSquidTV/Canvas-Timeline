import type { BlogPost } from '#www/data/blog';
import type { DemoDoc } from '#www/data/demos';
import type { PackageDoc } from '#www/data/packages';
import type { ReactRegistryApi, ReactRegistryItem } from '#www/data/react-registry';
import { site } from '#www/data/site';
import type { ApiPackage, ApiSymbol } from '#www/lib/api-reference';
import { apiPackageHref, apiSymbolHref } from '#www/lib/api-reference';
import { openGraphRouteForPath } from '#www/lib/open-graph';

const reactRegistryPackageName = '@techsquidtv/canvas-timeline-react';

type JsonLdPrimitive = string | number | boolean | null;
type JsonLdValue = JsonLdPrimitive | JsonLdObject | readonly JsonLdValue[];

export interface JsonLdObject {
  readonly [key: string]: JsonLdValue | undefined;
}

export type StructuredDataInput = JsonLdObject | readonly JsonLdObject[];

interface BreadcrumbLike {
  readonly label: string;
  readonly href?: string;
}

interface ImageLike {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

interface ItemListEntry {
  readonly name: string;
  readonly url: string;
  readonly description?: string;
}

interface PageStructuredDataInput {
  readonly title: string;
  readonly description: string;
  readonly url: string;
  readonly image: ImageLike;
}

interface ArticleStructuredDataInput {
  readonly title: string;
  readonly description: string;
  readonly url: string;
  readonly keywords?: readonly string[];
}

export function toAbsoluteUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, site.url).toString();
}

export function normalizeStructuredData(input: StructuredDataInput | undefined): JsonLdObject[] {
  if (!input) {
    return [];
  }

  return isStructuredDataArray(input) ? [...input] : [input];
}

function createOrganizationStructuredData(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': toAbsoluteUrl('/#organization'),
    name: site.name,
    url: site.url,
    logo: {
      '@type': 'ImageObject',
      url: toAbsoluteUrl('/logo.svg'),
    },
    sameAs: [site.repository.href, site.sponsorship.href],
  };
}

function createWebSiteStructuredData(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': toAbsoluteUrl('/#website'),
    name: site.name,
    description: site.description,
    url: site.url,
    publisher: {
      '@id': toAbsoluteUrl('/#organization'),
    },
  };
}

export function createBreadcrumbStructuredData(
  breadcrumbs: readonly BreadcrumbLike[],
  currentUrl: string
): JsonLdObject | undefined {
  if (breadcrumbs.length === 0) {
    return undefined;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((breadcrumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: breadcrumb.label,
      item: toAbsoluteUrl(breadcrumb.href ?? currentUrl),
    })),
  };
}

function createWebPageStructuredData(input: PageStructuredDataInput): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${input.url}#webpage`,
    name: input.title,
    description: input.description,
    url: input.url,
    image: createImageObject(input.image),
    isPartOf: {
      '@id': toAbsoluteUrl('/#website'),
    },
    publisher: {
      '@id': toAbsoluteUrl('/#organization'),
    },
  };
}

export function createSiteStructuredData(input: {
  readonly breadcrumbs: readonly BreadcrumbLike[];
  readonly description: string;
  readonly image: ImageLike;
  readonly title: string;
  readonly url: string;
}): JsonLdObject[] {
  return [
    createOrganizationStructuredData(),
    createWebSiteStructuredData(),
    createWebPageStructuredData(input),
    createBreadcrumbStructuredData(input.breadcrumbs, input.url),
  ].filter((item): item is JsonLdObject => item !== undefined);
}

function createTechArticleStructuredData(input: ArticleStructuredDataInput): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: input.title,
    name: input.title,
    description: input.description,
    url: toAbsoluteUrl(input.url),
    mainEntityOfPage: toAbsoluteUrl(input.url),
    keywords: input.keywords?.join(', '),
    author: {
      '@id': toAbsoluteUrl('/#organization'),
    },
    publisher: {
      '@id': toAbsoluteUrl('/#organization'),
    },
  };
}

function stripInlineCodeMarkers(value: string): string {
  return value.replace(/`([^`\n]+)`/g, '$1');
}

export function createDocsArticleStructuredData(input: ArticleStructuredDataInput): JsonLdObject {
  return createTechArticleStructuredData(input);
}

export function createBlogPostStructuredData(post: BlogPost): JsonLdObject {
  const postUrl = toAbsoluteUrl(blogPostUrl(post));
  const postImageSrc = post.data.image?.src ?? openGraphRouteForPath(blogPostUrl(post));
  const updatedDate = post.data.updatedDate ?? post.data.publishDate;

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.data.title,
    description: post.data.description,
    datePublished: post.data.publishDate.toISOString(),
    dateModified: updatedDate.toISOString(),
    author: {
      '@type': 'Organization',
      name: post.data.author,
    },
    publisher: {
      '@id': toAbsoluteUrl('/#organization'),
    },
    mainEntityOfPage: post.data.canonicalUrl ?? postUrl,
    image: toAbsoluteUrl(postImageSrc),
    keywords: post.data.tags.join(', '),
  };
}

export function createBlogFaqStructuredData(
  faqItems: BlogPost['data']['faq']
): JsonLdObject | undefined {
  if (!faqItems || faqItems.length === 0) {
    return undefined;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item: NonNullable<BlogPost['data']['faq']>[number]) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export function createBlogIndexStructuredData(posts: readonly BlogPost[]): JsonLdObject[] {
  return createCollectionStructuredData({
    name: 'Canvas Timeline Blog',
    description:
      'Engineering notes, release writeups, and practical guides for building high-performance React timeline editors with Canvas Timeline.',
    url: '/blog',
    items: posts.map((post) => ({
      name: post.data.title,
      description: post.data.description,
      url: blogPostUrl(post),
    })),
  });
}

export function createPackageIndexStructuredData(
  packageDocs: readonly PackageDoc[]
): JsonLdObject[] {
  return createCollectionStructuredData({
    name: 'Canvas Timeline Packages',
    description:
      'Explore modular packages for the Canvas React timeline editor, including headless core engine, React component bindings, 60fps canvas renderer, and sync adapters.',
    url: '/packages',
    items: packageDocs.map((packageDoc) => ({
      name: packageDoc.name,
      description: packageDoc.description,
      url: `/packages/${packageDoc.slug}`,
    })),
  });
}

export function createPackageStructuredData(packageDoc: PackageDoc): JsonLdObject {
  const packageLinks = packageDoc.linkGroups.flatMap((group) => group.links);

  return createSoftwareSourceCodeStructuredData({
    name: packageDoc.name,
    description: packageDoc.description,
    url: `/packages/${packageDoc.slug}`,
    codeRepository: packageLinks.find((link) => link.title === 'GitHub')?.href,
    installUrl: packageLinks.find((link) => link.title === 'NPM')?.href,
    keywords: [packageDoc.shortName, ...(packageDoc.useCases ?? []).map(stripInlineCodeMarkers)],
    runtimePlatform: 'React',
    codeSampleType: packageDoc.installCommand,
  });
}

export function createApiPackageArticleStructuredData(packageDoc: ApiPackage): JsonLdObject {
  return createTechArticleStructuredData({
    title: `${packageDoc.name} API`,
    description: `Generated API reference for ${packageDoc.name}.`,
    url: apiPackageHref(packageDoc.slug),
    keywords: [packageDoc.name, packageDoc.entryPoint, 'API reference'],
  });
}

export function createApiSymbolArticleStructuredData(
  packageDoc: ApiPackage,
  symbol: ApiSymbol
): JsonLdObject {
  return createTechArticleStructuredData({
    title: `${symbol.name} API`,
    description: symbol.summary || `Generated API reference for ${symbol.name}.`,
    url: apiSymbolHref(packageDoc.slug, symbol.slug),
    keywords: [packageDoc.name, symbol.name, symbol.kind, 'API reference'],
  });
}

export function createDemoIndexStructuredData(demoDocs: readonly DemoDoc[]): JsonLdObject[] {
  return createCollectionStructuredData({
    name: 'Timeline editor demos',
    description: 'Source-backed Canvas Timeline demos for editor basics.',
    url: '/demos',
    items: demoDocs.map((demoDoc) => ({
      name: demoDoc.title,
      description: demoDoc.description,
      url: `/demos/${demoDoc.slug}`,
    })),
  });
}

export function createDemoStructuredData(demoDoc: DemoDoc): JsonLdObject {
  return createSoftwareSourceCodeStructuredData({
    name: demoDoc.title,
    description: demoDoc.description,
    url: `/demos/${demoDoc.slug}`,
    codeRepository: `https://github.com/techsquidtv/canvas-timeline/blob/main/${demoDoc.sourcePath}`,
    keywords: [demoDoc.status, demoDoc.difficulty, ...demoDoc.packageFocus],
    runtimePlatform: 'React',
    programmingLanguage: 'TypeScript',
    codeSampleType: demoDoc.sourcePath,
    sameAs: [
      ...(demoDoc.externalUrl ? [toAbsoluteUrl(demoDoc.externalUrl)] : []),
      ...(demoDoc.references?.map((reference) => toAbsoluteUrl(reference.url)) ?? []),
    ],
  });
}

export function createReactRegistryIndexStructuredData(
  items: readonly ReactRegistryItem[]
): JsonLdObject[] {
  return createCollectionStructuredData({
    name: 'React Timeline Component Registry',
    description:
      'Browse the component registry for our React timeline component. Reusable primitives, interaction layers, and hook bindings for the canvas timeline editor.',
    url: '/packages/react/registry',
    items: items.map((item) => ({
      name: item.title,
      description: item.description,
      url: `/packages/react/registry/${item.slug}`,
    })),
  });
}

export function createReactRegistryStructuredData(
  item: ReactRegistryItem,
  title = item.title,
  description = item.description
): JsonLdObject[] {
  return [
    createTechArticleStructuredData({
      title: `${title} | React Registry`,
      description,
      url: `/packages/react/registry/${item.slug}`,
      keywords: [item.name, item.kind, item.importPath],
    }),
    createSoftwareSourceCodeStructuredData({
      name: item.name,
      description,
      url: `/packages/react/registry/${item.slug}`,
      codeRepository: site.repository.href,
      installUrl: `https://www.npmjs.com/package/${reactRegistryInstallPackages(item)}`,
      keywords: [item.kind, item.importPath, ...item.apis.map((api) => api.name)],
      runtimePlatform: 'React',
      programmingLanguage: 'TypeScript',
      codeSampleType: item.importPath,
      sameAs: item.apis
        .map((api) => reactRegistryApiHref(api))
        .filter((href): href is string => href !== undefined)
        .map((href) => toAbsoluteUrl(href)),
    }),
  ];
}

function createCollectionStructuredData(input: {
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly items: readonly ItemListEntry[];
}): JsonLdObject[] {
  const collectionUrl = toAbsoluteUrl(input.url);

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: input.name,
      description: input.description,
      url: collectionUrl,
      mainEntity: {
        '@id': `${collectionUrl}#item-list`,
      },
    },
    createItemListStructuredData(input.items, `${collectionUrl}#item-list`),
  ];
}

function createItemListStructuredData(items: readonly ItemListEntry[], id: string): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': id,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      description: item.description,
      url: toAbsoluteUrl(item.url),
    })),
  };
}

function createSoftwareSourceCodeStructuredData(input: {
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly codeRepository?: string;
  readonly codeSampleType?: string;
  readonly installUrl?: string;
  readonly keywords?: readonly string[];
  readonly programmingLanguage?: string;
  readonly runtimePlatform?: string;
  readonly sameAs?: readonly string[];
}): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: input.name,
    description: input.description,
    url: toAbsoluteUrl(input.url),
    codeRepository: input.codeRepository,
    codeSampleType: input.codeSampleType,
    programmingLanguage: input.programmingLanguage ?? 'TypeScript',
    runtimePlatform: input.runtimePlatform,
    keywords: input.keywords?.join(', '),
    sameAs: input.sameAs,
    targetProduct: input.installUrl
      ? {
          '@type': 'SoftwareApplication',
          name: input.name,
          applicationCategory: 'DeveloperApplication',
          installUrl: input.installUrl,
        }
      : undefined,
    publisher: {
      '@id': toAbsoluteUrl('/#organization'),
    },
  };
}

function createImageObject(image: ImageLike): JsonLdObject {
  return {
    '@type': 'ImageObject',
    url: toAbsoluteUrl(image.src),
    caption: image.alt,
    width: image.width,
    height: image.height,
  };
}

function isStructuredDataArray(input: StructuredDataInput): input is readonly JsonLdObject[] {
  return Array.isArray(input);
}

function blogPostUrl(post: BlogPost): string {
  return `/blog/${post.id}`;
}

function reactRegistryInstallPackages(item: ReactRegistryItem): string {
  return item.installPackages ?? item.packageName ?? reactRegistryPackageName;
}

function reactRegistryApiHref(api: ReactRegistryApi): string | undefined {
  return api.apiHref ?? (api.apiSlug ? apiSymbolHref('react', api.apiSlug) : undefined);
}
