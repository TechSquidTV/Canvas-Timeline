import { describe, expect, test } from 'vite-plus/test';
import type { BlogPost } from '../data/blog';
import type { DemoDoc } from '../data/demos';
import type { PackageDoc } from '../data/packages';
import {
  createBlogFaqStructuredData,
  createBlogPostStructuredData,
  createBreadcrumbStructuredData,
  createDemoIndexStructuredData,
  createDemoStructuredData,
  createPackageStructuredData,
  toAbsoluteUrl,
} from './structured-data';

describe('structured data helpers', () => {
  test('converts paths and URLs to canonical absolute URLs', () => {
    expect(toAbsoluteUrl('/docs')).toBe('https://canvastimeline.com/docs');
    expect(toAbsoluteUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  test('builds breadcrumb lists with stable positions', () => {
    const structuredData = createBreadcrumbStructuredData(
      [{ label: 'Home', href: '/' }, { label: 'Docs', href: '/docs' }, { label: 'Current' }],
      'https://canvastimeline.com/docs/current'
    );

    expect(structuredData?.itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://canvastimeline.com/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Docs',
        item: 'https://canvastimeline.com/docs',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Current',
        item: 'https://canvastimeline.com/docs/current',
      },
    ]);
  });

  test('builds blog post and FAQ structured data from frontmatter', () => {
    const post = createBlogPost();

    expect(createBlogPostStructuredData(post)).toMatchObject({
      '@type': 'BlogPosting',
      headline: 'Building timelines',
      datePublished: '2026-01-01T00:00:00.000Z',
      dateModified: '2026-01-02T00:00:00.000Z',
      image: 'https://canvastimeline.com/open-graph/blog/building-timelines.png',
      keywords: 'react, timeline',
    });

    expect(createBlogFaqStructuredData(post.data.faq)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Does it support React?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, through the React package.',
          },
        },
      ],
    });
  });

  test('preserves custom blog post structured data images', () => {
    const post = createBlogPost({
      image: {
        src: '/custom-blog-card.png',
        alt: 'Custom blog social card',
        width: 1200,
        height: 630,
      },
    });

    expect(createBlogPostStructuredData(post)).toMatchObject({
      image: 'https://canvastimeline.com/custom-blog-card.png',
    });
  });

  test('builds package software source data from package docs', () => {
    expect(createPackageStructuredData(createPackageDoc())).toMatchObject({
      '@type': 'SoftwareSourceCode',
      name: '@techsquidtv/canvas-timeline-react',
      url: 'https://canvastimeline.com/packages/react',
      codeRepository: 'https://github.com/techsquidtv/canvas-timeline/tree/main/packages/react',
      keywords: 'React, You need React bindings., Wrap editors in TimelineProvider.',
      targetProduct: {
        '@type': 'SoftwareApplication',
        installUrl: 'https://www.npmjs.com/package/@techsquidtv/canvas-timeline-react',
      },
    });
  });

  test('builds demo data and keeps item list ordering stable', () => {
    const firstDemo = createDemoDoc('basic-editor-surface', 'Basic Timeline');
    const secondDemo = createDemoDoc('timeline-stress-test', 'Timeline Stress Test');
    const [, itemList] = createDemoIndexStructuredData([firstDemo, secondDemo]);

    expect(itemList.itemListElement).toMatchObject([
      {
        position: 1,
        name: 'Basic Timeline',
        url: 'https://canvastimeline.com/demos/basic-editor-surface',
      },
      {
        position: 2,
        name: 'Timeline Stress Test',
        url: 'https://canvastimeline.com/demos/timeline-stress-test',
      },
    ]);

    expect(createDemoStructuredData(firstDemo)).toMatchObject({
      '@type': 'SoftwareSourceCode',
      name: 'Basic Timeline',
      codeRepository:
        'https://github.com/techsquidtv/canvas-timeline/blob/main/apps/www/src/demos/basic-editor-surface/BasicTimeline.tsx',
      keywords:
        'Minimal, Beginner, @techsquidtv/canvas-timeline-core, @techsquidtv/canvas-timeline-react',
    });
  });
});

function createBlogPost(data: Partial<BlogPost['data']> = {}): BlogPost {
  return {
    id: 'building-timelines',
    body: 'Post body',
    collection: 'blog',
    data: {
      title: 'Building timelines',
      description: 'A practical guide to building timeline editors with Canvas Timeline.',
      publishDate: new Date('2026-01-01T00:00:00.000Z'),
      updatedDate: new Date('2026-01-02T00:00:00.000Z'),
      author: 'Canvas Timeline',
      tags: ['react', 'timeline'],
      draft: false,
      faq: [
        {
          question: 'Does it support React?',
          answer: 'Yes, through the React package.',
        },
      ],
      ...data,
    },
  };
}

function createPackageDoc(): PackageDoc {
  return {
    slug: 'react',
    name: '@techsquidtv/canvas-timeline-react',
    shortName: 'React',
    purpose: 'React provider and hooks.',
    description: 'React package for Canvas Timeline.',
    installCommand: 'pnpm add @techsquidtv/canvas-timeline-react',
    overview: ['React package overview.'],
    useCasesTitle: 'Use React bindings for',
    useCases: ['You need React bindings.', 'Wrap editors in `TimelineProvider`.'],
    usage: {
      title: 'Bind the engine to React',
      body: 'Use the provider and hooks.',
      steps: ['Wrap the editor in `TimelineProvider`.'],
    },
    example: {
      title: 'Example',
      code: 'export function Example() {}',
    },
    linkGroups: [
      {
        title: 'Package links',
        links: [
          {
            title: 'NPM',
            href: 'https://www.npmjs.com/package/@techsquidtv/canvas-timeline-react',
          },
          {
            title: 'GitHub',
            href: 'https://github.com/techsquidtv/canvas-timeline/tree/main/packages/react',
          },
        ],
      },
    ],
  };
}

function createDemoDoc(slug: string, title: string): DemoDoc {
  return {
    slug,
    title,
    description: `${title} description.`,
    status: 'Minimal',
    difficulty: 'Beginner',
    packageFocus: ['@techsquidtv/canvas-timeline-core', '@techsquidtv/canvas-timeline-react'],
    sourcePath: `apps/www/src/demos/${slug}/BasicTimeline.tsx`,
    liveDemoId: 'basic',
  };
}
