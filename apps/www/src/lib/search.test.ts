import { describe, expect, test } from 'vite-plus/test';
import {
  assertSearchDocumentMatchesPath,
  assertUniqueSearchDocumentUrls,
  createApiPackageSearchDocument,
  createApiSymbolSearchDocument,
  createBlogSearchDocument,
  createDemoSearchDocument,
  createDocsSearchDocument,
  createPackageSearchDocument,
  createRegistrySearchDocument,
} from '#www/lib/search';

describe('search documents', () => {
  test('maps each structured source to a stable route and kind', () => {
    const documents = [
      createDocsSearchDocument({
        id: 'getting-started',
        title: 'Getting started',
        description: 'Install Canvas Timeline.',
        section: 'intro',
      }),
      createBlogSearchDocument({
        id: 'canvas-first',
        title: 'Canvas first',
        description: 'Building a responsive editor.',
        author: 'Canvas Timeline',
        tags: ['performance'],
      }),
      createPackageSearchDocument({
        slug: 'react',
        name: '@techsquidtv/canvas-timeline-react',
        shortName: 'React',
        purpose: 'React bindings.',
        description: 'React bindings for Canvas Timeline.',
      }),
      createDemoSearchDocument({
        slug: 'basic-editor-surface',
        title: 'Basic Timeline',
        description: 'A minimal editor.',
        status: 'Minimal',
        difficulty: 'Beginner',
        packageFocus: ['@techsquidtv/canvas-timeline-react'],
      }),
      createRegistrySearchDocument({
        slug: 'playhead',
        title: 'Playhead',
        name: 'Timeline.Playhead',
        description: 'Timeline playhead primitives.',
        kind: 'component',
        importPath: '@techsquidtv/canvas-timeline-react',
      }),
      createApiSymbolSearchDocument({
        slug: 'react',
        name: '@techsquidtv/canvas-timeline-react',
        entryPoint: 'src/index.ts',
        symbolSlug: 'use-timeline',
        symbolName: 'useTimeline',
        symbolKind: 'Function',
        summary: 'Read the active timeline.',
        sourcePackage: '@techsquidtv/canvas-timeline-react',
      }),
      createApiPackageSearchDocument({
        slug: 'core',
        name: '@techsquidtv/canvas-timeline-core',
        entryPoint: 'src/index.ts',
      }),
    ];

    expect(documents.map((document) => document.kind)).toEqual([
      'docs',
      'blog',
      'package',
      'demo',
      'registry',
      'api',
      'api',
    ]);
    expect(new Set(documents.map((document) => document.url))).toHaveLength(documents.length);
  });

  test('applies editorial aliases, exclusions, and priority to the default weight', () => {
    const document = createDocsSearchDocument({
      id: 'getting-started',
      title: 'Getting started',
      description: 'Install Canvas Timeline.',
      section: 'intro',
      search: {
        keywords: ['quickstart', 'setup', 'quickstart'],
        priority: 'high',
        exclude: true,
      },
    });

    expect(document.aliases).toEqual(['quickstart', 'setup']);
    expect(document.exclude).toBe(true);
    expect(document.weight).toBe(1.875);
  });

  test('keeps API symbols searchable at a lower default weight', () => {
    const document = createApiSymbolSearchDocument({
      slug: 'core',
      name: '@techsquidtv/canvas-timeline-core',
      entryPoint: 'src/index.ts',
      symbolSlug: 'timeline-engine',
      symbolName: 'TimelineEngine',
      symbolKind: 'Class',
      summary: 'Timeline editing engine.',
      sourcePackage: '@techsquidtv/canvas-timeline-core',
    });

    expect(document.weight).toBeLessThan(
      createDocsSearchDocument({
        id: 'architecture',
        title: 'Architecture',
        description: 'System architecture.',
        section: 'concepts',
      }).weight
    );
  });

  test('rejects duplicate search document URLs', () => {
    const document = createDocsSearchDocument({
      id: 'getting-started',
      title: 'Getting started',
      description: 'Install Canvas Timeline.',
      section: 'intro',
    });

    expect(() => assertUniqueSearchDocumentUrls([document, document])).toThrow(
      'Duplicate Pagefind catalog URL: /docs/getting-started'
    );
  });

  test('rejects a search document rendered at a different route', () => {
    const document = createDocsSearchDocument({
      id: 'getting-started',
      title: 'Getting started',
      description: 'Install Canvas Timeline.',
      section: 'intro',
    });

    expect(() => assertSearchDocumentMatchesPath(document, '/docs/installation')).toThrow(
      'Search document URL /docs/getting-started does not match rendered page path /docs/installation.'
    );
  });
});
