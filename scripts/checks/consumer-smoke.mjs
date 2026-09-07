import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import {
  discoverPublishablePackages,
  readJson,
} from '@techsquidtv/canvas-timeline-scripts/repository';

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const packagesRoot = join(workspaceRoot, 'packages');

const run = (command, args, options = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      stdio: 'inherit',
      ...options,
    });

    child.on('error', rejectRun);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      const reason = code === null ? `signal ${signal ?? 'unknown'}` : `code ${code}`;
      rejectRun(new Error(`${command} ${args.join(' ')} exited with ${reason}`));
    });
  });

const packPackage = async (packageDir, packDir) => {
  const before = new Set(await readdir(packDir));
  await run('pnpm', ['pack', '--pack-destination', packDir], {
    cwd: packageDir,
  });

  const after = await readdir(packDir);
  const tarballs = after.filter((entry) => entry.endsWith('.tgz') && !before.has(entry));

  if (tarballs.length !== 1) {
    throw new Error(`Expected one tarball from ${packageDir}, found ${tarballs.length}`);
  }

  return join(packDir, tarballs[0]);
};

const writeConsumerFixture = async ({ fixtureDir, tarballs, rootManifest }) => {
  const srcDir = join(fixtureDir, 'src');
  await mkdir(srcDir, { recursive: true });

  const packageTarballDependencies = Object.fromEntries(
    [...tarballs.entries()].map(([packageName, tarballPath]) => [
      packageName,
      `file:${relative(fixtureDir, tarballPath)}`,
    ])
  );

  const packageManifest = {
    private: true,
    type: 'module',
    packageManager: rootManifest.packageManager,
    scripts: {
      build: 'tsc -p tsconfig.json && vite build && node ssr-headless.mjs',
    },
    dependencies: {
      ...packageTarballDependencies,
      mediabunny: '^1.50.3',
      react: '^19.2.7',
      'react-dom': '^19.2.7',
    },
    devDependencies: {
      '@types/node': rootManifest.devDependencies['@types/node'],
      '@types/react': rootManifest.devDependencies['@types/react'],
      '@types/react-dom': rootManifest.devDependencies['@types/react-dom'],
      typescript: rootManifest.devDependencies.typescript,
      vite: '^8.1.3',
    },
  };

  await writeFile(
    join(fixtureDir, 'package.json'),
    `${JSON.stringify(packageManifest, null, 2)}\n`
  );
  await writeFile(
    join(fixtureDir, 'pnpm-workspace.yaml'),
    `packages:\n  - .\noverrides:\n${Object.entries(packageTarballDependencies)
      .map(([packageName, tarballPath]) => `  '${packageName}': '${tarballPath}'`)
      .join('\n')}\n`
  );
  await writeFile(
    join(fixtureDir, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          lib: ['ESNext', 'DOM', 'DOM.Iterable'],
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          isolatedModules: true,
          types: ['node', 'vite/client'],
        },
        include: ['src', 'ssr-headless.mjs', 'vite.config.ts'],
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    join(fixtureDir, 'vite.config.ts'),
    `import { defineConfig } from 'vite';\n\nexport default defineConfig({});\n`
  );
  await writeFile(
    join(fixtureDir, 'index.html'),
    `<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n`
  );
  await writeFile(
    join(fixtureDir, 'src/main.tsx'),
    `import { createRoot } from 'react-dom/client';
import {
  CanvasRenderer,
  Timeline,
  TimelineEngine,
  TimelineProvider,
  fromSeconds,
} from '@techsquidtv/canvas-timeline';
import '@techsquidtv/canvas-timeline/styles.css';
import '@techsquidtv/canvas-timeline-react/base.css';
import { SnapIndex } from '@techsquidtv/canvas-timeline-core/snapping';
import { useHTMLTimelineMedia } from '@techsquidtv/canvas-timeline-html-media-adapter/react';
import { formatMediabunnyTime } from '@techsquidtv/canvas-timeline-mediabunny-adapter';
import { CanvasRenderer as FocusedCanvasRenderer } from '@techsquidtv/canvas-timeline-renderer';
import { toSeconds } from '@techsquidtv/canvas-timeline-utils';

const engine = new TimelineEngine({
  duration: fromSeconds(10),
  tracks: [],
});

function App() {
  const rendererName = FocusedCanvasRenderer.name;
  const mediaHookName = useHTMLTimelineMedia.name;
  const snapIndex = new SnapIndex();
  const seconds = toSeconds(fromSeconds(1));

  return (
    <TimelineProvider engine={engine}>
      <Timeline.Root aria-label="Consumer smoke timeline">
        <CanvasRenderer />
        <Timeline.ClipInteractionLayer />
        <Timeline.PlayheadArea />
        <Timeline.PlayheadGrabber />
      </Timeline.Root>
      <output>
        {rendererName}:{mediaHookName}:{snapIndex.size}:{formatMediabunnyTime(seconds)}
      </output>
    </TimelineProvider>
  );
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing root element');
}

createRoot(root).render(<App />);
`
  );
  await writeFile(
    join(fixtureDir, 'ssr-headless.mjs'),
    `import { TimelineEngine } from '@techsquidtv/canvas-timeline-core';
import { fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';

const engine = new TimelineEngine({
  duration: fromSeconds(3),
  tracks: [],
});

if (toSeconds(engine.getState().duration) !== 3) {
  throw new Error('Headless package smoke test failed');
}
`
  );
};

const packageDirs = await discoverPublishablePackages(packagesRoot);
const rootManifest = await readJson(join(workspaceRoot, 'package.json'));
const tempDir = await mkdtemp(join(tmpdir(), 'canvas-timeline-consumer-smoke-'));

try {
  const packDir = join(tempDir, 'tarballs');
  const fixtureDir = join(tempDir, 'consumer');
  const tarballs = new Map();

  await mkdir(packDir, { recursive: true });
  await mkdir(fixtureDir, { recursive: true });

  for (const { directory, manifest } of packageDirs) {
    console.log(`Packing ${manifest.name}`);
    tarballs.set(manifest.name, await packPackage(directory, packDir));
  }

  await writeConsumerFixture({ fixtureDir, tarballs, rootManifest });
  await run('pnpm', ['install', '--frozen-lockfile=false'], { cwd: fixtureDir });
  await run('pnpm', ['run', 'build'], { cwd: fixtureDir });
} finally {
  await rm(tempDir, { force: true, recursive: true });
}
