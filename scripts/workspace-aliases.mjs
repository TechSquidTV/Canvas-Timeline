import path from 'node:path';

const internalAliasTargets = [
  ['full-editor', 'apps/full-editor-demo/src'],
  ['core', 'packages/core/src'],
  ['html-media-adapter', 'packages/html-media-adapter/src'],
  ['mediabunny-adapter', 'packages/mediabunny-adapter/src'],
  ['react', 'packages/react/src'],
  ['renderer', 'packages/renderer/src'],
  ['test-utils', 'test-utils'],
  ['timeline', 'packages/timeline/src'],
  ['utils', 'packages/utils/src'],
  ['www', 'apps/www/src'],
  ['www-generated', 'apps/www/.generated'],
];

const packageAliasTargets = {
  core: {
    packageName: '@techsquidtv/canvas-timeline-core',
    root: 'packages/core/src',
    entry: 'packages/core/src/index.ts',
    subpaths: {},
  },
  'html-media-adapter': {
    packageName: '@techsquidtv/canvas-timeline-html-media-adapter',
    root: 'packages/html-media-adapter/src',
    entry: 'packages/html-media-adapter/src/index.ts',
    subpaths: {},
  },
  'mediabunny-adapter': {
    packageName: '@techsquidtv/canvas-timeline-mediabunny-adapter',
    root: 'packages/mediabunny-adapter/src',
    entry: 'packages/mediabunny-adapter/src/index.ts',
    subpaths: {},
  },
  react: {
    packageName: '@techsquidtv/canvas-timeline-react',
    root: 'packages/react/src',
    entry: 'packages/react/src/index.ts',
    subpaths: {
      'range-scrollbar': 'packages/react/src/rangeScrollbar/index.ts',
      'timecode-field': 'packages/react/src/timecodeField/index.ts',
      'timecode-input': 'packages/react/src/timecodeInput/index.ts',
    },
  },
  renderer: {
    packageName: '@techsquidtv/canvas-timeline-renderer',
    root: 'packages/renderer/src',
    entry: 'packages/renderer/src/index.ts',
    subpaths: {},
  },
  timeline: {
    packageName: '@techsquidtv/canvas-timeline',
    root: 'packages/timeline/src',
    entry: 'packages/timeline/src/index.ts',
    subpaths: {},
  },
  utils: {
    packageName: '@techsquidtv/canvas-timeline-utils',
    root: 'packages/utils/src',
    entry: 'packages/utils/src/index.ts',
    subpaths: {},
  },
};

const allPackageAliases = Object.keys(packageAliasTargets);

export function createWorkspaceAliases({
  workspaceRoot,
  internalAliasOverrides = {},
  packageAliases = allPackageAliases,
}) {
  return [
    ...internalAliasTargets.map(([name, target]) =>
      createSubpathAlias(
        `#${name}`,
        resolveAliasTarget(workspaceRoot, internalAliasOverrides[name] ?? target, '$1')
      )
    ),
    ...packageAliases.flatMap((name) => {
      const target = packageAliasTargets[name];
      const subpathAliases = Object.entries(target.subpaths).map(([subpath, targetPath]) =>
        createExactAlias(
          `${target.packageName}/${subpath}`,
          path.resolve(workspaceRoot, targetPath)
        )
      );

      return [
        createExactAlias(target.packageName, path.resolve(workspaceRoot, target.entry)),
        ...subpathAliases,
        createSubpathAlias(target.packageName, path.resolve(workspaceRoot, target.root, '$1')),
      ];
    }),
  ];
}

function createExactAlias(specifier, replacement) {
  return {
    find: new RegExp(`^${escapeRegExp(specifier)}$`),
    replacement,
  };
}

function createSubpathAlias(specifier, replacement) {
  return {
    find: new RegExp(`^${escapeRegExp(specifier)}\\/(.*)$`),
    replacement,
  };
}

function resolveAliasTarget(workspaceRoot, target, subpath) {
  return path.resolve(workspaceRoot, target, subpath);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
