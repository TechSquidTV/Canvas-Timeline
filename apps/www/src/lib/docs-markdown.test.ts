import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import {
  buildDocsIndexMarkdown,
  sanitizeDocsMdx,
  type DocsMarkdownEntry,
} from '#www/lib/docs-markdown';

const docsContentDir = join(process.cwd(), 'apps/www/src/content/docs');

describe('docs Markdown sanitizer', () => {
  test('removes MDX imports and converts known docs components', () => {
    const markdown = sanitizeDocsMdx(`---
title: Example
---

import Callout from '#www/components/Callout.astro';
import PackageManagerTabs from '#www/components/PackageManagerTabs.astro';

# Example

<PackageManagerTabs packages="@techsquidtv/canvas-timeline" />

<Callout kind="warning" title="Careful">
  Keep IDs stable.
</Callout>

<CodeBlock code="pnpm add @techsquidtv/canvas-timeline" variant="terminal" />
`);

    expect(markdown).not.toContain('import Callout');
    expect(markdown).not.toContain('<PackageManagerTabs');
    expect(markdown).not.toContain('<Callout');
    expect(markdown).not.toContain('<CodeBlock');
    expect(markdown).toContain('```shell\npnpm add @techsquidtv/canvas-timeline');
    expect(markdown).toContain('npm install @techsquidtv/canvas-timeline');
    expect(markdown).toContain('> **Careful (warning)**');
    expect(markdown).toContain('> Keep IDs stable.');
  });

  test('preserves standard Markdown structures', () => {
    const markdown = sanitizeDocsMdx(`
## Install

- Read [the guide](/docs/getting-started).
- Keep \`track.id\` stable.

| Field | Meaning |
| :--- | :--- |
| \`tracks\` | Ordered lanes |

\`\`\`ts
const value = '<Timeline.Root />';
\`\`\`
`);

    expect(markdown).toContain('## Install');
    expect(markdown).toContain('- Read [the guide](/docs/getting-started).');
    expect(markdown).toContain('| Field');
    expect(markdown).toContain("const value = '<Timeline.Root />';");
  });

  test('replaces unsupported rich MDX content with a readable placeholder', () => {
    const markdown = sanitizeDocsMdx(`
<figure className="architecture-map" aria-label="Canvas Timeline system architecture">
  <div>
    <span>Visual map</span>
  </div>
</figure>
`);

    expect(markdown).toContain('Rich content omitted: Canvas Timeline system architecture.');
    expect(markdown).not.toContain('<figure');
    expect(markdown).not.toContain('className');
  });

  test('sanitizes every current docs MDX file', async () => {
    const fileNames = (await readdir(docsContentDir)).filter((fileName) =>
      fileName.endsWith('.mdx')
    );

    expect(fileNames.length).toBeGreaterThan(0);

    for (const fileName of fileNames) {
      const source = await readFile(join(docsContentDir, fileName), 'utf8');
      const markdown = sanitizeDocsMdx(source);

      expect(markdown.length, fileName).toBeGreaterThan(0);
      expect(markdown, fileName).not.toContain("from '#www/components");
      expect(markdown, fileName).not.toContain('<Callout');
      expect(markdown, fileName).not.toContain('<PackageManagerTabs');
      expect(markdown, fileName).not.toContain('<figure');
    }
  });

  test('builds docs index Markdown with canonical sibling md links', () => {
    const markdown = buildDocsIndexMarkdown([
      entry(
        'architecture',
        'System Architecture',
        'Understand the rendering layers.',
        'concepts',
        20
      ),
      entry(
        'getting-started',
        'Getting Started',
        'Install and render your first timeline.',
        'intro',
        10
      ),
    ]);

    expect(markdown).toContain('# Canvas Timeline documentation');
    expect(markdown).toContain('Source: https://canvastimeline.com/docs');
    expect(markdown).toContain('Markdown: https://canvastimeline.com/docs.md');
    expect(markdown).toContain('This Markdown file is a generated documentation index.');
    expect(markdown).toContain(
      '- **Getting Started** - Install and render your first timeline. [Page](/docs/getting-started) | [Markdown](/docs/getting-started.md)'
    );
    expect(markdown).toContain(
      '- **System Architecture** - Understand the rendering layers. [Page](/docs/architecture) | [Markdown](/docs/architecture.md)'
    );
    expect(markdown.indexOf('### Start here')).toBeLessThan(markdown.indexOf('### Concepts'));
    expect(markdown.indexOf('**Getting Started**')).toBeLessThan(
      markdown.indexOf('**System Architecture**')
    );
    expect(markdown).not.toContain('/docs/getting-started/index.md');
  });
});

function entry(
  id: string,
  title: string,
  description: string,
  section: DocsMarkdownEntry['data']['section'],
  order: number
): DocsMarkdownEntry {
  return {
    id,
    body: '',
    data: {
      title,
      description,
      order,
      section,
    },
  };
}
