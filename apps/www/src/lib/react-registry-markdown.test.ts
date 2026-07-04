import { describe, expect, test } from 'vite-plus/test';
import { buildReactRegistryLlmMarkdown } from './react-registry-markdown';

describe('React registry LLM Markdown builder', () => {
  test('builds deep API reference Markdown for registry compound components', () => {
    const markdown = buildReactRegistryLlmMarkdown({
      slug: 'track',
      kind: 'component',
      name: 'Track',
      title: 'Track',
      description: 'Timeline rows and optional DOM headers that size themselves from track state.',
      importPath: '@techsquidtv/canvas-timeline-react',
      demo: {
        variant: 'track',
        title: 'Track preview',
        description: 'A focused row layout showing track lanes and nested clip content.',
      },
      usageCode: `import { Timeline } from '@techsquidtv/canvas-timeline-react';

export function VideoTrack() {
  return (
    <div className="grid grid-cols-[12rem_minmax(0,1fr)]">
      <Timeline.TrackHeaderList>
        <Timeline.TrackHeader trackId="video-1" />
      </Timeline.TrackHeaderList>
      <Timeline.Track trackId="video-1" />
    </div>
  );
}`,
      apis: [
        {
          name: 'Timeline.Track',
          description: 'Track row element bound to a track id and synchronized row height.',
          apiSlug: 'track-item-props',
        },
        {
          name: 'Timeline.TrackHeaderList',
          description: 'Static left-column container for DOM track headers.',
          apiSlug: 'track-header-list-props',
        },
        {
          name: 'Timeline.TrackHeader',
          description: 'DOM track header row bound to one track id and synchronized row height.',
          apiSlug: 'track-header-props',
        },
      ],
    });

    expect(markdown).toContain('# Track LLM Reference');
    expect(markdown).toContain('Source: https://canvastimeline.com/packages/react/registry/track');
    expect(markdown).toContain(
      'LLM reference: https://canvastimeline.com/packages/react/registry/track.llms.md'
    );
    expect(markdown).toContain('## Usage');
    expect(markdown).toContain('## Compound components and exports');
    expect(markdown).toContain('`Timeline.Track`');
    expect(markdown).toContain('# TrackItemProps API');
    expect(markdown).toContain('# TrackHeaderProps API');
    expect(markdown).toContain('## Signature');
    expect(markdown).not.toContain('<table');
    expect(markdown).not.toContain('class=');
  });
});
