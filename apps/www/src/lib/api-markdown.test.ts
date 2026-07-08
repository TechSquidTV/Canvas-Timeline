import { describe, expect, test } from 'vite-plus/test';
import { buildApiPackageMarkdown, buildApiSymbolMarkdown } from '#www/lib/api-markdown';
import { apiReference } from '#www/lib/api-reference';
import { markdownCode, markdownTable } from '#www/lib/markdown-format';

describe('API Markdown builder', () => {
  test('builds static package API index Markdown', () => {
    const packageDoc = requiredPackage('react');
    const markdown = buildApiPackageMarkdown(packageDoc);

    expect(markdown).toContain('# @techsquidtv/canvas-timeline-react API');
    expect(markdown).toContain('Source: https://canvastimeline.com/packages/react/api');
    expect(markdown).toContain('Markdown: https://canvastimeline.com/packages/react/api.md');
    expect(markdown).toContain('[KeyboardScopeProps](/packages/react/api/keyboard-scope-props)');
  });

  test('builds static API symbol Markdown', () => {
    const packageDoc = requiredPackage('react');
    const symbol = packageDoc.symbols.find(
      (candidate) => candidate.slug === 'keyboard-scope-props'
    );

    expect(symbol).toBeDefined();

    if (!symbol) {
      return;
    }

    const markdown = buildApiSymbolMarkdown(packageDoc, symbol);

    expect(markdown).toContain('# KeyboardScopeProps API');
    expect(markdown).toContain(
      'Source: https://canvastimeline.com/packages/react/api/keyboard-scope-props'
    );
    expect(markdown).toContain(
      'Markdown: https://canvastimeline.com/packages/react/api/keyboard-scope-props.md'
    );
    expect(markdown).toContain('## Signature');
    expect(markdown).toContain('## Properties');
    expect(markdown).not.toContain('<table');
    expect(markdown).not.toContain('class=');
  });

  test('renders structured TSDoc links in copied API Markdown', () => {
    const packageDoc = requiredPackage('react');
    const markdown = buildApiSymbolMarkdown(packageDoc, {
      slug: 'linked-example',
      name: 'linkedExample',
      kind: 'Function',
      summary: 'Reads linked docs.',
      summaryParts: [{ kind: 'text', text: 'Reads linked docs.' }],
      remarks: 'Use the state model.',
      remarksParts: [
        { kind: 'text', text: 'Use the ' },
        { kind: 'link', text: 'state model', target: 'TimelineState' },
        { kind: 'text', text: ' before rendering.' },
      ],
      signature: 'linkedExample(): TimelineState',
      params: [],
      typeParameters: [
        {
          name: 'LayerName',
          constraint: 'string',
          default: 'string',
          summary: 'Layer key.',
          summaryParts: [
            { kind: 'text', text: 'Layer key for ' },
            { kind: 'link', text: 'active layers', target: 'ActiveLayerResult' },
            { kind: 'text', text: '.' },
          ],
        },
      ],
      properties: [],
      methods: [],
      constructors: [],
      returnMembers: [],
      returns: 'TimelineState',
      returnsSummary: 'Current state.',
      returnsSummaryParts: [{ kind: 'text', text: 'Current state.' }],
      examples: [],
      see: [
        [
          {
            kind: 'link',
            text: 'React editor hooks',
            target: 'https://canvastimeline.com/docs/react-hooks',
          },
        ],
      ],
      sourcePackage: 'react',
    });

    expect(markdown).toContain('## Usage notes');
    expect(markdown).toContain('[state model](/packages/core/api/timeline-state)');
    expect(markdown).toContain('[active layers](/packages/core/api/active-layer-result)');
    expect(markdown).toContain('[React editor hooks](https://canvastimeline.com/docs/react-hooks)');
    expect(markdown).not.toContain('{@link');
  });

  test('escapes Markdown table cells and inline code delimiters', () => {
    expect(markdownTable(['Name|Type', 'Path\\Segment'], [['line\nbreak', 'a|b\\c']])).toBe(
      '| Name\\|Type | Path\\\\Segment |\n| :--- | :--- |\n| line<br>break | a\\|b\\\\c |'
    );

    expect(markdownCode('Timeline.`Track`')).toBe('`` Timeline.`Track` ``');
    expect(markdownCode('`already wrapped`')).toBe('`` `already wrapped` ``');
  });
});

function requiredPackage(packageSlug: string) {
  const packageDoc = apiReference.packages.find((candidate) => candidate.slug === packageSlug);

  if (!packageDoc) {
    throw new Error(`Missing API package "${packageSlug}"`);
  }

  return packageDoc;
}
