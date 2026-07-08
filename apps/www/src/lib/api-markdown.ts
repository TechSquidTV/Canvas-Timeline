import { groupApiSymbols } from '#www/lib/api-symbol-groups';
import {
  apiReference,
  apiDocPartHref,
  apiSymbolHref,
  getApiSymbol,
  type ApiMember,
  type ApiPackage,
  type ApiParameter,
  type ApiDocTextPart,
  type ApiSymbol,
  type ApiTypeParameter,
} from '#www/lib/api-reference';
import {
  absoluteUrl,
  markdownCode as code,
  markdownCodeBlock as codeBlock,
  markdownTable,
  normalizeMarkdown,
} from '#www/lib/markdown-format';
import { site } from '#www/data/site';

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
    ...remarksSection(resolvedSymbol),
    ...timelineStateBreakdownSection(resolvedSymbol),
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
    ...typeParameterSection(packageDoc, resolvedSymbol, typeParameters),
    ...parameterSection(packageDoc, resolvedSymbol, resolvedSymbol.params),
    ...memberSection(packageDoc, resolvedSymbol, 'Properties', properties),
    ...memberSection(packageDoc, resolvedSymbol, 'Constructors', constructors),
    ...literalValueSection(resolvedSymbol),
    ...memberSection(packageDoc, resolvedSymbol, 'Methods', methods),
    ...returnsSection(packageDoc, resolvedSymbol),
    ...memberSection(packageDoc, resolvedSymbol, 'Return members', returnMembers),
    ...exampleSection(examples),
    ...seeSection(packageDoc, resolvedSymbol),
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

function remarksSection(symbol: ApiSymbol) {
  if (symbol.remarksParts.length === 0) {
    return [];
  }

  return [
    '## Usage notes',
    '',
    formatDocParts(symbol.remarksParts, symbol.sourcePackage, symbol.sourcePackage),
    '',
  ];
}

function timelineStateBreakdownSection(symbol: ApiSymbol) {
  if (symbol.name !== 'useTimelineState') {
    return [];
  }

  return [
    '## State available',
    '',
    markdownTable(
      ['Area', 'Fields', 'Use for'],
      [
        [
          'Content',
          '`tracks`, `clipGroups`, `contentRevision`',
          'Track lists, clip counts, inspectors, and content-change badges.',
        ],
        [
          'Playback and time',
          '`playheadTime`, `playing`, `playbackRate`, `duration`',
          'Toolbar state and coarse playback status. Use `useTimelinePlayheadTime()` for live readouts.',
        ],
        [
          'Viewport',
          '`zoomScale`, `scrollLeft`, `scrollTop`, `viewportWidth`, `viewportHeight`',
          'Viewport-aware chrome. Use viewport hooks for focused scroll and zoom controls.',
        ],
        [
          'Selection and ranges',
          '`inPoint`, `outPoint`',
          'Range labels, loop region state, and edit selection chrome.',
        ],
        ['Markers', '`markers`', 'Marker lists and annotation panels.'],
        [
          'Interaction feedback',
          '`snapEnabled`, `snapThresholdPixels`, `snapFeedback`, `clipDropFeedback`',
          'Snapping toggles, drag/drop hints, and lightweight editor status.',
        ],
      ]
    ),
    '',
  ];
}

function typeParameterSection(
  packageDoc: ApiPackage,
  symbol: ApiSymbol,
  typeParameters: ApiTypeParameter[]
) {
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
        formatDescription(
          typeParameter.summaryParts,
          typeParameter.summary,
          'No type parameter summary yet.',
          packageDoc.slug,
          symbol.sourcePackage
        ),
      ])
    ),
    '',
  ];
}

function parameterSection(packageDoc: ApiPackage, symbol: ApiSymbol, params: ApiParameter[]) {
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
        formatDescription(
          param.summaryParts,
          param.summary,
          param.defaultValue ? `Default: ${param.defaultValue}` : 'No parameter summary yet.',
          packageDoc.slug,
          symbol.sourcePackage
        ),
      ])
    ),
    '',
  ];
}

function memberSection(
  packageDoc: ApiPackage,
  symbol: ApiSymbol,
  title: string,
  members: ApiMember[]
) {
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
        formatDescription(
          member.summaryParts,
          member.summary,
          `No ${member.kind.toLowerCase()} summary yet.`,
          packageDoc.slug,
          symbol.sourcePackage
        ),
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

function returnsSection(packageDoc: ApiPackage, symbol: ApiSymbol) {
  if (!symbol.returns) {
    return [];
  }

  return [
    '## Returns',
    '',
    code(symbol.returns),
    '',
    ...(symbol.returnsSummaryParts.length > 0 || symbol.returnsSummary
      ? [
          formatDescription(
            symbol.returnsSummaryParts,
            symbol.returnsSummary,
            '',
            packageDoc.slug,
            symbol.sourcePackage
          ),
          '',
        ]
      : []),
  ];
}

function seeSection(packageDoc: ApiPackage, symbol: ApiSymbol) {
  if (symbol.see.length === 0) {
    return [];
  }

  return [
    '## Related links',
    '',
    ...symbol.see.map(
      (parts) => `- ${formatDocParts(parts, packageDoc.slug, symbol.sourcePackage)}`
    ),
    '',
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

function formatDescription(
  parts: ApiDocTextPart[],
  text: string | undefined,
  fallback: string,
  packageSlug: string,
  sourcePackage: string
) {
  if (parts.length > 0) {
    return formatDocParts(parts, packageSlug, sourcePackage);
  }

  return text || fallback;
}

function formatDocParts(parts: ApiDocTextPart[], packageSlug: string, sourcePackage: string) {
  return parts
    .map((part) => {
      if (part.kind === 'code') {
        return code(part.text);
      }

      if (part.kind !== 'link') {
        return part.text;
      }

      const href = apiDocPartHref(part, packageSlug, sourcePackage);
      const label = part.text || part.target || 'link';

      return href ? `[${label}](${href})` : label;
    })
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function titleCase(value: string) {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
