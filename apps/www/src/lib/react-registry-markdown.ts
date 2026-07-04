import type { ReactRegistryItem } from '../data/react-registry';
import { site } from '../data/site';
import { buildApiSymbolMarkdown, getApiPackage } from './api-markdown';
import { getApiSymbol } from './api-reference';

type ReactRegistryMarkdownOptions = {
  siteUrl?: string;
};

const reactRegistryPackageName = '@techsquidtv/canvas-timeline-react';

export function buildReactRegistryLlmMarkdown(
  item: ReactRegistryItem,
  options: ReactRegistryMarkdownOptions = {}
) {
  const siteUrl = options.siteUrl ?? site.url;
  const sourcePath = `/packages/react/registry/${item.slug}`;
  const markdownPath = `${sourcePath}.llms.md`;
  const body = [
    item.description,
    '',
    `Source: ${absoluteUrl(sourcePath, siteUrl)}`,
    `LLM reference: ${absoluteUrl(markdownPath, siteUrl)}`,
    '',
    '---',
    '',
    `Package: \`${item.packageName ?? reactRegistryPackageName}\``,
    `Import path: \`${item.importPath}\``,
    `Registry kind: \`${item.kind}\``,
    '',
    '## Usage',
    '',
    codeBlock(item.usageCode, 'tsx'),
    '',
    ...notesSection(item.notes),
    ...propsSection(item),
    ...exportsSection(item),
    ...deepApiSection(item, options),
  ].join('\n');

  return normalizeMarkdown(`# ${item.title} LLM Reference\n\n${body}`);
}

function notesSection(notes: readonly string[] | undefined) {
  if (!notes || notes.length === 0) {
    return [];
  }

  return ['## Notes', '', ...notes.map((note) => `- ${note}`), ''];
}

function propsSection(item: ReactRegistryItem) {
  if (!item.props || item.props.length === 0) {
    return [];
  }

  return [
    '## Props and inputs',
    '',
    markdownTable(
      ['Name', 'Type', 'Description'],
      item.props.map((prop) => [code(prop.name), code(prop.type), prop.description])
    ),
    '',
  ];
}

function exportsSection(item: ReactRegistryItem) {
  return [
    '## Compound components and exports',
    '',
    markdownTable(
      ['Name', 'Reference', 'Description'],
      item.apis.map((api) => [
        code(api.name),
        api.apiSlug
          ? `[API reference](/packages/react/api/${api.apiSlug})`
          : api.apiHref
            ? `[Reference](${api.apiHref})`
            : 'Namespace export',
        api.description,
      ])
    ),
    '',
  ];
}

function deepApiSection(item: ReactRegistryItem, options: ReactRegistryMarkdownOptions) {
  const packageDoc = getApiPackage('react');

  if (!packageDoc) {
    throw new Error('Missing React API package reference.');
  }

  const apiSections = item.apis.flatMap((api) => {
    if (!api.apiSlug) {
      const reference = api.apiHref ? ` Reference: ${api.apiHref}` : '';

      return [
        `### ${api.name}`,
        '',
        `${api.description}${reference}`,
        '',
        'This registry export does not have a standalone generated API symbol.',
        '',
      ];
    }

    const symbol = getApiSymbol('react', api.apiSlug);

    if (!symbol) {
      throw new Error(`Unknown React API symbol "${api.apiSlug}" for ${api.name}.`);
    }

    return [buildApiSymbolMarkdown(packageDoc, symbol, options)];
  });

  return ['## Deep API reference', '', ...apiSections];
}

function markdownTable(headers: string[], rows: string[][]) {
  return [
    `| ${headers.map(escapeTableCell).join(' |')} |`,
    `| ${headers.map(() => ':---').join(' |')} |`,
    ...rows.map((row) => `| ${row.map(escapeTableCell).join(' |')} |`),
  ].join('\n');
}

function escapeTableCell(value: string) {
  return value.replace(/\n/g, '<br>').replace(/\|/g, '\\|');
}

function code(value: string) {
  return `\`${value.replace(/`/g, '\\`')}\``;
}

function codeBlock(value: string, lang: string) {
  return `\`\`\`${lang}\n${value.trim()}\n\`\`\``;
}

function absoluteUrl(path: string, siteUrl: string) {
  return new URL(path, siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).toString();
}

function normalizeMarkdown(value: string) {
  return `${value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}
