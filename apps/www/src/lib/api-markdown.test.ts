import { describe, expect, test } from 'vite-plus/test';
import { buildApiPackageMarkdown, buildApiSymbolMarkdown } from './api-markdown';
import { apiReference } from './api-reference';

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
});

function requiredPackage(packageSlug: string) {
  const packageDoc = apiReference.packages.find((candidate) => candidate.slug === packageSlug);

  if (!packageDoc) {
    throw new Error(`Missing API package "${packageSlug}"`);
  }

  return packageDoc;
}
