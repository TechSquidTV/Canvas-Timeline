import { readFileSync } from 'node:fs';

const defaultOptions = {
  maxImplementationExports: 12,
  maxDomainBarrelExports: 30,
  maxRootBarrelDirectExports: 12,
  checkPatterns: ['(^|/)packages/'],
  allowFiles: [],
  allowPatterns: [],
};
const reactApiTsdocDefaultOptions = {
  requiredNames: [
    'TimelineProvider',
    'TimelineProviderProps',
    'TimelineMediaSyncAdapter',
    'UseTimelineMediaSyncOptions',
    'UseTimelineMediaSyncResult',
    'useTimelineMediaSync',
    'useTimelineState',
  ],
  exampleNames: ['TimelineProvider', 'useTimelineMediaSync', 'useTimelineState'],
  returnNames: ['useTimelineMediaSync', 'useTimelineState'],
  remarksLinkNames: [
    'TimelineProvider',
    'TimelineProviderProps',
    'TimelineMediaSyncAdapter',
    'UseTimelineMediaSyncOptions',
    'useTimelineMediaSync',
    'useTimelineState',
  ],
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

const reactApiTsdocRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require useful TSDoc on curated public React API declarations, including examples and inline links.',
      recommended: false,
    },
    defaultOptions: [reactApiTsdocDefaultOptions],
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          requiredNames: {
            type: 'array',
            items: { type: 'string' },
          },
          exampleNames: {
            type: 'array',
            items: { type: 'string' },
          },
          returnNames: {
            type: 'array',
            items: { type: 'string' },
          },
          remarksLinkNames: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    ],
    messages: {
      missingDoc: '{{name}} must have a TSDoc block.',
      missingSummary: '{{name}} must have a TSDoc summary.',
      missingRemarks: '{{name}} must include @remarks.',
      missingRemarksLink: '{{name}} @remarks must include a {@link ...} reference.',
      missingExample: '{{name}} must include @example.',
      missingReturn: '{{name}} must include @returns.',
      missingParam: '{{name}} must document @param {{param}}.',
      missingTemplate: '{{name}} must document @template {{param}}.',
      missingMemberDoc: '{{name}}.{{member}} must have a TSDoc summary.',
    },
  },
  createOnce(context) {
    const options = normalizeReactApiTsdocOptions(context.options?.[0]);
    let checkedNames = new Set();

    function check(node) {
      const name = declarationName(node);
      if (name && checkedNames.has(name)) {
        return;
      }
      if (name) {
        checkedNames.add(name);
      }
      checkReactApiDeclaration(context, options, node);
    }

    return {
      before() {
        checkedNames = new Set();
      },
      ExportNamedDeclaration(node) {
        check(node.declaration ?? node);
      },
      FunctionDeclaration(node) {
        if (isExportedNode(node)) {
          check(node);
        }
      },
      TSInterfaceDeclaration(node) {
        if (isExportedNode(node)) {
          check(node);
        }
      },
      TSTypeAliasDeclaration(node) {
        if (isExportedNode(node)) {
          check(node);
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
    'react-api-tsdoc': reactApiTsdocRule,
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

function normalizeReactApiTsdocOptions(rawOptions) {
  return {
    ...reactApiTsdocDefaultOptions,
    ...rawOptions,
    requiredNames: rawOptions?.requiredNames ?? reactApiTsdocDefaultOptions.requiredNames,
    exampleNames: rawOptions?.exampleNames ?? reactApiTsdocDefaultOptions.exampleNames,
    returnNames: rawOptions?.returnNames ?? reactApiTsdocDefaultOptions.returnNames,
    remarksLinkNames: rawOptions?.remarksLinkNames ?? reactApiTsdocDefaultOptions.remarksLinkNames,
  };
}

function checkReactApiDeclaration(context, options, node) {
  const name = declarationName(node);

  if (!name || !options.requiredNames.includes(name)) {
    return;
  }

  const doc = tsdocForNode(context, node);

  if (!doc) {
    reportTsdoc(context, node, 'missingDoc', { name });
    return;
  }

  if (!hasSummaryText(doc)) {
    reportTsdoc(context, node, 'missingSummary', { name });
  }

  const remarks = tagText(doc, 'remarks');
  if (!remarks) {
    reportTsdoc(context, node, 'missingRemarks', { name });
  }

  if (options.remarksLinkNames.includes(name) && remarks && !/\{@link\s+[^}]+\}/.test(remarks)) {
    reportTsdoc(context, node, 'missingRemarksLink', { name });
  }

  if (options.exampleNames.includes(name) && !hasTag(doc, 'example')) {
    reportTsdoc(context, node, 'missingExample', { name });
  }

  if (options.returnNames.includes(name) && !hasTag(doc, 'returns')) {
    reportTsdoc(context, node, 'missingReturn', { name });
  }

  for (const param of functionParameterNames(node)) {
    if (!new RegExp(`@param\\s+${escapeRegExp(param)}\\b[\\s\\S]*?-\\s+\\S`).test(doc)) {
      reportTsdoc(context, node, 'missingParam', { name, param });
    }
  }

  for (const param of typeParameterNames(node)) {
    if (
      !new RegExp(`@(template|typeParam)\\s+${escapeRegExp(param)}\\b[\\s\\S]*?-\\s+\\S`).test(doc)
    ) {
      reportTsdoc(context, node, 'missingTemplate', { name, param });
    }
  }
}

function reportTsdoc(context, node, messageId, data) {
  context.report({
    node,
    messageId,
    data,
  });
}

function declarationName(node) {
  return node?.id?.name ?? node?.name?.name ?? node?.name ?? undefined;
}

function isExportedNode(node) {
  return node.modifiers?.some((modifier) => modifier.type === 'ExportKeyword') ?? false;
}

function tsdocForNode(context, node) {
  const name = declarationName(node);

  if (name && context.filename) {
    const scannedDoc = tsdocForDeclaration(context.filename, name);

    if (scannedDoc) {
      return scannedDoc;
    }
  }

  const comments =
    context.sourceCode?.getCommentsBefore?.(node) ??
    context.getSourceCode?.().getCommentsBefore?.(node) ??
    node.leadingComments ??
    [];
  const comment = comments
    .filter((candidate) => candidate.type === 'Block' || candidate.type === 'BlockComment')
    .at(-1);
  const text = comment?.value ?? comment?.text;

  if (typeof text === 'string') {
    return text;
  }

  return undefined;
}

function tsdocForDeclaration(fileName, name) {
  try {
    const source = readFileSync(fileName, 'utf8');
    const escapedName = escapeRegExp(name);
    const declarationMatch = source.match(
      new RegExp(`export\\s+(?:async\\s+)?(?:function|interface|type|class)\\s+${escapedName}\\b`)
    );

    if (declarationMatch?.index === undefined) {
      return undefined;
    }

    const beforeDeclaration = source.slice(0, declarationMatch.index);

    return beforeDeclaration.match(/\/\*\*[\s\S]*?\*\/\s*$/)?.[0];
  } catch {
    return undefined;
  }
}

function hasSummaryText(doc) {
  return (
    doc
      .split(/\n\s*\*\s*@/)[0]
      ?.replaceAll('*', '')
      .trim().length > 0
  );
}

function hasTag(doc, tagName) {
  return new RegExp(`@${tagName}\\b`).test(doc);
}

function tagText(doc, tagName) {
  const match = doc.match(new RegExp(`@${tagName}\\b([\\s\\S]*?)(?=\\n\\s*\\*\\s*@|\\n\\s*@|$)`));

  return match?.[1]?.trim() ?? '';
}

function functionParameterNames(node) {
  if (node.type !== 'FunctionDeclaration') {
    return [];
  }

  return (node.params ?? [])
    .map((param) => param.name ?? param.argument?.name)
    .filter((name) => typeof name === 'string');
}

function typeParameterNames(node) {
  return (node.typeParameters?.params ?? node.typeParameters?.items ?? [])
    .map((param) => param.name?.name ?? param.name)
    .filter((name) => typeof name === 'string');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
