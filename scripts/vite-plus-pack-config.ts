import type { PackUserConfig } from 'vite-plus/pack';

type LibraryPackConfigOptions = {
  entry: string[];
  neverBundle?: Array<RegExp | string>;
  sourcemap?: boolean;
};

export function createLibraryPackConfig({
  entry,
  neverBundle = [],
  sourcemap = true,
}: LibraryPackConfigOptions): PackUserConfig {
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
    fixedExtension: false,
    deps: {
      neverBundle,
    },
  };
}
