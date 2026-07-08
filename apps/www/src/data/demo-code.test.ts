import { describe, expect, it } from 'vite-plus/test';
import { demoCodeExamples } from '#www/data/demo-code';
import { toCopyableDemoSource } from '#www/data/demo-snippets';

const publicPackageName = '@techsquidtv/canvas-timeline';
const adapterPackageExports = [
  'TimelineEngine',
  'TimelineProvider',
  'Timeline',
  'CanvasRenderer',
  'useTimeline',
  'useTimelineMediaSync',
  'useTimelinePlayheadTime',
  'fromSeconds',
  'toSeconds',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function namedImportsFrom(source: string, packageName: string): string[] {
  const importRe = new RegExp(
    String.raw`^import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]${escapeRegExp(packageName)}['"];?`,
    'gm'
  );

  return [...source.matchAll(importRe)].flatMap((match) =>
    match[1]
      .split(',')
      .map((specifier) => specifier.trim().replace(/^type\s+/, ''))
      .filter(Boolean)
  );
}

describe('demo code examples', () => {
  it('keeps adapter imports separate from the public timeline package projection', () => {
    const source = [
      "import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';",
      "import { TimelineProvider } from '@techsquidtv/canvas-timeline-react';",
      "import { useHTMLTimelineMedia } from '@techsquidtv/canvas-timeline-html-media-adapter';",
      "import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';",
    ].join('\n');

    const copyableSource = toCopyableDemoSource(source);

    expect(namedImportsFrom(copyableSource, publicPackageName)).toEqual([
      'TimelineEngine',
      'TimelineProvider',
      'CanvasRenderer',
    ]);
    expect(
      namedImportsFrom(copyableSource, '@techsquidtv/canvas-timeline-html-media-adapter')
    ).toEqual(['useHTMLTimelineMedia']);
  });

  it('renders adapter demo code tabs with only adapter APIs imported from adapter packages', () => {
    const mediaSyncSource = demoCodeExamples['media-sync'].tsx;
    const htmlMediaSyncSource = demoCodeExamples['html-media-sync'].tsx;

    expect(namedImportsFrom(mediaSyncSource, publicPackageName)).toEqual([
      'TimelineEngine',
      'TimelineProvider',
      'Timeline',
      'useTimeline',
      'useTimelinePlayheadTime',
      'CanvasRenderer',
      'fromSeconds',
      'toSeconds',
    ]);
    expect(
      namedImportsFrom(mediaSyncSource, '@techsquidtv/canvas-timeline-mediabunny-adapter')
    ).toEqual(['formatMediabunnyTime']);
    expect(
      namedImportsFrom(mediaSyncSource, '@techsquidtv/canvas-timeline-mediabunny-adapter/react')
    ).toEqual(['useMediabunnyTimelineMedia']);

    expect(namedImportsFrom(htmlMediaSyncSource, publicPackageName)).toEqual([
      'TimelineEngine',
      'TimelineProvider',
      'Timeline',
      'useTimeline',
      'useTimelinePlayheadTime',
      'CanvasRenderer',
      'fromSeconds',
      'toSeconds',
    ]);
    expect(
      namedImportsFrom(htmlMediaSyncSource, '@techsquidtv/canvas-timeline-html-media-adapter')
    ).toEqual(['useHTMLTimelineMedia']);

    for (const packageName of [
      '@techsquidtv/canvas-timeline-mediabunny-adapter',
      '@techsquidtv/canvas-timeline-mediabunny-adapter/react',
      '@techsquidtv/canvas-timeline-html-media-adapter',
    ]) {
      const importedNames = [
        ...namedImportsFrom(mediaSyncSource, packageName),
        ...namedImportsFrom(htmlMediaSyncSource, packageName),
      ];
      for (const exportedName of adapterPackageExports) {
        expect(importedNames).not.toContain(exportedName);
      }
    }
  });
});
