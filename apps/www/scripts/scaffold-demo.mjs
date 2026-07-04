import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..');

const [slug, liveDemoId, componentName, ...titleParts] = process.argv.slice(2);
const title = titleParts.join(' ') || slugToTitle(slug ?? '');

if (!slug || !liveDemoId || !componentName) {
  console.error(
    'Usage: node scripts/scaffold-demo.mjs <slug> <liveDemoId> <ComponentName> [Title]'
  );
  process.exit(1);
}

const demoDir = resolve(appDir, 'src/demos', slug);
const componentFile = `${componentName}.tsx`;
const relativeComponentPath = `apps/www/src/demos/${slug}/${componentFile}`;
const relativeDataPath = `apps/www/src/demos/${slug}/timeline-demo-data.ts`;

await mkdir(demoDir, { recursive: false });

await writeFile(
  resolve(demoDir, 'timeline-demo-data.ts'),
  `import type { Track } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';

export const demoTracks: Track<'visual' | 'audio'>[] = [
  {
    id: 'visual-a',
    kind: 'visual',
    name: 'Visual A',
    locked: false,
    muted: false,
    selected: false,
    height: 48,
    clips: [
      {
        id: 'intro',
        sourceId: 'vid-intro',
        timelineStart: fromSeconds(1),
        timelineEnd: fromSeconds(5),
        sourceStart: fromSeconds(0),
        selected: true,
        label: 'Intro sequence',
      },
    ],
  },
];
`
);

await writeFile(
  resolve(demoDir, componentFile),
  `import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { TimelineProvider, Timeline, useTimeline } from '@techsquidtv/canvas-timeline-react';
import { CanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { fromSeconds } from '@techsquidtv/canvas-timeline-utils';
import { useMemo } from 'react';
import { demoTracks } from './timeline-demo-data';
import '@techsquidtv/canvas-timeline-react/styles.css';

function TimelineLayers() {
  const { state } = useTimeline();

  return (
    <>
      <Timeline.TrackList className="timeline-editor-track-list">
        {state.tracks.map((track) => (
          <Timeline.Track key={track.id} trackId={track.id} />
        ))}
      </Timeline.TrackList>
      <Timeline.ClipInteractionLayer />
    </>
  );
}

export function ${componentName}() {
  const engine = useMemo(
    () =>
      new TimelineEngine({
        duration: fromSeconds(15),
        playheadTime: fromSeconds(2),
        zoomScale: 74,
        tracks: demoTracks,
      }),
    []
  );

  return (
    <TimelineProvider engine={engine}>
      <div className="timeline-editor-shell">
        <div className="timeline-editor-stage">
          <Timeline.Root className="timeline-editor-root">
            <CanvasRenderer />
            <TimelineLayers />
          </Timeline.Root>
        </div>
      </div>
    </TimelineProvider>
  );
}
`
);

await insertRegistryEntry();
await insertComponentEntry();
await insertDemoDocEntry();

console.log(`Scaffolded source-backed demo "${slug}" (${liveDemoId}).`);

async function insertRegistryEntry() {
  const registryPath = resolve(appDir, 'src/data/demo-code.ts');
  let source = await readFile(registryPath, 'utf8');
  const importBlock = `import ${liveDemoIdToIdentifier(liveDemoId)}TimelineSource from '../demos/${slug}/${componentFile}?raw';
import ${liveDemoIdToIdentifier(liveDemoId)}DataSource from '../demos/${slug}/timeline-demo-data.ts?raw';
`;

  source = source.replace(
    /import \{ toCopyableDemoSource \} from '\.\/demo-snippets';/,
    `${importBlock}import { toCopyableDemoSource } from './demo-snippets';`
  );

  const key = liveDemoId.includes('-') ? `'${liveDemoId}'` : liveDemoId;
  const id = liveDemoIdToIdentifier(liveDemoId);
  const entry = `  ${key}: {
    tsx: toCopyableDemoSource(${id}TimelineSource),
    data: toCopyableDemoSource(${id}DataSource),
    sourceFiles: {
      component: '${relativeComponentPath}',
      data: '${relativeDataPath}',
    },
  },
`;

  source = source.replace(/\n};\s*$/, `\n${entry}};\n`);
  await writeFile(registryPath, source);
}

async function insertComponentEntry() {
  const registryPath = resolve(appDir, 'src/data/demo-components.ts');
  let source = await readFile(registryPath, 'utf8');
  const key = liveDemoId.includes('-') ? `'${liveDemoId}'` : liveDemoId;
  const entry = `  ${key}: () =>
    import('../demos/${slug}/${componentName}').then((module) => module.${componentName}),
`;

  source = source.replace(/\n};\s*$/, `\n${entry}};\n`);
  await writeFile(registryPath, source);
}

async function insertDemoDocEntry() {
  const demosPath = resolve(appDir, 'src/data/demos.ts');
  let source = await readFile(demosPath, 'utf8');
  const entry = `  {
    slug: '${slug}',
    title: '${title.replace(/'/g, "\\'")}',
    description: 'A source-backed Canvas Timeline demo.',
    status: 'starter',
    difficulty: 'Beginner',
    packageFocus: [
      '@techsquidtv/canvas-timeline-core',
      '@techsquidtv/canvas-timeline-react',
      '@techsquidtv/canvas-timeline-renderer',
    ],
    sourcePath: '${relativeComponentPath}',
    liveDemoId: '${liveDemoId}',
  },
`;

  source = source.replace(/export type LiveDemoId = ([^;]+);/, (match, ids) => {
    if (ids.includes(`'${liveDemoId}'`)) {
      return match;
    }

    return `export type LiveDemoId = ${ids} | '${liveDemoId}';`;
  });

  source = source.replace(/\n];\s*$/, `\n${entry}];\n`);
  await writeFile(demosPath, source);
}

function slugToTitle(value) {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function liveDemoIdToIdentifier(value) {
  return value.replace(/[^a-zA-Z0-9]+(.)?/g, (_, next = '') => next.toUpperCase());
}
