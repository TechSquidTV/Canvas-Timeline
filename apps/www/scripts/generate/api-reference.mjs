import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '../..');
const rootDir = resolve(appDir, '../..');
const generatedDir = resolve(appDir, '.generated');
const outputPath = resolve(generatedDir, 'api-reference.json');
const warningsPath = resolve(generatedDir, 'api-reference-warnings.txt');
const typedocBin = resolve(appDir, 'node_modules/.bin/typedoc');
const externalSymbolLinkMappings = {
  '@techsquidtv/canvas-timeline-core': {
    ActiveLayerOptions: '/packages/core/api/active-layer-options',
    ActiveLayerResult: '/packages/core/api/active-layer-result',
    ActiveLayerSelector: '/packages/core/api/active-layer-selector',
    TimelineEngine: '/packages/core/api/timeline-engine',
    TimelineState: '/packages/core/api/timeline-state',
  },
  '@techsquidtv/canvas-timeline-react': {
    useTimelineMediaSync: '/packages/react/api/use-timeline-media-sync',
  },
  '@techsquidtv/canvas-timeline-utils': {
    RationalTime: '/packages/utils/api/rational-time',
  },
};

const packageEntries = [
  {
    slug: 'timeline',
    name: '@techsquidtv/canvas-timeline',
    entryPoint: 'packages/timeline/src/index.ts',
  },
  {
    slug: 'core',
    name: '@techsquidtv/canvas-timeline-core',
    entryPoint: 'packages/core/src/index.ts',
  },
  {
    slug: 'react',
    name: '@techsquidtv/canvas-timeline-react',
    entryPoint: 'packages/react/src/index.ts',
  },
  {
    slug: 'mediabunny-adapter',
    name: '@techsquidtv/canvas-timeline-mediabunny-adapter',
    entryPoint: 'packages/mediabunny-adapter/src/index.ts',
    entryPoints: [
      'packages/mediabunny-adapter/src/index.ts',
      'packages/mediabunny-adapter/src/react.ts',
    ],
  },
  {
    slug: 'html-media-adapter',
    name: '@techsquidtv/canvas-timeline-html-media-adapter',
    entryPoint: 'packages/html-media-adapter/src/index.ts',
  },
  {
    slug: 'renderer',
    name: '@techsquidtv/canvas-timeline-renderer',
    entryPoint: 'packages/renderer/src/index.ts',
  },
  {
    slug: 'utils',
    name: '@techsquidtv/canvas-timeline-utils',
    entryPoint: 'packages/utils/src/index.ts',
  },
];

const kindNames = new Map([
  [32, 'Variable'],
  [64, 'Function'],
  [128, 'Class'],
  [256, 'Interface'],
  [512, 'Constructor'],
  [1024, 'Property'],
  [2048, 'Method'],
  [4096, 'Call Signature'],
  [262144, 'Accessor'],
  [2097152, 'Type Alias'],
  [4194304, 'Reference'],
]);

const linkTags = new Set(['@link', '@linkcode', '@linkplain']);

function commentPartText(part) {
  if (typeof part.text === 'string') {
    return part.text;
  }

  if (typeof part.name === 'string') {
    return part.name;
  }

  return '';
}

function commentPartTarget(part) {
  const target = part.target;

  if (typeof target === 'string') {
    return target;
  }

  if (typeof target?.name === 'string') {
    return target.name;
  }

  if (typeof target?.qualifiedName === 'string') {
    return target.qualifiedName;
  }

  return undefined;
}

function trimTSDocLinkText(value) {
  return value
    .replace(/^\{@link(?:code|plain)?\s+/, '')
    .replace(/\}$/, '')
    .trim();
}

function docPartsFromCommentParts(parts = []) {
  const docParts = [];

  for (const part of parts) {
    const kind = part.kind ?? 'text';
    const text = commentPartText(part);

    if (kind === 'inline-tag' && linkTags.has(part.tag)) {
      const rawTarget = commentPartTarget(part);
      const cleanedText = trimTSDocLinkText(text);
      const [targetText, labelText] = cleanedText.split('|').map((segment) => segment.trim());
      const target = rawTarget ?? targetText;
      const label = labelText || targetText || rawTarget;

      if (target) {
        docParts.push({
          kind: 'link',
          text: label || target,
          target,
        });
      }
      continue;
    }

    if (!text) {
      continue;
    }

    docParts.push({
      kind: kind === 'code' ? 'code' : 'text',
      text,
    });
  }

  return docParts;
}

function textFromDocParts(parts, { collapseWhitespace = true } = {}) {
  const text = parts.map((part) => part.text).join('');

  if (!collapseWhitespace) {
    return text.trim();
  }

  return text.replace(/\s+/g, ' ').trim();
}

function textFromCommentParts(parts = [], options = {}) {
  return textFromDocParts(docPartsFromCommentParts(parts), options);
}

function commentSummary(comment) {
  return textFromCommentParts(comment?.summary);
}

function commentSummaryParts(comment) {
  return docPartsFromCommentParts(comment?.summary);
}

function commentExamples(comment) {
  return (comment?.blockTags ?? [])
    .filter((tag) => tag.tag === '@example')
    .map((tag) => textFromCommentParts(tag.content, { collapseWhitespace: false }))
    .filter(Boolean);
}

function commentBlockTag(comment, tagName) {
  const tag = comment?.blockTags?.find((blockTag) => blockTag.tag === tagName);

  return textFromCommentParts(tag?.content);
}

function commentBlockTagParts(comment, tagName) {
  const tag = comment?.blockTags?.find((blockTag) => blockTag.tag === tagName);

  return docPartsFromCommentParts(tag?.content);
}

function commentBlockTagsParts(comment, tagName) {
  return (comment?.blockTags ?? [])
    .filter((tag) => tag.tag === tagName)
    .map((tag) => docPartsFromCommentParts(tag.content))
    .filter((parts) => parts.length > 0);
}

function parametersText(parameters = []) {
  return parameters
    .map((parameter) => {
      const optional = parameter.flags?.isOptional ? '?' : '';
      const defaultValue = parameter.defaultValue ? ` = ${parameter.defaultValue}` : '';

      return `${parameter.name}${optional}: ${typeName(parameter.type)}${defaultValue}`;
    })
    .join(', ');
}

function signatureText(signature, name = '') {
  const parameters = parametersText(signature?.parameters);
  const returnType = typeName(signature?.type);
  const prefix = name ? `${name}(` : '(';

  return `${prefix}${parameters}): ${returnType}`;
}

function typeName(type) {
  if (!type) {
    return 'void';
  }

  if (type.type === 'intrinsic') {
    return type.name;
  }

  if (type.type === 'reference') {
    const typeArguments = type.typeArguments?.length
      ? `<${type.typeArguments.map(typeName).join(', ')}>`
      : '';

    return `${type.name}${typeArguments}`;
  }

  if (type.type === 'intersection') {
    return type.types.map(typeName).join(' & ');
  }

  if (type.type === 'conditional') {
    return type.name;
  }

  if (type.type === 'array') {
    return `${typeName(type.elementType)}[]`;
  }

  if (type.type === 'union') {
    return type.types.map(typeName).join(' | ');
  }

  if (type.type === 'literal') {
    return JSON.stringify(type.value);
  }

  if (type.type === 'reflection') {
    const signature = type.declaration?.signatures?.[0];

    if (signature) {
      return `(${parametersText(signature.parameters)}) => ${typeName(signature.type)}`;
    }

    const children = type.declaration?.children ?? [];

    if (children.length > 0 && children.length <= 4) {
      return `{ ${children.map((child) => `${child.name}: ${typeName(child.type)}`).join('; ')} }`;
    }

    return 'object';
  }

  if (type.type === 'tuple') {
    return `[${type.elements.map(typeName).join(', ')}]`;
  }

  return type.name ?? type.type ?? 'unknown';
}

function signatureFor(reflection) {
  const signature = reflection.signatures?.[0];

  if (signature) {
    return signatureText(signature, reflection.name);
  }

  if (reflection.type) {
    return `${reflection.name}: ${typeName(reflection.type)}`;
  }

  return `${kindNames.get(reflection.kind) ?? 'Symbol'} ${reflection.name}`;
}

function paramsFor(reflection) {
  const signature = reflection.signatures?.[0];

  return (signature?.parameters ?? []).map((parameter) => ({
    name: parameter.name,
    type: typeName(parameter.type),
    optional: Boolean(parameter.flags?.isOptional),
    defaultValue: parameter.defaultValue,
    summary: commentSummary(parameter.comment),
    summaryParts: commentSummaryParts(parameter.comment),
  }));
}

function isExternalInheritedMember(child) {
  const sources = child.sources ?? [];

  return (
    sources.length > 0 &&
    sources.every((source) => {
      const fileName = source.fileName ?? '';
      const sourceUrl = source.url ?? '';

      return (
        fileName.includes('node_modules') ||
        sourceUrl.includes('DefinitelyTyped') ||
        (fileName === 'index.d.ts' && source.packageName?.startsWith('@types/'))
      );
    })
  );
}

function visibleChildren(reflection) {
  return (reflection?.children ?? []).filter(
    (child) =>
      !child.flags?.isPrivate && !child.flags?.isProtected && !isExternalInheritedMember(child)
  );
}

function memberSignature(member) {
  const signature =
    member.signatures?.[0] ??
    member.getSignature ??
    member.setSignature ??
    member.type?.declaration?.signatures?.[0];

  if (member.kind === 262144 && signature?.type) {
    return `${member.name}: ${typeName(signature.type)}`;
  }

  if (signature) {
    return signatureText(signature, member.kind === 2048 || member.kind === 512 ? member.name : '');
  }

  if (member.type) {
    return `${member.name}${member.flags?.isOptional ? '?' : ''}: ${typeName(member.type)}`;
  }

  return `${member.name}: ${kindNames.get(member.kind) ?? 'unknown'}`;
}

function memberReturn(member) {
  const signature =
    member.signatures?.[0] ??
    member.getSignature ??
    member.setSignature ??
    member.type?.declaration?.signatures?.[0];

  return signature?.type ? typeName(signature.type) : undefined;
}

function normalizeMember(member) {
  const signature =
    member.signatures?.[0] ??
    member.getSignature ??
    member.setSignature ??
    member.type?.declaration?.signatures?.[0];

  const summaryParts =
    commentSummaryParts(member.comment).length > 0
      ? commentSummaryParts(member.comment)
      : commentSummaryParts(member.getSignature?.comment).length > 0
        ? commentSummaryParts(member.getSignature?.comment)
        : commentSummaryParts(member.setSignature?.comment).length > 0
          ? commentSummaryParts(member.setSignature?.comment)
          : commentSummaryParts(signature?.comment);
  const summary = textFromDocParts(summaryParts);

  return {
    name: member.name,
    kind: kindNames.get(member.kind) ?? `Kind ${member.kind}`,
    signature: memberSignature(member),
    type: member.type
      ? typeName(member.type)
      : signature?.type
        ? typeName(signature.type)
        : undefined,
    optional: Boolean(member.flags?.isOptional),
    params: paramsFor(signature ? { signatures: [signature] } : member),
    returns: memberReturn(member),
    summary,
    summaryParts,
  };
}

function membersFor(reflection, kinds) {
  return visibleChildren(reflection)
    .filter((child) => kinds.includes(child.kind))
    .map(normalizeMember)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function propertiesFor(reflection) {
  const declaration = reflection.type?.declaration ?? reflection;

  return membersFor(declaration, [1024, 262144]);
}

function methodsFor(reflection) {
  return membersFor(reflection, [2048]);
}

function constructorsFor(reflection) {
  return membersFor(reflection, [512]);
}

function typeParametersFor(reflection) {
  const signature = reflection.signatures?.[0];
  const typeParameters = reflection.typeParameters ?? signature?.typeParameters ?? [];
  const comments = [reflection.comment, signature?.comment].filter(Boolean);

  return typeParameters.map((typeParameter) => {
    const summaryParts = typeParameterSummaryParts(typeParameter, comments);

    return {
      name: typeParameter.name,
      default: typeParameter.default ? typeName(typeParameter.default) : undefined,
      constraint: typeParameter.type ? typeName(typeParameter.type) : undefined,
      summary: textFromDocParts(summaryParts),
      summaryParts,
    };
  });
}

function typeParameterSummaryParts(typeParameter, comments) {
  const directParts = commentSummaryParts(typeParameter.comment);

  if (directParts.length > 0) {
    return directParts;
  }

  for (const comment of comments) {
    for (const blockTag of comment?.blockTags ?? []) {
      if (blockTag.tag !== '@template' && blockTag.tag !== '@typeParam') {
        continue;
      }

      const tagName = blockTag.name;
      const parts = docPartsFromCommentParts(blockTag.content);

      if (tagName === typeParameter.name) {
        return parts;
      }

      const text = textFromDocParts(parts);
      if (text.startsWith(`${typeParameter.name} - `)) {
        return docPartsFromCommentParts([
          {
            kind: 'text',
            text: text.slice(typeParameter.name.length + 3),
          },
        ]);
      }
    }
  }

  return [];
}

function returnMembersFor(reflection) {
  const signature = reflection.signatures?.[0];
  const returnDeclaration = signature?.type?.declaration;

  return membersFor(returnDeclaration, [1024, 2048, 262144]);
}

function warnMissingParameterSummaries(packageEntry, symbolName, params = [], warnings) {
  for (const param of params) {
    if (!param.summary) {
      warnings.push(
        `Missing TSDoc @param summary for ${packageEntry.name}.${symbolName}.${param.name}`
      );
    }
  }
}

function sourceFilePath(source, packageEntry) {
  const urlPath = source?.url?.match(/\/blob\/[^/]+\/(.+?)(?:#|$)/)?.[1];

  if (urlPath) {
    return resolve(rootDir, urlPath);
  }

  if (source?.fileName?.startsWith('packages/')) {
    return resolve(rootDir, source.fileName);
  }

  return resolve(rootDir, dirname(packageEntry.entryPoint), source?.fileName ?? '');
}

function literalValue(node) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isNumericLiteral(node)) {
    return node.text;
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return 'true';
  }

  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return 'false';
  }

  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return 'null';
  }

  return undefined;
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return undefined;
}

function literalTableFor(reflection, packageEntry, source) {
  if (reflection.kind !== 32 || !reflection.flags?.isConst || !source) {
    return undefined;
  }

  let sourceFile;

  try {
    const filePath = sourceFilePath(source, packageEntry);
    sourceFile = ts.createSourceFile(
      filePath,
      readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
  } catch {
    return undefined;
  }

  let initializer;

  const visit = (node) => {
    if (initializer) {
      return;
    }

    if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      );

      if (!isExported) {
        return;
      }

      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === reflection.name) {
          initializer = declaration.initializer;
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    return undefined;
  }

  const rows = [];
  const columns = [];

  for (const element of initializer.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      return undefined;
    }

    const row = {};

    for (const property of element.properties) {
      if (!ts.isPropertyAssignment(property)) {
        return undefined;
      }

      const name = propertyNameText(property.name);
      const value = literalValue(property.initializer);

      if (!name || value === undefined) {
        return undefined;
      }

      row[name] = value;

      if (!columns.includes(name)) {
        columns.push(name);
      }
    }

    rows.push(row);
  }

  if (rows.length === 0 || columns.length === 0) {
    return undefined;
  }

  return { columns, rows };
}

function slugifySymbolName(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function packageSlugForName(packageName) {
  return packageEntries.find((entry) => entry.name === packageName)?.slug;
}

function referenceTargetSymbolName(type) {
  if (type?.type !== 'reference') {
    return undefined;
  }

  if (typeof type.target === 'object') {
    return type.target.qualifiedName ?? type.name;
  }

  return type.qualifiedName ?? type.name;
}

function aliasOfFor(reflection) {
  if (reflection.kind !== 2097152 || reflection.type?.type !== 'reference') {
    return undefined;
  }

  const packageName =
    reflection.type.package ??
    (typeof reflection.type.target === 'object' ? reflection.type.target.packageName : undefined);
  const symbolName = referenceTargetSymbolName(reflection.type);
  const packageSlug = packageSlugForName(packageName);

  if (!packageSlug || !symbolName) {
    return undefined;
  }

  return {
    packageSlug,
    packageName,
    symbolName,
    symbolSlug: slugifySymbolName(symbolName),
  };
}

function normalizeSymbol(reflection, packageEntry, warnings) {
  const signature = reflection.signatures?.[0];
  let summaryParts =
    commentSummaryParts(reflection.comment).length > 0
      ? commentSummaryParts(reflection.comment)
      : commentSummaryParts(signature?.comment);
  let summary = textFromDocParts(summaryParts);
  const remarksParts =
    commentBlockTagParts(reflection.comment, '@remarks').length > 0
      ? commentBlockTagParts(reflection.comment, '@remarks')
      : commentBlockTagParts(signature?.comment, '@remarks');
  const see = [
    ...commentBlockTagsParts(reflection.comment, '@see'),
    ...commentBlockTagsParts(signature?.comment, '@see'),
  ];
  const examples = [...commentExamples(reflection.comment), ...commentExamples(signature?.comment)];
  const source = reflection.sources?.[0] ?? signature?.sources?.[0];
  const symbolSlug = slugifySymbolName(reflection.name);
  const params = paramsFor(reflection);
  const typeParameters = typeParametersFor(reflection);
  const properties = propertiesFor(reflection);
  const methods = methodsFor(reflection);
  const constructors = constructorsFor(reflection);
  const returnMembers = returnMembersFor(reflection);

  if (summary === reflection.name) {
    summary = '';
    summaryParts = [];
  } else if (summary.startsWith(`${reflection.name} `)) {
    summary = summary.slice(reflection.name.length).trim();
    summaryParts = docPartsFromCommentParts([{ kind: 'text', text: summary }]);
  }

  if (!summary) {
    warnings.push(`Missing TSDoc summary for ${packageEntry.name}.${reflection.name}`);
  }

  warnMissingParameterSummaries(packageEntry, reflection.name, params, warnings);

  return {
    slug: symbolSlug,
    name: reflection.name,
    kind: kindNames.get(reflection.kind) ?? `Kind ${reflection.kind}`,
    summary,
    summaryParts,
    remarks: textFromDocParts(remarksParts),
    remarksParts,
    signature: signatureFor(reflection),
    params,
    typeParameters,
    properties,
    methods,
    constructors,
    returnMembers,
    literalTable: literalTableFor(reflection, packageEntry, source),
    aliasOf: aliasOfFor(reflection),
    returns: signature?.type ? typeName(signature.type) : undefined,
    returnsSummary:
      commentBlockTag(reflection.comment, '@returns') ||
      commentBlockTag(signature?.comment, '@returns'),
    returnsSummaryParts:
      commentBlockTagParts(reflection.comment, '@returns').length > 0
        ? commentBlockTagParts(reflection.comment, '@returns')
        : commentBlockTagParts(signature?.comment, '@returns'),
    examples,
    see,
    sourcePackage: packageEntry.slug,
    source: source
      ? {
          fileName: source.fileName,
          line: source.line,
          url: source.url,
        }
      : undefined,
  };
}

function topLevelApiReflections(rawProject) {
  return (rawProject.children ?? []).flatMap((reflection) => {
    if (reflection.kind === 2) {
      return reflection.children ?? [];
    }

    return [reflection];
  });
}

async function runTypedoc(packageEntry) {
  const rawPath = resolve(generatedDir, `typedoc-${packageEntry.slug}.json`);
  const optionsPath = resolve(generatedDir, `typedoc-${packageEntry.slug}.jsonc`);
  const entryPoints = packageEntry.entryPoints ?? [packageEntry.entryPoint];
  const options = {
    json: rawPath,
    tsconfig: resolve(rootDir, 'tsconfig.base.json'),
    entryPoints: entryPoints.map((entryPoint) => resolve(rootDir, entryPoint)),
    entryPointStrategy: 'resolve',
    excludePrivate: true,
    excludeInternal: true,
    readme: 'none',
    name: packageEntry.name,
    logLevel: 'Warn',
    skipErrorChecking: true,
    externalSymbolLinkMappings,
  };
  const args = ['--options', optionsPath];

  await writeFile(optionsPath, `${JSON.stringify(options, null, 2)}\n`);
  const result = spawnSync(typedocBin, args, {
    cwd: rootDir,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw new Error(`TypeDoc failed for ${packageEntry.name}.\n${output || 'No output.'}`);
  }

  const rawProject = JSON.parse(await readFile(rawPath, 'utf8'));
  const warnings = [result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('[warning]'));
  const symbols = topLevelApiReflections(rawProject)
    .filter((reflection) => !reflection.flags?.isPrivate)
    .map((reflection) => normalizeSymbol(reflection, packageEntry, warnings))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (symbols.length === 0) {
    throw new Error(`TypeDoc returned no public symbols for ${packageEntry.name}.`);
  }

  return {
    slug: packageEntry.slug,
    name: packageEntry.name,
    entryPoint: packageEntry.entryPoint,
    symbols,
    warnings,
  };
}

await mkdir(generatedDir, { recursive: true });

const packages = [];

for (const packageEntry of packageEntries) {
  packages.push(await runTypedoc(packageEntry));
}

const symbols = packages.flatMap((packageDoc) =>
  packageDoc.symbols.map((symbol) => ({
    ...symbol,
    packageName: packageDoc.name,
  }))
);
const warnings = packages.flatMap((packageDoc) =>
  packageDoc.warnings.map((warning) => `${packageDoc.name}: ${warning}`)
);
const requiredSymbols = [
  ['core', 'TimelineEngine'],
  ['core', 'TimelineState'],
  ['react', 'TimelineProvider'],
  ['renderer', 'CanvasRenderer'],
  ['utils', 'fromSeconds'],
];
const missingRequiredSymbols = requiredSymbols.filter(
  ([packageSlug, symbolName]) =>
    !symbols.some((symbol) => symbol.sourcePackage === packageSlug && symbol.name === symbolName)
);

if (missingRequiredSymbols.length > 0) {
  throw new Error(
    `Generated API reference is missing required symbols: ${missingRequiredSymbols
      .map(([packageSlug, symbolName]) => `${packageSlug}.${symbolName}`)
      .join(', ')}`
  );
}

validateCuratedReactDocs(packages);

const reference = {
  generatedAt: new Date().toISOString(),
  packages,
  symbols,
  warnings,
};
const serializedReference = `${JSON.stringify(reference, null, 2)}\n`;
const serializedWarnings =
  warnings.length > 0 ? `${warnings.join('\n')}\n` : 'No API documentation warnings.\n';

await writeFile(`${outputPath}.tmp`, serializedReference);
await rename(`${outputPath}.tmp`, outputPath);
await writeFile(warningsPath, serializedWarnings);

globalThis.console.info(
  `Wrote ${outputPath} with ${packages.length} packages and ${symbols.length} symbols.`
);
globalThis.console.info(`Wrote ${warningsPath} with ${warnings.length} warnings.`);

function validateCuratedReactDocs(packages) {
  const reactPackage = packages.find((packageDoc) => packageDoc.slug === 'react');

  if (!reactPackage) {
    throw new Error('Generated API reference is missing the React package.');
  }

  const curatedNames = new Set([
    'TimelineProvider',
    'TimelineProviderProps',
    'TimelineMediaSyncAdapter',
    'UseTimelineMediaSyncOptions',
    'UseTimelineMediaSyncResult',
    'useTimelineMediaSync',
    'useTimelineState',
  ]);
  const exampleRequiredNames = new Set([
    'TimelineProvider',
    'useTimelineMediaSync',
    'useTimelineState',
  ]);
  const remarksLinkRequiredNames = new Set([
    'TimelineProvider',
    'TimelineProviderProps',
    'TimelineMediaSyncAdapter',
    'UseTimelineMediaSyncOptions',
    'useTimelineMediaSync',
    'useTimelineState',
  ]);
  const failures = [];

  for (const name of curatedNames) {
    const symbol = reactPackage.symbols.find((candidate) => candidate.name === name);

    if (!symbol) {
      failures.push(`Missing curated React API symbol ${name}.`);
      continue;
    }

    requireDocParts(symbol.summaryParts, `${name} summary`, failures);
    requireDocParts(symbol.remarksParts, `${name} @remarks`, failures);

    if (remarksLinkRequiredNames.has(name) && !hasDocLink(symbol.remarksParts)) {
      failures.push(`${name} @remarks must include at least one {@link ...} reference.`);
    }

    if (exampleRequiredNames.has(name) && symbol.examples.length === 0) {
      failures.push(`${name} must include at least one @example block.`);
    }

    for (const param of symbol.params) {
      requireDocParts(param.summaryParts, `${name}.${param.name} @param`, failures);
    }

    for (const typeParameter of symbol.typeParameters) {
      requireDocParts(
        typeParameter.summaryParts,
        `${name}.${typeParameter.name} @template`,
        failures
      );
    }

    if (symbol.kind === 'Interface') {
      for (const property of symbol.properties) {
        requireDocParts(property.summaryParts, `${name}.${property.name} property`, failures);
      }
    }

    if (symbol.name.startsWith('use')) {
      requireDocParts(symbol.returnsSummaryParts, `${name} @returns`, failures);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Curated React API documentation is incomplete.\n${failures.join('\n')}`);
  }
}

function requireDocParts(parts, label, failures) {
  if (textFromDocParts(parts).length === 0) {
    failures.push(`${label} is missing.`);
  }
}

function hasDocLink(parts) {
  return parts.some((part) => part.kind === 'link');
}
