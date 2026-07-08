export function createLibraryPackConfig({ entry, neverBundle = [], sourcemap = true }) {
  return {
    entry,
    root: 'src',
    outDir: 'dist',
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    sourcemap,
    dts: {
      sourcemap: false,
    },
    unbundle: true,
    fixedExtension: true,
    deps: {
      neverBundle,
    },
  };
}
