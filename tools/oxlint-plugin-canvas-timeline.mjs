const defaultOptions = {
  maxImplementationExports: 12,
  maxDomainBarrelExports: 30,
  maxRootBarrelDirectExports: 12,
  checkPatterns: ['(^|/)packages/'],
  allowFiles: [],
  allowPatterns: [],
};

const exportCountingRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Limit exported symbol count so implementation files do not become accidental public surfaces.',
      recommended: false,
    },
    defaultOptions: [defaultOptions],
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          maxImplementationExports: {
            type: 'number',
            minimum: 0,
          },
          maxDomainBarrelExports: {
            type: 'number',
            minimum: 0,
          },
          maxRootBarrelDirectExports: {
            type: 'number',
            minimum: 0,
          },
          checkPatterns: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          allowFiles: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          allowPatterns: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
      },
    ],
    messages: {
      tooManyImplementationExports:
        'This implementation module exports {{count}} symbols; split it or move grouped exports behind a domain barrel. Limit is {{limit}}.',
      tooManyDomainBarrelExports:
        'This domain barrel re-exports {{count}} symbols; split it into smaller domain barrels. Limit is {{limit}}.',
      tooManyRootBarrelDirectExports:
        'This root barrel has {{count}} direct file exports; re-export domain barrels instead. Limit is {{limit}}.',
    },
  },
  createOnce(context) {
    let namedExportCount = 0;
    let directBarrelExportCount = 0;
    let firstExportNode;

    return {
      before() {
        namedExportCount = 0;
        directBarrelExportCount = 0;
        firstExportNode = undefined;
      },
      ExportAllDeclaration(node) {
        firstExportNode ??= node;
        namedExportCount += 1;

        if (isDirectBarrelExport(node.source?.value)) {
          directBarrelExportCount += 1;
        }
      },
      ExportNamedDeclaration(node) {
        firstExportNode ??= node;

        if (node.declaration) {
          namedExportCount += countDeclarationExports(node.declaration);
          return;
        }

        namedExportCount += node.specifiers?.length ?? 0;

        if (isDirectBarrelExport(node.source?.value)) {
          directBarrelExportCount += 1;
        }
      },
      'Program:exit'(node) {
        const fileName = normalizePath(context.filename);
        const options = normalizeOptions(context.options[0]);

        if (!shouldCheckFile(fileName, options)) {
          return;
        }

        const fileKind = classifyFile(fileName);
        const reportNode = firstExportNode ?? node;

        if (fileKind === 'rootBarrel') {
          if (directBarrelExportCount > options.maxRootBarrelDirectExports) {
            context.report({
              node: reportNode,
              messageId: 'tooManyRootBarrelDirectExports',
              data: {
                count: String(directBarrelExportCount),
                limit: String(options.maxRootBarrelDirectExports),
              },
            });
          }
          return;
        }

        if (fileKind === 'domainBarrel') {
          if (namedExportCount > options.maxDomainBarrelExports) {
            context.report({
              node: reportNode,
              messageId: 'tooManyDomainBarrelExports',
              data: {
                count: String(namedExportCount),
                limit: String(options.maxDomainBarrelExports),
              },
            });
          }
          return;
        }

        if (namedExportCount > options.maxImplementationExports) {
          context.report({
            node: reportNode,
            messageId: 'tooManyImplementationExports',
            data: {
              count: String(namedExportCount),
              limit: String(options.maxImplementationExports),
            },
          });
        }
      },
    };
  },
};

export default {
  meta: {
    name: 'canvas-timeline',
  },
  rules: {
    'max-exports-per-module': exportCountingRule,
  },
};

function normalizeOptions(rawOptions) {
  return {
    ...defaultOptions,
    ...rawOptions,
    checkPatterns: rawOptions?.checkPatterns ?? defaultOptions.checkPatterns,
    allowFiles: rawOptions?.allowFiles ?? defaultOptions.allowFiles,
    allowPatterns: rawOptions?.allowPatterns ?? defaultOptions.allowPatterns,
  };
}

function shouldCheckFile(fileName, options) {
  if (!options.checkPatterns.some((pattern) => new RegExp(pattern).test(fileName))) {
    return false;
  }

  if (!/\.[cm]?[jt]sx?$/.test(fileName)) {
    return false;
  }

  if (/(^|\/)(dist|node_modules|coverage)\//.test(fileName)) {
    return false;
  }

  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(fileName)) {
    return false;
  }

  if (options.allowFiles.some((allowedFile) => fileName.endsWith(normalizePath(allowedFile)))) {
    return false;
  }

  return !options.allowPatterns.some((pattern) => new RegExp(pattern).test(fileName));
}

function classifyFile(fileName) {
  if (!fileName.endsWith('/index.ts') && !fileName.endsWith('/index.tsx')) {
    return 'implementation';
  }

  const pathParts = fileName.split('/');
  const srcIndex = pathParts.lastIndexOf('src');

  if (srcIndex === -1) {
    return 'implementation';
  }

  return pathParts.length - srcIndex === 2 ? 'rootBarrel' : 'domainBarrel';
}

function isDirectBarrelExport(sourceValue) {
  return typeof sourceValue === 'string' && sourceValue.startsWith('./') && sourceValue !== './';
}

function countDeclarationExports(declaration) {
  if (declaration.type === 'VariableDeclaration') {
    return declaration.declarations?.length ?? 0;
  }

  return 1;
}

function normalizePath(fileName) {
  return fileName.replaceAll('\\', '/');
}
