export type AliasRule = {
  find: RegExp;
  replacement: string;
};

export type WorkspaceAliasOptions = {
  workspaceRoot: string;
  internalAliasOverrides?: Partial<
    Record<
      | 'core'
      | 'full-editor'
      | 'html-media-adapter'
      | 'mediabunny-adapter'
      | 'react'
      | 'renderer'
      | 'test-utils'
      | 'timeline'
      | 'utils'
      | 'www'
      | 'www-generated',
      string
    >
  >;
  packageAliases?: ReadonlyArray<
    | 'core'
    | 'html-media-adapter'
    | 'mediabunny-adapter'
    | 'react'
    | 'renderer'
    | 'timeline'
    | 'utils'
  >;
};

export function createWorkspaceAliases(options: WorkspaceAliasOptions): AliasRule[];
