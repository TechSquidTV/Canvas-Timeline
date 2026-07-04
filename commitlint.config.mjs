const allowedScopes = [
  'ci',
  'config',
  'core',
  'demo',
  'deps',
  'docs',
  'html-media',
  'mediabunny',
  'react',
  'release',
  'renderer',
  'timeline',
  'utils',
  'www',
];

const allowedScopeMessage = `scope must be empty for cross-domain changes or one or more of: ${allowedScopes.join(', ')}`;

const splitScopes = (scope) =>
  scope
    .split(/[,/\\]/)
    .map((part) => part.trim())
    .filter(Boolean);

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'canvas-scope-enum': ({ scope }) => {
          if (!scope) {
            return [true];
          }

          const scopes = splitScopes(scope);
          const hasOnlyAllowedScopes = scopes.every((candidate) =>
            allowedScopes.includes(candidate)
          );

          return [hasOnlyAllowedScopes, allowedScopeMessage];
        },
      },
    },
  ],
  rules: {
    'scope-enum': [0],
    'canvas-scope-enum': [2, 'always'],
  },
};
