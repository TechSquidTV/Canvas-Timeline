import { groupApiSymbols } from './api-symbol-groups';
import {
  apiReference,
  apiSymbolHref,
  getApiSymbol,
  type ApiMember,
  type ApiPackage,
  type ApiParameter,
  type ApiSymbol,
  type ApiTypeParameter,
} from './api-reference';
import {
  absoluteUrl,
  markdownCode as code,
  markdownCodeBlock as codeBlock,
  markdownTable,
  normalizeMarkdown,
} from './markdown-format';
import { site } from '../data/site';

type ApiMarkdownOptions = {
  siteUrl?: string;
};

type ApiMarkdownPage = {
  title: string;
  description: string;
  path: string;
  markdownPath: string;
  body: string;
};

export function buildApiPackageMarkdown(packageDoc: ApiPackage, options: ApiMarkdownOptions = {}) {
  const symbolGroups = groupApiSymbols(packageDoc.slug, packageDoc.symbols);
  const body = [
    `Package: \`${packageDoc.name}\``,
    `Entry point: \`${packageDoc.entryPoint}\``,
    '',
    '## API Index',
    '',
    ...symbolGroups.flatMap(([group, symbols]) => [
      `### ${group}`,
      '',
      ...symbols.map(
        (symbol) =>
          `- [${symbol.name}](${apiSymbolHref(packageDoc.slug, symbol.slug)}) - ${symbol.summary || 'No TSDoc summary yet.'}`
      ),
      '',
    ]),
  ].join('\n');

  return formatApiMarkdownPage(
    {
      title: `${packageDoc.name} API`,
      description: `Generated API reference for ${packageDoc.name}.`,
      path: `/packages/${packageDoc.slug}/api`,
      markdownPath: `/packages/${packageDoc.slug}/api.md`,
      body,
    },
    options
  );
}

export function buildApiSymbolMarkdown(
  packageDoc: ApiPackage,
  symbol: ApiSymbol,
  options: ApiMarkdownOptions = {}
) {
  const resolvedSymbol = getApiSymbol(packageDoc.slug, symbol.slug) ?? symbol;
  const aliasedSymbol = resolvedSymbol.aliasOf
    ? getApiSymbol(resolvedSymbol.aliasOf.packageSlug, resolvedSymbol.aliasOf.symbolSlug)
    : undefined;
  const properties = resolvedSymbol.properties.length > 0 ? resolvedSymbol.properties : [];
  const methods = resolvedSymbol.methods.length > 0 ? resolvedSymbol.methods : [];
  const constructors = resolvedSymbol.constructors.length > 0 ? resolvedSymbol.constructors : [];
  const typeParameters =
    (resolvedSymbol.typeParameters?.length ?? 0) > 0 ? resolvedSymbol.typeParameters : [];
  const returnMembers = resolvedSymbol.returnMembers.length > 0 ? resolvedSymbol.returnMembers : [];
  const examples = resolvedSymbol.examples.length > 0 ? resolvedSymbol.examples : [];

  const body = [
    `Package: \`${packageDoc.name}\``,
    `Kind: \`${resolvedSymbol.kind}\``,
    `Entry point: \`${packageDoc.entryPoint}\``,
    '',
    '## Signature',
    '',
    codeBlock(resolvedSymbol.signature, 'ts'),
    '',
    ...(resolvedSymbol.aliasOf
      ? [
          '## Alias',
          '',
          `\`${resolvedSymbol.name}\` aliases \`${resolvedSymbol.aliasOf.symbolName}\` from \`${resolvedSymbol.aliasOf.packageName}\`.`,
          '',
          ...(aliasedSymbol ? [codeBlock(aliasedSymbol.signature, 'ts'), ''] : []),
        ]
      : []),
    ...typeParameterSection(typeParameters),
    ...parameterSection(resolvedSymbol.params),
    ...memberSection('Properties', properties),
    ...memberSection('Constructors', constructors),
    ...literalValueSection(resolvedSymbol),
    ...memberSection('Methods', methods),
    ...returnsSection(resolvedSymbol),
    ...memberSection('Return members', returnMembers),
    ...exampleSection(examples),
    ...sourceSection(packageDoc, resolvedSymbol),
  ].join('\n');

  return formatApiMarkdownPage(
    {
      title: `${resolvedSymbol.name} API`,
      description: resolvedSymbol.summary || `Generated API reference for ${resolvedSymbol.name}.`,
      path: `/packages/${packageDoc.slug}/api/${symbol.slug}`,
      markdownPath: `/packages/${packageDoc.slug}/api/${symbol.slug}.md`,
      body,
    },
    options
  );
}

export function getApiPackage(packageSlug: string) {
  return apiReference.packages.find((packageDoc) => packageDoc.slug === packageSlug);
}

function typeParameterSection(typeParameters: ApiTypeParameter[]) {
  if (typeParameters.length === 0) {
    return [];
  }

  return [
    '## Type parameters',
    '',
    markdownTable(
      ['Name', 'Constraint', 'Default', 'Description'],
      typeParameters.map((typeParameter) => [
        code(typeParameter.name),
        code(typeParameter.constraint ?? 'None'),
        code(typeParameter.default ?? 'None'),
        typeParameter.summary || 'No type parameter summary yet.',
      ])
    ),
    '',
  ];
}

function parameterSection(params: ApiParameter[]) {
  if (params.length === 0) {
    return [];
  }

  return [
    '## Parameters',
    '',
    markdownTable(
      ['Name', 'Type', 'Description'],
      params.map((param) => [
        code(`${param.name}${param.optional ? '?' : ''}`),
        code(param.type),
        param.summary ||
          (param.defaultValue ? `Default: ${param.defaultValue}` : 'No parameter summary yet.'),
      ])
    ),
    '',
  ];
}

function memberSection(title: string, members: ApiMember[]) {
  if (members.length === 0) {
    return [];
  }

  return [
    `## ${title}`,
    '',
    markdownTable(
      ['Name', 'Signature', 'Description'],
      members.map((member) => [
        code(`${member.name}${member.optional ? '?' : ''}`),
        code(member.signature),
        member.summary || `No ${member.kind.toLowerCase()} summary yet.`,
      ])
    ),
    '',
  ];
}

function literalValueSection(symbol: ApiSymbol) {
  if (!symbol.literalTable) {
    return [];
  }

  return [
    '## Values',
    '',
    markdownTable(
      symbol.literalTable.columns.map(titleCase),
      symbol.literalTable.rows.map(
        (row) => symbol.literalTable?.columns.map((column) => code(row[column] ?? '')) ?? []
      )
    ),
    '',
  ];
}

function returnsSection(symbol: ApiSymbol) {
  if (!symbol.returns) {
    return [];
  }

  return [
    '## Returns',
    '',
    code(symbol.returns),
    '',
    ...(symbol.returnsSummary ? [symbol.returnsSummary, ''] : []),
  ];
}

function exampleSection(examples: string[]) {
  if (examples.length === 0) {
    return [];
  }

  return ['## Examples', '', ...examples.flatMap((example) => [formatExample(example), ''])];
}

function sourceSection(packageDoc: ApiPackage, symbol: ApiSymbol) {
  const sourceParts = [
    '## Declaration source',
    '',
    `Package: \`${packageDoc.name}\``,
    `Entry point: \`${packageDoc.entryPoint}\``,
  ];

  if (symbol.source) {
    sourceParts.push(`File: \`${symbol.source.fileName}:${symbol.source.line}\``);

    if (symbol.source.url) {
      sourceParts.push(`GitHub: ${symbol.source.url}`);
    }
  }

  return [...sourceParts, ''];
}

function formatApiMarkdownPage(page: ApiMarkdownPage, options: ApiMarkdownOptions) {
  const siteUrl = options.siteUrl ?? site.url;
  const metadata = [
    page.description,
    '',
    `Source: ${absoluteUrl(page.path, siteUrl)}`,
    `Markdown: ${absoluteUrl(page.markdownPath, siteUrl)}`,
    '',
    '---',
  ].join('\n');

  return normalizeMarkdown(`# ${page.title}\n\n${metadata}\n\n${page.body}`);
}

function formatExample(example: string) {
  const trimmedExample = example.trim();

  return trimmedExample.startsWith('```') ? trimmedExample : codeBlock(trimmedExample, 'ts');
}

function titleCase(value: string) {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
